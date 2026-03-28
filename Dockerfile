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

# Stage 2: Python runtime with CUDA
FROM nvidia/cuda:12.4.0-runtime-ubuntu22.04 AS runtime

# Prevent interactive prompts
ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies
RUN apt-get update && apt-get install -y \
    python3.12 \
    python3.12-venv \
    libsndfile1 \
    ffmpeg \
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
RUN uv pip install flash-attn --no-build-isolation || echo "FlashAttention not available"

# Copy backend code
COPY backend/ .

# Copy built frontend
COPY --from=frontend-builder /app/frontend/dist ./static

# Create non-root user for security
ARG PUID=1000
ARG PGID=1000
RUN groupadd -g ${PGID} appgroup && \
    useradd -u ${PUID} -g appgroup -m -s /bin/bash appuser

# Create directories for volumes and set ownership
RUN mkdir -p /models /cache /output /personalities && \
    chown -R appuser:appgroup /app /models /cache /output /personalities

# Environment variables
ENV PYTHONUNBUFFERED=1
ENV HF_HOME=/models
ENV TRANSFORMERS_CACHE=/models
ENV HOST=0.0.0.0
ENV PORT=7860

# Expose port
EXPOSE 7860

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:7860/api/health || exit 1

# Switch to non-root user
USER appuser

# Run the application
CMD ["uv", "run", "python", "main.py"]
