import os
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse
from typing import Optional

from api.personality_schemas import (
    PersonalityCreate,
    PersonalityUpdate,
    PersonalityResponse,
    PersonalityListResponse,
    PersonalityGenerateRequest,
    PersonalityAudioUpdate,
    TranscribeResponse,
)
from api.schemas import Language, ModelSize, GenerationResponse
from services.personality_service import personality_service
from config import get_settings
from auth import get_auth_dependency
from logging_config import get_logger

settings = get_settings()
logger = get_logger()

router = APIRouter(prefix="/api/personalities", dependencies=get_auth_dependency())


@router.get("", response_model=PersonalityListResponse)
async def list_personalities():
    """List all personalities."""
    personalities = personality_service.list_all()
    return PersonalityListResponse(
        personalities=[PersonalityResponse(**p) for p in personalities],
        total=len(personalities),
    )


@router.post("", response_model=PersonalityResponse)
async def create_personality(
    name: str = Form(...),
    language: str = Form("English"),
    transcript: str = Form(...),
    description: Optional[str] = Form(None),
    audio: UploadFile = File(...),
):
    """Create a new personality with audio and transcript."""
    # Validate language
    if language not in [l.value for l in Language]:
        raise HTTPException(status_code=400, detail=f"Invalid language: {language}")

    # Validate file size
    if audio.size and audio.size > settings.max_upload_size:
        max_mb = settings.max_upload_size // (1024 * 1024)
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum size is {max_mb}MB"
        )

    # Validate MIME type
    if audio.content_type and audio.content_type not in settings.audio_types_set:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type '{audio.content_type}'. Allowed: WAV, MP3"
        )

    # Read audio data
    audio_data = await audio.read()

    # Validate audio duration
    valid, error_msg, duration = personality_service.validate_audio_duration(audio_data)
    if not valid:
        raise HTTPException(status_code=400, detail=error_msg)

    try:
        personality = personality_service.create(
            name=name,
            description=description,
            language=language,
            transcript=transcript,
            audio_data=audio_data,
        )

        if not personality:
            raise HTTPException(status_code=500, detail="Failed to create personality")

        logger.info(f"Personality created: {personality['id']}")
        return PersonalityResponse(**personality)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to create personality: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to create personality")


@router.get("/{personality_id}", response_model=PersonalityResponse)
async def get_personality(personality_id: str):
    """Get a personality by ID."""
    try:
        personality = personality_service.get(personality_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid personality ID")
    if not personality:
        raise HTTPException(status_code=404, detail="Personality not found")
    return PersonalityResponse(**personality)


@router.patch("/{personality_id}", response_model=PersonalityResponse)
async def update_personality(personality_id: str, update: PersonalityUpdate):
    """Update personality metadata."""
    try:
        personality = personality_service.update(
            personality_id=personality_id,
            name=update.name,
            description=update.description,
            language=update.language.value if update.language else None,
        )
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid personality ID")

    if not personality:
        raise HTTPException(status_code=404, detail="Personality not found")

    logger.info(f"Personality updated: {personality_id}")
    return PersonalityResponse(**personality)


@router.put("/{personality_id}/audio", response_model=PersonalityResponse)
async def update_personality_audio(
    personality_id: str,
    transcript: str = Form(...),
    audio: UploadFile = File(...),
):
    """Update personality audio and transcript."""
    # Validate file size
    if audio.size and audio.size > settings.max_upload_size:
        max_mb = settings.max_upload_size // (1024 * 1024)
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum size is {max_mb}MB"
        )

    # Validate MIME type
    if audio.content_type and audio.content_type not in settings.audio_types_set:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type '{audio.content_type}'. Allowed: WAV, MP3"
        )

    # Read audio data
    audio_data = await audio.read()

    # Validate audio duration
    valid, error_msg, duration = personality_service.validate_audio_duration(audio_data)
    if not valid:
        raise HTTPException(status_code=400, detail=error_msg)

    try:
        personality = personality_service.update_audio(
            personality_id=personality_id,
            transcript=transcript,
            audio_data=audio_data,
        )
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid personality ID")

    if not personality:
        raise HTTPException(status_code=404, detail="Personality not found")

    logger.info(f"Personality audio updated: {personality_id}")
    return PersonalityResponse(**personality)


@router.delete("/{personality_id}")
async def delete_personality(personality_id: str):
    """Delete a personality."""
    try:
        deleted = personality_service.delete(personality_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid personality ID")
    if not deleted:
        raise HTTPException(status_code=404, detail="Personality not found")

    logger.info(f"Personality deleted: {personality_id}")
    return {"status": "deleted", "id": personality_id}


@router.get("/{personality_id}/audio")
async def get_personality_audio(personality_id: str):
    """Serve personality reference audio."""
    try:
        audio_path = personality_service.get_audio_file_path(personality_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid personality ID")
    if not audio_path:
        raise HTTPException(status_code=404, detail="Audio file not found")

    return FileResponse(
        str(audio_path),
        media_type="audio/wav",
        filename=f"{personality_id}_reference.wav",
    )


# Transcription endpoint - separate router for /api prefix
transcribe_router = APIRouter(prefix="/api", dependencies=get_auth_dependency())


@transcribe_router.post("/transcribe", response_model=TranscribeResponse)
async def transcribe_audio(audio: UploadFile = File(...)):
    """Transcribe audio using Whisper."""
    # Validate file size
    if audio.size and audio.size > settings.max_upload_size:
        max_mb = settings.max_upload_size // (1024 * 1024)
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum size is {max_mb}MB"
        )

    # Validate MIME type
    if audio.content_type and audio.content_type not in settings.audio_types_set:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type '{audio.content_type}'. Allowed: WAV, MP3"
        )

    # Read audio data
    audio_data = await audio.read()

    try:
        from services.whisper_service import whisper_service

        transcript, duration = whisper_service.transcribe(audio_data)

        logger.info(f"Audio transcribed: {duration:.1f}s")
        return TranscribeResponse(transcript=transcript, duration=duration)

    except ImportError:
        raise HTTPException(
            status_code=503,
            detail="Whisper service not available. Please install faster-whisper."
        )
    except Exception as e:
        logger.error(f"Transcription failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Transcription failed")


# Generation with personality - separate router for /api/generate prefix
generate_router = APIRouter(prefix="/api/generate", dependencies=get_auth_dependency())


@generate_router.post("/personality", response_model=GenerationResponse)
async def generate_with_personality(
    personality_id: str = Form(...),
    text: str = Form(...),
    model_size: str = Form("1.7B"),
):
    """Generate speech using a saved personality."""
    # Validate model size
    if model_size not in [s.value for s in ModelSize]:
        raise HTTPException(status_code=400, detail=f"Invalid model size: {model_size}")

    # Get personality
    try:
        personality = personality_service.get(personality_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid personality ID")
    if not personality:
        raise HTTPException(status_code=404, detail="Personality not found")

    # Get audio file path
    try:
        audio_path = personality_service.get_audio_file_path(personality_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid personality ID")
    if not audio_path:
        raise HTTPException(status_code=404, detail="Personality audio not found")

    try:
        # Import TTS service (handles mock mode)
        if settings.mock_mode:
            from services.mock_service import MockTTSService
            tts_service = MockTTSService()
        else:
            from services.tts_service import tts_service

        result = await tts_service.generate_clone(
            text=text,
            language=personality["language"],
            ref_audio_path=str(audio_path),
            ref_text=personality["transcript"],
            model_size=model_size,
        )

        logger.info(f"Personality generation completed: {result.get('filename', 'unknown')} using {personality_id}")
        return GenerationResponse(**result)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Personality generation failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Audio generation failed. Please try again."
        )
