from typing import Dict, List, Tuple
from sqlalchemy.orm import Session
from app.db.models import ConfusionMatrix
import datetime

class ConfusionMatrixEngine:
    """
    Tracks and accumulates phoneme substitution occurrences across all word attempts for a user.
    Maintains cumulative evidence of substitution patterns (e.g. TH -> T).
    """

    def record_substitutions(self, db: Session, user_id: int, errors: List[Dict[str, str]]):
        """
        Takes list of errors: [{'expected': 'TH', 'actual': 'T'}, ...]
        and increments cumulative count in the database.
        """
        for err in errors:
            src = err.get("expected")
            tgt = err.get("actual")

            if not src or not tgt or src == tgt:
                continue

            record = db.query(ConfusionMatrix).filter(
                ConfusionMatrix.user_id == user_id,
                ConfusionMatrix.source_phoneme == src,
                ConfusionMatrix.target_phoneme == tgt
            ).first()

            if record:
                record.count += 1
                record.last_updated = datetime.datetime.utcnow()
            else:
                record = ConfusionMatrix(
                    user_id=user_id,
                    source_phoneme=src,
                    target_phoneme=tgt,
                    count=1,
                    last_updated=datetime.datetime.utcnow()
                )
                db.add(record)

        db.flush()

    def get_user_confusion_matrix(self, db: Session, user_id: int) -> Dict[str, int]:
        """
        Returns a mapping of 'SRC->TGT': count for the user.
        Example: {'TH->T': 14, 'TH->D': 2, 'SH->S': 8, 'V->W': 5}
        """
        records = db.query(ConfusionMatrix).filter(
            ConfusionMatrix.user_id == user_id
        ).all()

        matrix = {}
        for r in records:
            key = f"{r.source_phoneme}->{r.target_phoneme}"
            matrix[key] = r.count
        return matrix

    def get_top_substitutions_for_sound(
        self, db: Session, user_id: int, sound: str, limit: int = 3
    ) -> List[Tuple[str, int]]:
        """
        Returns the most frequent target substitutions for a specific sound.
        Example: [('T', 14), ('D', 2)]
        """
        records = db.query(ConfusionMatrix).filter(
            ConfusionMatrix.user_id == user_id,
            ConfusionMatrix.source_phoneme == sound
        ).order_by(ConfusionMatrix.count.desc()).limit(limit).all()

        return [(r.target_phoneme, r.count) for r in records]

confusion_matrix_engine = ConfusionMatrixEngine()
