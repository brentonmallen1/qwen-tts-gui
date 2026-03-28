import os
import tempfile
from typing import Optional, Tuple

from config import get_settings

settings = get_settings()


class WhisperService:
    def __init__(self):
        self._model = None
        self._model_name = settings.whisper_model

    def _load_model(self):
        """Lazy load the Whisper model."""
        if self._model is not None:
            return self._model

        from faster_whisper import WhisperModel

        # Determine compute type based on available hardware
        import torch
        if torch.cuda.is_available():
            device = "cuda"
            compute_type = "float16"
        else:
            device = "cpu"
            compute_type = "int8"

        self._model = WhisperModel(
            self._model_name,
            device=device,
            compute_type=compute_type,
        )
        return self._model

    def transcribe(self, audio_data: bytes) -> Tuple[str, Optional[float]]:
        """
        Transcribe audio data to text.

        Args:
            audio_data: Raw audio bytes (WAV format expected)

        Returns:
            Tuple of (transcript text, duration in seconds)
        """
        model = self._load_model()

        # Write audio to temp file (faster-whisper needs a file path)
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
            f.write(audio_data)
            temp_path = f.name

        try:
            segments, info = model.transcribe(
                temp_path,
                beam_size=5,
                language=None,  # Auto-detect language
                vad_filter=True,  # Filter out non-speech
            )

            # Combine all segments into a single transcript
            transcript_parts = []
            for segment in segments:
                transcript_parts.append(segment.text.strip())

            transcript = " ".join(transcript_parts).strip()
            duration = round(info.duration, 2) if info.duration else None

            return transcript, duration

        finally:
            # Clean up temp file
            if os.path.exists(temp_path):
                os.unlink(temp_path)

    def get_model_info(self) -> dict:
        """Get information about the loaded Whisper model."""
        return {
            "model": self._model_name,
            "loaded": self._model is not None,
        }


# Singleton instance
whisper_service = WhisperService()
