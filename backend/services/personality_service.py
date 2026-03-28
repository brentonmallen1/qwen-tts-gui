import os
import re
import json
import shutil
import librosa
from pathlib import Path
from datetime import datetime
from typing import Optional

from config import get_settings

settings = get_settings()


def slugify(name: str) -> str:
    """Convert name to URL-safe slug for directory names."""
    return re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')


def is_valid_personality_id(personality_id: str) -> bool:
    """Validate personality_id contains only safe characters (alphanumeric and hyphens)."""
    return bool(re.match(r'^[a-z0-9-]+$', personality_id))


class PersonalityService:
    def __init__(self):
        self._base_path = Path(settings.personalities_path)
        self._ensure_base_dir()

    def _ensure_base_dir(self):
        """Ensure the personalities directory exists."""
        self._base_path.mkdir(parents=True, exist_ok=True)

    def _get_personality_path(self, personality_id: str) -> Path:
        """Get the path to a personality's directory."""
        # Security: validate personality_id to prevent path traversal
        if not is_valid_personality_id(personality_id):
            raise ValueError(f"Invalid personality ID: {personality_id}")
        return self._base_path / personality_id

    def _get_metadata_path(self, personality_id: str) -> Path:
        """Get the path to a personality's metadata file."""
        return self._get_personality_path(personality_id) / "metadata.json"

    def _get_audio_path(self, personality_id: str) -> Path:
        """Get the path to a personality's audio file."""
        return self._get_personality_path(personality_id) / "reference.wav"

    def _get_transcript_path(self, personality_id: str) -> Path:
        """Get the path to a personality's transcript file."""
        return self._get_personality_path(personality_id) / "transcript.txt"

    def _load_metadata(self, personality_id: str) -> Optional[dict]:
        """Load metadata for a personality."""
        metadata_path = self._get_metadata_path(personality_id)
        if not metadata_path.exists():
            return None
        with open(metadata_path, 'r', encoding='utf-8') as f:
            return json.load(f)

    def _save_metadata(self, personality_id: str, metadata: dict):
        """Save metadata for a personality."""
        metadata_path = self._get_metadata_path(personality_id)
        with open(metadata_path, 'w', encoding='utf-8') as f:
            json.dump(metadata, f, indent=2, default=str)

    def _get_audio_duration(self, audio_path: Path) -> Optional[float]:
        """Get audio duration in seconds."""
        try:
            duration = librosa.get_duration(path=str(audio_path))
            return round(duration, 2)
        except Exception:
            return None

    def list_all(self) -> list[dict]:
        """List all personalities."""
        personalities = []

        if not self._base_path.exists():
            return personalities

        for item in self._base_path.iterdir():
            if item.is_dir():
                personality = self.get(item.name)
                if personality:
                    personalities.append(personality)

        # Sort by name
        personalities.sort(key=lambda p: p['name'].lower())
        return personalities

    def get(self, personality_id: str) -> Optional[dict]:
        """Get a personality by ID."""
        metadata = self._load_metadata(personality_id)
        if not metadata:
            return None

        audio_path = self._get_audio_path(personality_id)
        transcript_path = self._get_transcript_path(personality_id)

        # Read transcript
        transcript = ""
        if transcript_path.exists():
            with open(transcript_path, 'r', encoding='utf-8') as f:
                transcript = f.read()

        # Get audio duration
        audio_duration = None
        if audio_path.exists():
            audio_duration = self._get_audio_duration(audio_path)

        return {
            "id": personality_id,
            "name": metadata.get("name", personality_id),
            "description": metadata.get("description"),
            "language": metadata.get("language", "English"),
            "transcript": transcript,
            "audio_url": f"/api/personalities/{personality_id}/audio",
            "audio_duration": audio_duration,
            "created_at": metadata.get("created_at"),
            "updated_at": metadata.get("updated_at"),
        }

    def create(
        self,
        name: str,
        description: Optional[str],
        language: str,
        transcript: str,
        audio_data: bytes,
    ) -> dict:
        """Create a new personality."""
        personality_id = slugify(name)
        personality_path = self._get_personality_path(personality_id)

        # Check if already exists
        if personality_path.exists():
            # Append a number to make it unique
            counter = 1
            while self._get_personality_path(f"{personality_id}-{counter}").exists():
                counter += 1
            personality_id = f"{personality_id}-{counter}"
            personality_path = self._get_personality_path(personality_id)

        # Create directory
        personality_path.mkdir(parents=True, exist_ok=True)

        # Save audio file
        audio_path = self._get_audio_path(personality_id)
        with open(audio_path, 'wb') as f:
            f.write(audio_data)

        # Save transcript
        transcript_path = self._get_transcript_path(personality_id)
        with open(transcript_path, 'w', encoding='utf-8') as f:
            f.write(transcript)

        # Save metadata
        now = datetime.utcnow().isoformat()
        metadata = {
            "name": name,
            "description": description,
            "language": language,
            "created_at": now,
            "updated_at": now,
        }
        self._save_metadata(personality_id, metadata)

        return self.get(personality_id)

    def update(
        self,
        personality_id: str,
        name: Optional[str] = None,
        description: Optional[str] = None,
        language: Optional[str] = None,
    ) -> Optional[dict]:
        """Update personality metadata."""
        metadata = self._load_metadata(personality_id)
        if not metadata:
            return None

        # Update fields
        if name is not None:
            metadata["name"] = name
        if description is not None:
            metadata["description"] = description
        if language is not None:
            metadata["language"] = language

        metadata["updated_at"] = datetime.utcnow().isoformat()
        self._save_metadata(personality_id, metadata)

        return self.get(personality_id)

    def update_audio(
        self,
        personality_id: str,
        transcript: str,
        audio_data: bytes,
    ) -> Optional[dict]:
        """Update personality audio and transcript."""
        if not self._get_personality_path(personality_id).exists():
            return None

        # Save new audio file
        audio_path = self._get_audio_path(personality_id)
        with open(audio_path, 'wb') as f:
            f.write(audio_data)

        # Save new transcript
        transcript_path = self._get_transcript_path(personality_id)
        with open(transcript_path, 'w', encoding='utf-8') as f:
            f.write(transcript)

        # Update metadata timestamp
        metadata = self._load_metadata(personality_id)
        if metadata:
            metadata["updated_at"] = datetime.utcnow().isoformat()
            self._save_metadata(personality_id, metadata)

        return self.get(personality_id)

    def delete(self, personality_id: str) -> bool:
        """Delete a personality."""
        personality_path = self._get_personality_path(personality_id)
        if not personality_path.exists():
            return False

        shutil.rmtree(personality_path)
        return True

    def get_audio_file_path(self, personality_id: str) -> Optional[Path]:
        """Get the file path to a personality's audio for serving."""
        audio_path = self._get_audio_path(personality_id)
        if audio_path.exists():
            return audio_path
        return None

    def validate_audio_duration(self, audio_data: bytes, min_sec: float = 3.0, max_sec: float = 20.0) -> tuple[bool, str, Optional[float]]:
        """Validate audio duration is within acceptable range."""
        import tempfile

        temp_path = None
        try:
            # Write to temp file to check duration
            with tempfile.NamedTemporaryFile(suffix='.wav', delete=False, mode='wb') as f:
                f.write(audio_data)
                temp_path = f.name

            duration = librosa.get_duration(path=temp_path)

            if duration < min_sec:
                return False, f"Audio must be at least {min_sec} seconds (got {duration:.1f}s)", duration
            if duration > max_sec:
                return False, f"Audio must be {max_sec} seconds or less (got {duration:.1f}s)", duration

            return True, "", round(duration, 2)
        finally:
            if temp_path and os.path.exists(temp_path):
                os.unlink(temp_path)


# Singleton instance
personality_service = PersonalityService()
