from faster_whisper import WhisperModel

model = WhisperModel(
    "small",
    compute_type="int8"
)

def transcribe(audio_path):

    segments, info = model.transcribe(
        audio_path,
        task="transcribe",
        beam_size=5
    )

    print("Language:", info.language)

    text = " ".join(
        seg.text
        for seg in segments
    )

    return text