from typing import Dict, List

# Mapping from IPA phonemes (as produced by Allosaurus) to ARPAbet phonemes (as used by CMUdict)
IPA_TO_ARPABET: Dict[str, str] = {
    # Consonants - Target diagnostic sounds
    "θ": "TH",
    "ð": "DH",
    "ʃ": "SH",
    "s": "S",
    "v": "V",
    "w": "W",
    "ɹ": "R",
    "r": "R",
    "ɻ": "R",
    "l": "L",
    "ɫ": "L",
    "tʃ": "CH",
    "t͡ʃ": "CH",
    "ʧ": "CH",

    # Other Consonants
    "t": "T",
    "d": "D",
    "p": "P",
    "b": "B",
    "k": "K",
    "g": "G",
    "ɡ": "G",
    "f": "F",
    "z": "Z",
    "ʒ": "ZH",
    "dʒ": "JH",
    "d͡ʒ": "JH",
    "ʤ": "JH",
    "m": "M",
    "n": "N",
    "ŋ": "NG",
    "h": "HH",
    "j": "Y",

    # Vowels
    "i": "IY",
    "ɪ": "IH",
    "e": "EY",
    "eɪ": "EY",
    "ɛ": "EH",
    "æ": "AE",
    "ɑ": "AA",
    "a": "AA",
    "ɔ": "AO",
    "ɒ": "AO",
    "o": "OW",
    "oʊ": "OW",
    "ʊ": "UH",
    "u": "UW",
    "ʌ": "AH",
    "ə": "AH",
    "aɪ": "AY",
    "aʊ": "AW",
    "ɔɪ": "OY",
    "ɚ": "ER",
    "ɝ": "ER",
}

# Reverse mapping: ARPAbet -> canonical IPA
ARPABET_TO_IPA: Dict[str, str] = {
    "TH": "θ",
    "DH": "ð",
    "SH": "ʃ",
    "S": "s",
    "V": "v",
    "W": "w",
    "R": "ɹ",
    "L": "l",
    "CH": "tʃ",
    "T": "t",
    "D": "d",
    "P": "p",
    "B": "b",
    "K": "k",
    "G": "ɡ",
    "F": "f",
    "Z": "z",
    "ZH": "ʒ",
    "JH": "dʒ",
    "M": "m",
    "N": "n",
    "NG": "ŋ",
    "HH": "h",
    "Y": "j",
    "IY": "i",
    "IH": "ɪ",
    "EY": "eɪ",
    "EH": "ɛ",
    "AE": "æ",
    "AA": "ɑ",
    "AO": "ɔ",
    "OW": "oʊ",
    "UH": "ʊ",
    "UW": "u",
    "AH": "ʌ",
    "AY": "aɪ",
    "AW": "aʊ",
    "OY": "ɔɪ",
    "ER": "ɝ",
}

def normalize_detected_phoneme(token: str) -> str:
    """
    Normalizes a single detected phoneme token.
    If it's in IPA, maps to ARPAbet.
    If already in ARPAbet, strips stress digits and uppercases.
    """
    clean = token.strip()
    if not clean:
        return ""

    # Check direct IPA match
    if clean in IPA_TO_ARPABET:
        return IPA_TO_ARPABET[clean]

    # Clean tie bars if any (e.g. t͡ʃ -> tʃ)
    clean_no_tie = clean.replace("\u0361", "").replace("\u035c", "")
    if clean_no_tie in IPA_TO_ARPABET:
        return IPA_TO_ARPABET[clean_no_tie]

    # Remove trailing digits for ARPAbet (e.g. IH1 -> IH)
    stripped = "".join([c for c in clean if not c.isdigit()]).upper()
    return stripped

def normalize_phoneme_sequence(tokens: List[str]) -> List[str]:
    """Normalizes a list of phoneme tokens into canonical ARPAbet format."""
    normalized = []
    for token in tokens:
        norm = normalize_detected_phoneme(token)
        if norm:
            normalized.append(norm)
    return normalized
