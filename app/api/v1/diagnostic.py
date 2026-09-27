from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from sqlalchemy.orm import Session
from typing import Optional, List
import json
import uuid
import datetime
from pathlib import Path

from app.db.session import get_db
from app.db.models import User, DiagnosticSession, WordAttempt
from app.config import settings
from app.data.word_sets import DIAGNOSTIC_WORD_SETS, ALL_WORDS
from app.schemas.diagnostic import (
    DiagnosticStartRequest,
    DiagnosticStartResponse,
    WordAttemptResponse,
    DiagnosticReportResponse
)
from app.alignment.cmudict_service import cmu_service
from app.alignment.aligner import phoneme_aligner
from app.engines.confusion_matrix import confusion_matrix_engine
from app.engines.sound_mastery import sound_mastery_engine
from app.engines.learning_path import learning_path_engine
from app.engines.diagnostic_report import diagnostic_report_generator
from app.speech.factory import get_phoneme_recognizer

router = APIRouter()

@router.get("/diagnostic/words", tags=["Diagnostic"])
def get_diagnostic_words():
    """Retrieve all diagnostic target word sets organized by target sound."""
    return {
        "target_sounds": settings.TARGET_SOUNDS,
        "word_sets": DIAGNOSTIC_WORD_SETS,
        "total_words": len(ALL_WORDS),
        "all_words": ALL_WORDS
    }

@router.post("/diagnostic/start", response_model=DiagnosticStartResponse, tags=["Diagnostic"])
def start_diagnostic_session(
    payload: DiagnosticStartRequest,
    db: Session = Depends(get_db)
):
    """
    Initializes a new diagnostic session for a user.
    Creates the user if not existing, resets/initializes learning paths.
    """
    user = None
    if payload.user_id:
        user = db.query(User).filter(User.id == payload.user_id).first()
    elif payload.email:
        user = db.query(User).filter(User.email == payload.email).first()

    if not user:
        user = User(
            name=payload.name or "Student",
            email=payload.email or f"student_{uuid.uuid4().hex[:8]}@example.com"
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    session = DiagnosticSession(
        user_id=user.id,
        status="in_progress",
        created_at=datetime.datetime.utcnow()
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    # Initialize learning path entries
    learning_path_engine.initialize_paths_for_user(db, user.id)
    db.commit()

    return DiagnosticStartResponse(
        session_id=session.id,
        user_id=user.id,
        status=session.status,
        target_sounds=settings.TARGET_SOUNDS,
        total_words=len(ALL_WORDS),
        words=ALL_WORDS
    )

@router.post("/diagnostic/submit", response_model=WordAttemptResponse, tags=["Diagnostic"])
async def submit_diagnostic_attempt(
    session_id: Optional[int] = Form(None),
    user_id: Optional[int] = Form(None),
    word: str = Form(...),
    audio: Optional[UploadFile] = File(None),
    detected_phonemes: Optional[str] = Form(None),
    db: Session = Depends(get_db)
):
    """
    Submit a spoken word attempt for diagnostic analysis.
    Takes either an audio file (processed via Allosaurus/speech engine)
    or directly provided phonemes (for simulation/testing).
    Extracts phonemes, aligns against expected CMUdict phonemes, updates
    confusion matrix, recalculates sound mastery, and evaluates unlocks.
    """
    clean_word = word.strip().lower()

    # 1. Resolve User ID
    if session_id:
        session = db.query(DiagnosticSession).filter(DiagnosticSession.id == session_id).first()
        if not session:
            raise HTTPException(status_code=404, detail=f"Diagnostic session {session_id} not found")
        active_user_id = session.user_id
    elif user_id:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail=f"User {user_id} not found")
        active_user_id = user.id
    else:
        raise HTTPException(status_code=400, detail="Either session_id or user_id must be provided")

    # 2. Get Expected Phonemes from CMUdict
    try:
        expected_phonemes = cmu_service.get_phonemes(clean_word)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Unable to retrieve phonemes for word '{word}': {str(e)}")

    # 3. Extract Detected Phonemes
    audio_path_str = None
    extracted_phonemes: List[str] = []

    if audio:
        # Save audio file to upload directory
        file_ext = Path(audio.filename).suffix or ".wav"
        filename = f"{active_user_id}_{clean_word}_{uuid.uuid4().hex[:8]}{file_ext}"
        save_path = settings.UPLOAD_DIR / filename

        with open(save_path, "wb") as f:
            content = await audio.read()
            f.write(content)

        audio_path_str = str(save_path)

        # Extract using the configured speech engine (Allosaurus by default)
        recognizer = get_phoneme_recognizer()
        try:
            extracted_phonemes = recognizer.extract_phonemes(save_path)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Phoneme extraction failed: {str(e)}")

    elif detected_phonemes:
        # Directly supplied phonemes (useful for mock testing or client-side pre-extracted phonemes)
        try:
            parsed = json.loads(detected_phonemes)
            if isinstance(parsed, list):
                extracted_phonemes = [str(p) for p in parsed]
            else:
                extracted_phonemes = str(detected_phonemes).strip().split()
        except Exception:
            extracted_phonemes = detected_phonemes.strip().split()
    else:
        raise HTTPException(
            status_code=400,
            detail="Either 'audio' file upload or 'detected_phonemes' must be provided."
        )

    # 4. Phoneme Alignment (Needleman-Wunsch Dynamic Programming)
    analysis = phoneme_aligner.align(
        word=clean_word,
        expected=expected_phonemes,
        detected=extracted_phonemes
    )

    # 5. Persist WordAttempt
    attempt = WordAttempt(
        session_id=session_id,
        user_id=active_user_id,
        word=clean_word,
        expected_phonemes=analysis.expected_phonemes,
        detected_phonemes=analysis.detected_phonemes,
        phoneme_errors=analysis.errors,
        audio_path=audio_path_str,
        timestamp=datetime.datetime.utcnow()
    )
    db.add(attempt)
    db.flush()

    # 6. Accumulate Evidence in Confusion Matrix & Sound Mastery Engines
    confusion_matrix_engine.record_substitutions(db, active_user_id, analysis.errors)
    sound_mastery_engine.update_scores_from_attempt(db, active_user_id, analysis.target_sound_stats)
    learning_path_engine.evaluate_unlocks(db, active_user_id)

    db.commit()
    db.refresh(attempt)

    is_correct = len(analysis.errors) == 0

    return WordAttemptResponse(
        id=attempt.id,
        session_id=attempt.session_id,
        user_id=attempt.user_id,
        word=attempt.word,
        expected_phonemes=attempt.expected_phonemes,
        detected_phonemes=attempt.detected_phonemes,
        phoneme_errors=attempt.phoneme_errors,
        is_correct=is_correct,
        audio_path=attempt.audio_path,
        timestamp=attempt.timestamp
    )

@router.get("/diagnostic/report/{user_id}", response_model=DiagnosticReportResponse, tags=["Diagnostic"])
def get_diagnostic_report(
    user_id: int,
    db: Session = Depends(get_db)
):
    """
    Compiles and returns the evidence-based pronunciation diagnostic report
    categorizing strong vs weak sounds, concrete substitution patterns, and
    recommended dynamic learning paths.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail=f"User {user_id} not found")

    report = diagnostic_report_generator.generate_report(db, user_id)
    return report
