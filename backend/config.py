import os
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Server
    host: str = "0.0.0.0"
    port: int = 7860
    workers: int = 1

    # Paths (defaults work for local dev, overridden in Docker)
    model_path: str = "./data/models"
    cache_path: str = "./data/cache"
    output_path: str = "./data/output"
    personalities_path: str = "./data/personalities"

    # Whisper transcription
    # Options: tiny (~75MB), base (~150MB), small (~500MB), medium (~1.5GB), large-v3 (~3GB)
    whisper_model: str = "base"

    # GPU
    cuda_visible_devices: str = "0"
    use_flash_attention: bool = True

    # Model defaults
    # Note: Voice Design requires 1.7B - only Voice Clone and Custom Voice work with 0.6B
    enabled_model_sizes: str = "1.7B"  # Comma-separated: "0.6B", "1.7B", or "0.6B,1.7B"
    preload_models: bool = False

    @property
    def enabled_sizes(self) -> list[str]:
        """Parse enabled model sizes into a list."""
        return [s.strip() for s in self.enabled_model_sizes.split(",") if s.strip()]

    # Development
    mock_mode: bool = False  # Use mock service (no GPU required)

    # HuggingFace
    hf_home: str = "/models"
    hf_token: str = ""

    # Authentication
    auth_enabled: bool = False
    auth_username: str = "admin"
    auth_password: str = ""  # Must be set if auth_enabled=True

    # Security
    max_upload_size: int = 52428800  # 50MB in bytes
    allowed_origins: str = ""  # Comma-separated list, empty = localhost-only (dev)
    allowed_audio_types: str = "audio/wav,audio/mpeg,audio/mp3,audio/x-wav,audio/wave,audio/x-pn-wav"

    @property
    def audio_types_set(self) -> set[str]:
        """Parse allowed audio types into a set."""
        return {t.strip() for t in self.allowed_audio_types.split(",") if t.strip()}

    # Logging
    log_level: str = "INFO"

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache
def get_settings() -> Settings:
    return Settings()
