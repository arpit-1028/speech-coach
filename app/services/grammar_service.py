import json
import random


def load_sentences(level="easy"):

    with open(f"app/grammar/{level}.json", "r") as f:
        return json.load(f)


def get_random_sentence(level="easy"):

    sentences = load_sentences(level)

    return random.choice(sentences)


def get_sentence_by_id(level, sentence_id):

    sentences = load_sentences(level)

    for sentence in sentences:
        if sentence["id"] == sentence_id:
            return sentence

    return None


if __name__ == "__main__":
    print(get_random_sentence())
    print(get_sentence_by_id("easy", 3))