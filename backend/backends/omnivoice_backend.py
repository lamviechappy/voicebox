"""
OmniVoice TTS backend using the omnivoice package.

Model: k2-fsa/OmniVoice (via mlx-community/OmniVoice-bf16 weights)
Sample rate: 24000 Hz
Supports: Multilingual (600+ languages), voice cloning via ref_audio

Uses PyTorch with MPS on Apple Silicon, CUDA on NVIDIA GPUs.
"""

import asyncio
import logging
from pathlib import Path
from typing import Optional, Tuple

import numpy as np
import soundfile as sf
import torch

from . import TTSBackend
from .base import is_model_cached, model_load_progress, get_torch_device
from ..utils.cache import get_cache_key, get_cached_voice_prompt, cache_voice_prompt
from ..utils.hf_offline_patch import patch_huggingface_hub_offline, force_offline_if_cached

logger = logging.getLogger(__name__)

# Model repo - use original k2-fsa/OmniVoice which has full PyTorch support
MODEL_ID = "k2-fsa/OmniVoice"


class OmniVoiceBackend:
    """OmniVoice TTS backend using the omnivoice package."""

    MODEL_CONFIGS = []

    def __init__(self):
        self.model = None
        self._device = None

    def is_loaded(self) -> bool:
        return self.model is not None

    @property
    def device(self) -> str:
        if self._device is None:
            self._device = self._get_device()
        return self._device

    def _get_device(self) -> str:
        return get_torch_device(allow_mps=True, allow_xpu=True)

    def _is_model_cached(self) -> bool:
        return is_model_cached(
            MODEL_ID,
            weight_extensions=(".safetensors", ".bin", ".pt"),
        )

    async def load_model(self) -> None:
        """Lazy load the OmniVoice model."""
        if self.is_loaded():
            return

        await asyncio.to_thread(self._load_model_sync)

    def _load_model_sync(self) -> None:
        """Synchronous model loading."""
        is_cached = self._is_model_cached()
        model_name = "omnivoice"

        with model_load_progress(model_name, is_cached):
            from omnivoice.models.omnivoice import OmniVoice

            logger.info("Loading OmniVoice model...")

            device = self.device

            with force_offline_if_cached(is_cached, model_name):
                self.model = OmniVoice.from_pretrained(
                    MODEL_ID,
                    device_map=device,
                    torch_dtype=torch.bfloat16,
                    trust_remote_code=True,
                )
                self.model.eval()

        logger.info("OmniVoice model loaded successfully on %s", device)

    def unload_model(self) -> None:
        """Unload model to free memory."""
        if self.model is not None:
            del self.model
            self.model = None
            if self.device:
                if self.device.type == "mps":
                    torch.mps.empty_cache()
                elif self.device.type == "cuda":
                    torch.cuda.empty_cache()
            self.device = None
            logger.info("OmniVoice model unloaded")

    async def create_voice_prompt(
        self,
        audio_path: str,
        reference_text: str,
        use_cache: bool = True,
    ) -> Tuple[dict, bool]:
        """
        Create voice prompt from reference audio.

        Args:
            audio_path: Path to reference audio file
            reference_text: Transcript of reference audio
            use_cache: Whether to use cached prompt if available

        Returns:
            Tuple of (voice_prompt_dict, was_cached)
        """
        await self.load_model()

        if use_cache:
            cache_key = get_cache_key(audio_path, reference_text)
            cached_prompt = get_cached_voice_prompt(cache_key)
            if cached_prompt is not None:
                cached_audio_path = cached_prompt.get("ref_audio_path")
                if cached_audio_path and Path(cached_audio_path).exists():
                    try:
                        sf.read(cached_audio_path, dtype="float32")
                        return cached_prompt, True
                    except Exception:
                        logger.warning("Cached audio file unreadable: %s", cached_audio_path)

        # Create voice clone prompt from reference audio
        voice_clone_prompt = await asyncio.to_thread(
            self._create_voice_prompt_sync, str(audio_path), reference_text
        )

        voice_prompt = {
            "ref_audio_path": str(audio_path),
            "voice_clone_prompt": voice_clone_prompt,
            "ref_text": reference_text,
        }

        if use_cache:
            cache_key = get_cache_key(audio_path, reference_text)
            cache_voice_prompt(cache_key, voice_prompt)

        return voice_prompt, False

    def _create_voice_prompt_sync(self, audio_path: str, reference_text: str):
        """Create voice clone prompt synchronously."""
        # Load audio to check format
        audio_data, sr = sf.read(audio_path, dtype="float32")
        if audio_data.ndim > 1:
            audio_data = np.mean(audio_data, axis=1)

        # Resample to 24kHz if needed
        target_sr = 24000
        if sr != target_sr:
            import librosa
            audio_data = librosa.resample(audio_data, orig_sr=sr, target_sr=target_sr)
            sr = target_sr

        # Convert to torch tensor (OmniVoice expects torch tensors)
        audio_tensor = torch.from_numpy(audio_data).float()
        if audio_tensor.device.type != 'cpu':
            audio_tensor = audio_tensor.cpu()

        # Create voice clone prompt
        prompt = self.model.create_voice_clone_prompt(
            ref_audio=(audio_tensor, sr),
            ref_text=reference_text if reference_text else None,
            preprocess_prompt=True,
        )

        return prompt

    async def combine_voice_prompts(
        self,
        audio_paths: list[str],
        reference_texts: list[str],
    ) -> Tuple[np.ndarray, str]:
        """
        Combine multiple voice prompts.

        OmniVoice doesn't support multi-reference fusion natively,
        so we concatenate audio and texts.
        """
        combined_audio = []
        combined_texts = []
        sample_rate = 24000

        for audio_path, ref_text in zip(audio_paths, reference_texts):
            audio_data, sr = sf.read(audio_path, dtype="float32")
            if audio_data.ndim > 1:
                audio_data = np.mean(audio_data, axis=1)

            # Resample to 24kHz if needed
            if sr != sample_rate:
                import librosa
                audio_data = librosa.resample(audio_data, orig_sr=sr, target_sr=sample_rate)

            combined_audio.append(audio_data)
            combined_texts.append(ref_text)

        audio = np.concatenate(combined_audio)
        text = " ".join(combined_texts)
        return audio, text

    async def generate(
        self,
        text: str,
        voice_prompt: dict,
        language: str = "en",
        seed: Optional[int] = None,
        instruct: Optional[str] = None,
    ) -> Tuple[np.ndarray, int]:
        """
        Generate audio from text using voice prompt.

        Args:
            text: Text to synthesize
            voice_prompt: Dict with voice_clone_prompt and ref_text
            language: Language code (passed as hint to model)
            seed: Random seed for reproducibility
            instruct: Not supported for OmniVoice

        Returns:
            Tuple of (audio_array, sample_rate)
        """
        await self.load_model()

        def _generate_sync():
            # Extract voice prompt data
            voice_clone_prompt = voice_prompt.get("voice_clone_prompt")
            ref_text = voice_prompt.get("ref_text", "")

            # Set seed if provided
            if seed is not None:
                torch.manual_seed(seed)
                if torch.cuda.is_available():
                    torch.cuda.manual_seed(seed)

            # OmniVoice accepts ISO 639-1 codes directly (en, zh, ja, etc.)
            # No mapping needed - just pass the code

            # Generate audio
            with torch.no_grad():
                audio_list = self.model.generate(
                    text=text,
                    voice_clone_prompt=voice_clone_prompt,
                    language=language,
                )

            if audio_list and len(audio_list) > 0:
                audio = np.array(audio_list[0], dtype=np.float32)
            else:
                audio = np.array([], dtype=np.float32)

            sample_rate = 24000
            return audio, sample_rate

        audio, sr = await asyncio.to_thread(_generate_sync)
        return audio, sr
