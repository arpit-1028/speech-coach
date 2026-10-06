from typing import Dict, List, Any
from sqlalchemy.orm import Session
from app.db.models import UnlockedPath, SoundScore
from app.config import settings
from app.data.word_sets import get_words_for_sound, INDIAN_ENGLISH_ACCENT_NOTES
import datetime

STAGES_ORDER = [
    "Foundation",
    "Words",
    "Minimal Pairs",
    "Sentences",
    "Tongue Twisters",
    "Conversation"
]

class DynamicLearningPathEngine:
    """
    Manages sound-based dynamic learning paths.
    Unlocks targeted sound stages according to phoneme mastery evidence.
    """

    STAGES = STAGES_ORDER

    def initialize_paths_for_user(self, db: Session, user_id: int):
        """Initializes entries for all sounds and stages if not already present."""
        existing = db.query(UnlockedPath).filter(UnlockedPath.user_id == user_id).all()
        existing_set = {(p.sound, p.stage) for p in existing}

        for sound in settings.TARGET_SOUNDS:
            for stage in self.STAGES:
                if (sound, stage) not in existing_set:
                    path = UnlockedPath(
                        user_id=user_id,
                        sound=sound,
                        stage=stage,
                        is_unlocked=False
                    )
                    db.add(path)
        db.flush()

    def evaluate_unlocks(self, db: Session, user_id: int):
        """
        Evaluates and unlocks sound stages based on sound mastery:
        - If mastery < 60% (weak): automatically unlock '<Sound> Foundation'.
        - If mastery >= 80% (strong/proficient): unlock '<Sound> Foundation' and '<Sound> Words'.
        """
        self.initialize_paths_for_user(db, user_id)
        scores = db.query(SoundScore).filter(SoundScore.user_id == user_id).all()

        for s in scores:
            total_tested = s.correct_occurrences + s.incorrect_occurrences
            if total_tested == 0:
                continue

            # Unlock Foundation if weak sound diagnosed
            if s.mastery_percentage < settings.WEAK_THRESHOLD:
                self._unlock(db, user_id, s.phoneme, "Foundation")

            # Unlock Words if mastery is strong (or Foundation mastered > 80)
            if s.mastery_percentage >= settings.STRONG_THRESHOLD:
                self._unlock(db, user_id, s.phoneme, "Foundation")
                self._unlock(db, user_id, s.phoneme, "Words")

        db.flush()

    def _unlock(self, db: Session, user_id: int, sound: str, stage: str):
        record = db.query(UnlockedPath).filter(
            UnlockedPath.user_id == user_id,
            UnlockedPath.sound == sound,
            UnlockedPath.stage == stage
        ).first()

        if record and not record.is_unlocked:
            record.is_unlocked = True
            record.unlocked_at = datetime.datetime.utcnow()

    def advance_stage(self, db: Session, user_id: int, sound: str, stage_score: float):
        """
        Advances to the next stage if the current stage achieves score > 80%.
        Example: TH Foundation > 80 -> Unlock TH Words.
        """
        paths = db.query(UnlockedPath).filter(
            UnlockedPath.user_id == user_id,
            UnlockedPath.sound == sound
        ).all()

        path_map = {p.stage: p for p in paths}

        for i, stage_name in enumerate(self.STAGES[:-1]):
            current = path_map.get(stage_name)
            next_stage_name = self.STAGES[i + 1]
            next_stage = path_map.get(next_stage_name)

            if current and current.is_unlocked and (not next_stage or not next_stage.is_unlocked):
                if stage_score >= settings.STRONG_THRESHOLD:
                    self._unlock(db, user_id, sound, next_stage_name)
                break

        db.flush()

    def get_user_learning_path(self, db: Session, user_id: int) -> Dict[str, Any]:
        """
        Returns full structured learning tree for all target sounds.
        """
        self.initialize_paths_for_user(db, user_id)
        records = db.query(UnlockedPath).filter(UnlockedPath.user_id == user_id).all()
        scores = {s.phoneme: s for s in db.query(SoundScore).filter(SoundScore.user_id == user_id).all()}

        tree = {}
        for sound in settings.TARGET_SOUNDS:
            sound_records = [r for r in records if r.sound == sound]
            sound_score = scores.get(sound)

            stages_data = []
            for stage in self.STAGES:
                rec = next((r for r in sound_records if r.stage == stage), None)
                stages_data.append({
                    "stage": stage,
                    "is_unlocked": rec.is_unlocked if rec else False,
                    "unlocked_at": rec.unlocked_at.isoformat() if rec and rec.unlocked_at else None
                })

            foundation_unlocked = any(s["stage"] == "Foundation" and s["is_unlocked"] for s in stages_data)
            tree[sound] = {
                "sound": sound,
                "mastery_percentage": sound_score.mastery_percentage if sound_score else 0.0,
                "stages": stages_data,
                # Only surfaced once Foundation is unlocked (i.e. this sound has been
                # diagnosed as weak) - that's the actual "practice this" word list.
                "practice_words": get_words_for_sound(sound) if foundation_unlocked else [],
                "accent_note": INDIAN_ENGLISH_ACCENT_NOTES.get(sound),
            }

        return tree

learning_path_engine = DynamicLearningPathEngine()
