from app.core.comparator import compare
from app.core.scorer import score

def find_best_match(spoken, word_dict):
    best_word = None
    best_score = -1
    best_results = None

    for word, expected in word_dict.items():
        results = compare(expected, spoken)
        s = score(results)

        if s > best_score:
            best_score = s
            best_word = word
            best_results = results

    return best_word, best_score, best_results