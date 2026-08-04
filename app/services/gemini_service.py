"""
gemini_service.py
Gemini-powered translation + interview feedback service.
"""
import os
import json
from dotenv import load_dotenv
from google import genai

load_dotenv()

DEFAULT_GEMINI_KEY = "AQ.Ab8RN6Ia4MLJSMTcSmScnL-TL2l3q6QZ9aaAvCRv-OvxKsCMsQ"

def get_client():
    global _client
    api_key = os.getenv("API") or os.getenv("GEMINI_API_KEY") or os.getenv("GEMINI_KEY") or os.getenv("GOOGLE_API_KEY") or DEFAULT_GEMINI_KEY
    return genai.Client(api_key=api_key)


# ── Simple translation (used for non-interview generic translate) ───────────────
_SIMPLE_PROMPT = """You are an English speaking coach.

The user speaks Hindi or Hinglish.

The transcript may contain speech recognition mistakes.

Convert it into fluent, grammatically correct English.

Rules:
- Preserve names of people.
- Preserve software names.
- Preserve anime, movie, and book titles.
- Preserve company and brand names.
- Make the sentence sound natural.
- Return ONLY the corrected English sentence."""


def translate_to_english(text: str) -> str:
    """Simple Hindi → English translation (no question context)."""
    client = get_client()
    response = client.models.generate_content(
        model="gemini-flash-latest",
        contents=f"{_SIMPLE_PROMPT}\n\nTranscript:\n{text}"
    )
    return response.text.strip()


# ── Interview-aware translation + feedback ─────────────────────────────────────
def translate_with_feedback(text: str, question: str, accent: str = "indian") -> dict:
    """
    Translate the student's Hindi/Hinglish answer and provide interview coaching feedback.

    Returns:
        {
            "translation":  str,   # English translation of their answer
            "score":        int,   # 1–10 quality score
            "strengths":    list,  # 3 bullet points (what they did well)
            "missing":      list,  # 3 bullet points (what was missing)
            "better_answer": str   # A model better answer (≤ 60 words)
        }
    """
    prompt = f"""You are an expert English Interview Coach.

Question:
{question}

Student Answer (Hindi/Hinglish):
{text}

Respond ONLY in JSON. No markdown. No extra keys.

{{
  "translation": "",
  "score": 0,
  "strengths": [],
  "missing": [],
  "better_answer": ""
}}

Requirements:
- translation: Translate the student's answer to English. Never add facts.
- score: Integer 1–10 based on answer quality, clarity, and relevance.
- strengths: Exactly 3 short bullet points of what the student did well.
- missing: Exactly 3 short bullet points of what was lacking or could be improved.
- better_answer: A concise model answer. Do NOT invent experience. Max 60 words.

Output JSON only."""

    client = get_client()
    response = client.models.generate_content(
        model="gemini-flash-latest",
        contents=prompt,
    )

    raw = response.text.strip()
    if raw.startswith("```"):
        raw = raw.replace("```json", "").replace("```", "").strip()

    return json.loads(raw)