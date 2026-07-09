import os
import platform
import uuid

# Help phonemizer find eSpeak on Windows before importing transformers
if platform.system() == "Windows":
    os.environ["PHONEMIZER_ESPEAK_LIBRARY"] = r"C:\Program Files\eSpeak NG\libespeak-ng.dll"
    os.environ["PHONEMIZER_ESPEAK_PATH"] = r"C:\Program Files\eSpeak NG\espeak-ng.exe"

from transformers import Wav2Vec2Processor, Wav2Vec2ForCTC
import torch
import librosa
import soundfile as sf
import numpy as np

# Load the Wav2Vec2 model fine-tuned for phoneme recognition
MODEL_ID = "facebook/wav2vec2-xlsr-53-espeak-cv-ft"
processor = Wav2Vec2Processor.from_pretrained(MODEL_ID)
model = Wav2Vec2ForCTC.from_pretrained(MODEL_ID)


def preprocess_audio(input_file):
    """Load, convert to mono 16kHz, trim silence, normalize volume."""
    audio, sr = librosa.load(input_file, sr=16000, mono=True)

    if len(audio) == 0:
        return audio

    # Trim silence with gentle threshold to keep quiet consonants
    trimmed, _ = librosa.effects.trim(audio, top_db=50)

    # If trimming removed everything, use original
    if len(trimmed) < 1600:  # less than 0.1s at 16kHz
        trimmed = audio

    # Peak normalize to [-1, 1]
    peak = np.max(np.abs(trimmed))
    if peak > 0:
        trimmed = trimmed / peak

    return trimmed


def recognize_audio(filename):
    """Extract IPA phonemes from an audio file using Wav2Vec2."""
    speech_array = preprocess_audio(filename)

    if len(speech_array) == 0:
        return []

    print("PROCESSING AUDIO, length:", len(speech_array), "samples")

    # Process audio with Wav2Vec2
    inputs = processor(speech_array, sampling_rate=16000, return_tensors="pt")

    with torch.no_grad():
        logits = model(inputs.input_values).logits

    # Decode the most likely phonemes
    predicted_ids = torch.argmax(logits, dim=-1)
    transcription = processor.batch_decode(predicted_ids)

    phonemes_str = transcription[0] if transcription else ""

    print("RAW PHONEMES:", phonemes_str)

    # Return as a list of individual IPA characters/tokens
    return list(phonemes_str.replace(" ", "")) if phonemes_str else []