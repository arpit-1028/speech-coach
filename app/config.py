from pathlib import Path
from typing import List
import os

class Settings:
    PROJECT_NAME: str = "Phoneme-Based Pronunciation Diagnostic Platform"
    VERSION: str = "1.0.0"
    API_V1_STR: str = ""

    # Database
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./speech_coach.db")

    # Speech Recognition Engine ('allosaurus' or 'mock')
    RECOGNIZER_ENGINE: str = os.getenv("RECOGNIZER_ENGINE", "allosaurus")

    # Storage paths
    BASE_DIR: Path = Path(__file__).resolve().parent.parent
    UPLOAD_DIR: Path = BASE_DIR / "uploads"

    # Target Diagnostic Sounds (ARPAbet notation)
    TARGET_SOUNDS: List[str] = ["TH", "SH", "S", "V", "W", "R", "L", "CH"]

    # Sound Mastery Thresholds (Percentage)
    WEAK_THRESHOLD: float = 60.0
    STRONG_THRESHOLD: float = 80.0

    # Minimum occurrences to conclude high/medium confidence weakness
    MIN_OCCURRENCES_FOR_DIAGNOSIS: int = 3
    HIGH_CONFIDENCE_OCCURRENCES: int = 12
    MEDIUM_CONFIDENCE_OCCURRENCES: int = 6

settings = Settings()
settings.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
