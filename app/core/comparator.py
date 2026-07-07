import re

VOWELS_IPA = {
    "iː", "ɪ", "ɛ", "æ", "ɑː", "ʌ", "ɔː", "ʊ", "uː", "ə",
    "eɪ", "oʊ", "aɪ", "aʊ", "ɔɪ", "ɜːr", "ɜː", "i", "u", "y"
}

ACCENT_ACCEPTED_IPA = {
    ("v", "w"),
    ("w", "v"),
    ("θ", "t"),
    ("t", "θ"),
    ("ð", "d"),
    ("d", "ð"),
    ("ɹ", "r"),
    ("r", "ɹ"),
    ("r", "ɾ"),
    ("ɾ", "r"),
    ("d", "ɖ"),
    ("ɖ", "d"),
    ("t", "ʈ"),
    ("ʈ", "t"),
    ("ə", "ʌ"),
    ("ʌ", "ə"),
    ("ə", "ɑː"),
    ("ɑː", "ə"),
    ("ə", "a"),
    ("a", "ə"),
}

CLOSE_ACCEPTED_IPA = {
    # Vowels
    ("æ", "ɛ"), ("ɛ", "æ"),
    ("ɑː", "ʌ"), ("ʌ", "ɑː"),
    ("ɪ", "iː"), ("iː", "ɪ"),
    ("ʊ", "uː"), ("uː", "ʊ"),
    ("ɔː", "ɒ"), ("ɒ", "ɔː"),
    ("eɪ", "ɛ"), ("ɛ", "eɪ"),
    ("oʊ", "ɔː"), ("ɔː", "oʊ"),
    
    # Consonants
    ("p", "f"), ("f", "p"),
    ("b", "v"), ("v", "b"),
    ("s", "ʃ"), ("ʃ", "s"),
    ("z", "dʒ"), ("dʒ", "z"),
    ("n", "ŋ"), ("ŋ", "n"),
}

def compare(expected, spoken, accent="indian"):
    """
    Perform needleman-wunsch dynamic programming alignment for phoneme matching.
    Provides precise alignment with custom scoring logic for Indian accent awareness.
    """
    n = len(expected)
    m = len(spoken)
    
    # DP table storing alignment costs
    dp = [[0.0] * (m + 1) for _ in range(n + 1)]
    
    # Base cases
    for i in range(1, n + 1):
        dp[i][0] = dp[i-1][0] + 1.0
    for j in range(1, m + 1):
        dp[0][j] = dp[0-1][j] + 1.0
        
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            exp = expected[i-1]
            spk = spoken[j-1]
            
            # Custom accent-aware substitution costs
            if exp == spk:
                sub_cost = 0.0
            elif _is_accent_match(exp, spk, accent):
                sub_cost = 0.08  # Very low cost for natural accent variants
            elif _is_close_match(exp, spk):
                sub_cost = 0.32  # Small penalty for close sounds
            else:
                sub_cost = 1.0   # Full penalty for incorrect sounds
                
            match_cost = dp[i-1][j-1] + sub_cost
            del_cost = dp[i-1][j] + 1.0
            ins_cost = dp[i][j-1] + 1.0
            
            dp[i][j] = min(match_cost, del_cost, ins_cost)
            
    # Backtrack to construct optimal alignment
    alignment = []
    i, j = n, m
    while i > 0 or j > 0:
        if i > 0 and j > 0:
            exp = expected[i-1]
            spk = spoken[j-1]
            
            if exp == spk:
                sub_cost = 0.0
                op = "correct"
            elif _is_accent_match(exp, spk, accent):
                sub_cost = 0.08
                op = "accent_match"
            elif _is_close_match(exp, spk):
                sub_cost = 0.32
                op = "close"
            else:
                sub_cost = 1.0
                op = "wrong"
                
            if abs(dp[i][j] - (dp[i-1][j-1] + sub_cost)) < 1e-4:
                alignment.append((op, exp, spk))
                i -= 1
                j -= 1
                continue
                
        if i > 0 and abs(dp[i][j] - (dp[i-1][j] + 1.0)) < 1e-4:
            alignment.append(("missing", expected[i-1], None))
            i -= 1
        elif j > 0:
            alignment.append(("extra", None, spoken[j-1]))
            j -= 1
            
    alignment.reverse()
    
    # Map raw alignment to standard result objects
    results = []
    for op, exp, spk in alignment:
        results.append(_item(op, exp, spk))
        
    return results

def _is_accent_match(a, b, accent):
    if accent not in {"indian", "auto"}:
        return False
    return (a, b) in ACCENT_ACCEPTED_IPA or (b, a) in ACCENT_ACCEPTED_IPA

def _is_close_match(a, b):
    return (a, b) in CLOSE_ACCEPTED_IPA or (b, a) in CLOSE_ACCEPTED_IPA

def _item(kind, expected, spoken):
    sound = expected or spoken or ""
    return {
        "type": kind,
        "expected": expected,
        "spoken": spoken,
        "sound_group": "vowel" if sound in VOWELS_IPA else "consonant",
        "tip": _tip(kind, expected, spoken),
    }

def _tip(kind, expected, spoken):
    if kind == "correct":
        return "Clear sound."
    if kind == "accent_match":
        return f"Accepted variation. Correct Indian English pronunciation pattern for '{expected}'."
    if kind == "close":
        return f"Close sound. Expected '{expected}', heard '{spoken}'. Try speaking slowly to separate these vowels."
    if kind == "missing":
        return f"Missing '{expected}'. Ensure you finish this sound before moving to the next word."
    if kind == "extra":
        return f"Extra '{spoken}' sound. Keep pronunciation tight and clean."
    return f"Expected '{expected}', heard '{spoken}'. Practice making this sound clearly."
