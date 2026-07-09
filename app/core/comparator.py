from difflib import SequenceMatcher

VOWELS = {"a", "e", "i", "o", "u", "ai", "au", "oi", "ee", "oo", "aw", "er",
          "\u026A", "i\u02D0", "\u025B", "\u00E6", "\u0251\u02D0", "\u028C", "\u0254\u02D0",
          "\u028A", "u\u02D0", "\u0259", "e\u026A", "o\u028A", "a\u026A", "a\u028A",
          "\u0254\u026A", "\u025C\u02D0r", "\u025C\u02D0", "i", "u", "a", "e", "o",
          "\u0259\u028A", "\u025A"}

# Pairs that are equivalent in Indian English (full credit)
ACCENT_ACCEPTED = {
    # TH sounds
    ("\u03B8", "t"), ("t", "\u03B8"),
    ("\u00F0", "d"), ("d", "\u00F0"),
    ("\u03B8", "\u03B8"), ("\u00F0", "\u00F0"),
    # V/W confusion
    ("v", "w"), ("w", "v"),
    # R variants
    ("\u0279", "r"), ("r", "\u0279"),
    ("\u027E", "r"), ("r", "\u027E"),
    ("\u027E", "\u0279"), ("\u0279", "\u027E"),
    # Retroflex (Indian English)
    ("d", "\u0256"), ("\u0256", "d"),
    ("t", "\u0288"), ("\u0288", "t"),
    # Schwa variations
    ("\u0259", "\u028C"), ("\u028C", "\u0259"),
    ("\u0259", "\u0251\u02D0"), ("\u0251\u02D0", "\u0259"),
    ("\u0259", "a"), ("a", "\u0259"),
    ("\u028C", "a"), ("a", "\u028C"),
    ("\u028C", "\u0251\u02D0"), ("\u0251\u02D0", "\u028C"),
    # Vowel length (Indian English often neutralizes length)
    ("\u026A", "i\u02D0"), ("i\u02D0", "\u026A"),
    ("\u028A", "u\u02D0"), ("u\u02D0", "\u028A"),
    ("i", "i\u02D0"), ("i\u02D0", "i"),
    ("u", "u\u02D0"), ("u\u02D0", "u"),
    ("i", "\u026A"), ("\u026A", "i"),
    ("u", "\u028A"), ("\u028A", "u"),
    ("\u0254\u02D0", "o"), ("o", "\u0254\u02D0"),
}

# Pairs that are acoustically close (partial credit ~65%)
SIMILAR = {
    # Stop voicing
    ("t", "d"), ("d", "t"),
    ("p", "b"), ("b", "p"),
    ("k", "g"), ("g", "k"),
    # Fricative voicing
    ("f", "v"), ("v", "f"),
    ("s", "z"), ("z", "s"),
    ("\u0283", "\u0292"), ("\u0292", "\u0283"),
    # Fricative place
    ("s", "\u0283"), ("\u0283", "s"),
    ("z", "\u0292"), ("\u0292", "z"),
    ("f", "\u03B8"), ("\u03B8", "f"),
    ("\u03B8", "s"), ("s", "\u03B8"),
    ("\u00F0", "z"), ("z", "\u00F0"),
    # Affricate/fricative
    ("t\u0283", "\u0283"), ("\u0283", "t\u0283"),
    ("d\u0292", "\u0292"), ("\u0292", "d\u0292"),
    ("t\u0283", "t"), ("t", "t\u0283"),
    ("d\u0292", "d"), ("d", "d\u0292"),
    # Nasal place
    ("n", "\u014B"), ("\u014B", "n"),
    ("m", "n"), ("n", "m"),
    ("m", "\u014B"), ("\u014B", "m"),
    # Liquid
    ("r", "l"), ("l", "r"),
    # Vowel neighbors
    ("\u00E6", "\u025B"), ("\u025B", "\u00E6"),
    ("\u00E6", "a"), ("a", "\u00E6"),
    ("\u025B", "e"), ("e", "\u025B"),
    ("e\u026A", "\u025B"), ("\u025B", "e\u026A"),
    ("o\u028A", "\u0254\u02D0"), ("\u0254\u02D0", "o\u028A"),
    ("o\u028A", "o"), ("o", "o\u028A"),
    ("e\u026A", "e"), ("e", "e\u026A"),
    # Glide/vowel
    ("w", "u"), ("u", "w"),
    ("j", "i"), ("i", "j"),
    # H-dropping (common)
    ("h", ""),
}


def compare(expected, spoken, accent="indian"):
    """
    Compare expected and spoken phoneme lists using SequenceMatcher alignment.
    Classify each aligned pair into: correct, accent_match, close, wrong, missing, extra.
    """
    results = []
    matcher = SequenceMatcher(None, expected, spoken)

    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            for offset in range(i2 - i1):
                exp = expected[i1 + offset]
                spk = spoken[j1 + offset]
                results.append(_item("correct", exp, spk))
        elif tag == "replace":
            max_len = max(i2 - i1, j2 - j1)
            for offset in range(max_len):
                exp = expected[i1 + offset] if i1 + offset < i2 else None
                spk = spoken[j1 + offset] if j1 + offset < j2 else None
                results.append(_classify(exp, spk, accent))
        elif tag == "delete":
            for index in range(i1, i2):
                results.append(_item("missing", expected[index], None))
        elif tag == "insert":
            for index in range(j1, j2):
                results.append(_item("extra", None, spoken[index]))

    return results


def _classify(expected, spoken, accent):
    if expected and spoken and expected == spoken:
        return _item("correct", expected, spoken)

    if expected and spoken and _is_accent_match(expected, spoken, accent):
        return _item("accent_match", expected, spoken)

    if expected and spoken and _is_similar(expected, spoken):
        return _item("close", expected, spoken)

    if expected and spoken:
        return _item("wrong", expected, spoken)

    if expected:
        return _item("missing", expected, None)

    return _item("extra", None, spoken)


def _item(kind, expected, spoken):
    sound = expected or spoken or ""
    return {
        "type": kind,
        "expected": expected,
        "spoken": spoken,
        "sound_group": "vowel" if sound in VOWELS else "consonant",
        "tip": _tip(kind, expected, spoken),
    }


def _is_similar(left, right):
    return (left, right) in SIMILAR or (right, left) in SIMILAR


def _is_accent_match(expected, spoken, accent):
    if accent not in {"indian", "auto"}:
        return False
    return (expected, spoken) in ACCENT_ACCEPTED or (spoken, expected) in ACCENT_ACCEPTED


def _tip(kind, expected, spoken):
    if kind == "correct":
        return "Clear sound."
    if kind == "accent_match":
        return f"Accepted Indian English variation. '{expected}' pronounced as '{spoken}' is fine."
    if kind == "close":
        return f"Close sound. Expected '{expected}', heard '{spoken}'. Slow down and exaggerate the target sound."
    if kind == "missing":
        return f"Missing '{expected}'. Complete this sound before moving to the next."
    if kind == "extra":
        return f"Extra '{spoken}' detected. Keep the word compact."
    return f"Expected '{expected}', heard '{spoken}'. Practice this sound pair slowly."
