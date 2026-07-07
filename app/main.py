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

        # Audio Quality Assessment
        quality_warning = "good"
        try:
            y, sr = librosa.load(file_path, sr=16000)
            if len(y) == 0:
                quality_warning = "silence"
            else:
                peak = np.max(np.abs(y))
                rms = librosa.feature.rms(y=y)
                avg_rms = np.mean(rms)
                
                if peak < 0.006 or avg_rms < 0.001:
                    quality_warning = "silence"
                elif peak < 0.05:
                    quality_warning = "low_volume"
                else:
                    # Check for clipping
                    clip_count = np.sum(np.abs(y) >= 0.98)
                    clip_ratio = clip_count / len(y)
                    if clip_ratio > 0.05:
                        quality_warning = "clipping"
                    else:
                        # Check for constant background noise
                        sorted_rms = np.sort(rms[0])
                        quiet_rms = np.mean(sorted_rms[:max(1, len(sorted_rms) // 10)])
                        if quiet_rms > 0.07 and quiet_rms / avg_rms > 0.55:
                            quality_warning = "high_noise"
        except Exception as q_err:
            print("Audio quality check error:", q_err)

        audio_warning_msg = None
        if quality_warning == "silence":
            audio_warning_msg = "No sound detected. Please verify your microphone connection."
        elif quality_warning == "low_volume":
            audio_warning_msg = "Quiet recording detected. Try speaking closer to the microphone."
        elif quality_warning == "clipping":
            audio_warning_msg = "Distorted recording (clipping). Speak slightly further from the microphone."
        elif quality_warning == "high_noise":
            audio_warning_msg = "Constant background noise detected. Find a quieter space if possible."

        # Step 2: convert audio → phonemes
        from app.core.spoken_normalizer import normalize_spoken

        print("CALLING RECOGNIZER...")
        spoken_raw = recognize_audio(file_path)
        print("RAW SPOKEN:", spoken_raw)

        # Clean spoken phonemes using standard IPA normalization
        spoken = normalize_spoken(spoken_raw)
        print("NORMALIZED SPOKEN:", spoken)

        # Step 3: get expected phoneme variants (CMU dictionary support)
        expected_variants_cmu = get_phonemes_variants(word)
        print(f"FOUND {len(expected_variants_cmu)} PRONUNCIATION VARIANTS")

        # Step 4: Compare spoken phonemes against all dictionary variants
        best_sc = -1
        best_results = []
        best_expected_ipa = []
        
        for variant_cmu in expected_variants_cmu:
            variant_ipa = cmu_to_ipa(variant_cmu)
            
            # Align and compare (Needleman-Wunsch algorithm)
            results = compare(variant_ipa, spoken, accent=accent)
            
            # Score
            sc = score(results)
            
            # Keep the variant that matches the user's speech the best
            if sc > best_sc:
                best_sc = sc
                best_results = results
                best_expected_ipa = variant_ipa

        # Fallback if no matching variant found
        if best_sc == -1:
            best_sc = 0
            best_results = []
            best_expected_ipa = []

        # If audio quality is bad, prevent severe score penalties
        if quality_warning in ["silence", "low_volume"] and best_sc < 70:
            # Shield user from mic issues by capping score deduction
            best_sc = max(best_sc, 80)

        # Step 5: feedback with mistakes and improvement drills
        breakdown = score_breakdown(best_results)
        fb = generate_feedback(best_results, best_sc)

        # If there's an audio quality issue, prepend it to the summary feedback
        if audio_warning_msg:
            fb["summary"] = f"⚠️ Note: {audio_warning_msg} | {fb['summary']}"

        # Calculate granular scores for premium frontend UI
        total_phonemes = max(1, len(best_results))
        correct_count = breakdown.get("correct", 0)
        accent_count = breakdown.get("accent_match", 0)
        close_count = breakdown.get("close", 0)

        # Clarity based on matches
        clarity_score = round(((correct_count + accent_count) / total_phonemes) * 100)
        # Confidence based on pronunciation and flow
        confidence_score = round(((correct_count + accent_count + close_count * 0.65) / total_phonemes) * 100)
        
        # Estimate speaking speed
        speed_label = "normal"
        if len(spoken) > len(best_expected_ipa) * 1.3:
            speed_label = "fast"
        elif len(spoken) < len(best_expected_ipa) * 0.7:
            speed_label = "slow"

        # Separate weak/strong sounds
        weak_sounds = []
        strong_sounds = []
        for res in best_results:
            sound = res.get("expected") or res.get("spoken") or ""
            if res["type"] in ["correct", "accent_match"]:
                if sound and sound not in strong_sounds:
                    strong_sounds.append(sound)
            else:
                if sound and sound not in weak_sounds:
                    weak_sounds.append(sound)

        return {
            # Backward compatibility keys
            "expected_word": word.lower(),
            "detected_word": word.lower(),
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

            # New premium gamified dashboard keys
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
            "audio_quality_warning": audio_warning_msg,
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
