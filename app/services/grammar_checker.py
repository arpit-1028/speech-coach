import os
import json
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
You are an AI English Grammar Coach.

Expected sentence:
{correct}

Student spoke:
{spoken}

Compare both sentences carefully.

Evaluate:

1. Grammar correctness
2. Missing words
3. Wrong words
4. Extra words
5. Word order
6. Overall fluency

Scoring:

95-100 = Excellent
85-94 = Very Good
70-84 = Good
50-69 = Average
0-49 = Needs Improvement

Return ONLY valid JSON.

{{
    "score": 0,
    "grade": "",
    "grammar_correct": true,
    "spoken_sentence": "",
    "expected_sentence": "",
    "feedback": [],
    "mistakes": []
}}
"""

def check_grammar(correct, spoken):
    client = get_client()
    prompt = PROMPT.format(
        correct=correct,
        spoken=spoken,
    )

    response = client.models.generate_content(
        model="gemini-2.0-flash",
        contents=prompt
    )

    print("========== RAW RESPONSE ==========")
    print(response)
    print("========== TEXT ==========")
    print(response.text)

    text = response.text
    text = text.replace("```json", "")
    text = text.replace("```", "")
    text = text.strip()

    return json.loads(text)

if __name__ == "__main__":
    result = check_grammar(
        "She goes to school every day.",
        "She go to school every day."
    )
    print(result)