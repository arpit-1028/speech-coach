from pathlib import Path
from typing import List, Union, Optional
import logging
from app.speech.base import PhonemeRecognizer

logger = logging.getLogger(__name__)

class AllosaurusRecognizer(PhonemeRecognizer):
    """
    Allosaurus-based phoneme extraction engine.
    Extracts IPA phonemes from input speech audio.
    """

    def __init__(self, model_name: str = "uni2004", lang_id: str = "eng"):
        self.model_name = model_name
        self.lang_id = lang_id
        self._model = None

    def _get_model(self):
        if self._model is None:
            try:
                from allosaurus.app import read_recognizer
                logger.info("Loading Allosaurus recognizer model '%s'...", self.model_name)
                self._model = read_recognizer(self.model_name)
            except Exception as e:
                logger.error("Failed to load Allosaurus recognizer: %s", e)
                raise RuntimeError(f"Allosaurus model failed to initialize: {e}") from e
        return self._model

    def extract_phonemes(self, audio_path: Union[str, Path]) -> List[str]:
        """
        Runs phoneme recognition on the given audio file.
        Returns a list of detected phoneme tokens (e.g. ['θ', 'ɪ', 'ŋ', 'k']).
        """
        from app.speech.audio_utils import ensure_wav_16k_mono

        raw_path = Path(audio_path).resolve()
        processed_path = ensure_wav_16k_mono(raw_path)
        path_str = str(processed_path)

        model = self._get_model()
        try:
            # recognize() returns a space-separated string of phones
            output_str = model.recognize(path_str, lang_id=self.lang_id)
            tokens = [t.strip() for t in output_str.split() if t.strip()]
            return tokens
        except Exception as e:
            logger.error("Allosaurus recognition error on '%s': %s", path_str, e)
            raise RuntimeError(f"Allosaurus failed to process audio file: {e}") from e
