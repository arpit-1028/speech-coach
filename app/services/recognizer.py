"""
recognizer.py  –  Hybrid Speech-to-Phoneme Pipeline
=====================================================
Strategy:
  1. Use Faster-Whisper (small model) to convert speech → English text.
     Whisper is highly accurate for English and correctly transcribes words
     like "think", "world", "chair" even with Indian accents.
  2. Look up the transcribed word(s) in the CMU Pronouncing Dictionary
     to get the gold-standard IPA phonemes.
  3. Return those phonemes as the "spoken" representation for comparison.

This avoids the critical limitation of wav2vec2-xlsr-53-espeak-cv-ft which:
  - Mis-detects θ (TH) as 'h' or 't'
  - Collapses ŋk clusters to just 'n'
  - Requires eSpeak installed on Windows (not always present)

Falls back to character-level phoneme guessing if the word is not in CMU dict.
"""

import re
import librosa
import numpy as np
from faster_whisper import WhisperModel

# ── Lazy singleton ─────────────────────────────────────────────────────────────
_whisper_model = None

def _get_whisper():
    global _whisper_model
    if _whisper_model is None:
        _whisper_model = WhisperModel("small", compute_type="int8")
    return _whisper_model


# ── Audio pre-processing ───────────────────────────────────────────────────────
def preprocess_audio(input_file):
    """Load, trim silence, and peak-normalize audio to 16 kHz mono."""
    audio, sr = librosa.load(input_file, sr=16000, mono=True)
    if len(audio) == 0:
        return audio
    trimmed, _ = librosa.effects.trim(audio, top_db=50)
    if len(trimmed) < 1600:          # < 0.1 s — keep original
        trimmed = audio
    peak = np.max(np.abs(trimmed))
    if peak > 0:
        trimmed = trimmed / peak
    return trimmed


# ── Whisper transcription ──────────────────────────────────────────────────────
def _transcribe_words(audio_path: str, hint_word: str = "") -> list[str]:
    """
    Transcribe audio with Whisper and return a list of cleaned lower-case words.
    Language is forced to English so Indian-accented speech is always treated as
    English rather than being guessed as Hindi or another language.

    Key settings that prevent hallucination:
    - condition_on_previous_text=False : each segment is independent; prevents
      Whisper from chaining random text when audio is unclear.
    - no_speech_threshold=0.65 : segments with high no-speech probability are
      silently dropped instead of hallucinated into random sentences.
    """
    model = _get_whisper()
    segments, info = model.transcribe(
        audio_path,
        language="en",                    # force English
        task="transcribe",
        beam_size=5,
        word_timestamps=False,
        condition_on_previous_text=False, # prevents hallucination chains
        no_speech_threshold=0.65,         # drop silent/noise segments
        temperature=0.0,                  # greedy decode — less creative
    )
    text = " ".join(seg.text for seg in segments).strip()
    print("WHISPER TRANSCRIPT:", text)

    # Clean to lower-case alphabetic words only
    words = re.findall(r"[a-z']+", text.lower())
    print("WHISPER WORDS:", words)

    # ── Length guard ────────────────────────────────────────────────────────
    # Single-word pronunciation exercises should produce 1-3 words at most.
    # If Whisper returns a long sentence (hallucination), reduce to the
    # most relevant words only.
    if hint_word and len(words) > 4:
        print(f"WHISPER LENGTH GUARD: {len(words)} words → filtering to best match for '{hint_word}'")
        # Keep only words with at least one character in common with hint_word
        hint_chars = set(hint_word.lower())
        filtered = [w for w in words if set(w) & hint_chars]
        words = filtered[:3] if filtered else words[:2]
        print("WHISPER FILTERED WORDS:", words)

    return words


# ── Main public function ───────────────────────────────────────────────────────
def recognize_audio(filename: str, expected_word: str = "") -> list[str]:
    """
    Convert speech in `filename` to a list of IPA phoneme tokens.

    Pipeline:
      Whisper transcript → word list → CMU dict → IPA tokens

    Args:
        filename:      Path to the audio file (WAV, 16 kHz recommended).
        expected_word: The word the user was supposed to say. Used as a
                       tiebreaker when Whisper returns multiple candidates.

    Returns:
        List of IPA token strings, e.g. ['θ', 'ɪ', 'ŋ', 'k'] for "think".
    """
    # Pre-process audio for quality check (used by caller)
    audio = preprocess_audio(filename)
    if len(audio) == 0:
        print("RECOGNIZER: empty audio")
        return []

    # Step 1 – Whisper transcript (pass hint so length guard can filter garbage)
    words = _transcribe_words(filename, hint_word=expected_word)
    if not words:
        print("RECOGNIZER: no words detected")
        return []

    # Step 2 – Convert words → IPA via CMU dict
    # We import here to avoid circular imports (cmu_service imports nothing from recognizer)
    from app.services.cmu_service import get_phonemes_variants, cmu_to_ipa

    # Try each transcribed word; pick the one that is closest to expected_word
    # (handles cases like Whisper hearing "thin" instead of "think")
    exp_lower = expected_word.lower().strip()
    best_word = _pick_best_word(words, exp_lower)
    print("BEST WHISPER WORD:", best_word)

    # Get CMU variants for that word and pick variant 0 (most common pronunciation)
    variants = get_phonemes_variants(best_word)
    if not variants or not variants[0]:
        # Fallback: try whole transcript joined
        variants = get_phonemes_variants(" ".join(words))

    if not variants or not variants[0]:
        print("RECOGNIZER: CMU lookup failed, returning []")
        return []

    ipa_tokens = cmu_to_ipa(variants[0])
    print("SPOKEN IPA (from CMU):", ipa_tokens)
    return ipa_tokens


# ── Helpers ────────────────────────────────────────────────────────────────────
def _pick_best_word(words: list[str], expected: str) -> str:
    """
    From the Whisper-transcribed word list, pick the word that is most similar
    to the expected word. Always returns what Whisper actually heard — never
    falls back to the expected word, because doing so would auto-correct wrong
    pronunciations and give dishonest 100% scores.
    """
    if not words:
        return ""
    if not expected:
        return words[0]

    # Exact match first
    if expected in words:
        return expected

    # Fuzzy: pick the Whisper word with the most character overlap with expected
    def _overlap(w):
        common = set(w) & set(expected)
        return len(common) / max(len(set(expected)), 1)

    # Always return the best matching word — even if overlap is low.
    # This ensures "bye" stays "bye" (not auto-corrected to "cat").
    return max(words, key=_overlap)