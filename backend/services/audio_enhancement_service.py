import io
import os
import tempfile
from typing import Literal

import numpy as np

from logging_config import get_logger

logger = get_logger()

PresetName = Literal["light", "medium", "aggressive"]
MethodName = Literal["deepfilter", "lavasr", "chain"]

# How much of the enhanced signal to blend in per preset (rest is original)
_BLEND = {
    "light": 0.3,
    "medium": 0.7,
    "aggressive": 1.0,
}

# DeepFilterNet attenuation limit in dB per preset (lower = less aggressive denoising)
_DEEPFILTER_ATTEN_DB = {
    "light": 6.0,
    "medium": 12.0,
    "aggressive": 24.0,
}


class AudioEnhancementService:
    def __init__(self):
        self._df_model = None
        self._df_state = None
        self._lava_model = None

    def _load_deepfilter(self):
        if self._df_model is not None:
            return
        try:
            from df import init_df
            self._df_model, self._df_state, _ = init_df()
            logger.info("DeepFilterNet model loaded")
        except ImportError:
            raise RuntimeError(
                "deepfilternet is not installed. "
                "Install with: pip install deepfilternet"
            )

    def _load_lavasr(self):
        if self._lava_model is not None:
            return
        try:
            import torch
            from LavaSR.model import LavaEnhance2
            device = "cuda" if torch.cuda.is_available() else "cpu"
            self._lava_model = LavaEnhance2("YatharthS/LavaSR", device)
            logger.info(f"LavaSR model loaded on {device}")
        except ImportError:
            raise RuntimeError(
                "LavaSR is not installed. "
                "Install with: pip install git+https://github.com/ysharma3501/LavaSR.git"
            )

    def enhance(self, audio_data: bytes, method: str = "deepfilter", preset: str = "medium") -> bytes:
        """Enhance audio using the specified method and preset. Returns WAV bytes."""
        if method == "deepfilter":
            return self._enhance_deepfilter(audio_data, preset)
        elif method == "lavasr":
            return self._enhance_lavasr(audio_data, preset)
        elif method == "chain":
            # Denoise first, then enhance quality
            denoised = self._enhance_deepfilter(audio_data, preset)
            return self._enhance_lavasr(denoised, preset)
        else:
            raise ValueError(f"Unknown enhancement method: {method!r}. Choose: deepfilter, lavasr, chain")

    def _read_audio(self, audio_data: bytes) -> tuple[np.ndarray, int]:
        """Read WAV bytes into a mono float32 numpy array and sample rate."""
        import soundfile as sf
        audio_io = io.BytesIO(audio_data)
        audio_np, sr = sf.read(audio_io, dtype="float32", always_2d=False)
        # Mix to mono if stereo
        if audio_np.ndim > 1:
            audio_np = audio_np.mean(axis=1)
        return audio_np, sr

    def _write_audio(self, audio_np: np.ndarray, sr: int) -> bytes:
        """Write a float32 numpy array to WAV bytes."""
        import soundfile as sf
        out_io = io.BytesIO()
        sf.write(out_io, audio_np, sr, format="WAV", subtype="PCM_16")
        out_io.seek(0)
        return out_io.read()

    def _resample(self, audio_np: np.ndarray, orig_sr: int, target_sr: int) -> np.ndarray:
        """Resample audio array from orig_sr to target_sr using librosa."""
        import librosa
        return librosa.resample(audio_np, orig_sr=orig_sr, target_sr=target_sr)

    def _blend(self, enhanced: np.ndarray, original: np.ndarray, preset: str) -> np.ndarray:
        """Blend enhanced signal with original based on preset strength."""
        ratio = _BLEND.get(preset, 0.7)
        if ratio >= 1.0:
            return enhanced
        min_len = min(len(enhanced), len(original))
        return ratio * enhanced[:min_len] + (1.0 - ratio) * original[:min_len]

    def _enhance_deepfilter(self, audio_data: bytes, preset: str) -> bytes:
        self._load_deepfilter()
        from df import enhance as df_enhance

        original_np, orig_sr = self._read_audio(audio_data)
        atten_lim = _DEEPFILTER_ATTEN_DB.get(preset, 12.0)
        df_sr = self._df_state.sr()

        # DeepFilterNet requires its own sample rate (48kHz)
        if orig_sr != df_sr:
            proc_np = self._resample(original_np, orig_sr, df_sr)
        else:
            proc_np = original_np.copy()

        enhanced_np = df_enhance(
            self._df_model,
            self._df_state,
            proc_np,
            atten_lim_db=atten_lim,
        )

        # Blend based on preset (resample original to df_sr for blending)
        if _BLEND.get(preset, 1.0) < 1.0:
            orig_at_df_sr = proc_np if orig_sr == df_sr else self._resample(original_np, orig_sr, df_sr)
            enhanced_np = self._blend(enhanced_np, orig_at_df_sr, preset)

        return self._write_audio(enhanced_np, df_sr)

    def _enhance_lavasr(self, audio_data: bytes, preset: str) -> bytes:
        self._load_lavasr()

        original_np, orig_sr = self._read_audio(audio_data)

        # LavaSR.load_audio expects a file path
        tmp_fd, tmp_path = tempfile.mkstemp(suffix=".wav")
        try:
            with os.fdopen(tmp_fd, "wb") as f:
                f.write(audio_data)

            input_audio, input_sr = self._lava_model.load_audio(tmp_path)
            enhanced_tensor = self._lava_model.enhance(input_audio)
            enhanced_np = enhanced_tensor.cpu().numpy().squeeze()

            # Blend based on preset
            if _BLEND.get(preset, 1.0) < 1.0:
                # Resample original to match enhanced output rate if needed
                out_sr = input_sr  # LavaSR outputs at same sr it loaded
                orig_resampled = (
                    original_np if orig_sr == out_sr
                    else self._resample(original_np, orig_sr, out_sr)
                )
                enhanced_np = self._blend(enhanced_np, orig_resampled, preset)
                return self._write_audio(enhanced_np, out_sr)

            return self._write_audio(enhanced_np, input_sr)
        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass


audio_enhancement_service = AudioEnhancementService()
