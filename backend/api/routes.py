import io
import os
import shutil
import uuid
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse, StreamingResponse

from api.schemas import (
    VoiceCloneRequest,
    VoiceDesignRequest,
    CustomVoiceRequest,
    GenerationResponse,
    ModelsResponse,
    ModelInfo,
    HealthResponse,
    Language,
    Speaker,
    ModelSize,
)
from config import get_settings
from auth import get_auth_dependency
from logging_config import get_logger
from services.audio_enhancement_service import audio_enhancement_service

settings = get_settings()
logger = get_logger()

# Use mock service for development (no GPU required)
if settings.mock_mode:
    from services.mock_service import MockTTSService
    tts_service = MockTTSService()
    logger.info("Running in MOCK MODE - no GPU required")
else:
    from services.tts_service import tts_service

router = APIRouter(prefix="/api", dependencies=get_auth_dependency())


@router.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint."""
    return HealthResponse(
        status="healthy",
        gpu_available=tts_service.gpu_available,
        models_loaded=tts_service.loaded_models,
    )


@router.get("/models", response_model=ModelsResponse)
async def get_models():
    """Get available models and their status."""
    models_info = tts_service.get_models_info()
    return ModelsResponse(
        models=[ModelInfo(**m) for m in models_info]
    )


@router.get("/speakers")
async def get_speakers():
    """Get preset speaker information."""
    return tts_service.get_speakers()


@router.get("/config")
async def get_config():
    """Get frontend configuration."""
    return {
        "enabled_model_sizes": settings.enabled_sizes,
        "mock_mode": settings.mock_mode,
        "enhancement_enabled": settings.enhancement_enabled,
        "enhancement_methods": settings.enhancement_methods_list if settings.enhancement_enabled else [],
    }


@router.get("/languages")
async def get_languages():
    """Get supported languages."""
    return [lang.value for lang in Language]


@router.post("/generate/clone", response_model=GenerationResponse)
async def generate_clone(
    text: str = Form(...),
    language: str = Form("English"),
    ref_text: str = Form(...),
    model_size: str = Form("1.7B"),
    ref_audio: UploadFile = File(...),
):
    """Generate speech using voice cloning from reference audio."""
    # Validate file size
    if ref_audio.size and ref_audio.size > settings.max_upload_size:
        max_mb = settings.max_upload_size // (1024 * 1024)
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum size is {max_mb}MB"
        )

    # Validate MIME type
    if ref_audio.content_type and ref_audio.content_type not in settings.audio_types_set:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type '{ref_audio.content_type}'. Allowed: WAV, MP3"
        )

    # Validate inputs
    if language not in [l.value for l in Language]:
        raise HTTPException(status_code=400, detail=f"Invalid language: {language}")
    if model_size not in [s.value for s in ModelSize]:
        raise HTTPException(status_code=400, detail=f"Invalid model size: {model_size}")

    # Save uploaded audio to cache
    audio_filename = f"{uuid.uuid4().hex}_{ref_audio.filename}"
    audio_path = os.path.join(settings.cache_path, audio_filename)

    try:
        with open(audio_path, "wb") as f:
            shutil.copyfileobj(ref_audio.file, f)

        result = await tts_service.generate_clone(
            text=text,
            language=language,
            ref_audio_path=audio_path,
            ref_text=ref_text,
            model_size=model_size,
        )

        logger.info(f"Voice clone generation completed: {result.get('filename', 'unknown')}")
        return GenerationResponse(**result)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Voice clone generation failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Audio generation failed. Please try again or check your input."
        )

    finally:
        # Cleanup uploaded file
        if os.path.exists(audio_path):
            os.remove(audio_path)


@router.post("/generate/design", response_model=GenerationResponse)
async def generate_design(request: VoiceDesignRequest):
    """Generate speech using voice design (create voice from description)."""
    try:
        result = await tts_service.generate_design(
            text=request.text,
            language=request.language.value,
            instruct=request.instruct,
        )
        logger.info(f"Voice design generation completed: {result.get('filename', 'unknown')}")
        return GenerationResponse(**result)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Voice design generation failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Audio generation failed. Please try again or check your input."
        )


@router.post("/generate/custom", response_model=GenerationResponse)
async def generate_custom(request: CustomVoiceRequest):
    """Generate speech using preset custom voices."""
    try:
        result = await tts_service.generate_custom(
            text=request.text,
            language=request.language.value,
            speaker=request.speaker.value,
            instruct=request.instruct,
            model_size=request.model_size.value,
        )
        logger.info(f"Custom voice generation completed: {result.get('filename', 'unknown')}")
        return GenerationResponse(**result)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Custom voice generation failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Audio generation failed. Please try again or check your input."
        )


_VALID_ENHANCE_METHODS = {"deepfilter", "lavasr", "chain"}
_VALID_ENHANCE_PRESETS = {"light", "medium", "aggressive"}


@router.post("/enhance")
async def enhance_audio(
    audio: UploadFile = File(...),
    method: str = Form("deepfilter"),
    preset: str = Form("medium"),
):
    """Enhance uploaded audio using ML-based noise suppression or quality enhancement.

    Methods: deepfilter (denoise), lavasr (bandwidth extension), chain (both in sequence)
    Presets: light (30% blend), medium (70% blend), aggressive (100% enhanced)
    """
    if not settings.enhancement_enabled:
        raise HTTPException(status_code=503, detail="Audio enhancement is disabled")

    if method not in _VALID_ENHANCE_METHODS:
        raise HTTPException(status_code=400, detail=f"Invalid method. Choose: {', '.join(sorted(_VALID_ENHANCE_METHODS))}")

    if preset not in _VALID_ENHANCE_PRESETS:
        raise HTTPException(status_code=400, detail=f"Invalid preset. Choose: {', '.join(sorted(_VALID_ENHANCE_PRESETS))}")

    if audio.size and audio.size > settings.max_upload_size:
        max_mb = settings.max_upload_size // (1024 * 1024)
        raise HTTPException(status_code=413, detail=f"File too large. Maximum size is {max_mb}MB")

    if audio.content_type and audio.content_type not in settings.audio_types_set:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type '{audio.content_type}'. Allowed: WAV, MP3"
        )

    try:
        audio_data = await audio.read()
        enhanced_data = audio_enhancement_service.enhance(audio_data, method=method, preset=preset)
        logger.info(f"Audio enhanced: method={method}, preset={preset}, size={len(enhanced_data)} bytes")
        return StreamingResponse(
            io.BytesIO(enhanced_data),
            media_type="audio/wav",
            headers={"Content-Disposition": "attachment; filename=enhanced.wav"},
        )
    except RuntimeError as e:
        # Enhancement library not installed
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.error(f"Audio enhancement failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Audio enhancement failed. Please try again.")


@router.get("/audio/{filename}")
async def get_audio(filename: str):
    """Serve generated audio files."""
    # Security: prevent path traversal attacks
    safe_filename = os.path.basename(filename)
    if not safe_filename or safe_filename != filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    filepath = os.path.join(settings.output_path, safe_filename)

    # Double-check the resolved path is within output directory
    real_filepath = os.path.realpath(filepath)
    real_output = os.path.realpath(settings.output_path)
    if not real_filepath.startswith(real_output + os.sep):
        raise HTTPException(status_code=400, detail="Invalid filename")

    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Audio file not found")

    return FileResponse(
        filepath,
        media_type="audio/wav",
        filename=safe_filename,
    )
