from pydantic import BaseModel, Field
from typing import Optional, Literal
from enum import Enum


class ModelSize(str, Enum):
    SMALL = "0.6B"
    LARGE = "1.7B"


class Language(str, Enum):
    CHINESE = "Chinese"
    ENGLISH = "English"
    JAPANESE = "Japanese"
    KOREAN = "Korean"
    GERMAN = "German"
    FRENCH = "French"
    RUSSIAN = "Russian"
    PORTUGUESE = "Portuguese"
    SPANISH = "Spanish"
    ITALIAN = "Italian"


class Speaker(str, Enum):
    VIVIAN = "Vivian"
    SERENA = "Serena"
    UNCLE_FU = "Uncle_Fu"
    DYLAN = "Dylan"
    ERIC = "Eric"
    RYAN = "Ryan"
    AIDEN = "Aiden"
    ONO_ANNA = "Ono_Anna"
    SOHEE = "Sohee"


# Request schemas
class VoiceCloneRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=5000)
    language: Language = Language.ENGLISH
    ref_text: str = Field(..., min_length=1, max_length=2000)
    model_size: ModelSize = ModelSize.LARGE


class VoiceDesignRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=5000)
    language: Language = Language.ENGLISH
    instruct: str = Field(..., min_length=1, max_length=2000)
    # VoiceDesign only available in 1.7B


class CustomVoiceRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=5000)
    language: Language = Language.ENGLISH
    speaker: Speaker = Speaker.RYAN
    instruct: Optional[str] = Field(None, max_length=2000)
    model_size: ModelSize = ModelSize.LARGE


# Response schemas
class GenerationResponse(BaseModel):
    audio_url: str
    filename: str
    duration: Optional[float] = None
    sample_rate: int = 24000


class ModelInfo(BaseModel):
    name: str
    size: str
    mode: str
    loaded: bool


class ModelsResponse(BaseModel):
    models: list[ModelInfo]


class HealthResponse(BaseModel):
    status: str
    gpu_available: bool
    models_loaded: list[str]
