---
name: voicebox-tts-status
description: Working status of TTS engines in current branch
type: reference
---

# TTS Engine Status (as of 2026-05-12)

## Working ✓
- Chatterbox TTS
- Chatterbox Turbo
- Kokoro
- Qwen CustomVoice

## Not Working ✗

### Fish Audio S2 Pro
```
ImportError: cannot import name 'load' from 'mlx_audio.tts'
```
**Cause**: mlx-audio API changed - `load()` function not available in current version

### TADA (HumeAI)
```
OSError: Can't get source for <function snake>. TorchScript requires source access
```
**Cause**: PyInstaller bundling issue - `dac/nn/layers.py` uses `@torch.jit.script` which requires source files. The dac_shim doesn't fully prevent this.

### Omnivoice
**Cause**: Dependency conflicts with transformers version

### Qwen3 TTS
**Cause**: Unknown

## Known Issues
- mlx-audio needs to be installed separately (added to justfile setup-python for Apple Silicon)
- Fish Audio requires mlx-audio package but API has changed
- TADA: dac_shim.py doesn't fully block the real dac package from being imported
- omnivoice causes dependency conflicts with transformers version
