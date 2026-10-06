from pathlib import Path
from typing import List
import os

class Settings:
    PROJECT_NAME: str = "Phoneme-Based Pronunciation Diagnostic Platform"
    VERSION: str = "1.0.0"
    API_V1_STR: str = ""

    # Database
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./speech_coach.db")

    # Speech Recognition Engine ('gop', 'allosaurus' or 'mock')
    RECOGNIZER_ENGINE: str = os.getenv("RECOGNIZER_ENGINE", "gop")

    # Storage paths
    BASE_DIR: Path = Path(__file__).resolve().parent.parent
    UPLOAD_DIR: Path = BASE_DIR / "uploads"

    # Target Diagnostic Sounds (ARPAbet notation). DH, ZH, Z and JH added alongside
    # the original set because all are commonly hard for Indian English speakers
    # (see app.data.word_sets.INDIAN_ENGLISH_ACCENT_NOTES) - each one gets its own
    # dynamic practice level that unlocks when mastery on it is weak.
    TARGET_SOUNDS: List[str] = ["TH", "DH", "SH", "ZH", "S", "Z", "V", "W", "R", "L", "CH", "JH"]

    # Sound Mastery Thresholds (Percentage)
    WEAK_THRESHOLD: float = 60.0
    STRONG_THRESHOLD: float = 80.0

    # Minimum occurrences to conclude high/medium confidence weakness
    MIN_OCCURRENCES_FOR_DIAGNOSIS: int = 3
    HIGH_CONFIDENCE_OCCURRENCES: int = 12
    MEDIUM_CONFIDENCE_OCCURRENCES: int = 6

    # GOP (Goodness of Pronunciation) engine
    GOP_MODEL_NAME: str = os.getenv("GOP_MODEL_NAME", "facebook/wav2vec2-lv-60-espeak-cv-ft")
    # Status is decided on the GOP log-ratio (target vs. its single best competitor),
    # the textbook GOP definition - NOT on the 0-100 display score, which is a share of
    # mass across *all* English phones and is a much harsher bar (a correctly produced
    # phoneme can still only capture a minority of that total mass on a multilingual
    # model). Using the ratio instead fixes genuinely correct pronunciations being
    # reported as wrong.
    # gop >= PASS_MARGIN (target beats its best competitor) -> correct
    GOP_PASS_MARGIN: float = float(os.getenv("GOP_PASS_MARGIN", "0.0"))
    # gop < -FAIL_MARGIN (a competitor clearly beats the target) -> wrong; between the
    # two margins -> unclear
    GOP_FAIL_MARGIN: float = float(os.getenv("GOP_FAIL_MARGIN", "0.5"))
    # Minimum absolute acoustic mass on the target required to trust a "correct" call,
    # so near-silence/noise can't win merely for lacking a strong competitor
    GOP_MIN_EVIDENCE: float = float(os.getenv("GOP_MIN_EVIDENCE", "0.05"))
    # Accept non-rhotic (British/Indian) pronunciations such as "car" without the final
    # R -- but never when R is the sound actually being tested (see pipeline.py), so
    # dropping R can't silently "autocorrect" an R diagnostic into a pass.
    ACCEPT_NON_RHOTIC: bool = os.getenv("ACCEPT_NON_RHOTIC", "1") == "1"

    # Minimum plausible seconds of speech per phoneme in the target word (a very
    # fast speech rate ceiling) - below this, the word was said too fast/clipped
    # to physically contain all its sounds, and forced-aligning it anyway produces
    # confident-looking nonsense rather than an honest "too short, try again".
    MIN_SEC_PER_PHONEME: float = 0.08

    # Recording quality gate (voice activity detection) + denoising
    MIN_SPEECH_SEC: float = 0.12
    MAX_SPEECH_SEC: float = 4.0
    MIN_PEAK_DBFS: float = -40.0
    MIN_SNR_DB: float = 12.0
    MAX_CLIPPING_RATIO: float = 0.01
    # Spectral subtraction applied to the recording before scoring (not before the
    # quality-gate checks above, which must see the raw signal)
    DENOISE_AUDIO: bool = os.getenv("DENOISE_AUDIO", "1") == "1"
    DENOISE_OVERSUBTRACTION: float = 1.5
    DENOISE_FLOOR: float = 0.05

    # Confidence level for Wilson score intervals in the report (95%)
    WILSON_Z: float = 1.96

settings = Settings()
settings.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
