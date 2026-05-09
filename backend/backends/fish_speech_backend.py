"""
Fish Audio S2 Pro backend using mlx-audio.

Model: mlx-community/fish-audio-s2-pro
Sample rate: 44100 Hz
Supports: Multilingual (auto-detected), voice cloning via ref_audio
"""

import asyncio
import logging
from pathlib import Path
from typing import Optional, Tuple

import numpy as np
import soundfile as sf

from . import TTSBackend
from .base import (
    is_model_cached,
    model_load_progress,
)
from ..utils.cache import get_cache_key, get_cached_voice_prompt, cache_voice_prompt
from ..utils.hf_offline_patch import patch_huggingface_hub_offline, force_offline_if_cached

logger = logging.getLogger(__name__)

# Apply offline patch BEFORE mlx_audio import
patch_huggingface_hub_offline()

MODEL_ID = "mlx-community/fish-audio-s2-pro"


class FishSpeechTTSBackend:
    """Fish Audio S2 Pro TTS backend using mlx-audio."""

    MODEL_CONFIGS = []

    def __init__(self):
        self.model = None

    def is_loaded(self) -> bool:
        return self.model is not None

    def _get_model_path(self, model_size: str = "default") -> str:
        return MODEL_ID

    def _is_model_cached(self, model_size: str = "default") -> bool:
        return is_model_cached(
            MODEL_ID,
            weight_extensions=(".safetensors", ".bin", ".npz"),
        )

    async def load_model(self, model_size: str = "default") -> None:
        """Lazy load the Fish Audio S2 Pro model."""
        if self.is_loaded():
            return

        await asyncio.to_thread(self._load_model_sync)

    def _load_model_sync(self) -> None:
        """Synchronous model loading."""
        is_cached = self._is_model_cached()
        model_name = "fish-speech-s2-pro"

        with model_load_progress(model_name, is_cached):
            from mlx_audio.tts import load

            logger.info("Loading Fish Audio S2 Pro model...")

            with force_offline_if_cached(is_cached, model_name):
                self.model = load(MODEL_ID)

        logger.info("Fish Audio S2 Pro model loaded successfully")

    def unload_model(self) -> None:
        """Unload model to free memory."""
        if self.model is not None:
            del self.model
            self.model = None
            logger.info("Fish Audio S2 Pro model unloaded")

    async def create_voice_prompt(
        self,
        audio_path: str,
        reference_text: str,
        use_cache: bool = True,
    ) -> Tuple[dict, bool]:
        """
        Create voice prompt from reference audio.

        The reference audio is read into a numpy array and passed directly
        to the model at generation time (Pattern B: deferred data).

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
                    # Validate cached audio can still be loaded
                    try:
                        sf.read(cached_audio_path, dtype="float32")
                        return cached_prompt, True
                    except Exception:
                        logger.warning("Cached audio file unreadable: %s", cached_audio_path)

        # Read audio into numpy array
        audio_data, sr = sf.read(audio_path, dtype="float32")

        # Convert to mono if stereo
        if audio_data.ndim > 1:
            audio_data = np.mean(audio_data, axis=1)

        # Resample to 44100 Hz if needed (using scipy)
        target_sr = 44100
        if sr != target_sr:
            import librosa
            audio_data = librosa.resample(audio_data, orig_sr=sr, target_sr=target_sr)
            sr = target_sr

        voice_prompt = {
            "ref_audio_path": str(audio_path),
            "ref_audio": audio_data,
            "ref_sr": sr,
            "ref_text": reference_text,
        }

        if use_cache:
            cache_key = get_cache_key(audio_path, reference_text)
            cache_voice_prompt(cache_key, voice_prompt)

        return voice_prompt, False

    async def combine_voice_prompts(
        self,
        audio_paths: list[str],
        reference_texts: list[str],
    ) -> Tuple[np.ndarray, str]:
        """
        Combine multiple voice prompts.

        Fish Audio S2 Pro doesn't support multi-reference fusion natively,
        so we concatenate audio and texts.
        """
        combined_audio = []
        combined_texts = []
        sample_rate = 44100

        for audio_path, ref_text in zip(audio_paths, reference_texts):
            audio_data, sr = sf.read(audio_path, dtype="float32")
            if audio_data.ndim > 1:
                audio_data = np.mean(audio_data, axis=1)

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
            voice_prompt: Dict with ref_audio (numpy array), ref_sr, ref_text
            language: Language code (passed as hint)
            seed: Random seed for reproducibility
            instruct: Not supported for Fish Audio S2 Pro

        Returns:
            Tuple of (audio_array, sample_rate)
        """
        await self.load_model()

        def _generate_sync():
            audio_chunks = []
            sample_rate = 44100

            # Set seed if provided
            if seed is not None:
                import mlx.core as mx

                np.random.seed(seed)
                mx.random.seed(seed)

            # Extract voice prompt data
            ref_audio = voice_prompt.get("ref_audio")
            ref_sr = voice_prompt.get("ref_sr", 44100)
            ref_text = voice_prompt.get("ref_text", "")

            # Build generation kwargs
            gen_kwargs = {
                "text": text,
                "ref_text": ref_text,
                "temperature": 0.7,
                "top_p": 0.7,
                "top_k": 30,
                "max_tokens": 1024,
                "speed": 1.0,
            }

            if ref_audio is not None:
                # Convert numpy to mlx array for ref_audio
                import mlx.core as mx

                ref_mlx = mx.array(ref_audio, dtype=mx.float32)
                gen_kwargs["ref_audio"] = ref_mlx

            for result in self.model.generate(**gen_kwargs):
                audio_chunks.append(np.array(result.audio))
                sample_rate = result.sample_rate

            if audio_chunks:
                audio = np.concatenate([np.asarray(chunk, dtype=np.float32) for chunk in audio_chunks])
            else:
                audio = np.array([], dtype=np.float32)

            return audio, sample_rate

        audio, sr = await asyncio.to_thread(_generate_sync)
        return audio, sr
