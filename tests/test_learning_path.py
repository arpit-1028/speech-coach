import pytest
from app.db.models import User, SoundScore, UnlockedPath
from app.engines.learning_path import learning_path_engine
from app.config import settings

def test_learning_path_unlocks(db_session):
    user = User(name="Eve", email="eve@test.com")
    db_session.add(user)
    db_session.commit()

    # TH has weak mastery (36% < 60%)
    sc_th = SoundScore(
        user_id=user.id,
        phoneme="TH",
        correct_occurrences=9,
        incorrect_occurrences=16,
        mastery_percentage=36.0
    )
    # SH has strong mastery (90% >= 80%)
    sc_sh = SoundScore(
        user_id=user.id,
        phoneme="SH",
        correct_occurrences=18,
        incorrect_occurrences=2,
        mastery_percentage=90.0
    )
    db_session.add_all([sc_th, sc_sh])
    db_session.commit()

    # Evaluate unlocks
    learning_path_engine.evaluate_unlocks(db_session, user.id)
    db_session.commit()

    paths = learning_path_engine.get_user_learning_path(db_session, user.id)

    # TH should have Foundation unlocked
    th_stages = {s["stage"]: s["is_unlocked"] for s in paths["TH"]["stages"]}
    assert th_stages["Foundation"] is True
    assert th_stages["Words"] is False

    # SH should have Foundation and Words unlocked
    sh_stages = {s["stage"]: s["is_unlocked"] for s in paths["SH"]["stages"]}
    assert sh_stages["Foundation"] is True
    assert sh_stages["Words"] is True

def test_advance_stage_after_mastery(db_session):
    user = User(name="Frank", email="frank@test.com")
    db_session.add(user)
    db_session.commit()

    # Initialize and unlock TH Foundation
    learning_path_engine.initialize_paths_for_user(db_session, user.id)
    th_foundation = db_session.query(UnlockedPath).filter(
        UnlockedPath.user_id == user.id,
        UnlockedPath.sound == "TH",
        UnlockedPath.stage == "Foundation"
    ).first()
    th_foundation.is_unlocked = True
    db_session.commit()

    # User completes TH Foundation with 85% (> 80%)
    learning_path_engine.advance_stage(db_session, user.id, "TH", 85.0)
    db_session.commit()

    th_words = db_session.query(UnlockedPath).filter(
        UnlockedPath.user_id == user.id,
        UnlockedPath.sound == "TH",
        UnlockedPath.stage == "Words"
    ).first()
    assert th_words.is_unlocked is True
