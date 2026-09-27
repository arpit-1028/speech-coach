from typing import Dict, List, Any, Optional
from sqlalchemy.orm import Session
from app.db.models import SoundScore, WordAttempt, ConfusionMatrix
from app.config import settings
from app.engines.confusion_matrix import confusion_matrix_engine

class DiagnosticReportGenerator:
    """
    Generates evidence-backed pronunciation diagnostic reports.
    Accumulates evidence across words; never concludes weakness from a single attempt.
    """

    def generate_report(self, db: Session, user_id: int) -> Dict[str, Any]:
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

            if sc.mastery_percentage >= settings.STRONG_THRESHOLD:
                strong_sounds.append(sound)
            elif sc.mastery_percentage < settings.WEAK_THRESHOLD:
                # Only conclude weakness if accumulated evidence meets minimum threshold
                if total >= settings.MIN_OCCURRENCES_FOR_DIAGNOSIS:
                    weak_sounds.append(sound)
                    analysis = self._build_sound_analysis(db, user_id, sound, sc)
                    weak_analyses.append(analysis)
                else:
                    developing_sounds.append(sound)
            else:
                developing_sounds.append(sound)

        # Sort weak analyses by mastery percentage ascending (weakest first)
        weak_analyses.sort(key=lambda x: x["mastery_percentage"])

        # Recommended learning path (Weak sounds -> Foundation stage)
        recommended_learning_path = [
            f"{analysis['sound']} Foundation" for analysis in weak_analyses
        ]

        text_report = self._format_ascii_report(
            strong_sounds=strong_sounds,
            weak_sounds=[a["sound"] for a in weak_analyses],
            weak_analyses=weak_analyses,
            recommended_learning_path=recommended_learning_path
        )

        return {
            "user_id": user_id,
            "strong_sounds": strong_sounds,
            "weak_sounds": [a["sound"] for a in weak_analyses],
            "developing_sounds": developing_sounds,
            "sound_analyses": weak_analyses,
            "recommended_learning_path": recommended_learning_path,
            "formatted_text_report": text_report
        }

    def _build_sound_analysis(
        self, db: Session, user_id: int, sound: str, sc: SoundScore
    ) -> Dict[str, Any]:
        total = sc.correct_occurrences + sc.incorrect_occurrences

        # Confidence based on accumulated sample size
        if total >= settings.HIGH_CONFIDENCE_OCCURRENCES:
            confidence = "High"
        elif total >= settings.MEDIUM_CONFIDENCE_OCCURRENCES:
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
            "confidence": confidence
        }

    def _build_assessment_text(self, sound: str, top_sub: Optional[str]) -> str:
        if not top_sub:
            return f"User exhibits inconsistent articulation of {sound}."

        if sound == "TH" and top_sub == "T":
            return "User frequently substitutes TH with T."
        elif sound == "TH" and top_sub == "D":
            return "User frequently substitutes TH with D."
        elif (sound == "V" and top_sub == "W") or (sound == "W" and top_sub == "V"):
            return "User struggles to distinguish V and W."
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
        if sound == "TH":
            sub_char = top_sub.lower()
            return w.replace("th", sub_char, 1)
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
        recommended_learning_path: List[str]
    ) -> str:
        lines = [
            "=================================================",
            "PRONUNCIATION DIAGNOSTIC REPORT",
            "=================================================\n",
            "Strong Sounds:"
        ]
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
