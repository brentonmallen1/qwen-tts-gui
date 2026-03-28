import os
import shutil
import uuid
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse

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
