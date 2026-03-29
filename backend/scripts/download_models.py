#!/usr/bin/env python3
"""Download all Qwen3-TTS models to the local cache.

Run inside the container:
    python scripts/download_models.py

Or from docker exec:
    docker exec -it qwen-tts python scripts/download_models.py
"""

import sys
from huggingface_hub import snapshot_download

MODELS = [
    # Voice Clone models
    ("Qwen/Qwen3-TTS-12Hz-1.7B-Base", "Voice Clone 1.7B"),
    ("Qwen/Qwen3-TTS-12Hz-0.6B-Base", "Voice Clone 0.6B"),
    # Voice Design model
    ("Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign", "Voice Design 1.7B"),
    # Custom Voice models
    ("Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice", "Custom Voice 1.7B"),
    ("Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice", "Custom Voice 0.6B"),
    # Whisper for transcription
    ("Systran/faster-whisper-base", "Whisper Base"),
]


def main():
    print("=" * 60)
    print("Qwen3-TTS Model Downloader")
    print("=" * 60)
    print(f"\nDownloading {len(MODELS)} models...\n")

    failed = []
    for repo_id, name in MODELS:
        print(f"📦 Downloading: {name}")
        print(f"   Repository: {repo_id}")
        print("-" * 60)
        try:
            path = snapshot_download(repo_id)
            print(f"   ✅ Downloaded to: {path}\n")
        except Exception as e:
            print(f"   ❌ Failed: {e}\n")
            failed.append((name, str(e)))

    print("=" * 60)
    if failed:
        print(f"⚠️  {len(failed)} model(s) failed to download:")
        for name, error in failed:
            print(f"   - {name}: {error}")
        sys.exit(1)
    else:
        print("✅ All models downloaded successfully!")
    print("=" * 60)


if __name__ == "__main__":
    main()
