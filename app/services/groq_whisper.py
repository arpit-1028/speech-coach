"""
groq_whisper.py — Groq Cloud Whisper API (LPU-accelerated)
============================================================
Uses whisper-large-v3-turbo for ultra-fast, highly accurate transcription.
Free tier: 14,400 requests/day — more than enough for classroom pilot.

Fallback: if GROQ_API_KEY is missing or API fails, returns None so
callers can fall back to local faster-whisper model.
"""
from __future__ import annotations
import os
import requests
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

GROQ_API_URL = "https://api.groq.com/openai/v1/audio/transcriptions"
GROQ_MODEL = "whisper-large-v3-turbo"


def _get_key():
    return os.getenv("GROQ_API_KEY", "")


def transcribe_groq(audio_path: str, language: Optional[str] = None) -> Optional[str]:
    """
    Transcribe audio via Groq Whisper API.

    Args:
        audio_path: Path to audio file (wav, mp3, etc.)
        language: ISO-639-1 code (e.g. "en"). None = auto-detect.

    Returns:
        Transcribed text string, or None if API is unavailable/fails.
    """
    api_key = _get_key()
    if not api_key:
        print("GROQ: No API key set — falling back to local Whisper")
        return None

    try:
        data = {
            "model": GROQ_MODEL,
            "response_format": "json",
            "temperature": "0.0",
        }
        if language:
            data["language"] = language

        with open(audio_path, "rb") as f:
            resp = requests.post(
                GROQ_API_URL,
                headers={"Authorization": f"Bearer {api_key}"},
                files={"file": (os.path.basename(audio_path), f, "audio/wav")},
                data=data,
                timeout=30,
            )

        if resp.status_code == 429:
            print("GROQ: Rate limited — falling back to local Whisper")
            return None

        if resp.status_code != 200:
            print(f"GROQ: API error {resp.status_code}: {resp.text[:200]}")
            return None

        text = resp.json().get("text", "").strip()
        print(f"GROQ TRANSCRIPT: '{text}'")
        return text

    except requests.exceptions.Timeout:
        print("GROQ: Request timed out — falling back to local Whisper")
        return None
    except Exception as e:
        print(f"GROQ: Unexpected error: {e}")
        return None
