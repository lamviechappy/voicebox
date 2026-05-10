# Building Voicebox

This document covers everything you need to know about building, cleaning, and troubleshooting the Voicebox app.

## Prerequisites

### Required Tools

- **Node.js** (v18+): `brew install node`
- **Bun**: `brew install bun`
- **Rust**: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- **Python 3.12** (recommended for ML packages): `brew install python@3.12`
- **Just** (task runner): `brew install just`

### Optional GPU Acceleration

| Platform | GPU | Package |
|----------|-----|---------|
| macOS | Apple Silicon (M1/M2/M3/M4) | MLX (installed via `requirements-mlx.txt`) |
| Windows | NVIDIA | CUDA (auto-detected) |
| Windows | Intel Arc | XPU (auto-detected) |

## Quick Start

### First Time Setup

```bash
# Clone the repo
git clone https://github.com/lamviechappy/voicebox.git
cd voicebox

# Full setup (Python venv + JS deps)
just setup

# Start development
just dev
```

### Standard Build

```bash
just build
```

This builds:
1. Python server binary (CPU)
2. Tauri desktop app

### macOS Apple Silicon Only Build

For a lighter, faster build targeting only your Mac Mini M4:

```bash
# Build Tauri app for Apple Silicon only
just clean
just build-server    # Python binary (universal)
just build-tauri     # Tauri app (Apple Silicon only)
```

This builds **only** for macOS Apple Silicon instead of all platforms, resulting in:
- Faster build time (~5-10 minutes instead of ~30+ minutes)
- Smaller artifact size
- No Windows/Linux binaries

**What gets built:**

| Component | Target | Notes |
|-----------|--------|-------|
| Python server | Universal | Works on Apple Silicon + Intel Mac |
| Tauri app | `aarch64-apple-darwin` | Mac Mini M4 optimized |
| Installer | `.app` + `.dmg` | macOS only |

**To build all platforms again:**

```bash
just build-tauri-all
```

**To change target in tauri.conf.json:**

```json
"bundle": {
  "targets": "macOS"      // Apple Silicon only
  "targets": "all"        // All platforms (default)
}
```

## Build Commands Reference

### Setup Commands

| Command | Description |
|---------|-------------|
| `just setup` | Full setup: Python venv + JS dependencies |
| `just setup-python` | Python venv only |
| `just setup-js` | JavaScript dependencies only |

### Development Commands

| Command | Description |
|---------|-------------|
| `just dev` | Backend + Tauri desktop app |
| `just dev-backend` | Backend API server only (port 17493) |
| `just dev-frontend` | Tauri desktop app only |
| `just dev-web` | Backend + web app (no Tauri) |

### Build Commands

| Command | Description |
|---------|-------------|
| `just build` | Everything: server binary + Tauri app |
| `just build-server` | Python server binary only |
| `just build-tauri` | Tauri app only (macOS Apple Silicon) |
| `just build-tauri-all` | Tauri app for all platforms |
| `just build-web` | Web app only |

### Clean Commands

| Command | Description |
|---------|-------------|
| `just clean` | Build artifacts only (tauri target, dist folders) |
| `just clean-python` | Python venv + `__pycache__` |
| `just clean-deep` | Everything: clean + clean-python + external caches |
| `just clean-all` | Nuclear option: all of the above + node_modules |

### Code Quality Commands

| Command | Description |
|---------|-------------|
| `just check` | JS lint + Python lint + format check |
| `just lint` | Lint only (Biome + ruff) |
| `just format` | Format only |
| `just fix` | Auto-fix lint + format issues |
| `just test` | Run Python tests |
| `just test-models` | E2E test all TTS models |

## Clean Commands Explained

### `just clean` — Light Clean

Removes build output directories:
```
tauri/src-tauri/target/release
web/dist
app/dist
```

**When to use**: After a failed build but Python venv is still good.

### `just clean-python` — Python Clean

Removes Python virtual environment and bytecode caches:
```
backend/venv
backend/**/__pycache__
backend/**/*.pyc
```

**When to use**: Python dependency issues, import errors.

### `just clean-deep` — Deep Clean

Complete cleanup including external caches:
```
# Everything from clean + clean-python
tauri/src-tauri/target/release
web/dist
app/dist
backend/venv
backend/**/__pycache__
backend/**/*.pyc

# External caches
~/Library/Application\ Support/pyinstaller  # PyInstaller cache
backend/build
backend/dist
backend/*.spec

# Rust and JS/TS caches
tauri/src-tauri/target
app/.astro
app/.next
```

**When to use**:
- Build failures with no clear cause
- After changing Python package versions
- PyInstaller errors (HiggsAudioV2TokenizerModel, etc.)
- Recurring "file not found" errors during build

### `just clean-all` — Nuclear Clean

Everything plus `node_modules`:
```
# clean-deep +
node_modules
app/node_modules
tauri/node_modules
web/node_modules
tauri/src-tauri/target (cargo clean)
```

**When to use**:
- Switching branches with major dependency changes
- After updating Node.js/Bun versions
- When even `clean-deep` doesn't fix the issue

## Complete Rebuild Workflow

When you encounter persistent build errors:

```bash
# 1. Deep clean everything
just clean-deep

# 2. Recreate Python environment
just setup

# 3. Verify Python packages
just dev-backend &
sleep 3
curl http://127.0.0.1:17493/health
# Should return: {"status":"ok"}
# Kill with: just kill

# 4. Build everything
just build
```

## Troubleshooting

### "No module named 'chatterbox'" / Import errors

**Cause**: Python packages not installed or venv corrupted.

**Fix**:
```bash
just clean-python
just setup
```

### "HiggsAudioV2TokenizerModel not found"

**Cause**: PyInstaller cache has old compiled code.

**Fix**:
```bash
just clean-deep
just setup
just build-server
just build-tauri
```

### "No private key" / Signing errors

**Cause**: Tauri signing keys not configured.

**Fix**:
```bash
# Generate new keys (one-time only)
cargo tauri signer generate --app-id sh.voicebox.app
```

This creates:
- `~/.tauri/sign key.pem` — private key (KEEP SECRET!)
- `~/.tauri/sign key.pub.pem` — public key

Add to GitHub repository:
1. **Public key** → Add to `tauri.conf.json` under `plugins.updater.pubkey`
2. **Private key** → GitHub repo → Settings → Secrets → `TAURI_SIGNING_PRIVATE_KEY`

### App crashes on launch (SIGABRT)

**Cause**: Updater plugin misconfigured.

**Fix**: Ensure `tauri.conf.json` has valid signing key:
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

### "venv not found" errors

**Cause**: `clean-deep` removed the venv and you haven't run `just setup`.

**Fix**:
```bash
just setup
```

### Rust build errors

**Fix**:
```bash
just clean
cd tauri/src-tauri && cargo clean && cd ../..
just build
```

### Apple Silicon MLX errors

**Cause**: Wrong PyTorch version installed.

**Fix**: `clean-deep` then reinstall:
```bash
just clean-deep
just setup
# The setup script auto-detects Apple Silicon and installs MLX packages
```

## App Data Locations

| Platform | Path |
|----------|------|
| macOS | `~/Library/Application Support/sh.voicebox.app/` |
| Windows | `%APPDATA%\sh.voicebox.app\` |
| Linux | `~/.local/share/sh.voicebox.app/` |

### What's in there

```
sh.voicebox.app/
├── backends/          # Compiled server binaries
│   ├── macos-aarch64/
│   ├── windows-x86_64/
│   └── cuda/           # Windows NVIDIA builds
├── logs/              # Application logs
└── voicebox.db         # SQLite database (if exists)
```

### To clear app data (reset to fresh install)

```bash
# macOS
rm -rf ~/Library/Application\ Support/sh.voicebox.app

# Linux
rm -rf ~/.local/share/sh.voicebox.app

# Windows (PowerShell)
Remove-Item -Recurse "$env:APPDATA\sh.voicebox.app"
```

## PyInstaller Cache

PyInstaller caches compiled extensions in:
- **macOS/Linux**: `~/Library/Application Support/pyinstaller/`
- **Windows**: `%LOCALAPPDATA%\pyinstaller\`

**When to clear**: After updating packages that include C extensions.

## Development Tips

### Keep backend running while editing frontend

```bash
# Terminal 1: Backend
just dev-backend

# Terminal 2: Frontend
just dev-frontend
```

### Quick rebuild (no clean)

```bash
just build-server  # Fast rebuild of Python binary
just build-tauri   # Fast rebuild of Tauri app
```

### Check if backend is running

```bash
curl http://127.0.0.1:17493/health
```

## Platform-Specific Notes

### macOS

- **Apple Silicon**: Auto-detects and uses MLX for GPU acceleration
- **Intel Mac**: Falls back to CPU-only PyTorch
- **Minimum version**: macOS 11.0

### Windows

- **NVIDIA GPU**: Auto-installs CUDA PyTorch
- **Intel Arc GPU**: Auto-installs XPU PyTorch
- **No GPU**: CPU-only (warns during setup)

### Building for Specific Platforms

By default, `just build` builds for all platforms. To target only macOS Apple Silicon:

**Option 1: Use just build-tauri (Recommended)**

```bash
# This uses --target aarch64-apple-darwin automatically
just build-tauri
```

**Option 2: Use Tauri CLI directly**

```bash
cd tauri/src-tauri
cargo tauri build --target aarch64-apple-darwin
```

**Option 3: Edit tauri.conf.json**

```json
"bundle": {
  "targets": "macOS"
}
```

Available targets:

| Target | Platform |
|--------|----------|
| `aarch64-apple-darwin` | macOS Apple Silicon (M1/M2/M3/M4) |
| `x86_64-apple-darwin` | macOS Intel |
| `x86_64-pc-windows-msvc` | Windows 64-bit |
| `x86_64-unknown-linux-gnu` | Linux 64-bit |

### Building for Apple Silicon Only (Complete Guide)

If you want a single-platform build for your Mac Mini M4:

**Step 1: Ensure tauri.conf.json is set**

```json
{
  "bundle": {
    "targets": "macOS"
  }
}
```

**Step 2: Clean previous builds**

```bash
just clean
```

**Step 3: Build Python server**

```bash
just build-server
# Output: backend/dist/voicebox-server (universal binary)
```

**Step 4: Build Tauri app**

```bash
just build-tauri
# Output: tauri/src-tauri/target/release/bundle/macos/Voicebox.app
```

**Step 5: Copy server binary to app**

```bash
cp backend/dist/voicebox-server tauri/src-tauri/binaries/voicebox-server
```

**Step 6: Run the app**

```bash
open tauri/src-tauri/target/release/bundle/macos/Voicebox.app
# Or drag to Applications folder
```

### Linux

- CPU-only builds supported
- GTK/webkit2gtk required for Tauri

## GitHub Actions CI/CD

The release workflow automatically:
1. Builds for all platforms
2. Signs the macOS app
3. Creates GitHub releases
4. Generates update manifests

To trigger a release:
```bash
git tag v0.x.y
git push origin v0.x.y
```

## File Locations Summary

| File/Directory | Purpose |
|----------------|---------|
| `backend/venv/` | Python virtual environment |
| `backend/dist/` | Built server binary |
| `tauri/src-tauri/binaries/` | Sidecar binaries for app |
| `tauri/src-tauri/target/` | Rust build output |
| `~/.tauri/` | Tauri signing keys |
| `~/Library/Application Support/pyinstaller/` | PyInstaller cache |