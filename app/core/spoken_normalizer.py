def normalize_spoken(phonemes):
    """
    Cleans spoken phonemes by removing stress marks (ˈ, ˌ) 
    that could interfere with alignment.
    """
    result = []
    for p in phonemes:
        p_clean = p.replace("ˈ", "").replace("ˌ", "").replace(" ", "").strip()
        if p_clean:
            result.append(p_clean)
    return result