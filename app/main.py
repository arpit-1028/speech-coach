import os
import uuid
import shutil
import base64
from fastapi import FastAPI, UploadFile, File, Query, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.services.cmu_service import get_phonemes
from app.phonemes.cmu_map import CMU_TO_INTERNAL
from app.core.normalizer import normalize
from app.core.comparator import compare
from app.core.scorer import score, score_breakdown
from app.core.feedback import generate_feedback
from app.services.recognizer import recognize_audio
from app.phonemes.word_dict import WORD_DICT
from app.core.matcher import find_best_match

# New AI services
from app.services.whisper_service import transcribe
from app.services.gemini_service import translate_to_english
from app.services.tts_service import generate_audio
from app.services.grammar_service import get_random_sentence, get_sentence_by_id
from app.services.grammar_checker import check_grammar

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"message": "Pronunciation & AI Communication Engine Running"}

@app.post("/check/{word}")
async def check(
    word: str,
    audio: UploadFile = File(...),
    accent: str = Query(default="indian", pattern="^(indian|auto|neutral)$")
):
    print("CHECK ENDPOINT HIT")
    unique_id = uuid.uuid4().hex
    file_path = f"input_{unique_id}.wav"

    try:
        # Step 1: save uploaded audio file
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(audio.file, buffer)

        print("FILE SAVED:", file_path)

        # Step 2: convert audio → phonemes
        from app.core.spoken_normalizer import normalize_spoken

        print("CALLING RECOGNIZER...")
        spoken_raw = recognize_audio(file_path)
        print("RAW SPOKEN:", spoken_raw)

        spoken = normalize_spoken(spoken_raw)
        print("NORMALIZED SPOKEN:", spoken)

        # Step 3: get expected phonemes (from test dict or fallback)
        target = word.lower()
        if target in WORD_DICT:
            expected = WORD_DICT[target]
            print("FOUND IN WORD_DICT:", expected)
        else:
            expected_cmu = get_phonemes(word)
            expected = normalize(expected_cmu, CMU_TO_INTERNAL)
            print("FALLBACK TO CMU:", expected)

        # Step 4: compare sounds with Indian-speaker-aware tolerance
        results = compare(expected, spoken, accent=accent)

        # Step 5: score on a 0-100 scale with vowel/consonant weighting
        sc = score(results)
        breakdown = score_breakdown(results)

        # Step 6: feedback with mistakes and improvement drills
        fb = generate_feedback(results, sc)

        # Calculate granular scores for advanced frontend UI
        total_phonemes = max(1, len(results))
        correct_count = breakdown.get("correct", 0)
        accent_count = breakdown.get("accent_match", 0)
        close_count = breakdown.get("close", 0)
        wrong_count = breakdown.get("wrong", 0)
        missing_count = breakdown.get("missing", 0)
        extra_count = breakdown.get("extra", 0)

        # Clarity based on exact + accent matched
        clarity_score = round(((correct_count + accent_count) / total_phonemes) * 100)
        # Confidence based on pronunciation flow and lack of errors
        confidence_score = round(((correct_count + accent_count + close_count * 0.6) / total_phonemes) * 100)
        
        # Estimate speaking speed
        speed_label = "normal"
        if len(spoken) > len(expected) * 1.3:
            speed_label = "fast"
        elif len(spoken) < len(expected) * 0.7:
            speed_label = "slow"

        # Separate weak/strong sounds
        weak_sounds = []
        strong_sounds = []
        for res in results:
            sound = res.get("expected") or res.get("spoken") or ""
            if res["type"] in ["correct", "accent_match"]:
                if sound and sound not in strong_sounds:
                    strong_sounds.append(sound)
            else:
                if sound and sound not in weak_sounds:
                    weak_sounds.append(sound)

        return {
            # Backward compatibility keys
            "expected_word": target,
            "detected_word": target,
            "expected_phonemes": expected,
            "spoken_phonemes": spoken,
            "comparison": results,
            "score": sc,
            "score_breakdown": breakdown,
            "feedback": fb["feedback"],
            "summary": fb["summary"],
            "mistakes": fb["mistakes"],
            "improvements": fb["improvements"],
            "accent_used": accent,

            # New premium gamified dashboard keys
            "overall_score": sc,
            "pronunciation_score": sc,
            "clarity_score": clarity_score,
            "confidence_score": confidence_score,
            "speaking_speed": speed_label,
            "weak_sounds": weak_sounds[:5],
            "strong_sounds": strong_sounds[:5],
            "detected_mistakes": fb["mistakes"],
            "improvement_tips": fb["improvements"],
            "sound_level_comparison": results,
            "ai_summary": fb["summary"],
        }
    except Exception as e:
        print("ERROR IN CHECK:", e)
        return JSONResponse(status_code=500, content={"error": str(e)})
    finally:
        if os.path.exists(file_path):
            os.remove(file_path)

@app.post("/translate")
async def translate_audio(audio: UploadFile = File(...)):
    print("TRANSLATE ENDPOINT HIT")
    unique_id = uuid.uuid4().hex
    input_file = f"translate_in_{unique_id}.wav"
    output_file = f"translate_out_{unique_id}.mp3"

    try:
        # Save input audio
        with open(input_file, "wb") as buffer:
            shutil.copyfileobj(audio.file, buffer)
        
        # Transcribe (Whisper)
        transcript = transcribe(input_file)
        print("WHISPER TRANSCRIPT:", transcript)
        
        # Translate (Gemini)
        translation = translate_to_english(transcript)
        print("GEMINI TRANSLATION:", translation)
        
        # Generate Text-To-Speech (Edge-TTS)
        import edge_tts
        communicate = edge_tts.Communicate(translation, "en-US-AriaNeural")
        await communicate.save(output_file)
        
        # Read generated audio as base64
        audio_base64 = ""
        if os.path.exists(output_file):
            with open(output_file, "rb") as f:
                audio_base64 = base64.b64encode(f.read()).decode("utf-8")
        
        return {
            "transcript": transcript,
            "translation": translation,
            "audio": audio_base64
        }
    except Exception as e:
        print("TRANSLATION ERROR:", e)
        return JSONResponse(status_code=500, content={
            "error": str(e),
            "transcript": "Transcription failed",
            "translation": "Translation failed",
            "audio": ""
        })
    finally:
        if os.path.exists(input_file):
            os.remove(input_file)
        if os.path.exists(output_file):
            os.remove(output_file)

@app.get("/grammar/{level}")
async def grammar(level: str):
    try:
        sentence = get_random_sentence(level)
        return {
            "id": sentence["id"],
            "scenario": sentence["scenario"],
            "wrong": sentence["wrong"],
            "correct": sentence["correct"]
        }
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.post("/grammar/check")
async def grammar_check(
    level: str = Form(...),
    sentence_id: int = Form(...),
    audio: UploadFile = File(...)
):
    print("GRAMMAR CHECK ENDPOINT HIT")
    unique_id = uuid.uuid4().hex
    input_file = f"grammar_in_{unique_id}.wav"

    try:
        # Save input audio
        with open(input_file, "wb") as buffer:
            shutil.copyfileobj(audio.file, buffer)
        
        # Transcribe (Whisper)
        spoken = transcribe(input_file)
        print("GRAMMAR SPOKEN TEXT:", spoken)
        
        # Get correct target sentence
        sentence = get_sentence_by_id(level, sentence_id)
        if not sentence:
            return JSONResponse(status_code=404, content={"error": f"Sentence with ID {sentence_id} not found"})
        
        correct = sentence["correct"]
        
        # Check grammar (Gemini)
        result = check_grammar(correct, spoken)
        
        return result
    except Exception as e:
        print("GRAMMAR CHECK ERROR:", e)
        return {
            "score": 0,
            "grade": "Needs Improvement",
            "grammar_correct": False,
            "spoken_sentence": "Could not transcribe/check speech.",
            "expected_sentence": "",
            "feedback": [str(e)],
            "mistakes": []
        }
    finally:
        if os.path.exists(input_file):
            os.remove(input_file)

@app.get("/analytics/mock")
async def get_mock_analytics():
    return {
        "accuracy_trend": [70, 75, 78, 82, 85, 88, 91],
        "speaking_time_seconds": 1240,
        "most_improved_sound": "TH",
        "xp_history": [10, 20, 15, 30, 25, 40, 50]
    }
