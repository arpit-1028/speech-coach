from abc import ABC, abstractmethod
from pathlib import Path
from typing import List, Union

class PhonemeRecognizer(ABC):
    """
    Abstract interface for phoneme extraction engines.
    Implementations extract phoneme sequences from speech audio.
    Modular design allows swapping Allosaurus for Sherpa, MFA, GOP, Wav2Vec2, etc.
    without modifying business logic or database operations.
    """

    # Whether recordings must pass the VAD / quality gate before being scored
    uses_quality_gate: bool = True

    @abstractmethod
    def extract_phonemes(self, audio_path: Union[str, Path]) -> List[str]:
        """
        Extract a sequence of phonemes from an audio file.
        :param audio_path: Path to the audio file (e.g. WAV, 16kHz recommended)
        :return: List of detected phoneme tokens.
        """
        pass
