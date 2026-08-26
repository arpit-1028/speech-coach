"""
whisper_service.py — Speech-to-text (Groq primary, local fallback)
Used by /translate, /translate/interview, /grammar/check endpoints.
Auto-detects language (Hindi/Hinglish/English) for translation use-cases.
"""
from app.services.groq_whisper import transcribe_groq

# Lazy-loaded local model — only initialized if Groq fails
_local_model = None

def _get_local_model():
    global _local_model
    if _local_model is None:
        print("WHISPER SERVICE: Loading local Whisper model (fallback)...")
        from faster_whisper import WhisperModel
        _local_model = WhisperModel("small", compute_type="int8")
    return _local_model


def transcribe(audio_path):
    """Transcribe audio — tries Groq API first, falls back to local model."""

    # Primary: Groq Cloud API (auto-detect language for Hindi/Hinglish)
    text = transcribe_groq(audio_path)
    if text is not None:
        print("Language: detected via Groq")
        return text

    # Fallback: local faster-whisper
    print("WHISPER SERVICE: Falling back to local model")
    model = _get_local_model()
    segments, info = model.transcribe(
        audio_path,
        task="transcribe",
        beam_size=5
    )
    print("Language:", info.language)
    text = " ".join(seg.text for seg in segments)
    return text