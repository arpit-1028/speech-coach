from pydantic import BaseModel
from typing import Dict, List, Any, Optional

class SoundStat(BaseModel):
    correct: int
    incorrect: int
    total: int
    mastery_percentage: float
    substitution_patterns: List[str]
    avg_gop_score: Optional[float] = None
    ci_low: Optional[float] = None
    ci_high: Optional[float] = None

class SoundProfileResponse(BaseModel):
    user_id: int
    sound_scores: Dict[str, SoundStat]
    confusion_matrix: Dict[str, int]
