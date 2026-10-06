from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Any
from datetime import datetime

class DiagnosticStartRequest(BaseModel):
    user_id: Optional[int] = None
    name: Optional[str] = "Student"
    email: Optional[str] = None

class DiagnosticStartResponse(BaseModel):
    session_id: int
    user_id: int
    status: str
    target_sounds: List[str]
    total_words: int
    words: List[str]

class PhonemeError(BaseModel):
    expected: str
    actual: str

class WordAttemptResponse(BaseModel):
    id: int
    session_id: Optional[int]
    user_id: int
    word: str
    expected_phonemes: List[str]
    detected_phonemes: List[str]
    phoneme_errors: List[PhonemeError]
    is_correct: bool
    word_score: Optional[float] = None
    phoneme_scores: List[Dict[str, Any]] = []
    quality: Optional[Dict[str, Any]] = None
    audio_path: Optional[str]
    timestamp: datetime

class AttemptResult(BaseModel):
    attempt_id: int
    word: str
    target_sound: Optional[str] = None
    expected_phonemes: List[str]
    detected_phonemes: List[str]
    word_score: Optional[float] = None
    is_correct: bool
    errors: List[PhonemeError]
    unclear_phonemes: List[str] = []
    phoneme_scores: List[Dict[str, Any]] = []
    timestamp: Optional[str] = None

class TestSummary(BaseModel):
    total_words_tested: int
    correct_words: int
    accuracy_percentage: float
    average_word_score: Optional[float] = None

class SoundAnalysis(BaseModel):
    sound: str
    occurrences_tested: int
    correct: int
    incorrect: int
    mastery_percentage: float
    common_error: str
    examples: List[str]
    assessment: str
    confidence: str
    ci_low: Optional[float] = None
    ci_high: Optional[float] = None
    avg_gop_score: Optional[float] = None

class DiagnosticReportResponse(BaseModel):
    user_id: int
    strong_sounds: List[str]
    weak_sounds: List[str]
    developing_sounds: List[str]
    sound_analyses: List[SoundAnalysis]
    recommended_learning_path: List[str]
    test_summary: Optional[TestSummary] = None
    attempts: List[AttemptResult] = []
    formatted_text_report: str
