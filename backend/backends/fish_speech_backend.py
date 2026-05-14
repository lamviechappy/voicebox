"""
Fish Audio S2 Pro backend using mlx-audio.

Model: mlx-community/fish-audio-s2-pro
Sample rate: 44100 Hz
Supports: Multilingual (auto-detected), voice cloning via ref_audio
"""

import asyncio
import logging
import os
import queue
import threading
from pathlib import Path
from typing import Optional, Tuple

import numpy as np
import soundfile as sf

from . import TTSBackend
from .base import is_model_cached, model_load_progress
from ..utils.cache import get_cache_key, get_cached_voice_prompt, cache_voice_prompt
from ..utils.hf_offline_patch import force_offline_if_cached

logger = logging.getLogger(__name__)


MODEL_ID = "mlx-community/fish-audio-s2-pro"


class FishSpeechTTSBackend:
    """Fish Audio S2 Pro TTS backend using mlx-audio."""

    MODEL_CONFIGS = []

    def __init__(self):
        self.model = None
        self._work_q: queue.Queue = queue.Queue()
        self._result_q: queue.Queue = queue.Queue()
        self._worker: Optional[threading.Thread] = None
        self._alive = True

    def _start_worker(self):
        """Start the dedicated MLX worker thread."""
        if self._worker is not None and self._worker.is_alive():
            return
        self._work_q = queue.Queue()
        self._result_q = queue.Queue()
        self._alive = True
        self._worker = threading.Thread(target=self._mlx_loop, daemon=True)
        self._worker.start()

    def _mlx_loop(self):
        """Single thread that owns the MLX GPU context. ALL MLX operations
        run here — model loading AND generation. This is critical because:
        1. `@mx.compile` at model definition ties compiled code to this thread
        2. MLX GPU streams are per-thread
        3. Mixing threads causes 'no Stream(gpu, N)' errors"""
        import mlx.core as mx
        import queue as _q

        while self._alive:
            task = self._work_q.get()
            if task is None:
                self._alive = False
                break
            task_id, func = task
            try:
                result = func()
                self._result_q.put((task_id, result))
            except Exception as e:
                self._result_q.put((task_id, e))

    def _enqueue_and_wait(self, func):
        """Submit work to MLX worker and block for the result."""
        self._start_worker()
        tid = object()
        self._work_q.put((tid, func))
        result = self._result_q.get()
        if isinstance(result[1], Exception):
            raise result[1]
        return result[1]

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
        """Load model inside MLX worker thread (same thread as generation)."""
        if self.is_loaded():
            return

        def _load():
            from mlx_audio.tts.utils import load
            from .base import model_load_progress

            is_cached = self._is_model_cached()
            model_name = "fish-speech-s2-pro"

            with model_load_progress(model_name, is_cached):
                logger.info("Loading Fish Audio S2 Pro model...")
                with force_offline_if_cached(is_cached, model_name):
                    self.model = load(MODEL_ID)
                logger.info("Fish Audio S2 Pro model loaded successfully")

        await asyncio.to_thread(self._enqueue_and_wait, _load)

    def unload_model(self) -> None:
        if self.model is not None:
            self.model = None
            logger.info("Fish Audio S2 Pro model unloaded")

    async def create_voice_prompt(
        self,
        audio_path: str,
        reference_text: str,
        use_cache: bool = True,
    ) -> Tuple[dict, bool]:
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

        audio_data, sr = sf.read(audio_path, dtype="float32")
        if audio_data.ndim > 1:
            audio_data = np.mean(audio_data, axis=1)

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
    ) -> Tuple[dict, bool]:
        # Fish Speech only supports ONE ref_audio — concatenate all clips into one
        # temp file so the model processes a single coherent audio stream.
        if not audio_paths:
            return {}, False

        import tempfile, os
        combined_audio = []
        sample_rate = 44100

        for audio_path, ref_text in zip(audio_paths, reference_texts):
            audio_data, sr = sf.read(audio_path, dtype="float32")
            if audio_data.ndim > 1:
                audio_data = np.mean(audio_data, axis=1)
            if sr != sample_rate:
                import librosa
                audio_data = librosa.resample(audio_data, orig_sr=sr, target_sr=sample_rate)
            combined_audio.append(audio_data)

        audio = np.concatenate(combined_audio)
        text = " ".join(reference_texts)

        # Write combined audio to a temp WAV file for Fish Speech
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            tmp_path = f.name
        sf.write(tmp_path, audio, sample_rate, format="WAV")

        return await self.create_voice_prompt(
            audio_path=tmp_path,
            reference_text=text,
            use_cache=False,  # don't cache combined temp files
        )

    async def generate(
        self,
        text: str,
        voice_prompt: dict,
        language: str = "en",
        seed: Optional[int] = None,
        instruct: Optional[str] = None,
        progress_callback=None,
    ) -> Tuple[np.ndarray, int]:
        await self.load_model()

        def _gen():
            import mlx.core as mx
            import time

            if seed is not None:
                np.random.seed(seed)
                mx.random.seed(seed)

            ref_audio_path = voice_prompt.get("ref_audio_path")
            ref_text = voice_prompt.get("ref_text", "")

            gen_kwargs = {
                "text": text,
                "ref_text": ref_text,
                "temperature": 0.7,
                "top_p": 0.7,
                "top_k": 30,
                "max_tokens": 1024,
                "speed": 1.0,
            }

            _test_without_ref = os.environ.get("FISH_TEST_NO_REF") == "1"
            if _test_without_ref:
                logger.info("  TEST MODE: skipping ref_audio (FISH_TEST_NO_REF=1)")
            elif ref_audio_path:
                from mlx_audio.utils import load_audio
                audio_arr = load_audio(ref_audio_path, sample_rate=44100, volume_normalize=True)
                if audio_arr.ndim > 1:
                    audio_arr = audio_arr.squeeze()
                if audio_arr.dtype != mx.float32:
                    audio_arr = audio_arr.astype(mx.float32)
                gen_kwargs["ref_audio"] = audio_arr
                logger.info(
                    f"  ref_audio loaded: shape={audio_arr.shape}, "
                    f"dtype={audio_arr.dtype}, "
                    f"min={float(mx.min(audio_arr)):.3f}, max={float(mx.max(audio_arr)):.3f}"
                )

            audio_chunks = []
            last_result = None
            start = time.perf_counter()

            for i, last_result in enumerate(self.model.generate(**gen_kwargs)):
                audio_chunks.append(np.array(last_result.audio, dtype=np.float32))
                if progress_callback and last_result:
                    # Report progress based on time elapsed
                    elapsed = time.perf_counter() - start
                    # Approximate: each chunk is ~1 second of audio at 44.1kHz
                    # We'll report 80% progress after first chunk, then 100% at end
                    if i == 0:
                        progress_callback(0.5, f"Generating audio... {last_result.audio_duration}")
                    elif last_result.is_final_chunk:
                        progress_callback(0.95, f"Finalizing... {last_result.audio_duration}")

            if audio_chunks:
                audio = np.concatenate(audio_chunks)
                logger.info(
                    f"Fish Audio output: {len(audio_chunks)} chunks, "
                    f"shape={audio.shape}, duration={len(audio)/44100:.2f}s"
                )
            else:
                audio = np.array([], dtype=np.float32)
                logger.warning("Fish Audio generated empty output")

            return audio, (last_result.sample_rate if last_result else 44100)

        # All MLX work MUST run in the dedicated MLX worker thread
        return await asyncio.to_thread(self._enqueue_and_wait, _gen)
