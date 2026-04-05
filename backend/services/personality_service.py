import io
import os
import re
import json
import shutil
import wave
import struct
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional

from config import get_settings

settings = get_settings()

# Default segments if none provided (will be set to full duration on save)
DEFAULT_SEGMENTS = []


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
        """Get the path to a personality's reference audio file (concatenated segments for TTS)."""
        return self._get_personality_path(personality_id) / "reference.wav"

    def _get_original_audio_path(self, personality_id: str) -> Path:
        """Get the path to a personality's original audio file (full upload)."""
        return self._get_personality_path(personality_id) / "original.wav"

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
        """Get audio duration in seconds using wave module."""
        try:
            with wave.open(str(audio_path), 'rb') as wf:
                frames = wf.getnframes()
                rate = wf.getframerate()
                duration = frames / float(rate)
                return round(duration, 2)
        except Exception:
            return None

    def _concatenate_segments(
        self,
        original_path: Path,
        segments: list[dict],
        output_path: Path,
    ) -> bool:
        """
        Extract segments from original audio and concatenate to output file.

        Args:
            original_path: Path to original.wav
            segments: List of {"start": float, "end": float} dicts
            output_path: Path to write reference.wav

        Returns:
            True if successful, False otherwise
        """
        try:
            with wave.open(str(original_path), 'rb') as orig:
                params = orig.getparams()
                sample_rate = orig.getframerate()
                sample_width = orig.getsampwidth()
                n_channels = orig.getnchannels()

                # Sort segments by start time
                sorted_segments = sorted(segments, key=lambda s: s['start'])

                # Extract frames for each segment
                all_frames = b''
                for seg in sorted_segments:
                    start_frame = int(seg['start'] * sample_rate)
                    end_frame = int(seg['end'] * sample_rate)

                    orig.setpos(start_frame)
                    frames_to_read = end_frame - start_frame
                    frames = orig.readframes(frames_to_read)
                    all_frames += frames

                # Write concatenated audio
                with wave.open(str(output_path), 'wb') as out:
                    out.setnchannels(n_channels)
                    out.setsampwidth(sample_width)
                    out.setframerate(sample_rate)
                    out.writeframes(all_frames)

            return True
        except Exception as e:
            print(f"Error concatenating segments: {e}")
            return False

    def _save_as_wav(self, audio_data: bytes, output_path: Path) -> None:
        """Save audio bytes to output_path as WAV, converting from any format if necessary."""
        # WAV files start with RIFF....WAVE
        if audio_data[:4] == b'RIFF' and audio_data[8:12] == b'WAVE':
            with open(output_path, 'wb') as f:
                f.write(audio_data)
        else:
            from pydub import AudioSegment
            audio = AudioSegment.from_file(io.BytesIO(audio_data))
            audio.export(str(output_path), format="wav")

    def _ensure_original_exists(self, personality_id: str) -> bool:
        """
        Ensure original.wav exists (for migration of old personalities).
        If missing, copy reference.wav to original.wav.

        Returns True if original exists (or was created), False otherwise.
        """
        original_path = self._get_original_audio_path(personality_id)
        reference_path = self._get_audio_path(personality_id)

        if original_path.exists():
            return True

        if reference_path.exists():
            # Migrate: copy reference to original
            shutil.copy2(reference_path, original_path)

            # Also set default segments in metadata
            metadata = self._load_metadata(personality_id)
            if metadata and 'segments' not in metadata:
                duration = self._get_audio_duration(original_path)
                if duration:
                    metadata['segments'] = [{'start': 0, 'end': duration}]
                    self._save_metadata(personality_id, metadata)
            return True

        return False

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

        # Ensure original exists (migration for old personalities)
        self._ensure_original_exists(personality_id)

        audio_path = self._get_audio_path(personality_id)
        original_path = self._get_original_audio_path(personality_id)
        transcript_path = self._get_transcript_path(personality_id)

        # Read transcript
        transcript = ""
        if transcript_path.exists():
            with open(transcript_path, 'r', encoding='utf-8') as f:
                transcript = f.read()

        # Get audio duration of reference
        audio_duration = None
        if audio_path.exists():
            audio_duration = self._get_audio_duration(audio_path)

        # Get segments from metadata, or default to full duration
        segments = metadata.get("segments", [])
        if not segments and original_path.exists():
            # Legacy personality without segments - use full original
            orig_duration = self._get_audio_duration(original_path)
            if orig_duration:
                segments = [{"start": 0, "end": orig_duration}]

        # Build original URL only if original exists
        original_url = None
        if original_path.exists():
            original_url = f"/api/personalities/{personality_id}/original"

        return {
            "id": personality_id,
            "name": metadata.get("name", personality_id),
            "description": metadata.get("description"),
            "language": metadata.get("language", "English"),
            "transcript": transcript,
            "audio_url": f"/api/personalities/{personality_id}/audio",
            "original_url": original_url,
            "segments": segments,
            "audio_duration": audio_duration,
            "enhancement_method": metadata.get("enhancement_method"),
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
        segments: Optional[list[dict]] = None,
        enhancement_method: Optional[str] = None,
    ) -> dict:
        """Create a new personality.

        Args:
            name: Personality name
            description: Optional description
            language: Language code
            transcript: Transcript text
            audio_data: Original audio file bytes
            segments: Optional list of {"start": float, "end": float} dicts.
                      If None, the entire audio is used as one segment.
        """
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

        # Save original audio file (convert to WAV if needed)
        original_path = self._get_original_audio_path(personality_id)
        self._save_as_wav(audio_data, original_path)

        # If no segments provided, use full audio duration
        if not segments:
            duration = self._get_audio_duration(original_path)
            if duration:
                segments = [{"start": 0, "end": duration}]
            else:
                segments = [{"start": 0, "end": 20}]  # fallback

        # Generate reference.wav by concatenating segments
        reference_path = self._get_audio_path(personality_id)
        self._concatenate_segments(original_path, segments, reference_path)

        # Save transcript
        transcript_path = self._get_transcript_path(personality_id)
        with open(transcript_path, 'w', encoding='utf-8') as f:
            f.write(transcript)

        # Save metadata with segments
        now = datetime.now(timezone.utc).isoformat()
        metadata = {
            "name": name,
            "description": description,
            "language": language,
            "segments": segments,
            "enhancement_method": enhancement_method,
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

        metadata["updated_at"] = datetime.now(timezone.utc).isoformat()
        self._save_metadata(personality_id, metadata)

        return self.get(personality_id)

    def update_audio(
        self,
        personality_id: str,
        transcript: str,
        audio_data: Optional[bytes] = None,
        segments: Optional[list[dict]] = None,
    ) -> Optional[dict]:
        """Update personality audio and transcript.

        Args:
            personality_id: ID of personality to update
            transcript: New transcript text
            audio_data: New original audio bytes (optional - if None, keeps existing original)
            segments: New segment definitions (optional - if None with new audio, uses full duration)
        """
        if not self._get_personality_path(personality_id).exists():
            return None

        original_path = self._get_original_audio_path(personality_id)
        reference_path = self._get_audio_path(personality_id)

        # If new audio provided, save as original (convert to WAV if needed)
        if audio_data:
            self._save_as_wav(audio_data, original_path)

            # If no segments provided with new audio, use full duration
            if not segments:
                duration = self._get_audio_duration(original_path)
                if duration:
                    segments = [{"start": 0, "end": duration}]

        # Ensure original exists (for migration)
        self._ensure_original_exists(personality_id)

        # If segments provided (or derived from new audio), regenerate reference
        if segments:
            self._concatenate_segments(original_path, segments, reference_path)

        # Save new transcript
        transcript_path = self._get_transcript_path(personality_id)
        with open(transcript_path, 'w', encoding='utf-8') as f:
            f.write(transcript)

        # Update metadata
        metadata = self._load_metadata(personality_id)
        if metadata:
            metadata["updated_at"] = datetime.now(timezone.utc).isoformat()
            if segments:
                metadata["segments"] = segments
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
        """Get the file path to a personality's reference audio for serving."""
        audio_path = self._get_audio_path(personality_id)
        if audio_path.exists():
            return audio_path
        return None

    def get_original_audio_file_path(self, personality_id: str) -> Optional[Path]:
        """Get the file path to a personality's original audio for serving."""
        # Ensure original exists (migration)
        self._ensure_original_exists(personality_id)

        original_path = self._get_original_audio_path(personality_id)
        if original_path.exists():
            return original_path
        return None

    def validate_audio_duration(self, audio_data: bytes, min_sec: float = 3.0, max_sec: float = 20.0) -> tuple[bool, str, Optional[float]]:
        """Validate audio duration is within acceptable range."""
        import tempfile
        import wave

        temp_path = None
        try:
            # Write to temp file to check duration
            with tempfile.NamedTemporaryFile(suffix='.wav', delete=False, mode='wb') as f:
                f.write(audio_data)
                temp_path = f.name

            with wave.open(temp_path, 'rb') as wf:
                frames = wf.getnframes()
                rate = wf.getframerate()
                duration = frames / float(rate)

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
