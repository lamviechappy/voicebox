# Plan: Add Fish Speech (mlx-community/fish-audio-s2-pro) Engine

## Context

The user has `mlx-audio` installed and the `mlx-community/fish-audio-s2-pro` model already downloaded to the HuggingFace cache. `mlx-audio` already supports this model via auto-detection — calling `load("mlx-community/fish-audio-s2-pro")` loads both the Llama transformer and the Fish S1 DAC codec via `post_load_hook`. Voice cloning is done by passing `ref_audio` (numpy array) + `ref_text` to `generate()`. The model outputs 44.1kHz audio and supports multilingual (via Qwen tokenizer + phonemization).

## Files to Create (1 new file)

### 1. `backend/backends/fish_speech_backend.py` (~220 lines)
New backend class `FishSpeechTTSBackend` implementing `TTSBackend`:
- Uses `mlx-audio.tts.load()` — same import as existing MLX backend
- `load_model()` — calls `from mlx_audio.tts import load` with model ID `mlx-community/fish-audio-s2-pro`
- `create_voice_prompt()` — reads reference audio with `soundfile`, returns `{"ref_audio": np_array, "ref_text": str}` (Pattern B: deferred file path → actually the audio data)
- `generate()` — calls `model.generate(text, ref_audio=np_array, ref_text=ref_text)`, yields `GenerationResult` with `.audio` (mlx.array), `.sample_rate`
- Sample rate: **44100 Hz**
- Single model size (no size variants)
- Does NOT support `instruct` (no instruct mode on this model)
- Language: "auto" (mlx-audio handles it)
- **Key difference from existing MLX backend**: uses `mlx-community/fish-audio-s2-pro` model, not Qwen TTS

## Files to Modify (6 files)

### 2. `backend/backends/__init__.py`
- Add `"fish_speech": "Fish Audio S2 Pro"` to `TTS_ENGINES` dict
- Add `ModelConfig` for `fish-speech-s2-pro` (engine: `fish_speech`, hf_repo: `mlx-community/fish-audio-s2-pro`, size_mb: ~3500, needs_trim: false, languages: ["en", "zh", "ja", "ko", "de", "fr", "ru", "pt", "es", "it"])
- Add factory branch: `elif engine == "fish_speech": from .fish_speech_backend import FishSpeechTTSBackend; backend = FishSpeechTTSBackend()`
- Add `engine_has_model_sizes` entry (False — single size)
- Add `engine_needs_trim` (False)
- Add to `get_tts_model_configs()`

### 3. `backend/models.py`
- Add `"fish_speech"` to the `engine` regex pattern in `GenerationRequest`

### 4. `app/src/lib/api/types.ts`
- Add `"fish_speech"` to the engine union in `GenerationRequest`

### 5. `app/src/lib/constants/languages.ts`
- Add `fish_speech` to `ENGINE_LANGUAGES` with supported languages: `["zh", "en", "ja", "ko", "de", "fr", "ru", "pt", "es", "it"]`

### 6. `app/src/components/Generation/EngineModelSelector.tsx`
- Add to `ENGINE_OPTIONS`: `{ value: 'fish_speech', label: 'Fish Audio S2 Pro', engine: 'fish_speech' }`
- Add to `ENGINE_DESCRIPTIONS`: `fish_speech: 'Fish Audio S2 Pro, 50+ languages, Apple Silicon MLX'`
- Add `"fish_speech"` to `CLONING_ENGINES`

### 7. `app/src/lib/hooks/useGenerationForm.ts`
- Add `"fish_speech"` to Zod `engine` enum
- Add branch in `modelName`: `engine === 'fish_speech' ? 'fish-speech-s2-pro'`
- Add branch in `displayName`: `engine === 'fish_speech' ? 'Fish Audio S2 Pro'`
- `hasModelSizes` stays False for fish_speech
- `supportsInstruct` stays False for fish_speech

### 8. `app/src/components/ServerSettings/ModelManagement.tsx`
- Add `'fish-speech-s2-pro'` entry to `MODEL_DESCRIPTIONS`
- Add `m.model_name.startsWith('fish-speech')` to `voiceModels` filter

## No Changes Needed

- `requirements.txt` / `requirements-mlx.txt` — `mlx-audio` already present
- `justfile` — no new dependencies
- `.github/workflows/release.yml` — no new CI steps
- `build_binary.py` — mlx-audio already bundled with `--collect-all mlx_audio`
- `server.py` — no frozen-build env var overrides needed (no native data paths)
- Routes/services — auto-dispatch via model config registry

## Implementation Order

1. Create `fish_speech_backend.py`
2. Register in `backends/__init__.py`
3. Update `backend/models.py` regex
4. Update all 4 frontend files
5. Test: `just dev` — verify model loads and generation works

## Phase 0 Status (COMPLETE)

Fish Speech via mlx-audio has **zero integration blockers**:
- ✅ `mlx-audio` already installed
- ✅ Model already downloaded to cache
- ✅ `mlx-audio.tts.load()` auto-detects model type and calls `post_load_hook`
- ✅ No PyInstaller issues (mlx-audio already bundled)
- ✅ No monkey-patches needed
- ✅ No pinned torch conflicts
- ✅ No GUI framework dependencies
- ✅ `torch.load` with `map_location="cpu"` already in codec loading
- ✅ Sample rate: 44.1kHz
- ✅ `from_pretrained` internally uses `snapshot_download(token=None)` — no auth needed
- ✅ No `inspect.getsource`, `typeguard`, or `torch.jit.script`
- ✅ Voice cloning via `ref_audio` numpy array parameter
