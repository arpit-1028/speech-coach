"""
gemini_service.py
AI-powered translation + interview feedback service with multi-tier fallback (Groq LLM -> Gemini -> heuristic).
"""
from __future__ import annotations
import os
import json
import requests
from dotenv import load_dotenv

load_dotenv()

_SIMPLE_PROMPT = """You are an English speaking coach.
The user speaks Hindi or Hinglish.
Convert it into fluent, grammatically correct English.
Rules:
- Preserve names of people, software, companies.
- Make the sentence sound natural and professional.
- Return ONLY the corrected English sentence."""


def _call_groq_chat(system_prompt: str, user_prompt: str, json_mode: bool = False) -> str | None:
    groq_key = os.getenv("GROQ_API_KEY", "")
    if not groq_key:
        return None
    try:
        url = "https://api.groq.com/openai/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {groq_key}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": "llama-3.3-70b-versatile",
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "temperature": 0.3
        }
        if json_mode:
            payload["response_format"] = {"type": "json_object"}

        resp = requests.post(url, headers=headers, json=payload, timeout=12)
        if resp.status_code == 200:
            return resp.json()["choices"][0]["message"]["content"].strip()
    except Exception as e:
        print("Groq chat call failed:", e)
    return None


def translate_to_english(text: str) -> str:
    """Simple Hindi → English translation."""
    if not text or not text.strip():
        return ""

    # Tier 1: Groq LLM
    groq_out = _call_groq_chat(_SIMPLE_PROMPT, f"Translate: {text}")
    if groq_out:
        return groq_out

    # Tier 2: Gemini
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("API") or os.getenv("GOOGLE_API_KEY")
    if api_key:
        try:
            from google import genai
            client = genai.Client(api_key=api_key)
            response = client.models.generate_content(
                model="gemini-2.0-flash",
                contents=f"{_SIMPLE_PROMPT}\n\nTranscript:\n{text}"
            )
            if response.text:
                return response.text.strip()
        except Exception as e:
            print("Gemini translation error:", e)

    # Tier 3: Fallback
    return text.strip()


def translate_with_feedback(text: str, question: str, accent: str = "indian") -> dict:
    """
    Translate the student's Hindi/Hinglish answer and provide interview coaching feedback.
    """
    if not text or not text.strip():
        return {
            "translation": "",
            "score": 0,
            "strengths": ["No answer detected. Please speak into the mic."],
            "missing": ["Speak clearly and answer the interview question."],
            "better_answer": "I would approach this by highlighting my relevant skills and key experiences."
        }

    system_prompt = "You are an expert English Interview Coach. You must respond ONLY in valid JSON."
    user_prompt = f"""Question: {question}
Student Answer (Hindi/Hinglish): {text}

Respond ONLY in JSON with format:
{{
  "translation": "<fluent English translation of student's answer>",
  "score": <integer from 1 to 10>,
  "strengths": ["<strength 1>", "<strength 2>", "<strength 3>"],
  "missing": ["<point to improve 1>", "<point to improve 2>", "<point to improve 3>"],
  "better_answer": "<concise professional model answer, max 60 words>"
}}"""

    # Tier 1: Groq LLM (sub-second)
    groq_json = _call_groq_chat(system_prompt, user_prompt, json_mode=True)
    if groq_json:
        try:
            data = json.loads(groq_json)
            if "translation" in data and "score" in data:
                return data
        except Exception:
            pass

    # Tier 2: Gemini
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("API") or os.getenv("GOOGLE_API_KEY")
    if api_key:
        try:
            from google import genai
            client = genai.Client(api_key=api_key)
            response = client.models.generate_content(
                model="gemini-2.0-flash",
                contents=f"{system_prompt}\n\n{user_prompt}"
            )
            raw = response.text.strip()
            if raw.startswith("```"):
                raw = raw.replace("```json", "").replace("```", "").strip()
            data = json.loads(raw)
            if "translation" in data and "score" in data:
                return data
        except Exception as e:
            print("Gemini interview error:", e)

    # Tier 3: Heuristic Fallback
    eng = translate_to_english(text)
    word_count = len(eng.split())
    score_est = min(9, max(4, round(word_count / 3)))
    return {
        "translation": eng,
        "score": score_est,
        "strengths": [
            "Addressed the core intent of the question",
            "Used clear structure in expressing thoughts",
            "Understood the context well"
        ],
        "missing": [
            "Can elaborate with more specific examples or metrics",
            "Focus on active professional vocabulary",
            "Ensure concluding sentence summarizes your takeaway"
        ],
        "better_answer": f"In response to this question, I ensure that I present my core strengths, structured thinking, and practical examples that demonstrate my capability."
    }