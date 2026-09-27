from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.db.session import get_db
from app.db.models import User
from app.schemas.learning_path import LearningPathResponse
from app.engines.learning_path import learning_path_engine

router = APIRouter()

class AdvanceStageRequest(BaseModel):
    user_id: int
    sound: str
    stage_score: float

@router.get("/learning-path/{user_id}", response_model=LearningPathResponse, tags=["Learning Path"])
def get_user_learning_path(
    user_id: int,
    db: Session = Depends(get_db)
):
    """
    Returns the dynamic sound-based learning path for a user,
    reflecting unlocked stages (Foundation, Words, Minimal Pairs, etc.).
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail=f"User {user_id} not found")

    paths = learning_path_engine.get_user_learning_path(db, user_id)
    return LearningPathResponse(
        user_id=user_id,
        learning_paths=paths
    )

@router.post("/learning-path/advance", tags=["Learning Path"])
def advance_learning_stage(
    payload: AdvanceStageRequest,
    db: Session = Depends(get_db)
):
    """
    Advances a user to the next stage for a sound if their current stage score exceeds 80%.
    """
    user = db.query(User).filter(User.id == payload.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail=f"User {payload.user_id} not found")

    learning_path_engine.advance_stage(db, payload.user_id, payload.sound.upper(), payload.stage_score)
    db.commit()

    updated = learning_path_engine.get_user_learning_path(db, payload.user_id)
    return {
        "message": f"Evaluated stage advancement for {payload.sound.upper()}",
        "paths": updated.get(payload.sound.upper())
    }
