VOWELS = {"a", "e", "i", "o", "u", "ai", "au", "oi", "ee", "oo", "aw", "er",
          "\u026A", "i\u02D0", "\u025B", "\u00E6", "\u0251\u02D0", "\u028C", "\u0254\u02D0",
          "\u028A", "u\u02D0", "\u0259", "e\u026A", "o\u028A", "a\u026A", "a\u028A",
          "\u0254\u026A", "\u025C\u02D0r", "\u025C\u02D0", "i", "u", "a", "e", "o",
          "\u0259\u028A", "\u025A"}


def score(results):
    """
    Weighted scoring: vowels count 1.35x, consonants 1.0x.
    
    Credit per type:
      correct       = 100%
      accent_match  = 100%  (Indian English accepted variant)
      close         =  65%
      wrong         =  15%
      missing       =   0%  (but reduced weight if at word end)
      extra         =   0%  (but reduced weight always)
    
    Expected score ranges:
      Correct pronunciation     -> 90-100
      Minor mistakes             -> 80-90
      Understandable             -> 65-80
      Noticeable issues          -> 45-65
      Very poor                  -> below 45
    """
    if not results:
        return 0

    total_weight = 0.0
    earned = 0.0
    n = len(results)

    for idx, item in enumerate(results):
        kind = item["type"]
        is_vowel = item.get("sound_group") == "vowel"
        weight = 1.35 if is_vowel else 1.0

        # Reduce weight for ending missing consonants (very common in natural speech)
        if kind == "missing" and not is_vowel and idx >= n - 2:
            weight = 0.3

        # Reduce weight for extra sounds (often schwa insertions in Indian English)
        if kind == "extra":
            weight = 0.4

        total_weight += weight

        if kind == "correct":
            earned += weight * 1.0
        elif kind == "accent_match":
            earned += weight * 1.0   # Full credit for accepted accent variants
        elif kind == "close":
            earned += weight * 0.65
        elif kind == "wrong":
            earned += weight * 0.15
        # missing and extra earn 0

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
