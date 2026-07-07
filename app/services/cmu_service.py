import nltk
import re
import itertools
from nltk.corpus import cmudict

# Automatically download cmudict if not present on the deployment server
try:
    nltk.data.find('corpora/cmudict')
except LookupError:
    nltk.download('cmudict')

d = cmudict.dict()

CMU_TO_IPA = {
    "P": "p", "B": "b", "T": "t", "D": "d", "K": "k", "G": "g",
    "F": "f", "V": "v", "TH": "θ", "DH": "ð", "S": "s", "Z": "z",
    "SH": "ʃ", "ZH": "ʒ", "CH": "tʃ", "JH": "dʒ",
    "M": "m", "N": "n", "NG": "ŋ", "L": "l", "R": "r",
    "W": "w", "Y": "j", "HH": "h",
    "IY": "iː", "IH": "ɪ", "EH": "ɛ", "AE": "æ", "AA": "ɑː",
    "AH": "ʌ", "AO": "ɔː", "UH": "ʊ", "UW": "uː", "AX": "ə",
    "EY": "eɪ", "OW": "oʊ", "AY": "aɪ", "AW": "aʊ", "OY": "ɔɪ",
    "ER": "ɜːr",
}

def get_phonemes(phrase: str):
    phrase = phrase.lower()
    # Strip punctuation and keep only letters and spaces
    clean_phrase = re.sub(r'[^a-z\s]', '', phrase)
    words = clean_phrase.split()
    
    all_phonemes = []
    for word in words:
        if word in d:
            # Add the first pronunciation variant of the word
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
            # list of all pronunciation variants for this word
            words_variants.append(d[word])
        else:
            # Fallback to single word pronunciation or spelling proxy if not in dict
            fallback = get_phonemes(word)
            if fallback:
                words_variants.append([fallback])
            else:
                # simple spelling to phoneme fallback
                words_variants.append([[char.upper() for char in word if char.upper() in CMU_TO_IPA]])
                
    # Generate Cartesian product of all possible word-level pronunciations
    product = list(itertools.product(*words_variants))
    
    # Flatten each product tuple into a single phoneme list
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
        # Strip any stress numbers like IY1 -> IY, ER0 -> ER
        ph_clean = re.sub(r'\d+', '', ph).upper()
        if ph_clean in CMU_TO_IPA:
            ipa_list.append(CMU_TO_IPA[ph_clean])
        else:
            # fallback to lowercase representation
            ipa_list.append(ph.lower())
    return ipa_list