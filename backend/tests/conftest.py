"""Test configuration and fixtures."""
import os
import sys
import tempfile
import struct
import wave
import pytest

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Set mock mode for tests
os.environ["MOCK_MODE"] = "true"
os.environ["PERSONALITIES_PATH"] = tempfile.mkdtemp()


@pytest.fixture(scope="session")
def app():
    """Create FastAPI app for testing."""
    from main import app
    return app


@pytest.fixture
def client(app):
    """Create test client."""
    from fastapi.testclient import TestClient
    return TestClient(app)


def generate_wav_audio(duration_sec: float, sample_rate: int = 24000) -> bytes:
    """Generate a valid WAV audio file with the specified duration."""
    num_samples = int(sample_rate * duration_sec)
    # Generate silence (zeros)
    samples = b'\x00\x00' * num_samples  # 16-bit samples

    # Create WAV file in memory
    import io
    buffer = io.BytesIO()
    with wave.open(buffer, 'wb') as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)  # 16-bit
        wav.setframerate(sample_rate)
        wav.writeframes(samples)

    buffer.seek(0)
    return buffer.read()


@pytest.fixture
def short_audio():
    """Generate audio that's too short (<3s)."""
    return generate_wav_audio(2.0)


@pytest.fixture
def valid_audio():
    """Generate valid audio (3-20s)."""
    return generate_wav_audio(5.0)


@pytest.fixture
def long_audio():
    """Generate audio that's too long (>20s)."""
    return generate_wav_audio(25.0)


@pytest.fixture
def temp_personalities_dir():
    """Create a temporary directory for personalities."""
    import tempfile
    import shutil

    temp_dir = tempfile.mkdtemp()
    yield temp_dir

    # Cleanup
    shutil.rmtree(temp_dir, ignore_errors=True)
