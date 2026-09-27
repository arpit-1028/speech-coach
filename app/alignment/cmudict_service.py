from typing import List, Optional, Dict
import logging

logger = logging.getLogger(__name__)

class CMUdictService:
    """
    Service to fetch expected ARPAbet phoneme sequences from CMU Pronouncing Dictionary.
    Strips stress markers (e.g. IH1 -> IH) to produce canonical phonemes.
    """

    def __init__(self):
        self._cmu_dict: Optional[Dict[str, List[List[str]]]] = None

    def _load_dict(self):
        if self._cmu_dict is None:
            try:
                import cmudict
                self._cmu_dict = cmudict.dict()
                logger.info("Loaded CMU Pronouncing Dictionary successfully.")
            except Exception as e:
                logger.error("Failed to load cmudict package: %s", e)
                self._cmu_dict = {}

    def get_phonemes(self, word: str) -> List[str]:
        """
        Retrieves expected ARPAbet phonemes for a word without stress numbers.
        Example: 'think' -> ['TH', 'IH', 'NG', 'K']
        """
        self._load_dict()
        clean_word = word.strip().lower()

        if self._cmu_dict and clean_word in self._cmu_dict:
            pronunciations = self._cmu_dict[clean_word]
            if pronunciations:
                # Use primary pronunciation (first entry)
                primary = pronunciations[0]
                # Strip numeric stress digits (e.g. 'IH1' -> 'IH')
                return [''.join([c for c in phone if not c.isdigit()]).upper() for phone in primary]

        # Built-in fallbacks for standard test words if dictionary is unavailable or missing entry
        fallbacks = {
            "think": ["TH", "IH", "NG", "K"],
            "three": ["TH", "R", "IY"],
            "thumb": ["TH", "AH", "M"],
            "thunder": ["TH", "AH", "N", "D", "ER"],
            "thirty": ["TH", "ER", "T", "IY"],
            "thank": ["TH", "AE", "NG", "K"],
            "theory": ["TH", "IH", "R", "IY"],
            "thought": ["TH", "AO", "T"],
            "theme": ["TH", "IY", "M"],
            "thread": ["TH", "R", "EH", "D"],
            "author": ["AO", "TH", "ER"],
            "nothing": ["N", "AH", "TH", "IH", "NG"],
            "method": ["M", "EH", "TH", "AH", "D"],
            "athlete": ["AE", "TH", "L", "IY", "T"],
            "healthy": ["HH", "EH", "L", "TH", "IY"],
            "birthday": ["B", "ER", "TH", "D", "EY"],
            "anything": ["EH", "N", "IY", "TH", "IH", "NG"],
            "bathroom": ["B", "AE", "TH", "R", "UW", "M"],
            "bath": ["B", "AE", "TH"],
            "both": ["B", "OW", "TH"],
            "math": ["M", "AE", "TH"],
            "teeth": ["T", "IY", "TH"],
            "mouth": ["M", "AW", "TH"],
            "truth": ["T", "R", "UW", "TH"],
            "ship": ["SH", "IH", "P"],
            "shop": ["SH", "AA", "P"],
            "sheep": ["SH", "IY", "P"],
            "shark": ["SH", "AA", "R", "K"],
            "shine": ["SH", "AY", "N"],
            "short": ["SH", "AO", "R", "T"],
            "she": ["SH", "IY"],
            "show": ["SH", "OW"],
            "shadow": ["SH", "AE", "D", "OW"],
            "fashion": ["F", "AE", "SH", "AH", "N"],
            "nation": ["N", "EY", "SH", "AH", "N"],
            "machine": ["M", "AH", "SH", "IY", "N"],
            "ocean": ["OW", "SH", "AH", "N"],
            "wish": ["W", "IH", "SH"],
            "fish": ["F", "IH", "SH"],
            "dish": ["D", "IH", "SH"],
            "brush": ["B", "R", "AH", "SH"],
            "crash": ["K", "R", "AE", "SH"],
            "vine": ["V", "AY", "N"],
            "very": ["V", "EH", "R", "IY"],
            "visit": ["V", "IH", "Z", "AH", "T"],
            "voice": ["V", "OY", "S"],
            "value": ["V", "AE", "L", "Y", "UW"],
            "victory": ["V", "IH", "K", "T", "ER", "IY"],
            "video": ["V", "IH", "D", "IY", "OW"],
            "village": ["V", "IH", "L", "AH", "JH"],
            "seven": ["S", "EH", "V", "AH", "N"],
            "river": ["R", "IH", "V", "ER"],
            "movie": ["M", "UW", "V", "IY"],
            "travel": ["T", "R", "AE", "V", "AH", "L"],
            "love": ["L", "AH", "V"],
            "give": ["G", "IH", "V"],
            "live": ["L", "IH", "V"],
            "solve": ["S", "AA", "L", "V"],
            "water": ["W", "AO", "T", "ER"],
            "west": ["W", "EH", "S", "T"],
            "wind": ["W", "IH", "N", "D"],
            "wood": ["W", "UH", "D"],
            "white": ["W", "AY", "T"],
            "winter": ["W", "IH", "N", "T", "ER"],
            "window": ["W", "IH", "N", "D", "OW"],
            "wonder": ["W", "AH", "N", "D", "ER"],
            "always": ["AO", "L", "W", "EY", "Z"],
            "away": ["AH", "W", "EY"],
            "reward": ["R", "IH", "W", "AO", "R", "D"],
            "between": ["B", "IH", "T", "W", "IY", "N"],
            "red": ["R", "EH", "D"],
            "right": ["R", "AY", "T"],
            "road": ["R", "OW", "D"],
            "rain": ["R", "EY", "N"],
            "rocket": ["R", "AA", "K", "AH", "T"],
            "rose": ["R", "OW", "Z"],
            "rabbit": ["R", "AE", "B", "AH", "T"],
            "around": ["ER", "AW", "N", "D"],
            "correct": ["K", "ER", "EH", "K", "T"],
            "arrive": ["ER", "AY", "V"],
            "orange": ["AO", "R", "AH", "N", "JH"],
            "car": ["K", "AA", "R"],
            "star": ["S", "T", "AA", "R"],
            "door": ["D", "AO", "R"],
            "light": ["L", "AY", "T"],
            "look": ["L", "UH", "K"],
            "lamp": ["L", "AE", "M", "P"],
            "long": ["L", "AO", "NG"],
            "learn": ["L", "ER", "N"],
            "letter": ["L", "EH", "T", "ER"],
            "lion": ["L", "AY", "AH", "N"],
            "yellow": ["Y", "EH", "L", "OW"],
            "believe": ["B", "IH", "L", "IY", "V"],
            "follow": ["F", "AA", "L", "OW"],
            "holiday": ["HH", "AA", "L", "AH", "D", "EY"],
            "ball": ["B", "AO", "L"],
            "call": ["K", "AO", "L"],
            "school": ["S", "K", "UW", "L"],
            "hotel": ["HH", "OW", "T", "EH", "L"],
            "sun": ["S", "AH", "N"],
            "city": ["S", "IH", "T", "IY"],
            "sister": ["S", "IH", "S", "T", "ER"],
            "glass": ["G", "L", "AE", "S"],
            "pencil": ["P", "EH", "N", "S", "AH", "L"],
            "dance": ["D", "AE", "N", "S"],
            "space": ["S", "P", "EY", "S"],
            "house": ["HH", "AW", "S"],
            "simple": ["S", "IH", "M", "P", "AH", "L"],
            "chair": ["CH", "EH", "R"],
            "cheese": ["CH", "IY", "Z"],
            "child": ["CH", "AY", "L", "D"],
            "watch": ["W", "AA", "CH"],
            "teacher": ["T", "IY", "CH", "ER"],
            "catch": ["K", "AE", "CH"],
            "nature": ["N", "EY", "CH", "ER"],
            "match": ["M", "AE", "CH"],
            "church": ["CH", "ER", "CH"],
            "beach": ["B", "IY", "CH"],
        }
        if clean_word in fallbacks:
            return fallbacks[clean_word]

        raise ValueError(f"Phonetic transcription not found for word '{word}' in CMUdict.")

cmu_service = CMUdictService()
