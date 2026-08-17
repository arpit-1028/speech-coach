from difflib import SequenceMatcher

# Vowel set normalized to lowercase \u026a and \u028a.
VOWELS = {
    "a", "e", "i", "o", "u", "ai", "au", "oi", "ee", "oo", "aw", "er",
    "\u026a", "i\u02d0", "\u025b", "\u00e6", "\u0251\u02d0", "\u028c", "\u0254\u02d0",
    "\u028a", "u\u02d0", "\u0259", "e\u026a", "o\u028a", "a\u026a", "a\u028a",
    "\u0254\u026a", "\u0259\u028a", "\u025a", "i", "u", "o", "a", "e"
}

# Indian English equivalent variants (receive full credit)
ACCENT_ACCEPTED = {
    # TH replacements
    ("\u03b8", "t"), ("t", "\u03b8"),
    ("\u00f0", "d"), ("d", "\u00f0"),
    # V/W confusion
    ("v", "w"), ("w", "v"),
    # Retroflex / alveolar stops
    ("d", "\u0256"), ("\u0256", "d"),
    ("t", "\u0288"), ("\u0288", "t"),
    # Liquids
    ("\u0279", "r"), ("r", "\u0279"),
    ("\u027e", "r"), ("r", "\u027e"),
    # Schwa adjustments
    ("\u0259", "\u028c"), ("\u028c", "\u0259"),
    ("\u0259", "\u0251\u02d0"), ("\u0251\u02d0", "\u0259"),
    ("\u0259", "a"), ("a", "\u0259"),
    ("\u028c", "a"), ("a", "\u028c"),
    ("\u028c", "\u0251\u02d0"), ("\u0251\u02d0", "\u028c"),
    # Length neutralization
    ("\u026a", "i\u02d0"), ("i\u02d0", "\u026a"),
    ("\u028a", "u\u02d0"), ("u\u02d0", "\u028a"),
    ("i", "i\u02d0"), ("i\u02d0", "i"),
    ("u", "u\u02d0"), ("u\u02d0", "u"),
    ("\u0254\u02d0", "o"), ("o", "\u0254\u02d0"),
}

# Acoustically close pairs (receive partial credit 65%)
SIMILAR = {
    ("t", "d"), ("d", "t"),
    ("p", "b"), ("b", "p"),
    ("k", "g"), ("g", "k"),
    ("f", "v"), ("v", "f"),
    ("s", "z"), ("z", "s"),
    ("\u0283", "\u0292"), ("\u0292", "\u0283"),
    ("s", "\u0283"), ("\u0283", "s"),
    ("z", "\u0292"), ("\u0292", "z"),
    ("f", "\u03b8"), ("\u03b8", "f"),
    ("\u03b8", "s"), ("s", "\u03b8"),
    ("\u00f0", "z"), ("z", "\u00f0"),
    ("t\u0283", "\u0283"), ("\u0283", "t\u0283"),
    ("d\u0292", "\u0292"), ("\u0292", "d\u0292"),
    ("t\u0283", "t"), ("t", "t\u0283"),
    ("d\u0292", "d"), ("d", "d\u0292"),
    ("n", "\u014b"), ("\u014b", "n"),
    ("m", "n"), ("n", "m"),
    ("r", "l"), ("l", "r"),
    ("\u00e6", "\u025b"), ("\u025b", "\u00e6"),
    ("\u00e6", "a"), ("a", "\u00e6"),
    ("e\u026a", "\u025b"), ("\u025b", "e\u026a"),
    ("o\u028a", "\u0254\u02d0"), ("\u0254\u02d0", "o\u028a"),
    ("o\u028a", "o"), ("o", "o\u028a"),
    ("e\u026a", "e"), ("e", "e\u026a"),
    ("h", ""),
}

def compare(expected, spoken, accent="indian"):
    """
    Compares two lists of IPA tokens using SequenceMatcher.
    Returns results mapping types: correct, accent_match, close, wrong, missing, extra.
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

IPA_MAP = {
    "\u03b8": "th (\u0925)", "\u00f0": "dh (\u0926)", "\u0283": "sh (\u0936)", "t\u0283": "ch (\u091a)",
    "d\u0292": "j (\u091c)", "\u0292": "zh (\u091c\u093c)", "\u014b": "ng (\u0902\u0917)", "v": "v (\u0935)",
    "w": "w (\u0935)", "r": "r (\u0930)", "l": "l (\u0932)", "s": "s (\u0938)", "z": "z (\u091c\u093c)",
    "\u00e6": "a/ae (\u0910)", "\u028c": "u/uh (\u0905)", "\u0259": "uh (\u0905)", "i\u02d0": "ee (\u0908)",
    "\u026a": "i (\u0907)", "u\u02d0": "oo (\u090a)", "\u028a": "u (\u0909)", "\u0254\u02d0": "aw (\u0911)",
    "\u0251\u02d0": "aa (\u0906)", "\u025c\u02d0r": "ur/er (\u0905\u0930)", "e\u026a": "ay (\u090f)",
    "a\u026a": "eye (\u0906\u0907)", "o\u028a": "oh (\u0913)", "a\u028a": "ow (\u0906\u0909)", "\u0254\u026a": "oy (\u0911\u0907)",
    "\u025b": "e (\u090f)", "p": "p (\u092a)", "b": "b (\u092c)", "t": "t (\u091f)", "d": "d (\u0921)",
    "k": "k (\u0915)", "g": "g (\u0917)", "f": "f (\u092b)", "h": "h (\u0939)", "m": "m (\u092e)", "n": "n (\u0928)"
}

def _h(s):
    if not s:
        return ""
    return IPA_MAP.get(s, s)

def _tip(kind, expected, spoken):
    exp_h = _h(expected)
    spk_h = _h(spoken)
    if kind == "correct":
        return "Clear sound."
    if kind == "accent_match":
        return f"Accepted Indian English variation. '{exp_h}' pronounced as '{spk_h}' is fine."
    if kind == "close":
        return f"Close sound. Expected '{exp_h}', heard '{spk_h}'. Slow down and articulate clearly."
    if kind == "missing":
        return f"Missing sound '{exp_h}'. Complete this sound before moving to next."
    if kind == "extra":
        return f"Extra sound '{spk_h}' detected. Keep the word compact."
    return f"Expected '{exp_h}', heard '{spk_h}'. Practice this sound slowly."

