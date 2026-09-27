"""
Demonstration Client for Pronunciation Diagnostic Platform.
Simulates a student taking a diagnostic test, generating substitutions
(e.g., TH -> T, V -> W), and inspecting the resulting diagnostic report,
confusion matrix, and dynamic learning path.
"""

from fastapi.testclient import TestClient
from app.main import app
import json

def run_demo():
    client = TestClient(app)

    print("=" * 60)
    print("STEP 1: Starting Diagnostic Session for Student 'Alex'")
    print("=" * 60)
    start_res = client.post("/diagnostic/start", json={"name": "Alex", "email": "alex@example.com"})
    session = start_res.json()
    user_id = session["user_id"]
    session_id = session["session_id"]
    print(f"Session started! User ID: {user_id}, Session ID: {session_id}")
    print(f"Target sounds: {session['target_sounds']}")
    print(f"Total diagnostic words available: {session['total_words']}\n")

    print("=" * 60)
    print("STEP 2: Submitting Simulated Word Attempts")
    print("=" * 60)

    # 1. Simulate TH words with TH -> T substitution (9 correct, 16 incorrect)
    # Target: 'think' spoken as 'tink', 'three' spoken as 'tree', etc.
    th_words = [
        "think", "three", "thumb", "thunder", "thirty",
        "thank", "theory", "thought", "theme", "thread",
        "author", "nothing", "method", "athlete", "healthy",
        "birthday", "anything", "bathroom", "bath", "both",
        "math", "teeth", "mouth", "truth", "think"
    ]

    from app.alignment.cmudict_service import cmu_service

    print("Submitting 25 TH word attempts (simulating frequent TH -> T error)...")
    for i, word in enumerate(th_words):
        exp = cmu_service.get_phonemes(word)
        if i < 9:
            # Spoken correctly
            det = exp
        else:
            # Spoken with T substitution (e.g. think -> tink, three -> tree)
            det = ["T" if p == "TH" else p for p in exp]

        resp = client.post(
            "/diagnostic/submit",
            data={
                "session_id": session_id,
                "word": word,
                "detected_phonemes": json.dumps(det)
            }
        )

    # 2. Simulate V words with V -> W substitution (8 correct, 12 incorrect)
    v_words = [
        "vine", "very", "visit", "voice", "value",
        "victory", "video", "village", "seven", "river",
        "movie", "travel", "love", "give", "live",
        "solve", "vine", "very", "visit", "voice"
    ]
    print("Submitting 20 V word attempts (simulating V -> W confusion)...")
    for i, word in enumerate(v_words):
        exp = cmu_service.get_phonemes(word)
        if i < 8:
            det = exp
        else:
            det = ["W" if p == "V" else p for p in exp]

        resp = client.post(
            "/diagnostic/submit",
            data={
                "session_id": session_id,
                "word": word,
                "detected_phonemes": json.dumps(det)
            }
        )

    # 3. Simulate strong sounds: W and L (100% correct)
    print("Submitting 10 W and 10 L attempts (all correct)...")
    for w in ["water", "west", "wind", "wood", "white", "winter", "window", "wonder", "always", "away"]:
        exp = cmu_service.get_phonemes(w)
        client.post(
            "/diagnostic/submit",
            data={"session_id": session_id, "word": w, "detected_phonemes": json.dumps(exp)}
        )

    for l_word in ["light", "look", "lamp", "love", "long", "learn", "letter", "lion", "yellow", "believe"]:
        exp = cmu_service.get_phonemes(l_word)
        client.post(
            "/diagnostic/submit",
            data={"session_id": session_id, "word": l_word, "detected_phonemes": json.dumps(exp)}
        )

    print("Submission completed.\n")

    print("=" * 60)
    print("STEP 3: Fetching Sound Profile & Cumulative Confusion Matrix")
    print("=" * 60)
    profile_resp = client.get(f"/sound-profile/{user_id}")
    profile = profile_resp.json()
    print("Sound Scores:")
    for sound, stat in profile["sound_scores"].items():
        print(f"  {sound:4}: Correct={stat['correct']:2}, Incorrect={stat['incorrect']:2}, Mastery={stat['mastery_percentage']}%")
    print(f"\nConfusion Matrix: {profile['confusion_matrix']}\n")

    print("=" * 60)
    print("STEP 4: Fetching Formatted Pronunciation Diagnostic Report")
    print("=" * 60)
    report_resp = client.get(f"/diagnostic/report/{user_id}")
    report = report_resp.json()
    print(report["formatted_text_report"])
    print("\n")

    print("=" * 60)
    print("STEP 5: Inspecting Dynamic Learning Path")
    print("=" * 60)
    path_resp = client.get(f"/learning-path/{user_id}")
    paths = path_resp.json()["learning_paths"]
    for sound in ["TH", "V", "W", "L"]:
        s_data = paths[sound]
        unlocked = [st["stage"] for st in s_data["stages"] if st["is_unlocked"]]
        locked = [st["stage"] for st in s_data["stages"] if not st["is_unlocked"]]
        print(f"Sound {sound} (Mastery: {s_data['mastery_percentage']}%):")
        print(f"  [Unlocked]: {unlocked}")
        print(f"  [Locked]  : {locked}")

    print("\n" + "=" * 60)
    print("STEP 6: Advancing Stage (Student completes TH Foundation > 80%)")
    print("=" * 60)
    adv_resp = client.post("/learning-path/advance", json={"user_id": user_id, "sound": "TH", "stage_score": 85.0})
    updated_th = adv_resp.json()["paths"]
    unlocked_after = [st["stage"] for st in updated_th["stages"] if st["is_unlocked"]]
    print(f"TH stages now unlocked: {unlocked_after}")
    print("=" * 60)

if __name__ == "__main__":
    run_demo()
