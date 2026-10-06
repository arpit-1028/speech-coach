from dataclasses import replace
from pathlib import Path
from typing import Dict, List, Optional, Union

from app.alignment.aligner import AlignmentAnalysis, PhonemeAlignment, phoneme_aligner
from app.alignment.cmudict_service import cmu_service
from app.config import settings
from app.data.word_sets import WORD_TARGET_MAP
from app.speech.factory import get_phoneme_recognizer
from app.speech.gop_engine import GOPResult, GOPScorer
from app.speech.quality import AudioQualityReport, assess_audio


class AudioQualityError(Exception):
    """Raised when a recording fails the quality gate and must be re-recorded."""

    def __init__(self, report: AudioQualityReport):
        super().__init__(report.reason)
        self.report = report


def _analysis_from_gop(word: str, result: GOPResult, quality: Dict) -> AlignmentAnalysis:
    alignments: List[PhonemeAlignment] = []
    errors: List[Dict[str, str]] = []
    detected: List[str] = []
    stats: Dict[str, Dict[str, float]] = {
        s: {"correct": 0, "incorrect": 0, "score_sum": 0.0, "scored": 0} for s in settings.TARGET_SOUNDS
    }

    for ps in result.phoneme_scores:
        correct = ps.status == "correct"
        if ps.status == "deleted":
            actual = None
            errors.append({"expected": ps.phoneme, "actual": "<DELETED>"})
        elif correct:
            actual = ps.phoneme
        else:
            # "unclear" without a clear competitor counts against mastery but is not
            # recorded as a substitution: there is no evidence of what replaced it.
            actual = ps.heard or "?"
            if ps.heard:
                errors.append({"expected": ps.phoneme, "actual": ps.heard})
        if actual and actual != "?":
            detected.append(actual)

        is_target = ps.phoneme in settings.TARGET_SOUNDS
        alignments.append(PhonemeAlignment(
            expected=ps.phoneme, actual=actual, is_match=correct, is_target_sound=is_target
        ))
        if is_target:
            st = stats[ps.phoneme]
            st["correct" if correct else "incorrect"] += 1
            st["score_sum"] += ps.score
            st["scored"] += 1

    return AlignmentAnalysis(
        word=word,
        expected_phonemes=result.expected_phonemes,
        detected_phonemes=detected,
        alignments=alignments,
        errors=errors,
        target_sound_stats=stats,
        phoneme_scores=[ps.to_dict() for ps in result.phoneme_scores],
        word_score=round(result.word_score, 1),
        quality=quality,
        engine="gop",
    )


def analyze_attempt(word: str, audio_path: Optional[Union[str, Path]] = None,
                    detected_phonemes: Optional[List[str]] = None) -> AlignmentAnalysis:
    """
    Full scoring pipeline for one spoken word:
      quality gate (VAD, loudness, clipping, SNR) -> GOP forced-alignment scoring.
    Engines without GOP support fall back to free recognition + Needleman-Wunsch.
    Raises AudioQualityError when the recording should be repeated.
    """
    clean_word = word.strip().lower()

    if audio_path is None:
        if detected_phonemes is None:
            raise ValueError("Either audio or detected phonemes must be provided.")
        return phoneme_aligner.align(clean_word, cmu_service.get_phonemes(clean_word), detected_phonemes)

    recognizer = get_phoneme_recognizer()
    report = assess_audio(audio_path) if recognizer.uses_quality_gate else None
    if report is not None and not report.ok:
        raise AudioQualityError(report)

    if isinstance(recognizer, GOPScorer):
        pronunciations = cmu_service.get_pronunciations(clean_word)

        # A word physically takes some minimum time to say per phoneme it has; well
        # under that means it was said too fast/clipped to really contain the whole
        # word. Forced alignment doesn't know that - it will cram "ship" into 130ms
        # of audio and confidently report specific (meaningless) wrong phonemes
        # rather than admitting the recording couldn't have captured the word.
        min_phones = min(len(p) for p in pronunciations)
        min_expected_sec = max(settings.MIN_SPEECH_SEC, settings.MIN_SEC_PER_PHONEME * min_phones)
        if report.speech_sec < min_expected_sec:
            raise AudioQualityError(replace(
                report, ok=False,
                reason=f"That was too quick for '{clean_word}'. Please say the whole word clearly, a bit slower.",
            ))

        # Non-rhotic acceptance (dropping R) is accent fairness for *other* sound
        # tests, not for an R test itself - there it must be scored as missing.
        allow_non_rhotic = WORD_TARGET_MAP.get(clean_word) != "R"
        result = recognizer.score_audio(report.audio, pronunciations, allow_non_rhotic=allow_non_rhotic)
        return _analysis_from_gop(clean_word, result, report.to_dict())

    analysis = phoneme_aligner.align(
        clean_word, cmu_service.get_phonemes(clean_word), recognizer.extract_phonemes(audio_path)
    )
    analysis.quality = report.to_dict() if report else None
    return analysis
