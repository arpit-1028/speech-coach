# Dynamic Pronunciation Feedback & Practice Generator in IPA

PAIR_TIPS_IPA = {
    ("v", "w"): "For V, touch upper teeth to lower lip. For W, round both lips without teeth.",
    ("w", "v"): "For W, round both lips. For V, lightly vibrate lower lip against upper teeth.",
    ("θ", "t"): "For voiceless TH (like in 'thought'), place the tongue tip lightly between teeth and release air.",
    ("ð", "d"): "For voiced TH (like in 'mother'), keep tongue between teeth and add voice vibration.",
    ("r", "l"): "For R, pull the tongue back slightly. For L, touch tongue tip behind teeth.",
    ("s", "ʃ"): "For SH, round lips slightly and widen the air channel. For S, keep lips flatter.",
    ("ʃ", "s"): "For SH, round lips slightly and widen the air channel. Avoid flattening into S.",
}

PRACTICE_SUGGESTIONS = {
    "θ": ["think", "thank", "through", "thirty", "three"],
    "ð": ["this", "that", "there", "then", "their"],
    "v": ["very", "voice", "visit", "value", "view"],
    "w": ["water", "world", "work", "where", "write"],
    "æ": ["cat", "bat", "mat", "hat", "black"],
    "ʃ": ["she", "show", "ship", "short", "shine"],
    "tʃ": ["chair", "check", "change", "cheap", "choose"],
    "dʒ": ["job", "join", "joy", "juice", "large"],
    "ŋ": ["sing", "ring", "song", "long", "king"],
}

def generate_feedback(results, score_value=None):
    mistakes = [item for item in results if item["type"] not in {"correct", "accent_match"}]
    feedback = []
    improvements = []
    
    if not results:
        return {
            "summary": "No speech detected. Please speak closer to the microphone.",
            "feedback": ["No clear speech detected."],
            "mistakes": [],
            "improvements": ["Speak clearly and try again."],
            "weak_sound": "",
            "practice_words": []
        }

    if score_value is None:
        score_value = 0

    # Determine Summary Grade based on scores
    if score_value >= 90:
        summary = "Almost perfect pronunciation! Excellent clarity and confident speaking."
    elif score_value >= 80:
        summary = "Great job. Only minor accent or vowel length differences detected."
    elif score_value >= 65:
        summary = "Understandable pronunciation. Slower practice will help sharpen specific sounds."
    elif score_value >= 45:
        summary = "Noticeable mistakes detected. Slow down, breathe, and focus on target consonants."
    else:
        summary = "Very unclear speech. Try to enunciate every syllable slowly."

    # Identify the weakest sound
    weak_sound = ""
    for item in mistakes:
        exp = item.get("expected")
        if exp:
            weak_sound = exp
            break

    # Add practice suggestions
    practice_words = []
    if weak_sound in PRACTICE_SUGGESTIONS:
        practice_words = PRACTICE_SUGGESTIONS[weak_sound]
        improvements.append(f"Today's weakest sound is '{weak_sound}'. Practice these words: {', '.join(practice_words)}")
    
    if not mistakes:
        feedback.append("Excellent pronunciation! All sounds match target parameters.")
        improvements.append("Repeat the word naturally to build muscle memory.")
    else:
        # Categorize feedback
        issue_counts = {}
        for item in mistakes:
            key = item["type"]
            issue_counts[key] = issue_counts.get(key, 0) + 1

        if issue_counts.get("missing"):
            feedback.append(f"Missed {issue_counts['missing']} expected sound(s).")
            improvements.append("Complete the ending sounds of the words without swallowing them.")
        if issue_counts.get("extra"):
            feedback.append(f"Detected {issue_counts['extra']} extra/filler sound(s).")
            improvements.append("Keep the words compact. Avoid adding extra vowel sounds.")
        if issue_counts.get("wrong") or issue_counts.get("close"):
            total_sub = issue_counts.get("wrong", 0) + issue_counts.get("close", 0)
            feedback.append(f"Pronounced {total_sub} sound(s) differently.")

        # Find specific tips for mistakes
        for item in mistakes[:4]:
            pair = (item.get("expected"), item.get("spoken"))
            if pair in PAIR_TIPS_IPA:
                improvements.append(PAIR_TIPS_IPA[pair])
            elif item.get("tip"):
                improvements.append(item["tip"])

    return {
        "summary": summary,
        "feedback": _unique(feedback),
        "mistakes": mistakes[:8],
        "improvements": _unique(improvements)[:5],
        "weak_sound": weak_sound,
        "practice_words": practice_words
    }

def _unique(items):
    seen = set()
    output = []
    for item in items:
        if item and item not in seen:
            seen.add(item)
            output.append(item)
    return output
