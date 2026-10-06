from typing import Dict, List, Optional
from sqlalchemy.orm import Session
from app.db.models import SoundScore
from app.config import settings
from app.engines.confusion_matrix import confusion_matrix_engine
import datetime
import math
from typing import Tuple


def wilson_interval(correct: int, total: int, z: float = None) -> Tuple[float, float]:
    """
    Wilson score interval for the true accuracy, as percentages.
    Unlike a raw percentage it stays wide when there are few samples
    (1/1 -> 21-100%, 10/10 -> 72-100%), so small samples cannot look certain.
    """
    if total <= 0:
        return 0.0, 100.0
    z = settings.WILSON_Z if z is None else z
    p = correct / total
    denom = 1 + z * z / total
    centre = (p + z * z / (2 * total)) / denom
    margin = z * math.sqrt(p * (1 - p) / total + z * z / (4 * total * total)) / denom
    return round(max(0.0, centre - margin) * 100, 1), round(min(1.0, centre + margin) * 100, 1)


class SoundMasteryEngine:
    """
    Computes evidence-based sound mastery derived strictly from actual occurrences.
    Never generates arbitrary scores or invented percentages.
    """

    def update_scores_from_attempt(
        self, db: Session, user_id: int, target_sound_stats: Dict[str, Dict[str, int]]
    ):
        """
        Updates cumulative correct and incorrect occurrences for tested sounds.
        :param target_sound_stats: e.g. {"TH": {"correct": 0, "incorrect": 1}}
            GOP attempts also carry "score_sum" and "scored" (number of scored occurrences).
        """
        for sound, stats in target_sound_stats.items():
            correct = int(stats.get("correct", 0))
            incorrect = int(stats.get("incorrect", 0))
            score_sum = float(stats.get("score_sum", 0.0))
            scored = int(stats.get("scored", 0))

            if correct == 0 and incorrect == 0:
                continue

            record = db.query(SoundScore).filter(
                SoundScore.user_id == user_id,
                SoundScore.phoneme == sound
            ).first()

            if record:
                record.correct_occurrences += correct
                record.incorrect_occurrences += incorrect
                total = record.correct_occurrences + record.incorrect_occurrences
                record.mastery_percentage = round((record.correct_occurrences / total) * 100, 1) if total > 0 else 0.0
                record.gop_score_sum = (record.gop_score_sum or 0.0) + score_sum
                record.gop_scored_occurrences = (record.gop_scored_occurrences or 0) + scored
                record.last_updated = datetime.datetime.utcnow()
            else:
                total = correct + incorrect
                mastery = round((correct / total) * 100, 1) if total > 0 else 0.0
                record = SoundScore(
                    user_id=user_id,
                    phoneme=sound,
                    correct_occurrences=correct,
                    incorrect_occurrences=incorrect,
                    mastery_percentage=mastery,
                    gop_score_sum=score_sum,
                    gop_scored_occurrences=scored,
                    last_updated=datetime.datetime.utcnow()
                )
                db.add(record)

        db.flush()

    def get_sound_profile(self, db: Session, user_id: int) -> Dict[str, Dict]:
        """
        Fetches all sound scores along with top substitution patterns.
        """
        scores = db.query(SoundScore).filter(SoundScore.user_id == user_id).all()
        profile = {}

        for s in scores:
            top_subs = confusion_matrix_engine.get_top_substitutions_for_sound(db, user_id, s.phoneme)
            patterns = [f"{s.phoneme}->{tgt} ({cnt})" for tgt, cnt in top_subs]
            total = s.correct_occurrences + s.incorrect_occurrences
            ci_low, ci_high = wilson_interval(s.correct_occurrences, total)
            profile[s.phoneme] = {
                "correct": s.correct_occurrences,
                "incorrect": s.incorrect_occurrences,
                "total": s.correct_occurrences + s.incorrect_occurrences,
                "mastery_percentage": s.mastery_percentage,
                "substitution_patterns": patterns,
                "avg_gop_score": average_gop_score(s),
                "ci_low": ci_low,
                "ci_high": ci_high,
            }

        return profile

def average_gop_score(record: SoundScore) -> Optional[float]:
    """Mean 0-100 GOP score for a sound, or None when only legacy (non-GOP) attempts exist."""
    if not record.gop_scored_occurrences:
        return None
    return round(record.gop_score_sum / record.gop_scored_occurrences, 1)


sound_mastery_engine = SoundMasteryEngine()
