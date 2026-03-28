#!/bin/bash
set -e

echo "========================================"
echo "  Qwen3-TTS Server"
echo "========================================"
echo ""

# Display GPU info if available
if command -v nvidia-smi &> /dev/null; then
    echo "GPU Status:"
    nvidia-smi --query-gpu=name,memory.total,memory.free --format=csv,noheader
    echo ""
fi

# Create necessary directories
mkdir -p /models /cache /output

# Set permissions if PUID/PGID are set
if [ -n "$PUID" ] && [ -n "$PGID" ]; then
    echo "Setting permissions (PUID: $PUID, PGID: $PGID)"
    chown -R "$PUID:$PGID" /models /cache /output 2>/dev/null || true
fi

echo "Starting server on ${HOST:-0.0.0.0}:${PORT:-7860}"
echo ""

# Run the application
exec python main.py
