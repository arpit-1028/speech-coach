import re

# Multi-character IPA tokens that the Wav2Vec2 model can produce.
# Order matters: longer sequences must be checked first.
_MULTI_CHAR_IPA = [
    # Affricates
    "t\u0361\u0283", "d\u0361\u0292", "t\u0283", "d\u0292",
    # Long vowels
    "i\u02D0", "u\u02D0", "\u0251\u02D0", "\u0254\u02D0", "\u025C\u02D0r", "\u025C\u02D0",
    # Diphthongs
    "a\u026A", "a\u028A", "\u0254\u026A", "e\u026A", "o\u028A", "\u0259\u028A",
    # Common digraphs from model
    "\u014B",  # velar nasal (single char but often confused)
]

def normalize_spoken(raw_phonemes):
    """
    Takes the raw output from Wav2Vec2 (a list of IPA tokens, usually single chars)
    and recombines them into properly grouped multi-character IPA tokens.
    
    Wav2Vec2 outputs phonemes as space-separated individual characters, e.g.:
      ['\u03B8', '\u026A', '\u014B', 'k']  for 'think'
    
    But CMU dictionary gives multi-char IPA like ['\u03B8', '\u026A', '\u014B', 'k'].
    The key issue is that Wav2Vec2 sometimes splits affricates and diphthongs:
      't', '\u0283' should become 't\u0283'
      'a', '\u026A' should become 'a\u026A'
    """
    # First, join all tokens into a continuous string for greedy matching
    joined = ''.join(raw_phonemes)
    
    # Remove stress marks and whitespace
    joined = joined.replace('\u02C8', '').replace('\u02CC', '').replace(' ', '')
    
    # Greedy left-to-right tokenization
    result = []
    i = 0
    while i < len(joined):
        matched = False
        # Try longest multi-char tokens first
        for token in _MULTI_CHAR_IPA:
            if joined[i:i+len(token)] == token:
                result.append(token)
                i += len(token)
                matched = True
                break
        if not matched:
            char = joined[i]
            # Skip length marks and combining characters that are already handled
            if char not in ('\u02D0', '\u0361', '\u0320', '\u0324', '\u0325', '\u032A'):
                result.append(char)
            i += 1
    
    return result