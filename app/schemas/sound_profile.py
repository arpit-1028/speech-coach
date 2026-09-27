from pydantic import BaseModel
from typing import Dict, List, Any

class SoundStat(BaseModel):
    correct: int
    incorrect: int
    total: int
    mastery_percentage: float
    substitution_patterns: List[str]

class SoundProfileResponse(BaseModel):
    user_id: int
    sound_scores: Dict[str, SoundStat]
    confusion_matrix: Dict[str, int]
