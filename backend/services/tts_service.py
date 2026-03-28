import os
import uuid
import torch
import soundfile as sf
from pathlib import Path
from typing import Optional, Tuple
from contextlib import asynccontextmanager
import logging

from config import get_settings

settings = get_settings()
logger = logging.getLogger("qwen-tts")

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


def _log_gpu_info():
    """Log detailed GPU information."""
    logger.info("=" * 50)
    logger.info("GPU DIAGNOSTICS")
    logger.info("=" * 50)
    logger.info(f"CUDA available: {torch.cuda.is_available()}")
    logger.info(f"CUDA version: {torch.version.cuda if torch.cuda.is_available() else 'N/A'}")
    logger.info(f"PyTorch version: {torch.__version__}")

    if torch.cuda.is_available():
        logger.info(f"GPU count: {torch.cuda.device_count()}")
        for i in range(torch.cuda.device_count()):
            props = torch.cuda.get_device_properties(i)
            logger.info(f"GPU {i}: {props.name}")
            logger.info(f"  - Memory: {props.total_memory / 1024**3:.1f} GB")
            logger.info(f"  - Compute capability: {props.major}.{props.minor}")

        # Current memory usage
        logger.info(f"Current GPU memory allocated: {torch.cuda.memory_allocated() / 1024**3:.2f} GB")
        logger.info(f"Current GPU memory cached: {torch.cuda.memory_reserved() / 1024**3:.2f} GB")
    else:
        logger.warning("NO GPU DETECTED - Running on CPU (will be slow and may OOM)")
        logger.info(f"CUDA_VISIBLE_DEVICES: {os.environ.get('CUDA_VISIBLE_DEVICES', 'not set')}")
        logger.info(f"NVIDIA_VISIBLE_DEVICES: {os.environ.get('NVIDIA_VISIBLE_DEVICES', 'not set')}")

    logger.info("=" * 50)


def _log_memory_usage(stage: str = ""):
    """Log current memory usage."""
    prefix = f"[{stage}] " if stage else ""
    if torch.cuda.is_available():
        allocated = torch.cuda.memory_allocated() / 1024**3
        reserved = torch.cuda.memory_reserved() / 1024**3
        logger.debug(f"{prefix}GPU memory - allocated: {allocated:.2f} GB, reserved: {reserved:.2f} GB")

    # Also log CPU memory
    try:
        import psutil
        process = psutil.Process()
        mem_info = process.memory_info()
        logger.debug(f"{prefix}CPU memory - RSS: {mem_info.rss / 1024**3:.2f} GB")
    except ImportError:
        pass


class TTSService:
    def __init__(self):
        self._models: dict = {}

        # Log GPU info on init
        _log_gpu_info()

        self._device = "cuda" if torch.cuda.is_available() else "cpu"
        self._dtype = torch.bfloat16 if self._device == "cuda" else torch.float32

        logger.info(f"TTS Service initialized - device: {self._device}, dtype: {self._dtype}")

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
            logger.info(f"Model {key} already loaded, reusing")
            return self._models[key]

        model_name = MODELS.get(mode, {}).get(size)
        if not model_name:
            raise ValueError(f"Model not available: {mode} {size}")

        logger.info(f"Loading model: {model_name}")
        logger.info(f"  Mode: {mode}, Size: {size}")
        logger.info(f"  Device: {self._device}, Dtype: {self._dtype}")
        _log_memory_usage("before model load")

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
                logger.info("  FlashAttention: enabled")
            except ImportError:
                logger.info("  FlashAttention: not available")
        else:
            logger.info(f"  FlashAttention: disabled (use_flash_attention={settings.use_flash_attention})")

        logger.info(f"  Loading from HuggingFace with kwargs: {kwargs}")
        logger.info(f"  HF_HOME: {os.environ.get('HF_HOME', 'not set')}")
        logger.info(f"  HF_HUB_CACHE: {os.environ.get('HF_HUB_CACHE', 'not set')}")

        try:
            model = Qwen3TTSModel.from_pretrained(model_name, **kwargs)
            self._models[key] = model
            logger.info(f"Model {key} loaded successfully")
            _log_memory_usage("after model load")
            return model
        except Exception as e:
            logger.error(f"Failed to load model {model_name}: {e}", exc_info=True)
            raise

    def _save_audio(self, audio_data, sample_rate: int) -> Tuple[str, str]:
        """Save audio to file and return filename and path."""
        filename = f"{uuid.uuid4().hex}.wav"
        filepath = os.path.join(settings.output_path, filename)
        sf.write(filepath, audio_data, sample_rate)
        logger.debug(f"Audio saved: {filepath}")
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
        logger.info("=" * 40)
        logger.info("VOICE CLONE GENERATION")
        logger.info("=" * 40)
        logger.info(f"Text: {text[:100]}{'...' if len(text) > 100 else ''}")
        logger.info(f"Language: {language}")
        logger.info(f"Ref audio: {ref_audio_path}")
        logger.info(f"Ref text: {ref_text[:100]}{'...' if len(ref_text) > 100 else ''}")
        logger.info(f"Model size: {model_size}")
        _log_memory_usage("before generation")

        try:
            logger.info("Loading model...")
            model = self._load_model("clone", model_size)

            logger.info("Generating audio...")
            wavs, sr = model.generate_voice_clone(
                text=text,
                language=language,
                ref_audio=ref_audio_path,
                ref_text=ref_text,
            )
            logger.info(f"Audio generated - sample rate: {sr}, samples: {len(wavs[0])}")
            _log_memory_usage("after generation")

            filename, filepath = self._save_audio(wavs[0], sr)
            duration = self._get_audio_duration(filepath)
            logger.info(f"Generation complete - duration: {duration}s, file: {filename}")

            return {
                "audio_url": f"/api/audio/{filename}",
                "filename": filename,
                "duration": duration,
                "sample_rate": sr,
            }
        except Exception as e:
            logger.error(f"Voice clone generation failed: {e}", exc_info=True)
            _log_memory_usage("after error")
            raise

    async def generate_design(
        self,
        text: str,
        language: str,
        instruct: str,
    ) -> dict:
        """Generate speech using voice design (create voice from description)."""
        logger.info("=" * 40)
        logger.info("VOICE DESIGN GENERATION")
        logger.info("=" * 40)
        logger.info(f"Text: {text[:100]}{'...' if len(text) > 100 else ''}")
        logger.info(f"Language: {language}")
        logger.info(f"Instruct: {instruct[:100]}{'...' if len(instruct) > 100 else ''}")
        _log_memory_usage("before generation")

        try:
            logger.info("Loading model...")
            model = self._load_model("design", "1.7B")  # Only 1.7B available

            logger.info("Generating audio...")
            wavs, sr = model.generate_voice_design(
                text=text,
                language=language,
                instruct=instruct,
            )
            logger.info(f"Audio generated - sample rate: {sr}, samples: {len(wavs[0])}")
            _log_memory_usage("after generation")

            filename, filepath = self._save_audio(wavs[0], sr)
            duration = self._get_audio_duration(filepath)
            logger.info(f"Generation complete - duration: {duration}s, file: {filename}")

            return {
                "audio_url": f"/api/audio/{filename}",
                "filename": filename,
                "duration": duration,
                "sample_rate": sr,
            }
        except Exception as e:
            logger.error(f"Voice design generation failed: {e}", exc_info=True)
            _log_memory_usage("after error")
            raise

    async def generate_custom(
        self,
        text: str,
        language: str,
        speaker: str,
        instruct: Optional[str] = None,
        model_size: str = "1.7B",
    ) -> dict:
        """Generate speech using preset custom voices."""
        logger.info("=" * 40)
        logger.info("CUSTOM VOICE GENERATION")
        logger.info("=" * 40)
        logger.info(f"Text: {text[:100]}{'...' if len(text) > 100 else ''}")
        logger.info(f"Language: {language}")
        logger.info(f"Speaker: {speaker}")
        logger.info(f"Instruct: {instruct[:100] if instruct else 'None'}{'...' if instruct and len(instruct) > 100 else ''}")
        logger.info(f"Model size: {model_size}")
        _log_memory_usage("before generation")

        try:
            logger.info("Loading model...")
            model = self._load_model("custom", model_size)

            logger.info("Generating audio...")
            wavs, sr = model.generate_custom_voice(
                text=text,
                language=language,
                speaker=speaker,
                instruct=instruct,
            )
            logger.info(f"Audio generated - sample rate: {sr}, samples: {len(wavs[0])}")
            _log_memory_usage("after generation")

            filename, filepath = self._save_audio(wavs[0], sr)
            duration = self._get_audio_duration(filepath)
            logger.info(f"Generation complete - duration: {duration}s, file: {filename}")

            return {
                "audio_url": f"/api/audio/{filename}",
                "filename": filename,
                "duration": duration,
                "sample_rate": sr,
            }
        except Exception as e:
            logger.error(f"Custom voice generation failed: {e}", exc_info=True)
            _log_memory_usage("after error")
            raise

    def _is_model_downloaded(self, model_name: str) -> bool:
        """Check if a model is downloaded to the local cache."""
        try:
            from huggingface_hub import try_to_load_from_cache, _CACHED_NO_EXIST
            # Check if the config.json exists in cache (basic sanity check)
            result = try_to_load_from_cache(model_name, "config.json")
            return result is not None and result != _CACHED_NO_EXIST
        except Exception:
            return False

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
                    "downloaded": self._is_model_downloaded(name),
                })
        return models

    def get_speakers(self) -> dict:
        """Get preset speakers information."""
        return SPEAKERS


# Singleton instance
tts_service = TTSService()
