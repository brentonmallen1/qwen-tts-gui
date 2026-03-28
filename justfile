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
    docker run --rm --gpus all nvidia/cuda:12.4.0-base-ubuntu22.04 nvidia-smi
