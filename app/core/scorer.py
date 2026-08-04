# Vowel set normalized to lowercase \u026a and \u028a.
VOWELS = {
    "a", "e", "i", "o", "u", "ai", "au", "oi", "ee", "oo", "aw", "er",
    "\u026a", "i\u02d0", "\u025b", "\u00e6", "\u0251\u02d0", "\u028c", "\u0254\u02d0",
    "\u028a", "u\u02d0", "\u0259", "e\u026a", "o\u028a", "a\u026a", "a\u028a",
    "\u0254\u026a", "\u0259\u028a", "\u025a", "i", "u", "o", "a", "e"
}

def score(results):
    if not results:
        return 0

    total_weight = 0.0
    earned = 0.0
    n = len(results)

    for idx, item in enumerate(results):
        kind = item["type"]
        is_vowel = item.get("sound_group") == "vowel"
        weight = 1.35 if is_vowel else 1.0

        # Reduce weight for ending missing consonants
        if kind == "missing" and not is_vowel and idx >= n - 2:
            weight = 0.3

        # Reduce weight for extra sounds
        if kind == "extra":
            weight = 0.4

        total_weight += weight

        if kind == "correct":
            earned += weight * 1.0
        elif kind == "accent_match":
            earned += weight * 1.0
        elif kind == "close":
            earned += weight * 0.65
        elif kind == "wrong":
            earned += weight * 0.15

    if total_weight == 0:
        return 0

    raw = (earned / total_weight) * 100
    return min(100, max(0, round(raw)))

def score_breakdown(results):
    buckets = {
        "correct": 0,
        "accent_match": 0,
        "close": 0,
        "wrong": 0,
        "missing": 0,
        "extra": 0,
        "vowel_issues": 0,
        "consonant_issues": 0,
    }

    for item in results:
        kind = item["type"]
        if kind in buckets:
            buckets[kind] += 1
        if kind not in {"correct", "accent_match"}:
            key = "vowel_issues" if item.get("sound_group") == "vowel" else "consonant_issues"
            buckets[key] += 1

    return buckets
