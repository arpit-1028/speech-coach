import json

from app.services.recognizer import recognize_audio

from app.diagnostic.result import generate_report

from app.phonemes.ipa_map import IPA_TO_INTERNAL

SIMILAR = {
    "i": ["ii"],
    "ii": ["i"],

    "e": ["ei"],
    "ei": ["e"],

    "o": ["ou", "oo"],
    "ou": ["o", "oo"],
    "oo": ["o", "ou"],

    "r": ["er"],
    "er": ["r"],

    "n": ["ng"],
    "ng": ["n"]
}

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOUND_JSON_PATH = os.path.join(BASE_DIR, "diagnostic", "sound.json")

SOUND_TESTS = []
if os.path.exists(SOUND_JSON_PATH):
    with open(SOUND_JSON_PATH, "r", encoding="utf-8") as f:
        SOUND_TESTS = json.load(f)


def normalize_phonemes(phonemes):

    result = []

    for p in phonemes:

        p = p.strip()

        if p in IPA_TO_INTERNAL:
            result.append(
                IPA_TO_INTERNAL[p]
            )

    return result


def evaluate_sound(audio_path, sound_item):

    spoken_raw = recognize_audio(audio_path)

    spoken = normalize_phonemes(
        spoken_raw
    )

    expected = sound_item["sound"]

    if expected in IPA_TO_INTERNAL:
        expected = IPA_TO_INTERNAL[expected]
    
    detected = False

    for p in spoken:

        if p == expected:
            detected = True
            break

        if p in SIMILAR.get(expected, []):
            detected = True
            break
    

    score = 1.0 if detected else 0.0

    return {

        "display_name":
            sound_item["display_name"],

        "sound":
            sound_item["sound"],

        "word":
            sound_item["word"],

        "pronounce":
            sound_item["pronounce"],

        "skill":
            sound_item["skill"],

        "score":
            score,

        "detected":
            detected,

        "spoken":
            spoken
    }


def build_report(results):

    return generate_report(
        results
    )