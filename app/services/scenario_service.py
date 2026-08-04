"""
scenario_service.py
AI-powered scenario/question generator for the Translation (Interview Practice) feature.
Uses Gemini to generate contextual speaking practice questions in English + Hindi.
"""
import json
import os
from google import genai

SCENARIOS = {
    "college":   "College Life",
    "placement": "Internship and Placement Interview",
    "daily":     "Daily Conversation",
    "finance":   "Money and Banking",
}


DEFAULT_GEMINI_KEY = "AQ.Ab8RN6Ia4MLJSMTcSmScnL-TL2l3q6QZ9aaAvCRv-OvxKsCMsQ"

def _get_client():
    api_key = os.getenv("API") or os.getenv("GEMINI_API_KEY") or os.getenv("GEMINI_KEY") or os.getenv("GOOGLE_API_KEY") or DEFAULT_GEMINI_KEY
    return genai.Client(api_key=api_key)


def generate_scenario(topic: str) -> dict:
    """
    Generate ONE realistic speaking practice question for the given topic.
    Returns: { "english": "...", "hindi": "..." }
    """
    scenario_label = SCENARIOS.get(topic.lower(), "Daily Conversation")

    prompt = f"""Generate ONE realistic interview or daily speaking practice question for the topic: {scenario_label}.

Return ONLY valid JSON. No markdown. No explanation.

Format:
{{
    "english": "...",
    "hindi": "..."
}}

Rules:
- English question should sound natural for an interview or daily context.
- Hindi should be a clean, natural translation of the English question.
- Do NOT add markdown fences.
- Output JSON only."""

    client = _get_client()
    response = client.models.generate_content(
        model="gemini-flash-latest",
        contents=prompt,
    )

    raw = response.text.strip()
    # Strip markdown fences if model adds them
    if raw.startswith("```"):
        raw = raw.replace("```json", "").replace("```", "").strip()

    return json.loads(raw)
