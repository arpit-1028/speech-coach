from typing import Dict, List, Any

DIAGNOSTIC_WORD_SETS: Dict[str, Any] = {
    "TH": {
        "initial": [
            "think", "three", "thumb", "thunder", "thirty",
            "thank", "theory", "thought", "theme", "thread"
        ],
        "middle": [
            "author", "nothing", "method", "athlete",
            "healthy", "birthday", "anything", "bathroom"
        ],
        "final": [
            "bath", "both", "math", "teeth", "mouth", "truth"
        ]
    },
    "SH": [
        "ship", "shop", "sheep", "shark", "shine", "short",
        "she", "show", "shadow", "fashion", "nation", "machine",
        "ocean", "wish", "fish", "dish", "brush", "crash"
    ],
    "V": [
        "vine", "very", "visit", "voice", "value", "victory",
        "video", "village", "seven", "river", "movie", "travel",
        "love", "give", "live", "solve"
    ],
    "W": [
        "water", "west", "wind", "wood", "white", "winter",
        "window", "wonder", "always", "away", "reward", "between"
    ],
    "R": [
        "red", "right", "road", "rain", "river", "rocket",
        "rose", "rabbit", "around", "correct", "arrive", "orange",
        "car", "star", "door"
    ],
    "L": [
        "light", "look", "lamp", "love", "long", "learn",
        "letter", "lion", "yellow", "believe", "follow", "holiday",
        "ball", "call", "school", "hotel"
    ],
    "S": [
        "sun", "city", "sister", "glass", "pencil",
        "dance", "space", "voice", "house", "simple"
    ],
    "CH": [
        "chair", "cheese", "child", "watch", "teacher",
        "catch", "nature", "match", "church", "beach"
    ]
}

def get_all_diagnostic_words() -> List[str]:
    """Returns a flat list of all diagnostic test words."""
    words = []
    # TH
    for pos in ["initial", "middle", "final"]:
        words.extend(DIAGNOSTIC_WORD_SETS["TH"][pos])
    # Rest
    for sound in ["SH", "V", "W", "R", "L", "S", "CH"]:
        words.extend(DIAGNOSTIC_WORD_SETS[sound])
    # Deduplicate while preserving order
    seen = set()
    deduped = []
    for w in words:
        if w not in seen:
            seen.add(w)
            deduped.append(w)
    return deduped

def get_word_target_sound_map() -> Dict[str, str]:
    """Maps each diagnostic word to its primary target sound."""
    mapping = {}
    for pos in ["initial", "middle", "final"]:
        for w in DIAGNOSTIC_WORD_SETS["TH"][pos]:
            mapping[w] = "TH"
    for sound in ["SH", "V", "W", "R", "L", "S", "CH"]:
        for w in DIAGNOSTIC_WORD_SETS[sound]:
            if w not in mapping:
                mapping[w] = sound
    return mapping

WORD_TARGET_MAP = get_word_target_sound_map()
ALL_WORDS = get_all_diagnostic_words()
