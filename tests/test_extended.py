import pytest
import json
from app.data.word_sets import DIAGNOSTIC_WORD_SETS, ALL_WORDS, WORD_TARGET_MAP
from app.alignment.cmudict_service import cmu_service
from app.alignment.aligner import phoneme_aligner
from app.engines.learning_path import learning_path_engine, STAGES_ORDER
from app.db.models import User, UnlockedPath

def test_all_diagnostic_words_in_cmudict():
    """Verify that every single diagnostic word in the word sets has CMUdict phonemes."""
    missing = []
    for word in ALL_WORDS:
        try:
            phonemes = cmu_service.get_phonemes(word)
            assert len(phonemes) > 0
        except Exception:
            missing.append(word)
    assert len(missing) == 0, f"Missing words in CMUdict: {missing}"

def test_all_target_sounds_present():
    """Verify that all 8 target sounds (TH, SH, S, V, W, R, L, CH) are present in the word sets."""
    expected_sounds = {"TH", "SH", "S", "V", "W", "R", "L", "CH"}
    assert set(DIAGNOSTIC_WORD_SETS.keys()) == expected_sounds

def test_phoneme_aligner_deletions_and_insertions():
    # Word 'bath' -> expected ['B', 'AE', 'TH']
    # User omitted final TH -> detected ['B', 'AE']
    expected = ["B", "AE", "TH"]
    detected = ["B", "AE"]
    result = phoneme_aligner.align("bath", expected, detected)
    assert len(result.errors) == 1
    assert result.errors[0] == {"expected": "TH", "actual": "<DELETED>"}
    assert result.target_sound_stats["TH"]["incorrect"] == 1

def test_phoneme_aligner_double_substitution():
    # 'church' -> expected ['CH', 'ER', 'CH']
    # Spoken as 'turts' -> ['T', 'ER', 'T', 'S']
    expected = ["CH", "ER", "CH"]
    detected = ["T", "ER", "T"]
    result = phoneme_aligner.align("church", expected, detected)
    assert result.target_sound_stats["CH"]["incorrect"] == 2
    assert result.target_sound_stats["CH"]["correct"] == 0

def test_full_learning_path_progression(db_session):
    """Test full sequential progression through all 6 stages of a sound."""
    user = User(name="ProgressionTester", email="progress@test.com")
    db_session.add(user)
    db_session.commit()

    learning_path_engine.initialize_paths_for_user(db_session, user.id)

    # Unlock first stage (Foundation)
    foundation = db_session.query(UnlockedPath).filter(
        UnlockedPath.user_id == user.id,
        UnlockedPath.sound == "V",
        UnlockedPath.stage == "Foundation"
    ).first()
    foundation.is_unlocked = True
    db_session.commit()

    # Progress through all stages: Foundation -> Words -> Minimal Pairs -> Sentences -> Tongue Twisters -> Conversation
    for i in range(len(STAGES_ORDER) - 1):
        learning_path_engine.advance_stage(db_session, user.id, "V", stage_score=85.0)
        db_session.commit()

    paths = learning_path_engine.get_user_learning_path(db_session, user.id)
    v_stages = paths["V"]["stages"]
    for stage_data in v_stages:
        assert stage_data["is_unlocked"] is True, f"Stage {stage_data['stage']} should be unlocked"

def test_api_submit_validation_errors(client):
    # 1. Missing session_id and user_id
    resp = client.post("/diagnostic/submit", data={"word": "think", "detected_phonemes": "T IH NG K"})
    assert resp.status_code == 400

    # Create a user to test payload validation
    start_resp = client.post("/diagnostic/start", json={"name": "ValUser"})
    u_id = start_resp.json()["user_id"]

    # 2. Missing audio and detected_phonemes with valid user
    resp = client.post("/diagnostic/submit", data={"user_id": u_id, "word": "think"})
    assert resp.status_code == 400

    # 3. Non-existent session
    resp = client.post(
        "/diagnostic/submit",
        data={"session_id": 99999, "word": "think", "detected_phonemes": "T IH NG K"}
    )
    assert resp.status_code == 404
