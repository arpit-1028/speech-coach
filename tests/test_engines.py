import pytest
from app.db.models import User, WordAttempt
from app.engines.confusion_matrix import confusion_matrix_engine
from app.engines.sound_mastery import sound_mastery_engine
from app.engines.diagnostic_report import diagnostic_report_generator

def test_confusion_matrix_accumulation(db_session):
    user = User(name="Alice", email="alice@test.com")
    db_session.add(user)
    db_session.commit()

    # Simulate 14 substitutions of TH -> T, 2 of TH -> D, 8 of SH -> S, 5 of V -> W
    for _ in range(14):
        confusion_matrix_engine.record_substitutions(db_session, user.id, [{"expected": "TH", "actual": "T"}])
    for _ in range(2):
        confusion_matrix_engine.record_substitutions(db_session, user.id, [{"expected": "TH", "actual": "D"}])
    for _ in range(8):
        confusion_matrix_engine.record_substitutions(db_session, user.id, [{"expected": "SH", "actual": "S"}])
    for _ in range(5):
        confusion_matrix_engine.record_substitutions(db_session, user.id, [{"expected": "V", "actual": "W"}])
    db_session.commit()

    matrix = confusion_matrix_engine.get_user_confusion_matrix(db_session, user.id)
    assert matrix["TH->T"] == 14
    assert matrix["TH->D"] == 2
    assert matrix["SH->S"] == 8
    assert matrix["V->W"] == 5

    top_th = confusion_matrix_engine.get_top_substitutions_for_sound(db_session, user.id, "TH")
    assert top_th[0] == ("T", 14)
    assert top_th[1] == ("D", 2)

def test_sound_mastery_calculation(db_session):
    user = User(name="Bob", email="bob@test.com")
    db_session.add(user)
    db_session.commit()

    # Simulate 9 correct and 16 incorrect occurrences for TH
    # 9 / 25 = 36%
    for _ in range(9):
        sound_mastery_engine.update_scores_from_attempt(
            db_session, user.id, {"TH": {"correct": 1, "incorrect": 0}}
        )
    for _ in range(16):
        sound_mastery_engine.update_scores_from_attempt(
            db_session, user.id, {"TH": {"correct": 0, "incorrect": 1}}
        )
    db_session.commit()

    profile = sound_mastery_engine.get_sound_profile(db_session, user.id)
    th_stat = profile["TH"]
    assert th_stat["correct"] == 9
    assert th_stat["incorrect"] == 16
    assert th_stat["total"] == 25
    assert th_stat["mastery_percentage"] == 36.0

def test_evidence_accumulation_rule(db_session):
    # Verify that a single mispronounced word does NOT result in a diagnosed weakness
    user = User(name="Charlie", email="charlie@test.com")
    db_session.add(user)
    db_session.commit()

    # Just 1 single attempt for TH with error
    sound_mastery_engine.update_scores_from_attempt(
        db_session, user.id, {"TH": {"correct": 0, "incorrect": 1}}
    )
    confusion_matrix_engine.record_substitutions(
        db_session, user.id, [{"expected": "TH", "actual": "T"}]
    )
    db_session.commit()

    report = diagnostic_report_generator.generate_report(db_session, user.id)
    # Because occurrences_tested (1) is less than MIN_OCCURRENCES_FOR_DIAGNOSIS (3),
    # the system should NOT conclude TH as a definitive weak sound yet!
    assert "TH" not in report["weak_sounds"]
    assert "TH" in report["developing_sounds"]

def test_diagnostic_report_generation(db_session):
    user = User(name="David", email="david@test.com")
    db_session.add(user)
    db_session.commit()

    # Add 25 TH attempts (9 correct, 16 incorrect) with TH -> T
    for _ in range(9):
        sound_mastery_engine.update_scores_from_attempt(
            db_session, user.id, {"TH": {"correct": 1, "incorrect": 0}}
        )
    for _ in range(16):
        sound_mastery_engine.update_scores_from_attempt(
            db_session, user.id, {"TH": {"correct": 0, "incorrect": 1}}
        )
        confusion_matrix_engine.record_substitutions(
            db_session, user.id, [{"expected": "TH", "actual": "T"}]
        )

    # Add word attempt examples for think, three, thirty
    for w in ["think", "three", "thirty"]:
        att = WordAttempt(
            user_id=user.id,
            word=w,
            expected_phonemes=["TH"],
            detected_phonemes=["T"],
            phoneme_errors=[{"expected": "TH", "actual": "T"}]
        )
        db_session.add(att)

    # Add strong sounds: W (10 correct, 0 incorrect = 100%), L (10 correct, 0 incorrect = 100%)
    for _ in range(10):
        sound_mastery_engine.update_scores_from_attempt(
            db_session, user.id, {"W": {"correct": 1, "incorrect": 0}}
        )
        sound_mastery_engine.update_scores_from_attempt(
            db_session, user.id, {"L": {"correct": 1, "incorrect": 0}}
        )

    db_session.commit()

    report = diagnostic_report_generator.generate_report(db_session, user.id)

    assert "W" in report["strong_sounds"]
    assert "L" in report["strong_sounds"]
    assert "TH" in report["weak_sounds"]

    th_analysis = next(a for a in report["sound_analyses"] if a["sound"] == "TH")
    assert th_analysis["occurrences_tested"] == 25
    assert th_analysis["correct"] == 9
    assert th_analysis["incorrect"] == 16
    assert th_analysis["common_error"] == "TH -> T"
    assert th_analysis["confidence"] == "High"
    assert "User frequently substitutes TH with T" in th_analysis["assessment"]
    assert "think -> tink" in th_analysis["examples"]
    assert "three -> tree" in th_analysis["examples"]

    assert "TH Foundation" in report["recommended_learning_path"]
    assert "PRONUNCIATION DIAGNOSTIC REPORT" in report["formatted_text_report"]


def test_indian_accent_assessment_text_for_dh_and_zh(db_session):
    """DH->D and ZH->Z/JH (common Indian-English substitutions) get accent-aware wording."""
    user = User(name="Priya", email="priya@test.com")
    db_session.add(user)
    db_session.commit()

    for _ in range(9):
        sound_mastery_engine.update_scores_from_attempt(db_session, user.id, {"DH": {"correct": 1, "incorrect": 0}})
    for _ in range(16):
        sound_mastery_engine.update_scores_from_attempt(db_session, user.id, {"DH": {"correct": 0, "incorrect": 1}})
        confusion_matrix_engine.record_substitutions(db_session, user.id, [{"expected": "DH", "actual": "D"}])
    db_session.commit()

    report = diagnostic_report_generator.generate_report(db_session, user.id)
    dh_analysis = next(a for a in report["sound_analyses"] if a["sound"] == "DH")
    assert "Indian English" in dh_analysis["assessment"]
    assert dh_analysis["common_error"] == "DH -> D"


def test_report_includes_answer_by_answer_history(db_session):
    """generate_report() exposes a per-word attempt history and test summary, not just per-sound stats."""
    user = User(name="Dev", email="dev@test.com")
    db_session.add(user)
    db_session.commit()

    db_session.add(WordAttempt(
        user_id=user.id, session_id=7, word="think",
        expected_phonemes=["TH", "IH", "NG", "K"], detected_phonemes=["T", "IH", "NG", "K"],
        phoneme_errors=[{"expected": "TH", "actual": "T"}],
        phoneme_scores=[{"phoneme": "TH", "status": "wrong", "score": 10.0}],
        word_score=55.0,
    ))
    db_session.add(WordAttempt(
        user_id=user.id, session_id=7, word="water",
        expected_phonemes=["W", "AO", "T", "ER"], detected_phonemes=["W", "AO", "T", "ER"],
        phoneme_errors=[],
        phoneme_scores=[{"phoneme": "W", "status": "correct", "score": 95.0}],
        word_score=95.0,
    ))
    # Different session: must not leak into the session-scoped report
    db_session.add(WordAttempt(
        user_id=user.id, session_id=8, word="vine",
        expected_phonemes=["V", "AY", "N"], detected_phonemes=["V", "AY", "N"],
        phoneme_errors=[], word_score=90.0,
    ))
    db_session.commit()

    report = diagnostic_report_generator.generate_report(db_session, user.id, session_id=7)

    assert report["test_summary"]["total_words_tested"] == 2
    assert report["test_summary"]["correct_words"] == 1
    assert report["test_summary"]["accuracy_percentage"] == 50.0

    words = {a["word"]: a for a in report["attempts"]}
    assert set(words.keys()) == {"think", "water"}
    assert words["think"]["is_correct"] is False
    assert words["water"]["is_correct"] is True
    assert "ANSWER-BY-ANSWER RESULTS" in report["formatted_text_report"]
    assert "THINK" in report["formatted_text_report"]
