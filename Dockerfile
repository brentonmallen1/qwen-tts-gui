# Stage 1: Build frontend
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

# Copy package files
COPY frontend/package.json frontend/package-lock.json* ./

# Install dependencies
RUN npm install

# Copy source files
COPY frontend/ .

# Build frontend
RUN npm run build

# Stage 2: Python runtime with CUDA (Ubuntu 24.04 has Python 3.12 built-in)
FROM nvidia/cuda:12.9.0-runtime-ubuntu24.04 AS runtime

# Prevent interactive prompts
ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-venv \
    libsndfile1 \
    ffmpeg \
    sox \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app

# Copy dependency files first for better caching
COPY backend/pyproject.toml backend/uv.lock* ./

# Install dependencies with uv (including TTS extras for production)
RUN uv sync --extra tts --frozen --no-dev

# Install FlashAttention (optional, may fail on some systems)
RUN uv pip install flash-attn --no-build-isolation 2>/dev/null || echo "FlashAttention not available, continuing..."

# Copy backend code, but preserve the .venv created by uv sync
RUN mv .venv /tmp/.venv-backup
COPY backend/ .
RUN rm -rf .venv && mv /tmp/.venv-backup .venv

# Copy built frontend
COPY --from=frontend-builder /app/frontend/dist ./static

# Create non-root user for security
ARG PUID=1000
ARG PGID=1000
RUN groupadd -g ${PGID} appgroup 2>/dev/null; \
    useradd -u ${PUID} -g ${PGID} -m -s /bin/bash appuser 2>/dev/null; \
    exit 0

# Create directories for volumes and set ownership (use numeric IDs for robustness)
RUN mkdir -p /models /cache /output /personalities && \
    chown -R ${PUID}:${PGID} /app /models /cache /output /personalities

# Environment variables
ENV PYTHONUNBUFFERED=1
ENV HF_HOME=/models
ENV HF_HUB_CACHE=/models
ENV TRANSFORMERS_CACHE=/models
ENV HOST=0.0.0.0
ENV PORT=7860

# Expose port
EXPOSE 7860

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:7860/api/health || exit 1

# Switch to non-root user
# Switch to non-root user (use numeric UID for robustness)
USER ${PUID}

# Run the application
CMD ["uv", "run", "python", "main.py"]
