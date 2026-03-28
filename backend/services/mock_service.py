"""Mock TTS service for development/testing without GPU."""

import os
import uuid
import time
import math
import struct
import wave
from typing import Optional

from config import get_settings

settings = get_settings()


def generate_sine_wave(duration: float = 2.0, frequency: float = 440.0, sample_rate: int = 24000) -> bytes:
    """Generate a simple sine wave as mock audio."""
    num_samples = int(duration * sample_rate)
    audio_data = []

    for i in range(num_samples):
        # Generate sine wave with fade in/out
        t = i / sample_rate
        fade = min(t * 4, 1.0) * min((duration - t) * 4, 1.0)  # Fade envelope
        sample = int(32767 * fade * 0.3 * math.sin(2 * math.pi * frequency * t))
        audio_data.append(struct.pack('<h', sample))

    return b''.join(audio_data)


def create_wav_file(audio_data: bytes, sample_rate: int, filepath: str):
    """Create a WAV file from raw audio data."""
    with wave.open(filepath, 'wb') as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(audio_data)


class MockTTSService:
    """Mock service that generates placeholder audio for testing."""

    def __init__(self):
        os.makedirs(settings.output_path, exist_ok=True)
        os.makedirs(settings.cache_path, exist_ok=True)
        self._loaded_models = []

    @property
    def gpu_available(self) -> bool:
        return False  # Mock mode, no GPU

    @property
    def loaded_models(self) -> list[str]:
        return self._loaded_models

    def _generate_mock_audio(self, text: str) -> tuple[str, str, float]:
        """Generate a mock audio file based on text length."""
        # Estimate duration based on text length (~150 words per minute)
        words = len(text.split())
        duration = max(1.0, min(words / 2.5, 30.0))  # 1-30 seconds

        # Generate mock audio
        sample_rate = 24000
        audio_data = generate_sine_wave(duration, 440.0, sample_rate)

        # Save to file
        filename = f"{uuid.uuid4().hex}.wav"
        filepath = os.path.join(settings.output_path, filename)
        create_wav_file(audio_data, sample_rate, filepath)

        # Simulate processing time
        time.sleep(0.5)

        return filename, filepath, duration

    async def generate_clone(
        self,
        text: str,
        language: str,
        ref_audio_path: str,
        ref_text: str,
        model_size: str = "1.7B",
    ) -> dict:
        """Mock voice cloning - returns placeholder audio."""
        self._loaded_models = [f"clone_{model_size}"]
        filename, filepath, duration = self._generate_mock_audio(text)

        return {
            "audio_url": f"/api/audio/{filename}",
            "filename": filename,
            "duration": round(duration, 2),
            "sample_rate": 24000,
        }

    async def generate_design(
        self,
        text: str,
        language: str,
        instruct: str,
    ) -> dict:
        """Mock voice design - returns placeholder audio."""
        self._loaded_models = ["design_1.7B"]
        filename, filepath, duration = self._generate_mock_audio(text)

        return {
            "audio_url": f"/api/audio/{filename}",
            "filename": filename,
            "duration": round(duration, 2),
            "sample_rate": 24000,
        }

    async def generate_custom(
        self,
        text: str,
        language: str,
        speaker: str,
        instruct: Optional[str] = None,
        model_size: str = "1.7B",
    ) -> dict:
        """Mock custom voice - returns placeholder audio."""
        self._loaded_models = [f"custom_{model_size}"]
        filename, filepath, duration = self._generate_mock_audio(text)

        return {
            "audio_url": f"/api/audio/{filename}",
            "filename": filename,
            "duration": round(duration, 2),
            "sample_rate": 24000,
        }

    def get_models_info(self) -> list[dict]:
        """Get mock model information."""
        return [
            {"name": "Qwen/Qwen3-TTS-12Hz-1.7B-Base", "size": "1.7B", "mode": "clone", "loaded": False},
            {"name": "Qwen/Qwen3-TTS-12Hz-0.6B-Base", "size": "0.6B", "mode": "clone", "loaded": False},
            {"name": "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign", "size": "1.7B", "mode": "design", "loaded": False},
            {"name": "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice", "size": "1.7B", "mode": "custom", "loaded": False},
            {"name": "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice", "size": "0.6B", "mode": "custom", "loaded": False},
        ]

    def get_speakers(self) -> dict:
        """Get preset speakers information."""
        return {
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
