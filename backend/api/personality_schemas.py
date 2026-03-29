from pydantic import BaseModel, Field, field_validator
from typing import Optional
from datetime import datetime

from .schemas import Language, ModelSize


class Segment(BaseModel):
    """A segment of audio defined by start and end times in seconds."""
    start: float = Field(..., ge=0)
    end: float = Field(..., gt=0)

    @field_validator('end')
    @classmethod
    def end_after_start(cls, v: float, info) -> float:
        if 'start' in info.data and v <= info.data['start']:
            raise ValueError('end must be greater than start')
        return v


class PersonalityBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    language: Language = Language.ENGLISH


class PersonalityCreate(PersonalityBase):
    transcript: str = Field(..., min_length=1, max_length=2000)


class PersonalityUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    language: Optional[Language] = None


class PersonalityAudioUpdate(BaseModel):
    transcript: str = Field(..., min_length=1, max_length=2000)
    segments: Optional[list[Segment]] = Field(None, max_length=5)


class PersonalityResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    language: Language
    transcript: str
    audio_url: str  # URL to reference.wav (concatenated segments for TTS)
    original_url: Optional[str] = None  # URL to original.wav (full upload for editing)
    segments: list[Segment] = []  # Segment definitions from original
    audio_duration: Optional[float] = None  # Duration of reference.wav
    created_at: datetime
    updated_at: datetime


class PersonalityListResponse(BaseModel):
    personalities: list[PersonalityResponse]
    total: int


class PersonalityGenerateRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=5000)
    model_size: ModelSize = ModelSize.LARGE


class TranscribeResponse(BaseModel):
    transcript: str
    duration: Optional[float] = None
