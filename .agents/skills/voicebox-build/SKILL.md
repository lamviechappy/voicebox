---
name: voicebox-build
description: Use this skill when the user wants to build the Voicebox app. It handles full builds, Apple Silicon-only builds, cache cleaning, and troubleshooting build errors. Always check docs/BUILD.md first.
---

# Voicebox Build

## Goal

Help the user build the Voicebox app, with support for:
- Full cross-platform builds
- macOS Apple Silicon only builds (faster, lighter)
- Cache cleaning strategies
- Troubleshooting build errors

## Reference Docs

Always check these docs first:

```bash
cat docs/BUILD.md    # Build commands, cleaning, troubleshooting
cat docs/DEV.md      # Git workflow, upstream sync
cat justfile         # Available commands
```

## Build Commands Reference

| Command | Description |
|---------|-------------|
| `just setup` | Full setup: Python venv + JS dependencies |
| `just clean` | Build artifacts only |
| `just clean-deep` | Everything + PyInstaller cache |
| `just build` | Full build (all platforms) |
| `just build-server` | Python server binary only |
| `just build-tauri` | Tauri app (macOS Apple Silicon only) |
| `just build-tauri-all` | Tauri app for all platforms |
| `just test` | Run Python tests |
| `just test-models` | E2E test all TTS models |

## Standard Build Workflow

### First Time / After clean-deep

```bash
just setup
just build
```

### Normal Rebuild (after code changes)

```bash
just build
```

### Apple Silicon Only (faster)

```bash
just clean
just build-server
just build-tauri
```

## Cleaning Strategy

| Situation | Command |
|-----------|---------|
| After failed build, venv still good | `just clean` |
| Python import errors | `just clean-python` |
| PyInstaller errors (missing models) | `just clean-deep` |
| Switch branches / major changes | `just clean-all` |

## Common Build Errors

### "No module named 'chatterbox'" / Import errors

```bash
just clean-python
just setup
```

### "HiggsAudioV2TokenizerModel not found"

```bash
just clean-deep
just setup
just build-server
```

### "No private key" / Signing errors

Generate keys:
```bash
cargo tauri signer generate --app-id sh.voicebox.app
```

Add to GitHub:
1. Public key → `tauri.conf.json` under `plugins.updater.pubkey`
2. Private key → GitHub repo → Settings → Secrets → `TAURI_SIGNING_PRIVATE_KEY`

### App crashes on launch (SIGABRT)

Check `tauri.conf.json` has valid signing key:
```json
{
  "plugins": {
    "updater": {
      "pubkey": "<your-public-key>",
      "endpoints": ["https://github.com/lamviechappy/voicebox/releases/latest/download/latest.json"]
    }
  }
}
```

### Rust build errors

```bash
just clean
cd tauri/src-tauri && cargo clean && cd ../..
just build
```

## Platform-Specific Notes

### macOS Apple Silicon (M1/M2/M3/M4)

- Auto-detects and uses MLX for GPU acceleration
- Minimum version: macOS 11.0
- For Apple Silicon only build: `just build-tauri`

### Windows

- NVIDIA GPU: Auto-installs CUDA PyTorch
- Intel Arc GPU: Auto-installs XPU PyTorch
- No GPU: CPU-only

### Linux

- CPU-only builds supported
- GTK/webkit2gtk required for Tauri

## App Data Locations

| Platform | Path |
|----------|------|
| macOS | `~/Library/Application Support/sh.voicebox.app/` |
| Windows | `%APPDATA%\sh.voicebox.app\` |
| Linux | `~/.local/share/sh.voicebox.app/` |

To reset to fresh install:
```bash
rm -rf ~/Library/Application\ Support/sh.voicebox.app
```

## PyInstaller Cache

Cleared by `just clean-deep`:
```bash
~/Library/Application\ Support/pyinstaller/
```

Clear manually if needed:
```bash
rm -rf ~/Library/Application\ Support/pyinstaller
```

## Development Workflow

```bash
# Start development
just dev

# Keep backend running, edit frontend
just dev-frontend  # Terminal 2

# Test backend alone
just dev-backend
curl http://127.0.0.1:17493/health
```

## Build Artifacts

| File | Location |
|------|----------|
| Python binary | `backend/dist/voicebox-server` |
| Tauri app | `tauri/src-tauri/target/release/bundle/macos/Voicebox.app` |
| Sidecar binary | `tauri/src-tauri/binaries/voicebox-server` |
| Signing keys | `~/.tauri/` |

## GitHub Release Workflow

```bash
# Update version in:
# - app/package.json
# - tauri/src-tauri/Cargo.toml
# - tauri/src-tauri/tauri.conf.json

git add .
git commit -m "chore: bump to v0.x.y"
git tag v0.x.y
git push origin main --tags
```

GitHub Actions will:
1. Build for all platforms
2. Sign the macOS app
3. Create GitHub release
4. Generate update manifests

## Notes

- `just build` builds Python binary first, then Tauri app
- For Apple Silicon only: `just build-tauri` uses `--target aarch64-apple-darwin`
- PyInstaller builds are CPU-only by default (no GPU acceleration)
- Tauri signing keys are stored in `~/.tauri/`
- App checks for updates on launch via the updater plugin
