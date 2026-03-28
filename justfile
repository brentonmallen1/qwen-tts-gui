# Qwen3-TTS Development Commands
# Usage: just <command>

# Default: show available commands
default:
    @just --list

# ─────────────────────────────────────────────────────────
# Development (Mac - no GPU)
# ─────────────────────────────────────────────────────────

# Install all dependencies (backend + frontend)
install:
    cd backend && uv sync
    cd frontend && npm install

# Install with full TTS dependencies (requires CUDA GPU)
install-full:
    cd backend && uv sync --extra tts
    cd frontend && npm install

# Run backend in mock mode (no GPU required)
backend:
    cp -n .env.dev backend/.env 2>/dev/null || true
    cd backend && uv run python main.py

# Run frontend dev server (with hot reload)
frontend:
    cd frontend && npm run dev

# Run both backend and frontend (use two terminals, or run this then `just frontend` in another)
dev:
    @echo "Starting backend in mock mode..."
    @echo "Run 'just frontend' in another terminal for the frontend"
    @just backend

# ─────────────────────────────────────────────────────────
# Docker
# ─────────────────────────────────────────────────────────

# Build Docker image
build:
    docker compose build

# Start container (production with GPU)
up:
    docker compose up -d

# Stop container
down:
    docker compose down

# View logs
logs:
    docker compose logs -f

# Rebuild and restart
rebuild:
    docker compose down
    docker compose build
    docker compose up -d

# Shell into running container
shell:
    docker exec -it qwen-tts /bin/bash

# ─────────────────────────────────────────────────────────
# Frontend Build
# ─────────────────────────────────────────────────────────

# Build frontend for production
build-frontend:
    cd frontend && npm run build

# Preview production build locally
preview-frontend:
    cd frontend && npm run preview

# ─────────────────────────────────────────────────────────
# Model Management
# ─────────────────────────────────────────────────────────

# Download all TTS models to local cache (run before first use)
download-models:
    #!/usr/bin/env bash
    set -euo pipefail

    # Load env for MODELS_PATH
    if [ -f .env ]; then
        source .env
    fi

    MODELS_PATH="${MODELS_PATH:-./data/models}"
    mkdir -p "$MODELS_PATH"

    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Downloading Qwen3-TTS models to: $MODELS_PATH"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    # All available models
    MODELS=(
        "Qwen/Qwen3-TTS-12Hz-1.7B-Base"
        "Qwen/Qwen3-TTS-12Hz-0.6B-Base"
        "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign"
        "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice"
        "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice"
        "Systran/faster-whisper-base"
    )

    for MODEL in "${MODELS[@]}"; do
        echo ""
        echo "📦 Downloading: $MODEL"
        echo "─────────────────────────────────────────"
        HF_HUB_CACHE="$MODELS_PATH" huggingface-cli download "$MODEL"
    done

    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "✅ All models downloaded!"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Download only the base models (voice cloning)
download-models-base:
    #!/usr/bin/env bash
    set -euo pipefail
    if [ -f .env ]; then source .env; fi
    MODELS_PATH="${MODELS_PATH:-./data/models}"
    mkdir -p "$MODELS_PATH"
    echo "Downloading base models for voice cloning..."
    HF_HUB_CACHE="$MODELS_PATH" huggingface-cli download "Qwen/Qwen3-TTS-12Hz-1.7B-Base"
    HF_HUB_CACHE="$MODELS_PATH" huggingface-cli download "Systran/faster-whisper-base"
    echo "✅ Base models downloaded!"

# Download models inside Docker container
download-models-docker:
    docker exec -it qwen-tts python -c "from huggingface_hub import snapshot_download; \
        models = ['Qwen/Qwen3-TTS-12Hz-1.7B-Base', 'Qwen/Qwen3-TTS-12Hz-0.6B-Base', \
                  'Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign', 'Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice', \
                  'Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice', 'Systran/faster-whisper-base']; \
        [print(f'Downloading {m}...') or snapshot_download(m) for m in models]; \
        print('Done!')"

# ─────────────────────────────────────────────────────────
# Utilities
# ─────────────────────────────────────────────────────────

# Clean generated files and caches
clean:
    rm -rf data/output/*.wav
    rm -rf data/cache/*
    rm -rf frontend/dist
    rm -rf frontend/node_modules/.vite
    find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true

# Clean everything including models (careful!)
clean-all: clean
    rm -rf data/models/*

# Create data directories
init:
    mkdir -p data/models data/cache data/output

# Check if Docker GPU is working
check-gpu:
    docker run --rm --gpus all nvidia/cuda:12.9.0-base-ubuntu24.04 nvidia-smi

# ─────────────────────────────────────────────────────────
# Release
# ─────────────────────────────────────────────────────────

# Generate CalVer version (YYYY.MM.DD or YYYY.MM.DD.N for multiple releases per day)
_calver:
    #!/usr/bin/env bash
    TODAY=$(date +%Y.%m.%d)
    # Check for existing tags with today's date
    EXISTING=$(git tag -l "${TODAY}*" 2>/dev/null | sort -V | tail -1)
    if [ -z "$EXISTING" ]; then
        echo "$TODAY"
    elif [ "$EXISTING" = "$TODAY" ]; then
        echo "${TODAY}.1"
    else
        # Extract patch number and increment
        PATCH=$(echo "$EXISTING" | sed "s/${TODAY}\.//")
        echo "${TODAY}.$((PATCH + 1))"
    fi

# Show what version would be released
version:
    @echo "Next version: $(just _calver)"

# Build and push release to registry
release:
    #!/usr/bin/env bash
    set -euo pipefail

    # Load registry from .env
    if [ -f .env ]; then
        source .env
    fi

    if [ -z "${DOCKER_REGISTRY:-}" ]; then
        echo "Error: DOCKER_REGISTRY not set in .env"
        echo "Example: DOCKER_REGISTRY=docker.io/username"
        exit 1
    fi

    VERSION=$(just _calver)
    IMAGE="${DOCKER_REGISTRY}/qwen-tts"

    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Releasing qwen-tts v${VERSION}"
    echo "Image: ${IMAGE}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    # Build for linux/amd64 and push
    docker buildx build \
        --platform linux/amd64 \
        --tag "${IMAGE}:${VERSION}" \
        --tag "${IMAGE}:latest" \
        --push \
        .

    # Create git tag
    git tag -a "${VERSION}" -m "Release ${VERSION}"
    git push origin "${VERSION}"

    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Released ${IMAGE}:${VERSION}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Build release locally without pushing (for testing)
release-local:
    #!/usr/bin/env bash
    set -euo pipefail
    VERSION=$(just _calver)
    echo "Building qwen-tts:${VERSION} locally..."
    docker buildx build \
        --platform linux/amd64 \
        --tag "qwen-tts:${VERSION}" \
        --tag "qwen-tts:latest" \
        --load \
        .
