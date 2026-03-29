"""Tests for personality CRUD operations and audio validation."""
import pytest
import io
import wave


def generate_wav_audio(duration_sec: float, sample_rate: int = 24000) -> bytes:
    """Generate a valid WAV audio file with the specified duration."""
    num_samples = int(sample_rate * duration_sec)
    samples = b'\x00\x00' * num_samples  # 16-bit silence

    buffer = io.BytesIO()
    with wave.open(buffer, 'wb') as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        wav.writeframes(samples)

    buffer.seek(0)
    return buffer.read()


class TestCreatePersonality:
    """Test personality creation."""

    def test_create_personality_with_valid_audio(self, client, valid_audio):
        """Creating a personality with valid audio should succeed."""
        response = client.post(
            "/api/personalities",
            data={
                "name": "Test Personality",
                "language": "English",
                "transcript": "This is a test transcript",
                "description": "Test description",
            },
            files={"audio": ("test.wav", io.BytesIO(valid_audio), "audio/wav")},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Test Personality"
        assert data["language"] == "English"
        assert data["transcript"] == "This is a test transcript"
        assert "id" in data
        assert "audio_url" in data

    def test_create_personality_with_long_audio_fails(self, client, long_audio):
        """Creating a personality with audio > 20s should fail."""
        response = client.post(
            "/api/personalities",
            data={
                "name": "Test Personality",
                "language": "English",
                "transcript": "This is a test transcript",
            },
            files={"audio": ("test.wav", io.BytesIO(long_audio), "audio/wav")},
        )

        assert response.status_code == 400
        assert "20.0 seconds or less" in response.json()["detail"]

    def test_create_personality_with_short_audio_fails(self, client, short_audio):
        """Creating a personality with audio < 3s should fail."""
        response = client.post(
            "/api/personalities",
            data={
                "name": "Test Personality",
                "language": "English",
                "transcript": "This is a test transcript",
            },
            files={"audio": ("test.wav", io.BytesIO(short_audio), "audio/wav")},
        )

        assert response.status_code == 400
        assert "at least 3.0 seconds" in response.json()["detail"]

    def test_create_personality_missing_name_fails(self, client, valid_audio):
        """Creating a personality without name should fail."""
        response = client.post(
            "/api/personalities",
            data={
                "language": "English",
                "transcript": "This is a test transcript",
            },
            files={"audio": ("test.wav", io.BytesIO(valid_audio), "audio/wav")},
        )

        assert response.status_code == 422  # Validation error

    def test_create_personality_missing_transcript_fails(self, client, valid_audio):
        """Creating a personality without transcript should fail."""
        response = client.post(
            "/api/personalities",
            data={
                "name": "Test Personality",
                "language": "English",
            },
            files={"audio": ("test.wav", io.BytesIO(valid_audio), "audio/wav")},
        )

        assert response.status_code == 422  # Validation error

    def test_create_personality_invalid_language_fails(self, client, valid_audio):
        """Creating a personality with invalid language should fail."""
        response = client.post(
            "/api/personalities",
            data={
                "name": "Test Personality",
                "language": "InvalidLanguage",
                "transcript": "This is a test transcript",
            },
            files={"audio": ("test.wav", io.BytesIO(valid_audio), "audio/wav")},
        )

        assert response.status_code == 400
        assert "Invalid language" in response.json()["detail"]


class TestGetPersonalities:
    """Test listing and getting personalities."""

    def test_list_personalities(self, client):
        """Listing personalities should return a list."""
        response = client.get("/api/personalities")

        assert response.status_code == 200
        data = response.json()
        assert "personalities" in data
        assert "total" in data
        assert isinstance(data["personalities"], list)

    def test_get_personality_not_found(self, client):
        """Getting a non-existent personality should return 404."""
        response = client.get("/api/personalities/00000000-0000-0000-0000-000000000000")

        assert response.status_code == 404

    def test_get_personality_invalid_id(self, client):
        """Getting a personality with invalid ID format should return 400."""
        # IDs with uppercase, spaces, or special chars are invalid
        response = client.get("/api/personalities/Invalid_ID!")

        assert response.status_code == 400


class TestUpdatePersonality:
    """Test personality updates."""

    def test_update_personality_metadata(self, client, valid_audio):
        """Updating personality metadata should succeed."""
        # First create a personality
        create_response = client.post(
            "/api/personalities",
            data={
                "name": "Original Name",
                "language": "English",
                "transcript": "Original transcript",
            },
            files={"audio": ("test.wav", io.BytesIO(valid_audio), "audio/wav")},
        )
        assert create_response.status_code == 200
        personality_id = create_response.json()["id"]

        # Update metadata
        update_response = client.patch(
            f"/api/personalities/{personality_id}",
            json={
                "name": "Updated Name",
                "description": "Updated description",
            },
        )

        assert update_response.status_code == 200
        data = update_response.json()
        assert data["name"] == "Updated Name"
        assert data["description"] == "Updated description"

    def test_update_personality_audio(self, client, valid_audio):
        """Updating personality audio should succeed."""
        # First create a personality
        create_response = client.post(
            "/api/personalities",
            data={
                "name": "Test Personality",
                "language": "English",
                "transcript": "Original transcript",
            },
            files={"audio": ("test.wav", io.BytesIO(valid_audio), "audio/wav")},
        )
        assert create_response.status_code == 200
        personality_id = create_response.json()["id"]

        # Update audio
        new_audio = generate_wav_audio(10.0)  # Different duration
        update_response = client.put(
            f"/api/personalities/{personality_id}/audio",
            data={"transcript": "New transcript"},
            files={"audio": ("new.wav", io.BytesIO(new_audio), "audio/wav")},
        )

        assert update_response.status_code == 200
        data = update_response.json()
        assert data["transcript"] == "New transcript"

    def test_update_personality_with_long_audio_fails(self, client, valid_audio, long_audio):
        """Updating personality with audio > 20s should fail."""
        # First create a personality
        create_response = client.post(
            "/api/personalities",
            data={
                "name": "Test Personality",
                "language": "English",
                "transcript": "Original transcript",
            },
            files={"audio": ("test.wav", io.BytesIO(valid_audio), "audio/wav")},
        )
        assert create_response.status_code == 200
        personality_id = create_response.json()["id"]

        # Try to update with long audio
        update_response = client.put(
            f"/api/personalities/{personality_id}/audio",
            data={"transcript": "New transcript"},
            files={"audio": ("new.wav", io.BytesIO(long_audio), "audio/wav")},
        )

        assert update_response.status_code == 400
        assert "20.0 seconds or less" in update_response.json()["detail"]


class TestDeletePersonality:
    """Test personality deletion."""

    def test_delete_personality(self, client, valid_audio):
        """Deleting a personality should succeed."""
        # First create a personality
        create_response = client.post(
            "/api/personalities",
            data={
                "name": "Test Personality",
                "language": "English",
                "transcript": "Test transcript",
            },
            files={"audio": ("test.wav", io.BytesIO(valid_audio), "audio/wav")},
        )
        assert create_response.status_code == 200
        personality_id = create_response.json()["id"]

        # Delete it
        delete_response = client.delete(f"/api/personalities/{personality_id}")
        assert delete_response.status_code == 200
        assert delete_response.json()["status"] == "deleted"

        # Verify it's gone
        get_response = client.get(f"/api/personalities/{personality_id}")
        assert get_response.status_code == 404

    def test_delete_personality_not_found(self, client):
        """Deleting a non-existent personality should return 404."""
        response = client.delete("/api/personalities/00000000-0000-0000-0000-000000000000")
        assert response.status_code == 404


class TestAudioValidation:
    """Test audio validation edge cases."""

    def test_audio_at_minimum_duration(self, client):
        """Audio exactly at 3s should be valid."""
        audio = generate_wav_audio(3.0)
        response = client.post(
            "/api/personalities",
            data={
                "name": "Test Personality",
                "language": "English",
                "transcript": "Test transcript",
            },
            files={"audio": ("test.wav", io.BytesIO(audio), "audio/wav")},
        )

        assert response.status_code == 200

    def test_audio_at_maximum_duration(self, client):
        """Audio exactly at 20s should be valid."""
        audio = generate_wav_audio(20.0)
        response = client.post(
            "/api/personalities",
            data={
                "name": "Test Personality",
                "language": "English",
                "transcript": "Test transcript",
            },
            files={"audio": ("test.wav", io.BytesIO(audio), "audio/wav")},
        )

        assert response.status_code == 200

    def test_invalid_audio_format(self, client):
        """Non-audio file should be rejected."""
        response = client.post(
            "/api/personalities",
            data={
                "name": "Test Personality",
                "language": "English",
                "transcript": "Test transcript",
            },
            files={"audio": ("test.txt", io.BytesIO(b"not audio"), "text/plain")},
        )

        assert response.status_code == 400
        assert "Invalid file type" in response.json()["detail"]


class TestPersonalityAudioEndpoint:
    """Test personality audio serving."""

    def test_get_personality_audio(self, client, valid_audio):
        """Getting personality audio should return the audio file."""
        # First create a personality
        create_response = client.post(
            "/api/personalities",
            data={
                "name": "Test Personality",
                "language": "English",
                "transcript": "Test transcript",
            },
            files={"audio": ("test.wav", io.BytesIO(valid_audio), "audio/wav")},
        )
        assert create_response.status_code == 200
        personality_id = create_response.json()["id"]

        # Get the audio
        audio_response = client.get(f"/api/personalities/{personality_id}/audio")
        assert audio_response.status_code == 200
        assert audio_response.headers["content-type"] == "audio/wav"

    def test_get_personality_audio_not_found(self, client):
        """Getting audio for non-existent personality should return 404."""
        response = client.get("/api/personalities/00000000-0000-0000-0000-000000000000/audio")
        assert response.status_code == 404
