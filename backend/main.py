import os
import secrets
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, Response
from starlette.middleware.base import BaseHTTPMiddleware
import base64

from api.routes import router
from api.personality_routes import router as personality_router, transcribe_router, generate_router
from config import get_settings
from logging_config import setup_logging, RequestLoggingMiddleware, get_logger

settings = get_settings()

# Initialize logging
logger = setup_logging(settings.log_level)


class BasicAuthMiddleware(BaseHTTPMiddleware):
    """Middleware to protect frontend routes with basic auth."""

    async def dispatch(self, request: Request, call_next):
        # Skip auth if disabled
        if not settings.auth_enabled:
            return await call_next(request)

        # Skip auth for API routes (handled by route dependencies)
        if request.url.path.startswith("/api/"):
            return await call_next(request)

        # Check authorization header
        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Basic "):
            return Response(
                content="Authentication required",
                status_code=401,
                headers={"WWW-Authenticate": "Basic realm='Qwen TTS'"},
            )

        try:
            credentials = base64.b64decode(auth_header[6:]).decode("utf-8")
            username, password = credentials.split(":", 1)
        except Exception:
            return Response(
                content="Invalid credentials",
                status_code=401,
                headers={"WWW-Authenticate": "Basic realm='Qwen TTS'"},
            )

        correct_username = secrets.compare_digest(
            username.encode("utf-8"),
            settings.auth_username.encode("utf-8"),
        )
        correct_password = secrets.compare_digest(
            password.encode("utf-8"),
            settings.auth_password.encode("utf-8"),
        )

        if not (correct_username and correct_password):
            return Response(
                content="Invalid credentials",
                status_code=401,
                headers={"WWW-Authenticate": "Basic realm='Qwen TTS'"},
            )

        return await call_next(request)

# Set environment variables before importing torch
os.environ["HF_HOME"] = settings.hf_home
os.environ["CUDA_VISIBLE_DEVICES"] = settings.cuda_visible_devices
if settings.hf_token:
    os.environ["HF_TOKEN"] = settings.hf_token


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Validate auth configuration
    if settings.auth_enabled and not settings.auth_password:
        logger.error("AUTH_ENABLED=true but AUTH_PASSWORD is not set!")
        logger.error("Please set AUTH_PASSWORD in your .env file")
        raise SystemExit(1)

    # Startup banner
    logger.info("=" * 50)
    logger.info("Qwen3-TTS Server Starting")
    logger.info("=" * 50)
    logger.info(f"URL: http://{settings.host}:{settings.port}")
    logger.info(f"Auth: {'Enabled' if settings.auth_enabled else 'Disabled'}")
    logger.info(f"Mock Mode: {settings.mock_mode}")
    if not settings.mock_mode:
        logger.info(f"GPU: {os.environ.get('CUDA_VISIBLE_DEVICES', 'N/A')}")
    logger.info(f"Output: {settings.output_path}")
    logger.info("=" * 50)

    # Optionally preload models
    if settings.preload_models and not settings.mock_mode:
        from services.tts_service import tts_service
        logger.info("Preloading models...")
        for size in settings.enabled_sizes:
            try:
                logger.info(f"Loading model: {size}")
                tts_service._load_model(size)
                logger.info(f"Model {size} loaded successfully")
            except Exception as e:
                logger.error(f"Failed to preload model {size}: {e}")

    yield

    # Shutdown
    logger.info("Shutting down Qwen3-TTS Server")


app = FastAPI(
    title="Qwen3-TTS Web GUI",
    description="Self-hosted Text-to-Speech with Voice Cloning, Voice Design, and Custom Voices",
    version="1.0.0",
    lifespan=lifespan,
)

# Request logging middleware
app.add_middleware(RequestLoggingMiddleware)

# Basic auth middleware (protects frontend routes when enabled)
app.add_middleware(BasicAuthMiddleware)

# CORS middleware - configure allowed origins
if settings.allowed_origins:
    cors_origins = [o.strip() for o in settings.allowed_origins.split(",") if o.strip()]
else:
    # Default: allow localhost for development
    cors_origins = [
        "http://localhost:3000",
        "http://localhost:7860",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:7860",
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)


# Security headers middleware
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response

# Include API routes
app.include_router(router)
app.include_router(personality_router)
app.include_router(transcribe_router)
app.include_router(generate_router)

# Serve static frontend files (in production)
STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
if os.path.exists(STATIC_DIR):
    app.mount("/assets", StaticFiles(directory=os.path.join(STATIC_DIR, "assets")), name="assets")

    @app.get("/")
    async def serve_frontend():
        return FileResponse(os.path.join(STATIC_DIR, "index.html"))

    @app.get("/{path:path}")
    async def serve_frontend_routes(path: str):
        # Try to serve the file if it exists
        file_path = os.path.join(STATIC_DIR, path)
        real_path = os.path.realpath(file_path)
        real_static = os.path.realpath(STATIC_DIR)

        # Security: prevent path traversal attacks
        if not real_path.startswith(real_static + os.sep) and real_path != real_static:
            return FileResponse(os.path.join(STATIC_DIR, "index.html"))

        if os.path.exists(real_path) and os.path.isfile(real_path):
            return FileResponse(real_path)
        # Otherwise serve index.html for client-side routing
        return FileResponse(os.path.join(STATIC_DIR, "index.html"))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        workers=settings.workers,
        reload=False,
    )
