import os
import uuid
import shutil
import base64
import librosa
import numpy as np
from fastapi import FastAPI, UploadFile, File, Query, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.services.cmu_service import get_phonemes, get_phonemes_variants, cmu_to_ipa
from app.core.comparator import compare
from app.core.scorer import score, score_breakdown
from app.core.feedback import generate_feedback
from app.services.recognizer import recognize_audio
# spoken_normalizer no longer needed — CMU dict gives correct IPA directly

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


def assess_audio_quality(file_path):
    """Assess recording quality and return a warning category and message."""
    try:
        y, sr = librosa.load(file_path, sr=16000)
        if len(y) == 0:
            return "silence", "No sound detected. Please check your microphone."

        peak = np.max(np.abs(y))
        rms = librosa.feature.rms(y=y)
        avg_rms = float(np.mean(rms))

        if peak < 0.006 or avg_rms < 0.001:
            return "silence", "No sound detected. Please check your microphone."
        if peak < 0.05:
            return "low_volume", "Recording is very quiet. Speak closer to the microphone."

        # Check clipping
        clip_ratio = float(np.sum(np.abs(y) >= 0.98)) / len(y)
        if clip_ratio > 0.05:
            return "clipping", "Recording is distorted (clipping). Move slightly away from the microphone."

        # Check background noise
        sorted_rms = np.sort(rms[0])
        quiet_rms = float(np.mean(sorted_rms[:max(1, len(sorted_rms) // 10)]))
        if quiet_rms > 0.07 and quiet_rms / max(avg_rms, 1e-9) > 0.55:
            return "high_noise", "Background noise detected. Find a quieter space."

        return "good", None
    except Exception as e:
        print("Audio quality check error:", e)
        return "unknown", None


@app.post("/check/{word}")
async def check(
    word: str,
    audio: UploadFile = File(...),
    accent: str = Query(default="indian", pattern="^(indian|auto|neutral)$")
):
    print("CHECK ENDPOINT HIT for word:", word)
    unique_id = uuid.uuid4().hex
    file_path = f"input_{unique_id}.wav"

    try:
        # Step 1: Save uploaded audio
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(audio.file, buffer)

        # Step 2: Audio quality check
        quality_category, quality_msg = assess_audio_quality(file_path)
        print(f"AUDIO QUALITY: {quality_category}")

        # Step 3: Extract spoken phonemes via Whisper → CMU dict → IPA tokens
        # recognize_audio now uses Whisper (fast, accurate) to get the word
        # the user said, then looks it up in the CMU dict to get IPA phonemes.
        # This is far more accurate than the old wav2vec2-xlsr-53 IPA model
        # which incorrectly mapped θ→h, ŋk→n, etc.
        spoken = recognize_audio(file_path, expected_word=word)
        print("SPOKEN IPA:", spoken)

        # Also capture what Whisper actually heard (for word-match bonus check)
        from app.services.recognizer import _transcribe_words
        try:
            whisper_words = _transcribe_words(file_path, hint_word=word)
            whisper_heard = " ".join(whisper_words)
        except Exception:
            whisper_heard = word.lower()

        # Step 4: Get ALL expected pronunciation variants from CMU dict → IPA
        expected_variants_cmu = get_phonemes_variants(word)
        print(f"PRONUNCIATION VARIANTS: {len(expected_variants_cmu)}")

        # Step 5: Compare spoken against each variant, keep the best match
        best_sc = -1
        best_results = []
        best_expected_ipa = []

        for variant_cmu in expected_variants_cmu:
            variant_ipa = cmu_to_ipa(variant_cmu)
            results = compare(variant_ipa, spoken, accent=accent)
            sc = score(results)

            if sc > best_sc:
                best_sc = sc
                best_results = results
                best_expected_ipa = variant_ipa

        # Fallback
        if best_sc < 0:
            best_sc = 0
            best_results = []
            best_expected_ipa = []

        # Step 6 – Word-match bonus
        # If Whisper correctly transcribed the expected word, the user clearly
        # said the right word. Give a score floor of 72 to avoid false negatives
        # caused by minor accent differences in the phoneme comparison.
        word_correct = (whisper_heard.strip().lower() == word.strip().lower())
        if word_correct and best_sc < 72:
            print(f"WORD-MATCH BONUS: Whisper heard '{whisper_heard}' == expected '{word}', boosting {best_sc}→72")
            best_sc = 72

        # Step 6b: If audio quality is bad, protect user from false low scores
        if quality_category in ("silence", "low_volume") and best_sc < 60:
            best_sc = max(best_sc, 75)

        # Step 7: Generate feedback
        breakdown = score_breakdown(best_results)
        fb = generate_feedback(best_results, best_sc)

        if quality_msg:
            fb["summary"] = f"⚠️ {quality_msg} — {fb['summary']}"

        # Step 8: Compute granular scores for frontend display
        total = max(1, len(best_results))
        n_correct = breakdown.get("correct", 0)
        n_accent = breakdown.get("accent_match", 0)
        n_close = breakdown.get("close", 0)

        clarity_score = round(((n_correct + n_accent) / total) * 100)
        confidence_score = round(((n_correct + n_accent + n_close * 0.6) / total) * 100)

        speed_label = "normal"
        if len(spoken) > len(best_expected_ipa) * 1.3:
            speed_label = "fast"
        elif len(spoken) < len(best_expected_ipa) * 0.7:
            speed_label = "slow"

        # Separate weak and strong sounds
        weak_sounds = []
        strong_sounds = []
        for res in best_results:
            sound = res.get("expected") or res.get("spoken") or ""
            if res["type"] in ("correct", "accent_match"):
                if sound and sound not in strong_sounds:
                    strong_sounds.append(sound)
            else:
                if sound and sound not in weak_sounds:
                    weak_sounds.append(sound)

        return {
            # Backward compat
            "expected_word": word.lower(),
            "detected_word": whisper_heard,      # What Whisper actually heard
            "expected_phonemes": best_expected_ipa,
            "spoken_phonemes": spoken,
            "comparison": best_results,
            "score": best_sc,
            "score_breakdown": breakdown,
            "feedback": fb["feedback"],
            "summary": fb["summary"],
            "mistakes": fb["mistakes"],
            "improvements": fb["improvements"],
            "accent_used": accent,

            # Premium dashboard keys
            "overall_score": best_sc,
            "pronunciation_score": best_sc,
            "clarity_score": clarity_score,
            "confidence_score": confidence_score,
            "speaking_speed": speed_label,
            "weak_sounds": weak_sounds[:5],
            "strong_sounds": strong_sounds[:5],
            "detected_mistakes": fb["mistakes"],
            "improvement_tips": fb["improvements"],
            "sound_level_comparison": best_results,
            "ai_summary": fb["summary"],
            "audio_quality": quality_category,
            "audio_quality_warning": quality_msg,
            "weak_sound": fb.get("weak_sound", ""),
            "practice_words": fb.get("practice_words", []),
            "whisper_heard": whisper_heard,      # Debug / UI info
        }
    except Exception as e:
        print("ERROR IN CHECK:", e)
        import traceback
        traceback.print_exc()
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
        with open(input_file, "wb") as buffer:
            shutil.copyfileobj(audio.file, buffer)

        transcript = transcribe(input_file)
        print("WHISPER TRANSCRIPT:", transcript)

        translation = translate_to_english(transcript)
        print("GEMINI TRANSLATION:", translation)

        import edge_tts
        communicate = edge_tts.Communicate(translation, "en-US-AriaNeural")
        await communicate.save(output_file)

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
        with open(input_file, "wb") as buffer:
            shutil.copyfileobj(audio.file, buffer)

        spoken = transcribe(input_file)
        print("GRAMMAR SPOKEN TEXT:", spoken)

        sentence = get_sentence_by_id(level, sentence_id)
        if not sentence:
            return JSONResponse(status_code=404, content={"error": f"Sentence with ID {sentence_id} not found"})

        correct = sentence["correct"]
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
