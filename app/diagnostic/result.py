from collections import defaultdict
from app.diagnostic.skill_map import SKILL_DISPLAY


def calculate_skill_scores(word_results):

    grouped = defaultdict(list)

    for item in word_results:
        grouped[item["skill"]].append(item["score"])

    final_scores = {}

    for skill, scores in grouped.items():

        if not scores:
            continue

        avg = sum(scores) / len(scores)

        final_scores[skill] = round(avg * 100)

    return final_scores



def get_strengths(scores):

    strengths = []

    for skill, value in scores.items():

        if value >= 80:

            strengths.append(
                SKILL_DISPLAY.get(skill, skill)
            )

    return strengths[:5]


def get_weaknesses(scores):

    weaknesses = []

    for skill, value in scores.items():

        if value < 70:

            weaknesses.append(
                SKILL_DISPLAY.get(skill, skill)
            )

    return weaknesses

def get_learning_path(scores):

    path = []

    ordered = sorted(
        scores.items(),
        key=lambda x: x[1]
    )

    for skill, value in ordered:

        if value < 70:

            path.append(
                f"Practice {SKILL_DISPLAY.get(skill, skill)}"
            )

    return path

def generate_report(word_results):

    pronunciation_scores = calculate_skill_scores(
        word_results
    )

    overall_score = 0

    if pronunciation_scores:
        overall_score = round(
            sum(pronunciation_scores.values())
            / len(pronunciation_scores)
        )



        best_skill_key = max(
        pronunciation_scores,
        key=pronunciation_scores.get
    )

    weakest_skill_key = min(
        pronunciation_scores,
        key=pronunciation_scores.get
    )

    best_skill = SKILL_DISPLAY.get(
        best_skill_key,
        best_skill_key
    )

    weakest_skill = SKILL_DISPLAY.get(
        weakest_skill_key,
        weakest_skill_key
    )





    if pronunciation_scores:
        best_skill = max(
            pronunciation_scores,
            key=pronunciation_scores.get
        )

        weakest_skill = min(
            pronunciation_scores,
            key=pronunciation_scores.get
        )

    report = {
        "overall_score": overall_score,
        "pronunciation_scores": pronunciation_scores,
        "strengths": get_strengths(
            pronunciation_scores
        ),
        "weaknesses": get_weaknesses(
            pronunciation_scores
        ),
        "recommended_learning_path":
            get_learning_path(
                pronunciation_scores
            ),
        "best_skill": best_skill,
        "weakest_skill": weakest_skill,

        # useful for frontend report screen
        "question_results": word_results
    }

    return report