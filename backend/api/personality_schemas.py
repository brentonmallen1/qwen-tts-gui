from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

from .schemas import Language, ModelSize


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


class PersonalityResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    language: Language
    transcript: str
    audio_url: str
    audio_duration: Optional[float] = None
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
