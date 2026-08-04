import re

# Multi-character IPA tokens that the Wav2Vec2 model outputs.
# Normalized to lowercase \u026a and \u028a.
_MULTI_CHAR_IPA = [
    # Affricates
    "t\u0283", "d\u0292",
    # Long vowels
    "i\u02d0", "u\u02d0", "\u0251\u02d0", "\u0254\u02d0",
    # Diphthongs
    "a\u026a", "a\u028a", "\u0254\u026a", "e\u026a", "o\u028a", "\u0259\u028a",
]

def normalize_spoken(raw_phonemes):
    """
    Takes the raw output from Wav2Vec2 and recombines them into normalized
    multi-character IPA tokens using a greedy left-to-right approach.
    """
    # Join all tokens into a continuous string
    joined = ''.join(raw_phonemes)
    
    # Remove stress marks, whitespace, and normalize case/caps of IPA chars
    joined = joined.replace('\u02c8', '').replace('\u02cc', '').replace(' ', '')
    joined = joined.replace('\u026A', '\u026a').replace('\u028A', '\u028a')
    
    result = []
    i = 0
    while i < len(joined):
        matched = False
        for token in _MULTI_CHAR_IPA:
            if joined[i:i+len(token)] == token:
                result.append(token)
                i += len(token)
                matched = True
                break
        if not matched:
            char = joined[i]
            # Ignore standalone modifier symbols
            if char not in ('\u02d0', '\u0361', '\u0320', '\u0324', '\u0325', '\u032a'):
                result.append(char)
            i += 1
            
    return result