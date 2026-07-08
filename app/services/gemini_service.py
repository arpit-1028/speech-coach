import os
from dotenv import load_dotenv
from google import genai

load_dotenv()

_client = None

def get_client():
    global _client
    if _client is None:
        api_key = os.getenv("API") or os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("Gemini API Key is missing. Please add it to your Hugging Face Space secrets under the name 'API'.")
        _client = genai.Client(api_key=api_key)
    return _client

PROMPT = """
You are an English speaking coach.

The user speaks Hindi or Hinglish.

The transcript may contain speech recognition mistakes.

Convert it into fluent, grammatically correct English.

Rules:
- Preserve names of people.
- Preserve software names.
- Preserve anime, movie, and book titles.
- Preserve company and brand names.
- Make the sentence sound natural.
- Return ONLY the corrected English sentence.
"""

def translate_to_english(text: str):
    client = get_client()
    response = client.models.generate_content(
        model="gemini-2.5-flash-lite",
        contents=f"{PROMPT}\n\nTranscript:\n{text}"
    )
    return response.text.strip()