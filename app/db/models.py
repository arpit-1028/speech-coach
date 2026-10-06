import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Boolean, JSON
from sqlalchemy.orm import relationship
from app.db.session import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    email = Column(String(150), unique=True, index=True, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    sessions = relationship("DiagnosticSession", back_populates="user", cascade="all, delete-orphan")
    word_attempts = relationship("WordAttempt", back_populates="user", cascade="all, delete-orphan")
    sound_scores = relationship("SoundScore", back_populates="user", cascade="all, delete-orphan")
    confusion_records = relationship("ConfusionMatrix", back_populates="user", cascade="all, delete-orphan")
    unlocked_paths = relationship("UnlockedPath", back_populates="user", cascade="all, delete-orphan")


class DiagnosticSession(Base):
    __tablename__ = "diagnostic_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    status = Column(String(50), default="in_progress")  # in_progress, completed
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    user = relationship("User", back_populates="sessions")
    attempts = relationship("WordAttempt", back_populates="session", cascade="all, delete-orphan")


class WordAttempt(Base):
    __tablename__ = "word_attempts"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("diagnostic_sessions.id"), nullable=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    word = Column(String(100), nullable=False, index=True)
    expected_phonemes = Column(JSON, nullable=False)  # List[str] e.g. ["TH", "IH", "NG", "K"]
    detected_phonemes = Column(JSON, nullable=False)  # List[str] e.g. ["T", "IH", "NG", "K"]
    phoneme_errors = Column(JSON, default=list)      # List[dict] e.g. [{"expected": "TH", "actual": "T"}]
    audio_path = Column(String(500), nullable=True)
    phoneme_scores = Column(JSON, nullable=True)      # GOP per phoneme: [{"phoneme": "TH", "score": 12.0, "status": "wrong", ...}]
    word_score = Column(Float, nullable=True)         # Mean GOP score (0-100) of the word
    quality = Column(JSON, nullable=True)             # Recording quality metrics (SNR, speech duration, ...)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)

    session = relationship("DiagnosticSession", back_populates="attempts")
    user = relationship("User", back_populates="word_attempts")


class SoundScore(Base):
    __tablename__ = "sound_scores"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    phoneme = Column(String(10), nullable=False, index=True)  # e.g. "TH"
    correct_occurrences = Column(Integer, default=0, nullable=False)
    incorrect_occurrences = Column(Integer, default=0, nullable=False)
    mastery_percentage = Column(Float, default=0.0, nullable=False)
    gop_score_sum = Column(Float, default=0.0, nullable=False)       # Sum of GOP scores (0-100)
    gop_scored_occurrences = Column(Integer, default=0, nullable=False)
    last_updated = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    user = relationship("User", back_populates="sound_scores")


class ConfusionMatrix(Base):
    __tablename__ = "confusion_matrix"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    source_phoneme = Column(String(10), nullable=False, index=True)  # Expected, e.g. "TH"
    target_phoneme = Column(String(10), nullable=False, index=True)  # Actual substituted, e.g. "T"
    count = Column(Integer, default=0, nullable=False)
    last_updated = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    user = relationship("User", back_populates="confusion_records")


class UnlockedPath(Base):
    __tablename__ = "unlocked_paths"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    sound = Column(String(10), nullable=False, index=True)  # e.g. "TH"
    stage = Column(String(50), nullable=False)  # Foundation, Words, Minimal Pairs, Sentences, Tongue Twisters, Conversation
    is_unlocked = Column(Boolean, default=False, nullable=False)
    unlocked_at = Column(DateTime, default=datetime.datetime.utcnow)

    user = relationship("User", back_populates="unlocked_paths")
