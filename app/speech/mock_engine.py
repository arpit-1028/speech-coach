from pathlib import Path
from typing import List, Union, Optional, Dict
from app.speech.base import PhonemeRecognizer

class MockPhonemeRecognizer(PhonemeRecognizer):
    """
    Mock phoneme recognizer for testing and environments without GPU/audio models.
    Supports preset phoneme responses or simulated substitutions.
    """

    def __init__(self, default_response: Optional[List[str]] = None):
        self._default_response = default_response or ["T", "IH", "NG", "K"]
        self._word_presets: Dict[str, List[str]] = {}

    def set_preset(self, word: str, phonemes: List[str]):
        """Set a preset phoneme return for a specific word."""
        self._word_presets[word.lower()] = phonemes

    def clear_presets(self):
        """Clear all custom word presets."""
        self._word_presets.clear()

    def extract_phonemes(self, audio_path: Union[str, Path]) -> List[str]:
        """
        Returns mock phonemes based on audio filename or default.
        If audio path has stem matching a word preset (e.g., 'think.wav'), returns preset.
        """
        path = Path(audio_path)
        stem = path.stem.lower()
        if stem in self._word_presets:
            return self._word_presets[stem]
        for word, preset in self._word_presets.items():
            if word in stem:
                return preset
        return self._default_response
