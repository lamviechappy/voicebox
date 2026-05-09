# Build Guides

This directory contains platform-specific build guides for Voicebox.

## Table of Contents

- [macOS (Apple Silicon)](#macos-apple-silicon) — Mac Mini M4, MacBook Pro M-series, etc.
- [Windows (NVIDIA GPU)](#windows-nvidia-gpu)
- [Linux](#linux)

---

## macOS (Apple Silicon)

Build a distributable `.dmg` installer for your Mac Mini M4.

### Prerequisites

```bash
# Install Homebrew (if not already installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install required tools
brew install bun node python@3.12 rust just

# Verify installations
bun --version  # Should be 1.x
rustc --version  # Should be 1.70+
cargo --version  # Should match rustc
# or just 1 command
bun --version && rustc --version && cargo --version
```

### Setup

```bash
cd voicebox && just setup
```

This automatically:
- Creates Python virtual environment
- Installs MLX-optimized dependencies for Apple Silicon
- Installs JavaScript dependencies

### Build DMG

```bash
just build
```

This builds:
1. **Python server binary** (CPU, bundled with app)
2. **Tauri desktop app** (.dmg installer)

Output location:
```
tauri/src-tauri/target/release/bundle/dmg/
```

### Build Output

After build completes, you'll find:
- `Voicebox_X.X.X_aarch64.dmg` — Installer for Apple Silicon Macs

### Installation

1. Open the `.dmg` file
2. Drag Voicebox to Applications
3. Launch from Applications folder

### Troubleshooting

**"App is damaged" error:**
```bash
xattr -cr /Applications/Voicebox.app
```

**Python version mismatch:**
```bash
brew install python@3.12
export PATH="/opt/homebrew/opt/python@3.12/bin:$PATH"
just setup
```

**Rust not found:**
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env
```

---

## Windows (NVIDIA GPU)

Build an installer with CUDA support for GPU-accelerated TTS.

### Prerequisites

```powershell
# Install via winget (PowerShell)
winget install Bun.Bun
winget install Python.Python.3.12
winget install Rustlang.Rustup
winget install Git.Git
```

### Setup

```powershell
cd voicebox
just setup
```

This automatically:
- Detects NVIDIA GPU
- Installs CUDA-enabled PyTorch
- Installs JavaScript dependencies

### Build

**CPU only:**
```powershell
just build
```

**CPU + CUDA (GPU-accelerated):**
```powershell
just build-local
```

Output location:
```
tauri/src-tauri/target/release/bundle/msi/
```

---

## Linux

Build for Linux (AppImage or .deb).

### Prerequisites

```bash
# Debian/Ubuntu
sudo apt update
sudo apt install bun nodejs python3.12 python3.12-venv rustc cargo

# Fedora/RHEL
sudo dnf install bun nodejs python3.12 rust cargo
```

### Setup

```bash
cd voicebox
just setup
```

### Build

```bash
just build
```

Output location:
```
tauri/src-tauri/target/release/bundle/appimage/
# or
tauri/src-tauri/target/release/bundle/deb/
```

---

## Development Builds

For testing without creating an installer:

```bash
# Full dev mode (backend + desktop app)
just dev

# Backend only
just dev-backend

# Desktop app only (backend must be running)
just dev-frontend
```

---

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| Build fails with "linker errors" | Run `rustup update` to get latest Rust |
| Tauri build timeout | Increase timeout in `tauri.conf.json` |
| Python venv corrupted | Delete `backend/venv` and run `just setup` again |
| Node modules outdated | Delete `node_modules` and run `bun install` |

### Clean Build

If build fails unexpectedly:

```bash
just clean-all  # Nuclear clean
just setup      # Fresh setup
just build      # Rebuild
```

### Verbose Build

To see full build output:

```bash
cd tauri/src-tauri
cargo build --release --verbose 2>&1 | tee build.log
```

---

## CI/CD

GitHub Actions automatically builds releases on tag push. See `.github/workflows/` for configuration.
