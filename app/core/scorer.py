VOWELS_IPA = {
    "iː", "ɪ", "ɛ", "æ", "ɑː", "ʌ", "ɔː", "ʊ", "uː", "ə",
    "eɪ", "oʊ", "aɪ", "aʊ", "ɔɪ", "ɜːr", "ɜː", "i", "u", "y"
}

def score(results):
    """
    Weighted scoring algorithm based on alignment results:
    - 40% Pronunciation Accuracy
    - 20% Vowel Accuracy
    - 20% Consonant Accuracy
    - 10% Stress / Vowel emphasis
    - 10% Fluency (penalized by deletions/insertions)
    
    Tolerates ending consonant deletions and scales penalties for minor accent variations.
    """
    if not results:
        return 0

    n_results = len(results)
    
    # 1. Pronunciation Accuracy Score
    total_pr_weight = 0.0
    earned_pr = 0.0

    for idx, item in enumerate(results):
        kind = item["type"]
        is_vowel = item.get("sound_group") == "vowel"
        
        weight = 1.35 if is_vowel else 1.0
        
        # Ending Consonant Penalty Reduction:
        # If the sound is missing, is a consonant, and lies at the end of the word, reduce the penalty.
        if kind == "missing" and not is_vowel and (idx >= n_results - 2):
            weight = 0.25  # End consonants deletions do not destroy the score.
            
        total_pr_weight += weight
        
        if kind == "correct":
            earned_pr += weight
        elif kind == "accent_match":
            earned_pr += weight * 0.96  # Acceptable Indian accent variation
        elif kind == "close":
            earned_pr += weight * 0.78  # Close sound
        elif kind == "wrong":
            earned_pr += weight * 0.20  # Incorrect sound
            
    pr_score = (earned_pr / max(0.1, total_pr_weight)) * 100

    # 2. Vowel Accuracy & 3. Consonant Accuracy
    total_v_weight = 0.0
    earned_v = 0.0
    total_c_weight = 0.0
    earned_c = 0.0

    for idx, item in enumerate(results):
        kind = item["type"]
        is_vowel = item.get("sound_group") == "vowel"
        
        if is_vowel:
            total_v_weight += 1.0
            if kind == "correct":
                earned_v += 1.0
            elif kind == "accent_match":
                earned_v += 0.96
            elif kind == "close":
                earned_v += 0.75
            elif kind == "wrong":
                earned_v += 0.15
        else:
            weight = 1.0
            if kind == "missing" and (idx >= n_results - 2):
                weight = 0.25
            total_c_weight += weight
            if kind == "correct":
                earned_c += weight
            elif kind == "accent_match":
                earned_c += 0.96
            elif kind == "close":
                earned_c += 0.75
            elif kind == "wrong":
                earned_c += 0.15

    v_score = (earned_v / max(1.0, total_v_weight)) * 100 if total_v_weight > 0 else 100.0
    c_score = (earned_c / max(1.0, total_c_weight)) * 100 if total_c_weight > 0 else 100.0

    # 4. Stress Score (estimated based on vowel accuracy)
    stress_score = v_score

    # 5. Fluency Score (penalized by deletions/insertions/hesitations)
    n_deletions = sum(1 for item in results if item["type"] == "missing")
    n_insertions = sum(1 for item in results if item["type"] == "extra")
    fluency_penalty = (n_deletions * 6.5) + (n_insertions * 5.0)
    fluency_score = max(40.0, 100.0 - fluency_penalty)

    # Weighted Overall Score
    overall_score = (
        (pr_score * 0.40) +
        (v_score * 0.20) +
        (c_score * 0.20) +
        (stress_score * 0.10) +
        (fluency_score * 0.10)
    )

    return min(100, max(0, round(overall_score)))

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
