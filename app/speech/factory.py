from typing import Dict, Type
import logging
from app.config import settings
from app.speech.base import PhonemeRecognizer
from app.speech.allosaurus_engine import AllosaurusRecognizer
from app.speech.mock_engine import MockPhonemeRecognizer

logger = logging.getLogger(__name__)

_RECOGNIZER_REGISTRY: Dict[str, Type[PhonemeRecognizer]] = {
    "allosaurus": AllosaurusRecognizer,
    "mock": MockPhonemeRecognizer,
}

_ACTIVE_INSTANCE: PhonemeRecognizer = None

def register_recognizer(name: str, recognizer_cls: Type[PhonemeRecognizer]):
    """Register a new speech/phoneme engine (e.g. Sherpa, MFA, GOP, Wav2Vec2)."""
    _RECOGNIZER_REGISTRY[name.lower()] = recognizer_cls

def get_phoneme_recognizer(engine_name: str = None) -> PhonemeRecognizer:
    """
    Factory function to retrieve the configured phoneme recognizer instance.
    Uses singleton pattern for heavy models.
    """
    global _ACTIVE_INSTANCE
    target_engine = (engine_name or settings.RECOGNIZER_ENGINE).lower()

    if _ACTIVE_INSTANCE is not None:
        return _ACTIVE_INSTANCE

    if target_engine not in _RECOGNIZER_REGISTRY:
        logger.warning(
            "Engine '%s' not recognized. Falling back to MockPhonemeRecognizer.",
            target_engine
        )
        _ACTIVE_INSTANCE = MockPhonemeRecognizer()
        return _ACTIVE_INSTANCE

    recognizer_cls = _RECOGNIZER_REGISTRY[target_engine]
    _ACTIVE_INSTANCE = recognizer_cls()
    return _ACTIVE_INSTANCE

def set_active_recognizer(recognizer: PhonemeRecognizer):
    """Explicitly set active recognizer (useful for tests)."""
    global _ACTIVE_INSTANCE
    _ACTIVE_INSTANCE = recognizer
