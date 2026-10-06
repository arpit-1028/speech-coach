from typing import Dict, List, Any, Optional
from sqlalchemy.orm import Session
from app.db.models import SoundScore, WordAttempt, ConfusionMatrix
from app.config import settings
from app.data.word_sets import WORD_TARGET_MAP
from app.engines.confusion_matrix import confusion_matrix_engine
from app.engines.sound_mastery import wilson_interval, average_gop_score

class DiagnosticReportGenerator:
    """
    Generates evidence-backed pronunciation diagnostic reports.
    Accumulates evidence across words; never concludes weakness from a single attempt.
    """

    def generate_report(self, db: Session, user_id: int, session_id: Optional[int] = None) -> Dict[str, Any]:
        scores = db.query(SoundScore).filter(SoundScore.user_id == user_id).all()
        score_map = {s.phoneme: s for s in scores}

        strong_sounds: List[str] = []
        weak_sounds: List[str] = []
        developing_sounds: List[str] = []
        weak_analyses: List[Dict[str, Any]] = []

        # Analyze each target sound
        for sound in settings.TARGET_SOUNDS:
            sc = score_map.get(sound)
            if not sc:
                continue

            total = sc.correct_occurrences + sc.incorrect_occurrences
            if total == 0:
                continue

            # Decide with the 95% Wilson interval, not the raw percentage, so a handful
            # of lucky/unlucky attempts (or recognizer slips) cannot settle the verdict.
            ci_low, ci_high = wilson_interval(sc.correct_occurrences, total)
            if sc.mastery_percentage >= settings.STRONG_THRESHOLD and ci_low >= settings.WEAK_THRESHOLD:
                strong_sounds.append(sound)
            elif (sc.mastery_percentage < settings.WEAK_THRESHOLD
                  and ci_high < settings.STRONG_THRESHOLD
                  and total >= settings.MIN_OCCURRENCES_FOR_DIAGNOSIS):
                weak_sounds.append(sound)
                weak_analyses.append(self._build_sound_analysis(db, user_id, sound, sc))
            else:
                developing_sounds.append(sound)

        # Sort weak analyses by mastery percentage ascending (weakest first)
        weak_analyses.sort(key=lambda x: x["mastery_percentage"])

        # Recommended learning path (Weak sounds -> Foundation stage)
        recommended_learning_path = [
            f"{analysis['sound']} Foundation" for analysis in weak_analyses
        ]

        # Answer-by-answer breakdown for the specific test run (or all history
        # when no session is given), so a teacher/learner can see exactly which
        # word was said how, not just the aggregated per-sound mastery.
        attempts = self._build_attempt_history(db, user_id, session_id)
        test_summary = self._build_test_summary(attempts)

        text_report = self._format_ascii_report(
            strong_sounds=strong_sounds,
            weak_sounds=[a["sound"] for a in weak_analyses],
            weak_analyses=weak_analyses,
            recommended_learning_path=recommended_learning_path,
            attempts=attempts,
            test_summary=test_summary,
        )

        return {
            "user_id": user_id,
            "strong_sounds": strong_sounds,
            "weak_sounds": [a["sound"] for a in weak_analyses],
            "developing_sounds": developing_sounds,
            "sound_analyses": weak_analyses,
            "recommended_learning_path": recommended_learning_path,
            "test_summary": test_summary,
            "attempts": attempts,
            "formatted_text_report": text_report
        }

    def _build_attempt_history(
        self, db: Session, user_id: int, session_id: Optional[int]
    ) -> List[Dict[str, Any]]:
        query = db.query(WordAttempt).filter(WordAttempt.user_id == user_id)
        if session_id is not None:
            query = query.filter(WordAttempt.session_id == session_id)
        rows = query.order_by(WordAttempt.timestamp.asc()).all()

        attempts = []
        for att in rows:
            phoneme_scores = att.phoneme_scores or []
            is_correct = not att.phoneme_errors and all(
                ps.get("status") == "correct" for ps in phoneme_scores
            )
            unclear = [ps["phoneme"] for ps in phoneme_scores if ps.get("status") == "unclear"]
            attempts.append({
                "attempt_id": att.id,
                "word": att.word,
                "target_sound": WORD_TARGET_MAP.get(att.word),
                "expected_phonemes": att.expected_phonemes,
                "detected_phonemes": att.detected_phonemes,
                "word_score": att.word_score,
                "is_correct": is_correct,
                "errors": att.phoneme_errors or [],
                "unclear_phonemes": unclear,
                "phoneme_scores": phoneme_scores,
                "timestamp": att.timestamp.isoformat() if att.timestamp else None,
            })
        return attempts

    def _build_test_summary(self, attempts: List[Dict[str, Any]]) -> Dict[str, Any]:
        total = len(attempts)
        correct = sum(1 for a in attempts if a["is_correct"])
        scored = [a["word_score"] for a in attempts if a["word_score"] is not None]
        return {
            "total_words_tested": total,
            "correct_words": correct,
            "accuracy_percentage": round(100.0 * correct / total, 1) if total else 0.0,
            "average_word_score": round(sum(scored) / len(scored), 1) if scored else None,
        }

    def _build_sound_analysis(
        self, db: Session, user_id: int, sound: str, sc: SoundScore
    ) -> Dict[str, Any]:
        total = sc.correct_occurrences + sc.incorrect_occurrences

        # Confidence from the width of the Wilson interval (narrow = more certain)
        ci_low, ci_high = wilson_interval(sc.correct_occurrences, total)
        width = ci_high - ci_low
        # Roughly: High needs ~25 samples, Medium ~12 (at mid-range accuracy)
        if width <= 36:
            confidence = "High"
        elif width <= 50:
            confidence = "Medium"
        else:
            confidence = "Low"

        # Most frequent substitution
        top_subs = confusion_matrix_engine.get_top_substitutions_for_sound(db, user_id, sound, limit=1)
        common_error_str = "None detected"
        top_sub_phoneme = None

        if top_subs:
            top_sub_phoneme, count = top_subs[0]
            common_error_str = f"{sound} -> {top_sub_phoneme}"

        # Collect word examples with this substitution
        examples = self._find_word_examples(db, user_id, sound, top_sub_phoneme)

        # Build clinical/linguistic assessment
        assessment = self._build_assessment_text(sound, top_sub_phoneme)

        return {
            "sound": sound,
            "occurrences_tested": total,
            "correct": sc.correct_occurrences,
            "incorrect": sc.incorrect_occurrences,
            "mastery_percentage": sc.mastery_percentage,
            "common_error": common_error_str,
            "examples": examples,
            "assessment": assessment,
            "confidence": confidence,
            "ci_low": ci_low,
            "ci_high": ci_high,
            "avg_gop_score": average_gop_score(sc),
        }

    def _build_assessment_text(self, sound: str, top_sub: Optional[str]) -> str:
        if not top_sub:
            return f"User exhibits inconsistent articulation of {sound}."

        if sound == "TH" and top_sub == "T":
            return "User frequently substitutes TH with T (dentalization, common in Indian English)."
        elif sound == "TH" and top_sub == "D":
            return "User frequently substitutes TH with D."
        elif sound == "DH" and top_sub == "D":
            return "User frequently substitutes voiced TH (DH) with D (dentalization, common in Indian English)."
        elif sound == "DH" and top_sub == "T":
            return "User frequently devoices DH into T."
        elif sound == "ZH" and top_sub in ("Z", "JH"):
            return f"User substitutes ZH with {top_sub} ({'voicing shift' if top_sub == 'Z' else 'affrication'}, common in Indian English)."
        elif (sound == "V" and top_sub == "W") or (sound == "W" and top_sub == "V"):
            return "User merges V and W into a single sound (common V/W merger in Indian English)."
        elif sound == "SH" and top_sub == "S":
            return "User frequently substitutes postalveolar SH with alveolar S."
        elif (sound == "R" and top_sub == "L") or (sound == "L" and top_sub == "R"):
            return "User confuses liquid consonants R and L."
        elif sound == "CH" and top_sub in ("SH", "T"):
            return f"User de-affricates CH into {top_sub}."
        else:
            return f"User frequently substitutes {sound} with {top_sub}."

    def _find_word_examples(
        self, db: Session, user_id: int, sound: str, top_sub: Optional[str], limit: int = 3
    ) -> List[str]:
        if not top_sub:
            return []

        attempts = db.query(WordAttempt).filter(
            WordAttempt.user_id == user_id
        ).all()

        examples = []
        for att in attempts:
            if not att.phoneme_errors:
                continue
            has_sub = any(
                e.get("expected") == sound and e.get("actual") == top_sub
                for e in att.phoneme_errors
            )
            if has_sub:
                word_clean = att.word.lower()
                # Approximate spelling replacement for intuitive readability
                # e.g. think -> tink, three -> tree, thirty -> tirty, vine -> wine
                spoken_sim = self._render_spoken_word(word_clean, sound, top_sub)
                examples.append(f"{word_clean} -> {spoken_sim}")
                if len(examples) >= limit:
                    break

        return examples

    def _render_spoken_word(self, word: str, sound: str, top_sub: str) -> str:
        w = word.lower()
        if sound in ("TH", "DH"):
            sub_char = top_sub.lower()
            return w.replace("th", sub_char, 1)
        elif sound == "ZH":
            # ZH words are spelled inconsistently (measure, vision, garage); no
            # reliable single-letter swap, so just annotate instead of rewriting.
            return f"{w} [{top_sub}]"
        elif sound == "SH":
            return w.replace("sh", top_sub.lower(), 1)
        elif sound == "V":
            return w.replace("v", top_sub.lower(), 1)
        elif sound == "W":
            return w.replace("w", top_sub.lower(), 1)
        elif sound == "R":
            return w.replace("r", top_sub.lower(), 1)
        elif sound == "L":
            return w.replace("l", top_sub.lower(), 1)
        elif sound == "CH":
            return w.replace("ch", top_sub.lower(), 1)
        return f"{w} [{top_sub}]"

    def _format_ascii_report(
        self,
        strong_sounds: List[str],
        weak_sounds: List[str],
        weak_analyses: List[Dict[str, Any]],
        recommended_learning_path: List[str],
        attempts: Optional[List[Dict[str, Any]]] = None,
        test_summary: Optional[Dict[str, Any]] = None,
    ) -> str:
        lines = [
            "=================================================",
            "PRONUNCIATION DIAGNOSTIC REPORT",
            "=================================================\n",
        ]

        if test_summary and test_summary.get("total_words_tested"):
            lines.append("TEST SUMMARY")
            lines.append(f"Words tested: {test_summary['total_words_tested']}")
            lines.append(
                f"Correct: {test_summary['correct_words']} "
                f"({test_summary['accuracy_percentage']}%)"
            )
            if test_summary.get("average_word_score") is not None:
                lines.append(f"Average pronunciation score: {test_summary['average_word_score']} / 100")
            lines.append("")

        if attempts:
            lines.append("ANSWER-BY-ANSWER RESULTS")
            lines.append("-------------------------------------------------")
            for a in attempts:
                mark = "CORRECT" if a["is_correct"] else "NEEDS PRACTICE"
                score_str = f"{a['word_score']:.0f}/100" if a["word_score"] is not None else "n/a"
                sound_str = f" [{a['target_sound']}]" if a.get("target_sound") else ""
                lines.append(f"{a['word'].upper()}{sound_str} — {mark} ({score_str})")
                if a["errors"]:
                    detail = ", ".join(f"{e['expected']}->{e['actual']}" for e in a["errors"])
                    lines.append(f"    heard: {detail}")
                if a["unclear_phonemes"]:
                    lines.append(f"    unclear: {' '.join(a['unclear_phonemes'])}")
            lines.append("")

        lines.append("Strong Sounds:")
        if strong_sounds:
            for s in strong_sounds:
                lines.append(s)
        else:
            lines.append("None identified yet.")

        lines.append("\nWeak Sounds:")
        if weak_sounds:
            for s in weak_sounds:
                lines.append(s)
        else:
            lines.append("None identified.")

        for a in weak_analyses:
            lines.append("\n---")
            lines.append(f"{a['sound']} ANALYSIS\n")
            lines.append("Occurrences Tested:")
            lines.append(str(a["occurrences_tested"]))
            lines.append("\nLikely Accuracy Range (95%):")
            lines.append(f"{a['ci_low']}% - {a['ci_high']}%")
            if a.get("avg_gop_score") is not None:
                lines.append("\nAverage Pronunciation Score:")
                lines.append(f"{a['avg_gop_score']} / 100")
            lines.append("\nCorrect:")
            lines.append(str(a["correct"]))
            lines.append("\nIncorrect:")
            lines.append(str(a["incorrect"]))
            lines.append("\nCommon Error:")
            lines.append(a["common_error"])
            lines.append("\nExamples:")
            if a["examples"]:
                for ex in a["examples"]:
                    lines.append(ex)
            else:
                lines.append("N/A")
            lines.append("\nAssessment:")
            lines.append(a["assessment"])
            lines.append("\nConfidence:")
            lines.append(a["confidence"])

        lines.append("\n=================================================")
        lines.append("Recommended Learning Path:")
        if recommended_learning_path:
            for i, step in enumerate(recommended_learning_path, 1):
                lines.append(f"{i}. {step}")
        else:
            lines.append("General Maintenance & Conversational Practice")

        return "\n".join(lines)

diagnostic_report_generator = DiagnosticReportGenerator()
