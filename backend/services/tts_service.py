import os
import uuid
import torch
import soundfile as sf
from pathlib import Path
from typing import Optional, Tuple
from contextlib import asynccontextmanager

from config import get_settings

settings = get_settings()

# Model registry
MODELS = {
    "clone": {
        "1.7B": "Qwen/Qwen3-TTS-12Hz-1.7B-Base",
        "0.6B": "Qwen/Qwen3-TTS-12Hz-0.6B-Base",
    },
    "design": {
        "1.7B": "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign",
    },
    "custom": {
        "1.7B": "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice",
        "0.6B": "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice",
    },
}

# Preset speakers info
SPEAKERS = {
    "Vivian": {"language": "Chinese", "description": "Bright, slightly edgy young female"},
    "Serena": {"language": "Chinese", "description": "Warm, gentle young female"},
    "Uncle_Fu": {"language": "Chinese", "description": "Seasoned male with low, mellow timbre"},
    "Dylan": {"language": "Chinese", "description": "Youthful Beijing male with clear timbre"},
    "Eric": {"language": "Chinese", "description": "Lively Sichuan male, husky brightness"},
    "Ryan": {"language": "English", "description": "Dynamic male with strong rhythmic drive"},
    "Aiden": {"language": "English", "description": "Sunny American male with clear midrange"},
    "Ono_Anna": {"language": "Japanese", "description": "Playful Japanese female, light timbre"},
    "Sohee": {"language": "Korean", "description": "Warm Korean female with rich emotion"},
}


class TTSService:
    def __init__(self):
        self._models: dict = {}
        self._device = "cuda" if torch.cuda.is_available() else "cpu"
        self._dtype = torch.bfloat16 if self._device == "cuda" else torch.float32

        # Ensure output directory exists
        os.makedirs(settings.output_path, exist_ok=True)
        os.makedirs(settings.cache_path, exist_ok=True)

    @property
    def gpu_available(self) -> bool:
        return torch.cuda.is_available()

    @property
    def loaded_models(self) -> list[str]:
        return list(self._models.keys())

    def _get_model_key(self, mode: str, size: str) -> str:
        return f"{mode}_{size}"

    def _load_model(self, mode: str, size: str):
        """Load a model if not already loaded."""
        from qwen_tts import Qwen3TTSModel

        key = self._get_model_key(mode, size)

        if key in self._models:
            return self._models[key]

        model_name = MODELS.get(mode, {}).get(size)
        if not model_name:
            raise ValueError(f"Model not available: {mode} {size}")

        # Build model kwargs
        kwargs = {
            "device_map": self._device,
            "dtype": self._dtype,
        }

        # Add FlashAttention if available and enabled
        if settings.use_flash_attention and self._device == "cuda":
            try:
                import flash_attn
                kwargs["attn_implementation"] = "flash_attention_2"
            except ImportError:
                pass  # FlashAttention not available

        model = Qwen3TTSModel.from_pretrained(model_name, **kwargs)
        self._models[key] = model
        return model

    def _save_audio(self, audio_data, sample_rate: int) -> Tuple[str, str]:
        """Save audio to file and return filename and path."""
        filename = f"{uuid.uuid4().hex}.wav"
        filepath = os.path.join(settings.output_path, filename)
        sf.write(filepath, audio_data, sample_rate)
        return filename, filepath

    def _get_audio_duration(self, filepath: str) -> float:
        """Get audio duration in seconds."""
        import librosa
        duration = librosa.get_duration(path=filepath)
        return round(duration, 2)

    async def generate_clone(
        self,
        text: str,
        language: str,
        ref_audio_path: str,
        ref_text: str,
        model_size: str = "1.7B",
    ) -> dict:
        """Generate speech using voice cloning."""
        model = self._load_model("clone", model_size)

        wavs, sr = model.generate_voice_clone(
            text=text,
            language=language,
            ref_audio=ref_audio_path,
            ref_text=ref_text,
        )

        filename, filepath = self._save_audio(wavs[0], sr)
        duration = self._get_audio_duration(filepath)

        return {
            "audio_url": f"/api/audio/{filename}",
            "filename": filename,
            "duration": duration,
            "sample_rate": sr,
        }

    async def generate_design(
        self,
        text: str,
        language: str,
        instruct: str,
    ) -> dict:
        """Generate speech using voice design (create voice from description)."""
        model = self._load_model("design", "1.7B")  # Only 1.7B available

        wavs, sr = model.generate_voice_design(
            text=text,
            language=language,
            instruct=instruct,
        )

        filename, filepath = self._save_audio(wavs[0], sr)
        duration = self._get_audio_duration(filepath)

        return {
            "audio_url": f"/api/audio/{filename}",
            "filename": filename,
            "duration": duration,
            "sample_rate": sr,
        }

    async def generate_custom(
        self,
        text: str,
        language: str,
        speaker: str,
        instruct: Optional[str] = None,
        model_size: str = "1.7B",
    ) -> dict:
        """Generate speech using preset custom voices."""
        model = self._load_model("custom", model_size)

        wavs, sr = model.generate_custom_voice(
            text=text,
            language=language,
            speaker=speaker,
            instruct=instruct,
        )

        filename, filepath = self._save_audio(wavs[0], sr)
        duration = self._get_audio_duration(filepath)

        return {
            "audio_url": f"/api/audio/{filename}",
            "filename": filename,
            "duration": duration,
            "sample_rate": sr,
        }

    def get_models_info(self) -> list[dict]:
        """Get information about available models."""
        models = []
        for mode, sizes in MODELS.items():
            for size, name in sizes.items():
                key = self._get_model_key(mode, size)
                models.append({
                    "name": name,
                    "size": size,
                    "mode": mode,
                    "loaded": key in self._models,
                })
        return models

    def get_speakers(self) -> dict:
        """Get preset speakers information."""
        return SPEAKERS


# Singleton instance
tts_service = TTSService()
