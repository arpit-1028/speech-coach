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
def _transcribe_words(audio_path: str, hint_word: str = "") -> list:
    """
    Transcribe audio and return a list of cleaned lower-case words.
    Language is forced to English so Indian-accented speech is always treated as
    English rather than being guessed as Hindi or another language.

    Primary: Groq Cloud API (whisper-large-v3-turbo) — ultra-fast, free tier.
    Fallback: Local faster-whisper model if Groq is unavailable.
    """
    # ── Primary: Groq Cloud API (0.3s vs 4s local) ────────────────────────
    from app.services.groq_whisper import transcribe_groq
    text = transcribe_groq(audio_path, language="en")

    # ── Fallback: Local Whisper model ─────────────────────────────────────
    if text is None:
        print("RECOGNIZER: Falling back to local Whisper model")
        model = _get_whisper()
        segments, info = model.transcribe(
            audio_path,
            language="en",
            task="transcribe",
            beam_size=5,
            word_timestamps=False,
            condition_on_previous_text=False,
            no_speech_threshold=0.65,
            temperature=0.0,
        )
        text = " ".join(seg.text for seg in segments).strip()

    print("WHISPER TRANSCRIPT:", text)

    # Clean to lower-case alphabetic words only
    words = re.findall(r"[a-z']+", text.lower())
    print("WHISPER WORDS:", words)

    # ── Length guard ────────────────────────────────────────────────────────
    # For single-word pronunciation exercises, Whisper sometimes hallucinates
    # long sentences. We guard against this only when the EXPECTED target is
    # a single word (1 word). For multi-word phrases/sentences, we trust
    # Whisper and do NOT truncate.
    hint_clean = re.sub(r'[^a-z\s]', '', hint_word.lower().strip()) if hint_word else ""
    hint_word_count = len(hint_clean.split()) if hint_clean else 0

    if hint_word_count <= 1 and len(words) > 4:
        # Single-word target but Whisper returned many words → hallucination
        print(f"WHISPER LENGTH GUARD: {len(words)} words → filtering to best match for '{hint_word}'")
        hint_chars = set(hint_word.lower())
        filtered = [w for w in words if set(w) & hint_chars]
        words = filtered[:3] if filtered else words[:2]
        print("WHISPER FILTERED WORDS:", words)
    elif hint_word_count > 1 and len(words) > hint_word_count * 3:
        # Multi-word target but Whisper returned way too many words → hallucination
        print(f"WHISPER MULTI-WORD LENGTH GUARD: {len(words)} words (expected ~{hint_word_count}) → trimming")
        words = words[:hint_word_count + 3]
        print("WHISPER TRIMMED WORDS:", words)

    return words


# ── Main public function ───────────────────────────────────────────────────────
def recognize_audio(filename: str, expected_word: str = "") -> list:
    """
    Convert speech in `filename` to a list of IPA phoneme tokens.

    Pipeline:
      Whisper transcript → word list → CMU dict → IPA tokens

    For single-word targets: picks the best matching word from Whisper output.
    For multi-word phrases: converts ALL transcribed words to IPA phonemes.

    Args:
        filename:      Path to the audio file (WAV, 16 kHz recommended).
        expected_word: The word/phrase the user was supposed to say.

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
    from app.services.cmu_service import get_phonemes_variants, cmu_to_ipa

    # Determine if expected target is single-word or multi-word
    exp_lower = expected_word.lower().strip()
    exp_clean = re.sub(r'[^a-z\s]', '', exp_lower)
    exp_word_count = len(exp_clean.split()) if exp_clean else 0

    if exp_word_count <= 1:
        # ── SINGLE-WORD mode (original behavior, unchanged) ──────────────
        best_word = _pick_best_word(words, exp_lower)
        print("BEST WHISPER WORD:", best_word)

        variants = get_phonemes_variants(best_word)
        if not variants or not variants[0]:
            variants = get_phonemes_variants(" ".join(words))

        if not variants or not variants[0]:
            print("RECOGNIZER: CMU lookup failed, returning []")
            return []

        ipa_tokens = cmu_to_ipa(variants[0])
        print("SPOKEN IPA (from CMU):", ipa_tokens)
        return ipa_tokens
    else:
        # ── MULTI-WORD mode (new: convert ALL words to IPA) ──────────────
        print(f"RECOGNIZER: Multi-word mode ({len(words)} spoken words for {exp_word_count}-word target)")
        all_ipa = []
        for w in words:
            variants = get_phonemes_variants(w)
            if variants and variants[0]:
                word_ipa = cmu_to_ipa(variants[0])
                all_ipa.extend(word_ipa)
            else:
                print(f"RECOGNIZER: CMU lookup failed for word '{w}', skipping")

        print("SPOKEN IPA (multi-word from CMU):", all_ipa)
        return all_ipa


# ── Helpers ────────────────────────────────────────────────────────────────────
def _pick_best_word(words: list, expected: str) -> str:
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