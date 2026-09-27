from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.models import User
from app.schemas.sound_profile import SoundProfileResponse
from app.engines.sound_mastery import sound_mastery_engine
from app.engines.confusion_matrix import confusion_matrix_engine

router = APIRouter()

@router.get("/sound-profile/{user_id}", response_model=SoundProfileResponse, tags=["Profile"])
def get_user_sound_profile(
    user_id: int,
    db: Session = Depends(get_db)
):
    """
    Returns the comprehensive phoneme mastery profile and cumulative confusion matrix for a user.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail=f"User {user_id} not found")

    scores = sound_mastery_engine.get_sound_profile(db, user_id)
    confusion = confusion_matrix_engine.get_user_confusion_matrix(db, user_id)

    return SoundProfileResponse(
        user_id=user_id,
        sound_scores=scores,
        confusion_matrix=confusion
    )
