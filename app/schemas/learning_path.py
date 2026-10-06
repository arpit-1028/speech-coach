from pydantic import BaseModel
from typing import Dict, List, Optional, Any

class StageStatus(BaseModel):
    stage: str
    is_unlocked: bool
    unlocked_at: Optional[str] = None

class SoundLearningPath(BaseModel):
    sound: str
    mastery_percentage: float
    stages: List[StageStatus]
    practice_words: List[str] = []
    accent_note: Optional[str] = None

class LearningPathResponse(BaseModel):
    user_id: int
    learning_paths: Dict[str, SoundLearningPath]
