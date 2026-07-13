# Dynamic Pronunciation Feedback & Practice Generator in lowercase IPA.

PAIR_TIPS = {
    ("\u03b8", "t"): "For TH (as in 'think'), place tongue tip lightly between your teeth and blow air. Don't press tongue behind teeth like T.",
    ("t", "\u03b8"): "You're using TH where T is expected. Press tongue firmly behind upper teeth.",
    ("\u00f0", "d"): "For TH (as in 'this'), tongue between teeth with voice. Don't press tongue behind teeth like D.",
    ("d", "\u00f0"): "You're using TH where D is expected. Press tongue firmly behind upper teeth.",
    ("v", "w"): "For V, touch upper teeth to lower lip and vibrate. For W, round both lips without teeth.",
    ("w", "v"): "For W, round both lips. For V, upper teeth touch lower lip.",
    ("r", "l"): "For R, curl tongue tip back without touching roof. For L, touch tongue tip behind upper teeth.",
    ("l", "r"): "For L, touch tongue tip behind upper teeth. For R, curl tongue back.",
    ("s", "\u0283"): "For S, tongue behind teeth with narrow air stream. For SH, tongue further back with wider stream.",
    ("\u0283", "s"): "For SH, pull tongue slightly back and round lips. For S, tongue forward and lips flat.",
    ("n", "\u014b"): "For N, tongue touches behind upper teeth. For NG, back of tongue touches soft palate.",
    ("\u014b", "n"): "For NG (as in 'sing'), raise the back of tongue. Don't use tongue tip like N.",
    ("\u00e6", "\u025b"): "The 'a' in 'cat' is more open than the 'e' in 'bet'. Drop your jaw more.",
}

PRACTICE_DB = {
    "\u03b8": ["think", "thank", "through", "thirty", "three", "thought", "thin"],
    "\u00f0": ["this", "that", "there", "then", "their", "mother", "weather"],
    "v": ["very", "voice", "visit", "value", "view", "village", "seven"],
    "w": ["water", "world", "work", "where", "write", "want", "week"],
    "r": ["red", "right", "river", "road", "rain", "read", "room"],
    "l": ["light", "learn", "large", "live", "look", "long", "last"],
    "\u00e6": ["cat", "bat", "mat", "hat", "black", "back", "map"],
    "\u0283": ["she", "show", "ship", "short", "shine", "shoe", "share"],
    "t\u0283": ["chair", "check", "change", "cheap", "choose", "church", "catch"],
    "d\u0292": ["job", "join", "joy", "juice", "large", "judge", "bridge"],
    "\u014b": ["sing", "ring", "song", "long", "king", "thing", "morning"],
    "s": ["see", "sit", "sun", "some", "set", "six", "soon"],
    "z": ["zoo", "zero", "zone", "zip", "buzz", "because", "prize"],
    "\u026a": ["sit", "bit", "fit", "hit", "lip", "ship", "win"],
    "i\u02d0": ["see", "free", "tree", "green", "team", "deep", "keep"],
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

    if score_value >= 90:
        summary = "Excellent pronunciation! Clear and confident speaking."
    elif score_value >= 80:
        summary = "Great job. Minor accent variations detected but fully understandable."
    elif score_value >= 65:
        summary = "Good pronunciation. A few sounds need attention — see details below."
    elif score_value >= 45:
        summary = "Understandable but noticeable mistakes. Slow down and focus on highlighted sounds."
    else:
        summary = "Needs significant practice. Try speaking slowly and clearly, one syllable at a time."

    weak_sound = ""
    weak_counts = {}
    for item in mistakes:
        exp = item.get("expected")
        if exp:
            weak_counts[exp] = weak_counts.get(exp, 0) + 1
    if weak_counts:
        weak_sound = max(weak_counts, key=weak_counts.get)

    practice_words = PRACTICE_DB.get(weak_sound, [])
    if practice_words:
        improvements.append(
            f"Your weakest sound is '{weak_sound}'. Practice: {', '.join(practice_words[:5])}"
        )

    if not mistakes:
        feedback.append("All sounds match the target pronunciation.")
        improvements.append("Great work! Repeat for muscle memory.")
    else:
        counts = {}
        for item in mistakes:
            counts[item['type']] = counts.get(item['type'], 0) + 1

        if counts.get("wrong"):
            feedback.append(f"{counts['wrong']} sound(s) pronounced incorrectly.")
        if counts.get("close"):
            feedback.append(f"{counts['close']} sound(s) close but not exact.")
        if counts.get("missing"):
            feedback.append(f"{counts['missing']} expected sound(s) missing.")
            improvements.append("Finish ending sounds clearly. Don't swallow final consonants.")
        if counts.get("extra"):
            feedback.append(f"{counts['extra']} extra sound(s) detected.")
            improvements.append("Avoid adding vowel sounds between consonants.")

        for item in mistakes[:4]:
            pair = (item.get("expected"), item.get("spoken"))
            if pair in PAIR_TIPS:
                improvements.append(PAIR_TIPS[pair])
            elif item.get("tip") and item["tip"] != "Clear sound.":
                improvements.append(item["tip"])

    return {
        "summary": summary,
        "feedback": _unique(feedback),
        "mistakes": mistakes[:8],
        "improvements": _unique(improvements)[:5],
        "weak_sound": weak_sound,
        "practice_words": practice_words[:5]
    }

def _unique(items):
    seen = set()
    output = []
    for item in items:
        if item and item not in seen:
            seen.add(item)
            output.append(item)
    return output
