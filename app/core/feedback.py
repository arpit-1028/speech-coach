# ────────────────────────────────────────────────────────────────────────────
# feedback.py — Dynamic Pronunciation Feedback & Practice Generator
# Translates phonetic symbols into English & Hindi intuitive explanations.
# ────────────────────────────────────────────────────────────────────────────

IPA_TO_HUMAN = {
    "\u03b8": "th (\u0925 as in 'think')",
    "\u00f0": "dh (\u0926 as in 'this')",
    "\u0283": "sh (\u0936 as in 'ship')",
    "t\u0283": "ch (\u091a as in 'chair')",
    "d\u0292": "j (\u091c as in 'joy')",
    "\u0292": "zh (\u091c\u093c as in 'vision')",
    "\u014b": "ng (\u0902\u0917 as in 'sing')",
    "v": "v (\u0935 as in 'very')",
    "w": "w (\u0935 as in 'water')",
    "r": "r (\u0930 as in 'red')",
    "l": "l (\u0932 as in 'light')",
    "s": "s (\u0938 as in 'see')",
    "z": "z (\u091c\u093c as in 'zoo')",
    "\u00e6": "a/ae (\u0910 as in 'cat')",
    "\u028c": "u/uh (\u0905 as in 'sun')",
    "\u0259": "uh (\u0905 as in 'about')",
    "i\u02d0": "ee (\u0908 as in 'see')",
    "\u026a": "i (\u0907 as in 'sit')",
    "u\u02d0": "oo (\u090a as in 'moon')",
    "\u028a": "u (\u0909 as in 'book')",
    "\u0254\u02d0": "aw/or (\u0911 as in 'call')",
    "\u0251\u02d0": "aa (\u0906 as in 'car')",
    "\u025c\u02d0r": "ur/er (\u0905\u0930 as in 'bird')",
    "e\u026a": "ay (\u090f as in 'day')",
    "a\u026a": "eye (\u0906\u0907 as in 'my')",
    "o\u028a": "oh (\u0913 as in 'go')",
    "a\u028a": "ow (\u0906\u0909 as in 'now')",
    "\u0254\u026a": "oy (\u0911\u0907 as in 'boy')",
    "\u025b": "e (\u090f as in 'bed')",
    "p": "p (\u092a as in 'pen')",
    "b": "b (\u092c as in 'big')",
    "t": "t (\u091f as in 'time')",
    "d": "d (\u0921 as in 'day')",
    "k": "k (\u0915 as in 'cat')",
    "g": "g (\u0917 as in 'go')",
    "f": "f (\u092b as in 'five')",
    "h": "h (\u0939 as in 'home')",
    "m": "m (\u092e as in 'man')",
    "n": "n (\u0928 as in 'now')",
}

def human_label(sound: str) -> str:
    if not sound:
        return ""
    return IPA_TO_HUMAN.get(sound, sound)

PAIR_TIPS = {
    ("\u03b8", "t"): "For TH (\u0925 in 'think'), place tongue tip lightly between your teeth and blow air. Don't press tongue behind teeth like T (\u091f).",
    ("t", "\u03b8"): "You're using TH (\u0925) where T (\u091f) is expected. Press tongue firmly behind upper teeth.",
    ("\u00f0", "d"): "For voiced TH (\u0926 in 'this'), tongue between teeth with voice vibration. Don't press tongue behind teeth like D (\u0921).",
    ("d", "\u00f0"): "You're using TH (\u0926) where D (\u0921) is expected. Press tongue firmly behind upper teeth.",
    ("v", "w"): "For V (\u0935), touch upper teeth to lower lip with vibration. For W (\u0935/wa), round both lips without teeth.",
    ("w", "v"): "For W (\u0935), round both lips in an 'O' circle. For V (\u0935), upper teeth must touch lower lip.",
    ("r", "l"): "For R (\u0930), curl tongue tip back without touching roof of mouth. For L (\u0932), touch tongue tip behind upper teeth.",
    ("l", "r"): "For L (\u0932), touch tongue tip firmly behind upper teeth. For R (\u0930), curl tongue back.",
    ("s", "\u0283"): "For S (\u0938), tongue behind teeth with narrow air hissing. For SH (\u0936), tongue further back with rounded lips.",
    ("\u0283", "s"): "For SH (\u0936), pull tongue slightly back and round lips. For S (\u0938), tongue forward and lips flat.",
    ("n", "\u014b"): "For N (\u0928), tongue touches behind upper teeth. For NG (\u0902\u0917 in 'sing'), back of tongue touches soft palate.",
    ("\u014b", "n"): "For NG (\u0902\u0917 in 'sing'), raise the back of your tongue. Don't use tongue tip like N (\u0928).",
    ("\u00e6", "\u025b"): "The 'a' (\u0910 in 'cat') is more open than the 'e' (\u090f in 'bed'). Drop your jaw slightly more.",
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

    if score_value >= 85:
        summary = "Great job! Your pronunciation was clear and easy to understand."
    elif score_value >= 70:
        summary = "Good effort! Minor accent variations detected but fully understandable."
    elif score_value >= 50:
        summary = "Understandable speaking. A few specific sounds need refinement — see details below."
    else:
        summary = "Needs practice. Try speaking slowly and clearly, pronouncing each syllable."

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
        h_label = human_label(weak_sound)
        improvements.append(
            f"Focus sound: '{h_label}'. Practice with: {', '.join(practice_words[:5])}"
        )

    if not mistakes:
        feedback.append("All sounds matched the target English pronunciation.")
        improvements.append("Great articulation! Repeat once more for muscle memory.")
    else:
        counts = {}
        for item in mistakes:
            counts[item['type']] = counts.get(item['type'], 0) + 1

        if counts.get("wrong"):
            feedback.append(f"{counts['wrong']} sound(s) need clearer articulation.")
        if counts.get("close"):
            feedback.append(f"{counts['close']} sound(s) were close to the target sound.")
        if counts.get("missing"):
            feedback.append(f"{counts['missing']} ending or middle sound(s) were missing.")
            improvements.append("Finish ending sounds clearly. Don't drop final consonants.")
        if counts.get("extra"):
            feedback.append(f"{counts['extra']} extra sound(s) detected.")
            improvements.append("Keep words compact without extra vowel sounds.")

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
        "improvements": _unique(improvements)[:4],
        "weak_sound": human_label(weak_sound),
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
