from typing import Dict, List, Optional
from sqlalchemy.orm import Session
from app.db.models import SoundScore
from app.config import settings
from app.engines.confusion_matrix import confusion_matrix_engine
import datetime

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
        """
        for sound, stats in target_sound_stats.items():
            correct = stats.get("correct", 0)
            incorrect = stats.get("incorrect", 0)

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
            profile[s.phoneme] = {
                "correct": s.correct_occurrences,
                "incorrect": s.incorrect_occurrences,
                "total": s.correct_occurrences + s.incorrect_occurrences,
                "mastery_percentage": s.mastery_percentage,
                "substitution_patterns": patterns
            }

        return profile

sound_mastery_engine = SoundMasteryEngine()
