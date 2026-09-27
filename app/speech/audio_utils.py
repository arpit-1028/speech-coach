import logging
from pathlib import Path
import wave

logger = logging.getLogger(__name__)

def is_pcm_wav(file_path: Path) -> bool:
    """Checks if a file is already an uncompressed PCM WAV."""
    try:
        with wave.open(str(file_path), "rb") as wf:
            return wf.getnchannels() == 1 and wf.getframerate() == 16000 and wf.getsampwidth() == 2
    except Exception:
        return False

def ensure_wav_16k_mono(input_path: Path) -> Path:
    """
    Ensures the audio file is in standard 16kHz 16-bit mono PCM WAV format
    required by Allosaurus. If the file is WebM/Ogg from a browser microphone
    or a different sample rate, it transcodes it using PyAV.
    """
    input_path = Path(input_path)
    if is_pcm_wav(input_path):
        return input_path

    converted_path = input_path.with_name(f"{input_path.stem}_16k.wav")

    try:
        import av
        container = av.open(str(input_path))
        audio_streams = [s for s in container.streams if s.type == "audio"]
        if not audio_streams:
            raise ValueError("No audio stream found in input file.")

        in_stream = audio_streams[0]

        out_container = av.open(str(converted_path), mode="w", format="wav")
        out_stream = out_container.add_stream("pcm_s16le", rate=16000)
        out_stream.channels = 1

        resampler = av.AudioResampler(
            format="s16",
            layout="mono",
            rate=16000
        )

        for frame in container.decode(in_stream):
            for resampled_frame in resampler.resample(frame):
                for packet in out_stream.encode(resampled_frame):
                    out_container.mux(packet)

        # Flush encoder
        for packet in out_stream.encode():
            out_container.mux(packet)

        out_container.close()
        container.close()
        return converted_path
    except Exception as e:
        logger.warning("PyAV transcoding failed or unavailable: %s. Using original file.", e)
        return input_path
