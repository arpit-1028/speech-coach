import os
import json

from app.services.recognizer import recognize_audio, _transcribe_words
from app.services.cmu_service import get_phonemes_variants, cmu_to_ipa
from app.core.comparator import compare
from app.core.scorer import score
from app.diagnostic.result import generate_report

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOUND_JSON_PATH = os.path.join(BASE_DIR, "diagnostic", "sound.json")

SOUND_TESTS = []
if os.path.exists(SOUND_JSON_PATH):
    with open(SOUND_JSON_PATH, "r", encoding="utf-8") as f:
        SOUND_TESTS = json.load(f)


def evaluate_sound(audio_path: str, sound_item: dict) -> dict:
    """
    Evaluate a single diagnostic sound test item using the same accurate
    Whisper -> CMU dict -> IPA -> phoneme-compare pipeline as the main
    /check/{word} endpoint.

    Scoring:
    - Whisper transcribes what the user actually said.
    - If the transcribed word does NOT match the target word at all → score = 0.
    - If the word matches → run full phoneme comparison (0-100 score).
    - Accent-acceptable substitutions (e.g. Indian TH→T) get partial credit (50).
    - 'detected' is True only when score >= 60.
    """
    target_word = sound_item.get("word", "")
    target_sound = sound_item.get("sound", "")
    skill = sound_item.get("skill", "consonants")

    # ── Step 1: Transcribe what user actually said ─────────────────────────────
    try:
        whisper_words = _transcribe_words(audio_path, hint_word=target_word)
        whisper_heard = " ".join(whisper_words).strip().lower()
    except Exception as e:
        print(f"DIAGNOSTIC TRANSCRIBE ERROR: {e}")
        whisper_heard = ""

    print(f"DIAGNOSTIC: target='{target_word}', whisper_heard='{whisper_heard}'")

    # ── Step 2: Word-level gate ────────────────────────────────────────────────
    # If the user said a completely different word, they fail this question.
    target_clean = target_word.strip().lower()

    # Allow minor Whisper variations: check if target word appears in transcript
    # or if transcript appears in target (handles "thinks" vs "think" etc.)
    word_match = (
        target_clean == whisper_heard
        or target_clean in whisper_words
        or (whisper_heard and target_clean.startswith(whisper_heard[:4]))
    )

    if not whisper_heard:
        # Silence / no speech detected
        return _make_result(sound_item, score_val=0.0, detected=False,
                            spoken_word=whisper_heard, spoken_ipa=[])

    if not word_match:
        # User said wrong word entirely → zero score
        print(f"DIAGNOSTIC: WRONG WORD — heard '{whisper_heard}', expected '{target_clean}'")
        return _make_result(sound_item, score_val=0.0, detected=False,
                            spoken_word=whisper_heard, spoken_ipa=[])

    # ── Step 3: Phoneme-level comparison (same as /check/{word}) ──────────────
    # Get spoken IPA from what Whisper heard
    spoken_ipa = recognize_audio(audio_path, expected_word=target_word)
    print(f"DIAGNOSTIC: spoken IPA = {spoken_ipa}")

    # Get all expected CMU pronunciation variants for the target word
    expected_variants_cmu = get_phonemes_variants(target_word)
    if not expected_variants_cmu or not expected_variants_cmu[0]:
        # CMU lookup failed — word match alone gives partial credit
        print(f"DIAGNOSTIC: CMU lookup failed for '{target_word}', word match credit")
        return _make_result(sound_item, score_val=0.72, detected=True,
                            spoken_word=whisper_heard, spoken_ipa=spoken_ipa)

    # Score against all variants, keep best
    best_sc = -1
    for variant_cmu in expected_variants_cmu:
        variant_ipa = cmu_to_ipa(variant_cmu)
        results = compare(variant_ipa, spoken_ipa, accent="indian")
        sc = score(results)
        if sc > best_sc:
            best_sc = sc

    if best_sc < 0:
        best_sc = 0

    # ── Step 4: Word-match bonus (same as /check) ──────────────────────────────
    # If Whisper heard the correct word, apply a floor of 72 to avoid
    # penalising valid Indian-English accents too harshly.
    if word_match and best_sc < 72:
        print(f"DIAGNOSTIC: word-match bonus {best_sc}→72")
        best_sc = 72

    best_sc = min(best_sc, 100)

    # ── Step 5: Sound-specific penalty ────────────────────────────────────────
    # Even if the word matched, check that the KEY target sound was present.
    # E.g. for TH-sound test, deduct points if user clearly said "t" instead of "th".
    target_sound_penalty = _check_target_sound(
        spoken_ipa, target_sound, whisper_heard, target_word
    )
    if target_sound_penalty > 0:
        best_sc = max(0, best_sc - target_sound_penalty)
        print(f"DIAGNOSTIC: target-sound penalty -{target_sound_penalty} → {best_sc}")

    detected = best_sc >= 60
    score_val = round(best_sc) / 100.0  # Normalise to 0.0–1.0 for report aggregation

    return _make_result(sound_item, score_val=score_val, detected=detected,
                        spoken_word=whisper_heard, spoken_ipa=spoken_ipa)


def _check_target_sound(spoken_ipa: list, target_sound: str, whisper_heard: str, target_word: str) -> int:
    """
    Penalise score if the key target phoneme is clearly substituted.
    Returns penalty points (0 = no penalty, up to 30).

    Only applied for sounds the diagnostic specifically tests:
    - th/dh (TH confusion): if heard word lacks any TH phoneme and user didn't
      produce θ/ð → penalise 28 points (big TH-confusion indicator)
    - v/w confusion: if target is V-sound but user clearly said a W word → -25
    - r/l: if target is R but user said L-word → -20
    """
    SOUND_PENALTIES = {
        # (target_sound, wrong_ipa_tokens_indicating_failure) -> penalty
        "th": (["t", "d", "s", "f"], 28),   # TH said as T/D/S/F
        "dh": (["d", "z"], 25),              # soft-TH said as D/Z
        "v":  (["w"], 20),                   # V said as W
        "w":  (["v"], 20),                   # W said as V
        "r":  (["l"], 20),                   # R said as L
        "l":  (["r"], 20),                   # L said as R
    }

    if target_sound not in SOUND_PENALTIES:
        return 0  # No specific penalty for this sound

    wrong_tokens, penalty = SOUND_PENALTIES[target_sound]

    # IPA tokens that ARE correct for the target sound
    CORRECT_FOR_SOUND = {
        "th": ["θ"],
        "dh": ["ð"],
        "v":  ["v"],
        "w":  ["w"],
        "r":  ["ɹ", "r"],
        "l":  ["l"],
    }
    correct_tokens = CORRECT_FOR_SOUND.get(target_sound, [])

    # If correct token found in spoken IPA → no penalty
    for tok in spoken_ipa:
        if tok in correct_tokens:
            return 0

    # If wrong substitution token found → apply penalty
    for tok in spoken_ipa:
        if tok in wrong_tokens:
            return penalty

    return 0


def _make_result(sound_item: dict, score_val: float, detected: bool,
                 spoken_word: str, spoken_ipa: list) -> dict:
    return {
        "display_name": sound_item.get("display_name", ""),
        "sound":        sound_item.get("sound", ""),
        "word":         sound_item.get("word", ""),
        "pronounce":    sound_item.get("pronounce", ""),
        "skill":        sound_item.get("skill", "consonants"),
        "score":        score_val,
        "detected":     detected,
        "spoken_word":  spoken_word,
        "spoken":       spoken_ipa,
    }


def build_report(results: list) -> dict:
    return generate_report(results)