"""
scenario_service.py
AI-powered scenario/question generator for the Translation & Interview Practice feature.
Multi-tier generation: Groq LLM (sub-second) -> Gemini -> Curated Scenario Bank.
"""
from __future__ import annotations
import json
import os
import random
import requests
from dotenv import load_dotenv

load_dotenv()

SCENARIOS = {
    "college":   "College Life & Academics",
    "placement": "Job & Internship Interview",
    "daily":     "Daily Life & Social Conversation",
    "finance":   "Money, Banking & Business",
}

# Curated Fallback Question Bank
QUESTION_BANK = {
    "placement": [
        {
            "english": "Tell me about yourself and your key technical strengths.",
            "hindi": "अपने बारे में बताइए और अपनी प्रमुख तकनीकी शक्तियों के बारे में जानकारी दीजिए।"
        },
        {
            "english": "Why do you want to join our company as a software developer?",
            "hindi": "आप एक सॉफ्टवेयर डेवलपर के रूप में हमारी कंपनी में क्यों शामिल होना चाहते हैं?"
        },
        {
            "english": "Describe a challenging project you worked on and how you solved difficulties.",
            "hindi": "किसी चुनौतीपूर्ण प्रोजेक्ट के बारे में बताइए जिस पर आपने काम किया और कठिनाइयों को कैसे हल किया।"
        },
        {
            "english": "Where do you see yourself professionally in the next three to five years?",
            "hindi": "अगले तीन से पांच वर्षों में आप खुद को पेशेवर रूप से कहाँ देखते हैं?"
        },
        {
            "english": "How do you handle tight project deadlines and work under pressure?",
            "hindi": "आप काम के दबाव और समय सीमा (डेडलाइन) को कैसे संभालते हैं?"
        },
        {
            "english": "What is your biggest weakness and what steps are you taking to improve it?",
            "hindi": "आपकी सबसे बड़ी कमजोरी क्या है और इसे सुधारने के लिए आप क्या कदम उठा रहे हैं?"
        }
    ],
    "college": [
        {
            "english": "How was your first day at engineering college?",
            "hindi": "इंजीनियरिंग कॉलेज में आपका पहला दिन कैसा था?"
        },
        {
            "english": "Which subject do you find most interesting in your current semester?",
            "hindi": "इस सेमेस्टर में आपको कौन सा विषय सबसे दिलचस्प लगता है?"
        },
        {
            "english": "How do you balance your exam preparation with practical lab assignments?",
            "hindi": "आप परीक्षा की तैयारी और प्रैक्टिकल लैब असाइनमेंट के बीच संतुलन कैसे बनाते हैं?"
        },
        {
            "english": "Tell me about a technical fest or college event you participated in.",
            "hindi": "कॉलेज के किसी टेक्निकल फेस्ट या इवेंट के बारे में बताइए जिसमें आपने भाग लिया था।"
        }
    ],
    "daily": [
        {
            "english": "How do you usually spend your weekends with friends and family?",
            "hindi": "आप आमतौर पर दोस्तों और परिवार के साथ अपने वीकेंड कैसे बिताते हैं?"
        },
        {
            "english": "What is your favorite hobby and why do you enjoy it?",
            "hindi": "आपका पसंदीदा शौक (हॉबी) क्या है और आपको इसमें आनंद क्यों आता है?"
        },
        {
            "english": "Describe a memorable trip or place you visited recently.",
            "hindi": "हाल ही में की गई किसी यादगार यात्रा या जगह का वर्णन कीजिए।"
        },
        {
            "english": "What morning routine helps you stay productive throughout the day?",
            "hindi": "कौन सा सुबह का रूटीन आपको पूरे दिन एक्टिव और प्रोडक्टिव रखने में मदद करता है?"
        }
    ],
    "finance": [
        {
            "english": "Why is it important for college students to start budgeting their expenses?",
            "hindi": "कॉलेज के छात्रों के लिए अपने खर्चों का बजट बनाना क्यों महत्वपूर्ण है?"
        },
        {
            "english": "What are the advantages of digital banking and UPI payments in India?",
            "hindi": "भारत में डिजिटल बैंकिंग और यूपीआई भुगतान के क्या फायदे हैं?"
        },
        {
            "english": "How do you plan your personal savings from your monthly pocket money?",
            "hindi": "आप अपनी मासिक पॉकेट मनी से व्यक्तिगत बचत की योजना कैसे बनाते हैं?"
        }
    ]
}


def _generate_with_groq(topic_label: str) -> dict | None:
    groq_key = os.getenv("GROQ_API_KEY", "")
    if not groq_key:
        return None
    try:
        url = "https://api.groq.com/openai/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {groq_key}",
            "Content-Type": "application/json"
        }
        prompt = (
            f"Generate ONE realistic interview or speaking practice question for the topic: '{topic_label}'.\n"
            "Output JSON only with keys 'english' and 'hindi'.\n"
            'Example: {"english": "Tell me about...", "hindi": "अपने बारे में..."}'
        )
        payload = {
            "model": "llama-3.3-70b-versatile",
            "messages": [
                {"role": "system", "content": "You are a professional English interview and speaking coach. Respond ONLY in valid JSON."},
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.7,
            "response_format": {"type": "json_object"}
        }
        res = requests.post(url, headers=headers, json=payload, timeout=8)
        if res.status_code == 200:
            content = res.json()["choices"][0]["message"]["content"]
            data = json.loads(content)
            if "english" in data and "hindi" in data:
                return data
    except Exception as e:
        print("Groq scenario gen failed:", e)
    return None


def _generate_with_gemini(topic_label: str) -> dict | None:
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("API") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        return None
    try:
        from google import genai
        client = genai.Client(api_key=api_key)
        prompt = (
            f"Generate ONE realistic interview or speaking practice question for: {topic_label}.\n"
            "Return JSON only with keys 'english' and 'hindi'."
        )
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=prompt,
        )
        raw = response.text.strip()
        if raw.startswith("```"):
            raw = raw.replace("```json", "").replace("```", "").strip()
        data = json.loads(raw)
        if "english" in data and "hindi" in data:
            return data
    except Exception as e:
        print("Gemini scenario gen failed:", e)
    return None


def generate_scenario(topic: str) -> dict:
    """
    Generate ONE realistic speaking practice question for the given topic.
    Returns: { "english": "...", "hindi": "..." }
    """
    clean_topic = topic.lower().strip()
    topic_label = SCENARIOS.get(clean_topic, "Daily Conversation")

    # Tier 1: Try ultra-fast Groq LLM
    groq_res = _generate_with_groq(topic_label)
    if groq_res:
        return groq_res

    # Tier 2: Try Gemini API
    gemini_res = _generate_with_gemini(topic_label)
    if gemini_res:
        return gemini_res

    # Tier 3: Curated robust offline bank
    bank = QUESTION_BANK.get(clean_topic, QUESTION_BANK["placement"])
    return random.choice(bank)

