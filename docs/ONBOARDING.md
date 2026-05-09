# Voicebox Onboarding Guide

Welcome to Voicebox — the open-source voice synthesis studio. This guide will help you understand the project architecture, key concepts, and how to navigate the codebase.

---

## Project Overview

**Voicebox** is a cross-platform voice synthesis application built with:

| Layer | Technology |
|-------|------------|
| Frontend | React, Zustand, TanStack Router, Radix UI, Tailwind CSS |
| Backend | FastAPI (Python 3.12+), multiple TTS engines |
| Desktop | Tauri (Rust) |
| Build | Vite, PyInstaller |

**What it does**: Provides a unified interface for generating speech using multiple TTS engines (HumeAI TADA, Kokoro 82M, Qwen CustomVoice, and more).

---

## Architecture Layers

### 1. Frontend UI
React components and UI logic for the desktop and web apps.

**Key files:**
- `app/src/App.tsx` — Root component handling server lifecycle, auto-update, and initial routing
- `app/package.json` — React ecosystem dependencies (Zustand, React Query, TanStack Router, Radix UI, Tailwind)

### 2. Backend API
FastAPI routes, services, and TTS engine implementations.

**Key files:**
- `backend/app.py` — FastAPI application factory with CORS, GPU detection (CUDA/ROCm/MPS/MLX/XPU), and model lifecycle management
- `backend/routes/generations.py` — TTS generation endpoints (POST /generate, retry, regenerate, SSE streaming, direct WAV streaming)
- `backend/backends/base.py` — Shared utilities for all TTS engines: cache checking, device detection, voice prompt combination, and model loading progress

### 3. Desktop Platform
Tauri/Rust desktop app wrapper with system integration.

**Key file:**
- `tauri/src-tauri/src/main.rs` — Manages Python server lifecycle, audio capture/output, platform-specific process detection, and window events

### 4. Contributing & Release
Documentation and guides for development and release processes.

**Key files:**
- `CONTRIBUTING.md` — Setup via `just setup`, development workflow, API guidelines
- `CHANGELOG.md` — Release history (v0.4.0 added HumeAI TADA, Kokoro 82M, Qwen CustomVoice)
- Skills: `release-bump/`, `draft-release-notes/`, `triage-prs/`

### 5. Developer Guides
Step-by-step guides for adding features.

**Key file:**
- `.agents/skills/add-tts-engine/SKILL.md` — Multi-phase guide for integrating new TTS engines

---

## Key Concepts

| Concept | Description |
|---------|-------------|
| **Multi-Engine TTS** | Voicebox supports multiple TTS backends; `backend/backends/base.py` provides shared utilities for all |
| **GPU Acceleration** | Backend detects CUDA, ROCm, MPS, MLX, and XPU devices automatically |
| **Model Caching** | Shared cache checking and model loading with progress tracking |
| **Server Lifecycle** | Tauri manages Python backend auto-start/stop; frontend polls for health |
| **Voice Prompts** | Voice prompts are combined and processed through `base.py` utilities |

---

## Guided Tour

Follow these steps to understand the codebase:

### Step 1: Start at the Voicebox App Entry
**Files:** `app/src/App.tsx`, `app/package.json`

Understand how the frontend boots and mounts. The App component handles:
- Server auto-start and health-check polling
- Loading screen with cycling messages
- Lifecycle callbacks for platform integration

### Step 2: Explore the Backend TTS Architecture
**Files:** `backend/app.py`, `backend/routes/generations.py`, `backend/backends/base.py`

Delve into:
- FastAPI app factory with GPU detection
- TTS generation endpoints (generate, retry, regenerate, SSE streaming)
- Shared base utilities for multi-engine support

### Step 3: Understand the Desktop Platform Integration
**Files:** `tauri/src-tauri/src/main.rs`

See how the Rust-based Tauri app:
- Manages Python server lifecycle
- Handles audio capture and output
- Integrates with platform-specific features
- Handles window close events with keep-running functionality

### Step 4: Contribute and Release
**Files:** `CONTRIBUTING.md`, skills in `.agents/skills/`

Learn:
- Development setup with `just setup`
- Contribution workflow and code style
- Release management using custom skills (release-bump, draft-release-notes, triage-prs)

---

## File Map

| File | Purpose |
|------|---------|
| `app/src/App.tsx` | Root React component, server lifecycle, loading UI |
| `app/package.json` | Frontend dependencies: React, Zustand, React Query, TanStack Router, Radix UI, Tailwind |
| `backend/app.py` | FastAPI app factory, CORS, GPU detection, model lifecycle |
| `backend/routes/generations.py` | TTS generation endpoints with streaming support |
| `backend/backends/base.py` | Shared TTS utilities: cache, device detection, voice prompts |
| `backend/pyproject.toml` | Python config: Ruff linting, pytest testing |
| `tauri/src-tauri/src/main.rs` | Rust entry point: server management, audio, window events |
| `CONTRIBUTING.md` | Dev setup, workflow, API guidelines |
| `CHANGELOG.md` | Release history and notable changes |
| `.agents/skills/add-tts-engine/SKILL.md` | Guide for adding new TTS engines |

---

## Complexity Hotspots

Approach these areas carefully:

1. **`backend/backends/base.py`** — Core shared utilities used by all TTS engines. Changes here affect the entire backend.

2. **`backend/app.py`** — FastAPI app factory with complex lifecycle management (GPU detection, model loading/unloading). Multiple concerns are tangled here.

3. **`tauri/src-tauri/src/main.rs`** — Handles multiple platform concerns (server lifecycle, audio, window events). Platform-specific code can be tricky.

---

## Quick Start

```bash
# Install all dependencies
just setup

# Run in development
just dev          # Full stack (frontend + backend)
just dev-backend   # Backend only
just dev-frontend # Frontend only

# Lint and test
just lint          # Run Ruff
just test         # Run pytest

# Build for release
just build        # Build Tauri app
```

---

## Next Steps

1. Read `CONTRIBUTING.md` for detailed setup instructions
2. Explore `app/src/` to understand the React UI
3. Check `backend/backends/` to see how TTS engines are implemented
4. Review `CHANGELOG.md` to understand the project's evolution

---

*Generated from codebase analysis — last updated based on commit `476abe0`*
