import re

def normalize(phonemes, mapping):
    result = []
    for p in phonemes:
        # remove stress numbers (AE1 → AE)
        p = re.sub(r'\d', '', p)

        if p in mapping:
            result.append(mapping[p])
    return result