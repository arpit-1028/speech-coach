import pytest
import io
import json

def test_api_diagnostic_words(client):
    response = client.get("/diagnostic/words")
    assert response.status_code == 200
    data = response.json()
    assert "target_sounds" in data
    assert "TH" in data["target_sounds"]
    assert "SH" in data["target_sounds"]
    assert "V" in data["target_sounds"]
    assert "W" in data["target_sounds"]
    assert "word_sets" in data
    assert "total_words" in data
    assert data["total_words"] > 50

def test_api_serves_html_ui(client):
    response = client.get("/")
    assert response.status_code == 200
    assert "text/html" in response.headers.get("content-type", "")
    assert "Pronunciation Diagnostic Tester" in response.text

def test_api_diagnostic_flow(client, mock_speech_recognizer):
    # 1. Start diagnostic session
    start_resp = client.post("/diagnostic/start", json={"name": "Grace", "email": "grace@test.com"})
    assert start_resp.status_code == 200
    session_data = start_resp.json()
    session_id = session_data["session_id"]
    user_id = session_data["user_id"]
    assert session_data["status"] == "in_progress"

    # 2. Submit attempts using detected_phonemes (simulating 'think' -> 'tink')
    submit_resp1 = client.post(
        "/diagnostic/submit",
        data={
            "session_id": session_id,
            "word": "think",
            "detected_phonemes": json.dumps(["T", "IH", "NG", "K"])
        }
    )
    assert submit_resp1.status_code == 200
    attempt1 = submit_resp1.json()
    assert attempt1["word"] == "think"
    assert attempt1["expected_phonemes"] == ["TH", "IH", "NG", "K"]
    assert attempt1["detected_phonemes"] == ["T", "IH", "NG", "K"]
    assert attempt1["is_correct"] is False
    assert attempt1["phoneme_errors"] == [{"expected": "TH", "actual": "T"}]

    # 3. Submit attempts with audio file upload (processed by speech engine)
    mock_speech_recognizer.set_preset("three", ["T", "R", "IY"])
    fake_wav_content = b"RIFF....WAVEfmt ...."
    submit_resp2 = client.post(
        "/diagnostic/submit",
        data={
            "session_id": session_id,
            "word": "three"
        },
        files={"audio": ("three.wav", io.BytesIO(fake_wav_content), "audio/wav")}
    )
    assert submit_resp2.status_code == 200
    attempt2 = submit_resp2.json()
    assert attempt2["word"] == "three"
    assert attempt2["phoneme_errors"] == [{"expected": "TH", "actual": "T"}]

    # 4. Submit 3rd attempt for TH to reach minimum diagnosis threshold
    client.post(
        "/diagnostic/submit",
        data={
            "session_id": session_id,
            "word": "thirty",
            "detected_phonemes": json.dumps(["T", "ER", "T", "IY"])
        }
    )

    # 5. Check sound profile
    profile_resp = client.get(f"/sound-profile/{user_id}")
    assert profile_resp.status_code == 200
    profile_data = profile_resp.json()
    assert profile_data["confusion_matrix"]["TH->T"] == 3
    assert profile_data["sound_scores"]["TH"]["incorrect"] == 3
    assert profile_data["sound_scores"]["TH"]["correct"] == 0
    assert profile_data["sound_scores"]["TH"]["mastery_percentage"] == 0.0

    # 6. Check diagnostic report
    report_resp = client.get(f"/diagnostic/report/{user_id}")
    assert report_resp.status_code == 200
    report_data = report_resp.json()
    assert "TH" in report_data["weak_sounds"]
    assert "TH Foundation" in report_data["recommended_learning_path"]
    assert "PRONUNCIATION DIAGNOSTIC REPORT" in report_data["formatted_text_report"]

    # 7. Check dynamic learning path
    path_resp = client.get(f"/learning-path/{user_id}")
    assert path_resp.status_code == 200
    path_data = path_resp.json()
    th_stages = {s["stage"]: s["is_unlocked"] for s in path_data["learning_paths"]["TH"]["stages"]}
    assert th_stages["Foundation"] is True

    # 8. Test advancing stage
    adv_resp = client.post(
        "/learning-path/advance",
        json={"user_id": user_id, "sound": "TH", "stage_score": 85.0}
    )
    assert adv_resp.status_code == 200
    updated_stages = {s["stage"]: s["is_unlocked"] for s in adv_resp.json()["paths"]["stages"]}
    assert updated_stages["Words"] is True
