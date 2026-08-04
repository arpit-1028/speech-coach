import nltk
import re
import itertools
from nltk.corpus import cmudict

try:
    nltk.data.find('corpora/cmudict')
except LookupError:
    nltk.download('cmudict')

d = cmudict.dict()

CMU_TO_IPA = {
    "P": "p", "B": "b", "T": "t", "D": "d", "K": "k", "G": "g",
    "F": "f", "V": "v", "TH": "\u03b8", "DH": "\u00f0", "S": "s", "Z": "z",
    "SH": "\u0283", "ZH": "\u0292", "CH": "t\u0283", "JH": "d\u0292",
    "M": "m", "N": "n", "NG": "\u014b", "L": "l", "R": "r",
    "W": "w", "Y": "j", "HH": "h",
    "IY": "i\u02d0", "IH": "\u026a", "EH": "\u025b", "AE": "\u00e6", "AA": "\u0251\u02d0",
    "AH": "\u028c", "AO": "\u0254\u02d0", "UH": "\u028a", "UW": "u\u02d0", "AX": "\u0259",
    "EY": "e\u026a", "OW": "o\u028a", "AY": "a\u026a", "AW": "a\u028a", "OY": "\u0254\u026a",
    "ER": "\u025c\u02d0r",
}

def get_phonemes(phrase: str):
    phrase = phrase.lower()
    clean_phrase = re.sub(r'[^a-z\s]', '', phrase)
    words = clean_phrase.split()
    
    all_phonemes = []
    for word in words:
        if word in d:
            all_phonemes.extend(d[word][0])
    return all_phonemes

def get_phonemes_variants(phrase: str):
    phrase = phrase.lower()
    clean_phrase = re.sub(r'[^a-z\s]', '', phrase)
    words = clean_phrase.split()
    
    if not words:
        return [[]]
        
    words_variants = []
    for word in words:
        if word in d:
            words_variants.append(d[word])
        else:
            fallback = get_phonemes(word)
            if fallback:
                words_variants.append([fallback])
            else:
                words_variants.append([[char.upper() for char in word if char.upper() in CMU_TO_IPA]])
                
    product = list(itertools.product(*words_variants))
    variants = []
    for prod in product:
        flat = []
        for word_phonemes in prod:
            flat.extend(word_phonemes)
        variants.append(flat)
    return variants

def cmu_to_ipa(cmu_list):
    ipa_list = []
    for ph in cmu_list:
        ph_clean = re.sub(r'\d+', '', ph).upper()
        if ph_clean in CMU_TO_IPA:
            val = CMU_TO_IPA[ph_clean]
            # Normalize key to lowercase \u026a and \u028a
            val = val.replace("\u026A", "\u026a").replace("\u028A", "\u028a")
            ipa_list.append(val)
        else:
            ipa_list.append(ph.lower())
    return ipa_list