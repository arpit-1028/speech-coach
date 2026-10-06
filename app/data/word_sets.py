from typing import Dict, List, Any

# Sounds that are tested by word position (initial/middle/final) rather than
# a single flat list, because the position materially changes difficulty.
_POSITIONAL_SOUNDS = ("TH", "DH")

DIAGNOSTIC_WORD_SETS: Dict[str, Any] = {
    # Voiceless TH (as in "think") — commonly dentalized to T by Hindi/Tamil/etc.
    # background speakers, since most Indian languages have no interdental fricative.
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
    # Voiced TH (as in "this") — same dentalization issue, usually heard as D.
    # Indian English speakers who pass TH often still miss DH, so it is tracked separately.
    "DH": {
        "initial": [
            "this", "that", "these", "those", "them",
            "then", "there", "their", "they", "though"
        ],
        "middle": [
            "mother", "father", "brother", "weather", "together",
            "other", "rather", "gather", "either", "breathing"
        ],
        "final": [
            "breathe", "smooth", "bathe", "soothe", "clothe"
        ]
    },
    "SH": [
        "ship", "shop", "sheep", "shark", "shine", "short",
        "she", "show", "shadow", "fashion", "nation", "machine",
        "ocean", "wish", "fish", "dish", "brush", "crash"
    ],
    # ZH (as in "measure") — Indian English speakers frequently replace it with
    # Z or the affricate JH, since /ʒ/ does not occur natively in most Indian languages.
    "ZH": [
        "measure", "treasure", "pleasure", "leisure", "vision",
        "television", "usual", "casual", "decision", "occasion",
        "garage", "beige"
    ],
    # V and W — frequently merged into a single labiodental approximant [ʋ] by
    # Hindi/Punjabi/Bengali background speakers ("vine"/"wine" sound alike).
    "V": [
        "vine", "very", "visit", "voice", "value", "victory",
        "video", "village", "seven", "river", "movie", "travel",
        "love", "give", "live", "solve", "vehicle"
    ],
    "W": [
        "water", "west", "wind", "wood", "white", "winter",
        "window", "wonder", "always", "away", "reward", "between",
        "world", "work"
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
    # S — includes plain /s/ words plus words with an initial /s/+consonant
    # cluster ("school", "speak"), which many Indian English speakers break up
    # with an epenthetic vowel (e.g. "school" -> "ischool"). The GOP scorer
    # still grades the /s/ phoneme itself; the cluster forms are included so
    # a listening teacher can specifically check for the inserted vowel.
    "S": [
        "sun", "city", "sister", "glass", "pencil",
        "dance", "space", "voice", "house", "simple",
        "school", "speak", "state", "store", "sport",
        "stop", "small", "spoon", "student", "stay"
    ],
    # Z — frequently devoiced to S, or confused with JH, by Hindi/Bengali/etc.
    # background speakers (voicing distinctions for sibilants are less consistent
    # across Indian languages than in English).
    "Z": [
        "zoo", "zebra", "zero", "zone", "zoom",
        "lazy", "busy", "easy", "dizzy", "music",
        "rose", "nose", "prize", "please", "noise"
    ],
    "CH": [
        "chair", "cheese", "child", "watch", "teacher",
        "catch", "nature", "match", "church", "beach"
    ],
    # JH (as in "jump") — commonly merged with Z or Y depending on regional
    # background (e.g. Bengali speakers sometimes conflating J and Z).
    "JH": [
        "jump", "job", "joy", "juice", "jacket",
        "giant", "gym", "magic", "budget", "bridge",
        "cage", "page", "large"
    ]
}

# Short explanation of why each sound is commonly mispronounced by Indian
# English speakers, for display alongside the word sets in the UI/report.
INDIAN_ENGLISH_ACCENT_NOTES: Dict[str, str] = {
    "TH": "Dentalized to T: most Indian languages lack the interdental fricative /θ/.",
    "DH": "Dentalized to D: the voiced counterpart of the TH issue above.",
    "ZH": "Replaced with Z or JH: /ʒ/ does not occur natively in most Indian languages.",
    "V": "Merged with W into a single labiodental approximant [ʋ] (common in Hindi/Punjabi/Bengali backgrounds).",
    "W": "Merged with V — see above. Listen for whether 'wine' and 'vine' sound identical.",
    "R": "Often retroflex or non-rhotic depending on regional background; 'car' without a final R is acceptable, not an error.",
    "S": "Initial /s/+consonant clusters (school, speak) are often broken up with an inserted vowel ('ischool').",
    "Z": "Often devoiced to S, or confused with JH, depending on language background.",
    "JH": "Often merged with Z (e.g. Bengali backgrounds): 'jam' and 'zam' can sound alike.",
}


def get_words_for_sound(sound: str) -> List[str]:
    """Flat practice-word list for one target sound, regardless of its internal shape."""
    entry = DIAGNOSTIC_WORD_SETS.get(sound.upper())
    if entry is None:
        return []
    if sound.upper() in _POSITIONAL_SOUNDS:
        return [w for pos in ("initial", "middle", "final") for w in entry[pos]]
    return list(entry)


def get_all_diagnostic_words() -> List[str]:
    """Returns a flat list of all diagnostic test words."""
    words = []
    for sound, entry in DIAGNOSTIC_WORD_SETS.items():
        if sound in _POSITIONAL_SOUNDS:
            for pos in ("initial", "middle", "final"):
                words.extend(entry[pos])
        else:
            words.extend(entry)
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
    for sound, entry in DIAGNOSTIC_WORD_SETS.items():
        if sound in _POSITIONAL_SOUNDS:
            for pos in ("initial", "middle", "final"):
                for w in entry[pos]:
                    mapping.setdefault(w, sound)
        else:
            for w in entry:
                mapping.setdefault(w, sound)
    return mapping

WORD_TARGET_MAP = get_word_target_sound_map()
ALL_WORDS = get_all_diagnostic_words()
