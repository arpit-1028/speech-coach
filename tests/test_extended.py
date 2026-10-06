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
    """Verify all 12 target sounds (incl. DH/ZH/Z/JH, added for Indian-English coverage) are in the word sets."""
    expected_sounds = {"TH", "DH", "SH", "ZH", "S", "Z", "V", "W", "R", "L", "CH", "JH"}
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


def test_weak_sound_unlocks_practice_words(db_session):
    """A weak sound's Foundation stage auto-unlocks and comes with its practice word list."""
    from app.engines.sound_mastery import sound_mastery_engine
    from app.engines.learning_path import learning_path_engine

    user = User(name="WeakSoundTester", email="weak@test.com")
    db_session.add(user)
    db_session.commit()

    # SH diagnosed weak: 2 correct / 8 incorrect = 20% mastery
    for _ in range(2):
        sound_mastery_engine.update_scores_from_attempt(db_session, user.id, {"SH": {"correct": 1, "incorrect": 0}})
    for _ in range(8):
        sound_mastery_engine.update_scores_from_attempt(db_session, user.id, {"SH": {"correct": 0, "incorrect": 1}})
    db_session.commit()

    learning_path_engine.evaluate_unlocks(db_session, user.id)
    db_session.commit()

    paths = learning_path_engine.get_user_learning_path(db_session, user.id)
    sh = paths["SH"]
    assert any(s["stage"] == "Foundation" and s["is_unlocked"] for s in sh["stages"])
    assert "ship" in sh["practice_words"]
    assert len(sh["practice_words"]) > 0

    # An untested sound must stay locked and expose no practice words yet
    jh = paths["JH"]
    assert all(not s["is_unlocked"] for s in jh["stages"])
    assert jh["practice_words"] == []

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
