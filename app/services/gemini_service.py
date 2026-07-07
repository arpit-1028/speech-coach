import os

from dotenv import load_dotenv
from google import genai

load_dotenv()

client = genai.Client(
    api_key=os.getenv("API")
)

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

    response = client.models.generate_content(
        model="gemini-2.5-flash-lite",
        contents=f"{PROMPT}\n\nTranscript:\n{text}"
    )

    return response.text.strip()