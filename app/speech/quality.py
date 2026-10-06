import logging
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Any, Dict, Optional, Union

import numpy as np

from app.config import settings

logger = logging.getLogger(__name__)

SAMPLE_RATE = 16000
FRAME_MS = 25
HOP_MS = 10


@dataclass
class AudioQualityReport:
    """
    Result of the recording quality gate. When `ok` is False the attempt must be
    re-recorded instead of scored, so recording problems never count as pronunciation errors.
    """
    ok: bool
    reason: Optional[str]
    duration_sec: float
    speech_sec: float
    snr_db: float
    peak_dbfs: float
    clipping_ratio: float
    speech_start_sec: float = 0.0
    speech_end_sec: float = 0.0
    audio: Optional[np.ndarray] = field(default=None, repr=False)

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d.pop("audio", None)
        return {k: (round(v, 3) if isinstance(v, float) else v) for k, v in d.items()}


def load_audio_16k(audio_path: Union[str, Path]) -> np.ndarray:
    """Loads any browser/upload format as float32 16 kHz mono in [-1, 1]."""
    import wave
    from app.speech.audio_utils import ensure_wav_16k_mono

    wav_path = ensure_wav_16k_mono(Path(audio_path).resolve())
    try:
        with wave.open(str(wav_path), "rb") as wf:
            if wf.getsampwidth() != 2:
                raise wave.Error("not 16-bit PCM")
            sr, channels = wf.getframerate(), wf.getnchannels()
            pcm = np.frombuffer(wf.readframes(wf.getnframes()), dtype="<i2")
        audio = (pcm.reshape(-1, channels).astype(np.float32) / 32768.0).mean(axis=1)
    except (wave.Error, EOFError):
        import soundfile as sf
        audio, sr = sf.read(str(wav_path), dtype="float32", always_2d=True)
        audio = audio.mean(axis=1)
    if sr != SAMPLE_RATE:
        # Linear resample fallback when PyAV transcoding was unavailable
        n_out = int(round(len(audio) * SAMPLE_RATE / sr))
        audio = np.interp(
            np.linspace(0, len(audio) - 1, n_out), np.arange(len(audio)), audio
        ).astype(np.float32)
    return audio


def _frame_energy_db(audio: np.ndarray) -> np.ndarray:
    frame = SAMPLE_RATE * FRAME_MS // 1000
    hop = SAMPLE_RATE * HOP_MS // 1000
    if len(audio) < frame:
        audio = np.pad(audio, (0, frame - len(audio)))
    n_frames = 1 + (len(audio) - frame) // hop
    idx = np.arange(frame)[None, :] + hop * np.arange(n_frames)[:, None]
    frames = audio[idx] * np.hanning(frame)[None, :]
    rms = np.sqrt(np.mean(frames ** 2, axis=1) + 1e-12)
    return 20 * np.log10(rms + 1e-9)


def _smooth_speech_mask(mask: np.ndarray, min_gap: int, min_burst: int) -> np.ndarray:
    """Fills short silences inside speech (e.g. stop closures) and drops short clicks."""
    mask = mask.copy()
    # Fill gaps shorter than min_gap frames that sit between speech frames
    speech_idx = np.flatnonzero(mask)
    for a, b in zip(speech_idx[:-1], speech_idx[1:]):
        if 1 < b - a <= min_gap:
            mask[a:b] = True
    # Remove isolated bursts shorter than min_burst frames
    i = 0
    n = len(mask)
    while i < n:
        if mask[i]:
            j = i
            while j < n and mask[j]:
                j += 1
            if j - i < min_burst:
                mask[i:j] = False
            i = j
        else:
            i += 1
    return mask


def _count_speech_bursts(mask: np.ndarray) -> int:
    """Number of separate speech segments in the (already-smoothed) mask."""
    if not len(mask):
        return 0
    starts = np.flatnonzero(mask[1:] & ~mask[:-1]) + 1
    return int(mask[0]) + len(starts)


def _stft(audio: np.ndarray, frame: int, hop: int) -> np.ndarray:
    """Short-time FFT with a Hanning window, aligned to the same frame/hop as the VAD."""
    window = np.hanning(frame)
    padded = audio if len(audio) >= frame else np.pad(audio, (0, frame - len(audio)))
    n_frames = 1 + (len(padded) - frame) // hop
    idx = np.arange(frame)[None, :] + hop * np.arange(n_frames)[:, None]
    return np.fft.rfft(padded[idx] * window[None, :], axis=1)


def _istft(spec: np.ndarray, frame: int, hop: int, length: int) -> np.ndarray:
    """
    Inverse of `_stft` via overlap-add, normalized by the sum of the (single)
    analysis window rather than its square. A window-squared ("WOLA") scheme only
    reconstructs exactly when every overlapping frame's content is mutually
    consistent, as it is for an untouched round-trip; spectral subtraction breaks
    that by editing each frame independently, and WOLA's normalization then divides
    by the window itself near each frame's edge (where Hanning is exactly 0),
    blowing the result up. Summing un-rewindowed frames and dividing by the window
    *sum* (which the Hanning COLA identity keeps safely away from 0 at 50% overlap)
    avoids that division-by-near-zero entirely.
    """
    window = np.hanning(frame)
    time_frames = np.fft.irfft(spec, n=frame, axis=1)
    out = np.zeros(length + frame)
    norm = np.zeros(length + frame)
    for i, tf in enumerate(time_frames):
        start = i * hop
        out[start:start + frame] += tf
        norm[start:start + frame] += window
    return (out / np.maximum(norm, 1e-6))[:length]


def _spectral_denoise(audio: np.ndarray, mask: np.ndarray, frame: int, vad_hop: int) -> np.ndarray:
    """
    Spectral subtraction: estimate the noise magnitude spectrum from the frames the
    VAD marked as non-speech, then subtract it (with a small floor to avoid musical
    noise artefacts) from every frame before reconstructing. Run on the full signal
    before trimming so the noise estimate reflects real room noise, not just
    whatever leaks into the padding around the trimmed speech.

    Reconstruction uses its own 50%-overlap frame grid (`synth_hop = frame // 2`),
    not the VAD's 10ms hop: Hanning windows only sum to a constant (distortion-free
    overlap-add) at 50% overlap, and the VAD's finer hop doesn't satisfy that, which
    previously made the "denoised" audio louder than the original. `mask`, which was
    computed on the VAD's grid, is mapped onto this coarser grid by nearest frame.

    The signal is zero-padded by one `frame` on each side before analysis: without
    it, the true first/last samples are covered by only one (edited) frame's window
    instead of several overlapping ones, and Hanning is exactly 0 at a window's own
    edge - so the overlap-add normalization there divides by ~0 and the output
    briefly spikes to thousands of times the input's amplitude.
    """
    synth_hop = frame // 2
    pad = frame
    padded = np.pad(audio, (pad, pad))
    spec = _stft(padded, frame, synth_hop)
    mag, phase = np.abs(spec), np.angle(spec)
    n_frames = mag.shape[0]

    centers = np.arange(n_frames) * synth_hop + frame // 2 - pad
    vad_idx = np.clip(centers // vad_hop, 0, len(mask) - 1).astype(int)
    frame_mask = mask[vad_idx]
    noise_sel = ~frame_mask

    if np.any(noise_sel):
        noise_profile = np.median(mag[noise_sel], axis=0)
    else:
        # No frame was confidently non-speech; fall back to the quietest 10%.
        energy = mag.sum(axis=1)
        quiet = np.argsort(energy)[:max(1, len(energy) // 10)]
        noise_profile = np.median(mag[quiet], axis=0)

    gain = np.clip(
        1.0 - settings.DENOISE_OVERSUBTRACTION * noise_profile[None, :] / np.maximum(mag, 1e-9),
        settings.DENOISE_FLOOR, 1.0,
    )
    if gain.shape[0] >= 3:
        # Smooth the gain across adjacent (overlapping) frames. Two overlapping
        # frames processed with very different gains is exactly what turns the
        # overlap-add below into a reconstruction artefact rather than real signal.
        padded_gain = np.pad(gain, ((1, 1), (0, 0)), mode="edge")
        gain = 0.25 * padded_gain[:-2] + 0.5 * padded_gain[1:-1] + 0.25 * padded_gain[2:]

    denoised_padded = _istft((gain * mag * np.exp(1j * phase)), frame, synth_hop, len(padded))
    denoised = denoised_padded[pad:pad + len(audio)].astype(np.float32)

    # Safety net: a noise-reduction step must never increase peak amplitude. Any
    # overshoot here is a reconstruction artefact from editing overlapping frames
    # independently, not real signal, so scale it away instead of feeding it to
    # the phoneme scorer.
    peak_in = float(np.max(np.abs(audio))) + 1e-9
    peak_out = float(np.max(np.abs(denoised))) + 1e-9
    if peak_out > peak_in:
        denoised *= peak_in / peak_out
    return denoised


def assess_audio(audio_path: Union[str, Path]) -> AudioQualityReport:
    """
    Energy-based voice activity detection with an adaptive noise floor, plus
    loudness, clipping and SNR checks. Returns speech trimmed to the detected
    region (with padding) and peak-normalised, ready for phoneme scoring.
    """
    audio = load_audio_16k(audio_path)
    audio = audio - float(np.mean(audio)) if len(audio) else audio
    duration = len(audio) / SAMPLE_RATE

    def fail(reason: str, **metrics) -> AudioQualityReport:
        base = dict(duration_sec=duration, speech_sec=0.0, snr_db=0.0,
                    peak_dbfs=-120.0, clipping_ratio=0.0)
        base.update(metrics)
        return AudioQualityReport(ok=False, reason=reason, **base)

    if duration < 0.2:
        return fail("Recording is too short. Please hold the button and say the word.")

    peak = float(np.max(np.abs(audio)))
    peak_dbfs = float(20 * np.log10(peak + 1e-9))
    clipping_ratio = float(np.mean(np.abs(audio) >= 0.99))

    energy = _frame_energy_db(audio)
    noise_floor = max(float(np.percentile(energy, 10)), -90.0)
    loud = float(np.percentile(energy, 97))
    # Speech = frames clearly above the noise floor and within 35 dB of the loudest part
    threshold = max(noise_floor + 8.0, loud - 35.0)
    mask = _smooth_speech_mask(energy > threshold, min_gap=20, min_burst=6)

    speech_frames = int(mask.sum())
    speech_sec = speech_frames * HOP_MS / 1000
    snr_db = float(np.mean(energy[mask]) - noise_floor) if speech_frames else 0.0

    metrics = dict(duration_sec=duration, speech_sec=speech_sec, snr_db=snr_db,
                   peak_dbfs=peak_dbfs, clipping_ratio=clipping_ratio)

    if peak_dbfs < settings.MIN_PEAK_DBFS:
        return fail("No voice detected. Move closer to the microphone and speak louder.", **metrics)
    if speech_frames == 0:
        # Loud input but nothing stands out from the floor: constant noise, not speech
        return fail("Too much background noise. Please record in a quieter place.", **metrics)
    if _count_speech_bursts(mask) > 1:
        # Forced alignment assumes the recording contains exactly one utterance of
        # the target word. Saying it multiple times (or a false start + retry in
        # the same recording) stretches that single-word alignment across unrelated
        # audio and produces meaningless phoneme scores - so this must be caught
        # here, before scoring, not discovered as a confusing wrong result.
        return fail(
            "It sounds like more than one word/sound was recorded. "
            "Please say the target word just once, then stop.", **metrics
        )
    if speech_sec < settings.MIN_SPEECH_SEC:
        return fail("Speech was too short to analyse. Please say the whole word clearly.", **metrics)
    if speech_sec > settings.MAX_SPEECH_SEC:
        return fail("Recording contains too much speech. Please say only the target word.", **metrics)
    if clipping_ratio > settings.MAX_CLIPPING_RATIO:
        return fail("Audio is distorted (too loud). Move slightly away from the microphone.", **metrics)
    if snr_db < settings.MIN_SNR_DB:
        return fail("Too much background noise. Please record in a quieter place.", **metrics)

    speech_idx = np.flatnonzero(mask)
    frame = SAMPLE_RATE * FRAME_MS // 1000
    hop = SAMPLE_RATE * HOP_MS // 1000
    pad = int(0.15 * SAMPLE_RATE)
    start = max(0, int(speech_idx[0]) * hop - pad)
    end = min(len(audio), (int(speech_idx[-1]) + 1) * hop + frame + pad)

    # Denoise the full signal (needs real noise-only frames to estimate from) and
    # only then cut out the padded speech region that gets scored. The gate
    # decisions above all ran on the raw signal, so a noisy-but-passable recording
    # is never silently "fixed" into looking cleaner than it is - only the copy
    # handed to the phoneme scorer is cleaned up.
    source = _spectral_denoise(audio, mask, frame, hop) if settings.DENOISE_AUDIO else audio
    trimmed = source[start:end]
    trimmed = (trimmed / (np.max(np.abs(trimmed)) + 1e-9) * 0.9).astype(np.float32)

    return AudioQualityReport(
        ok=True, reason=None, audio=trimmed,
        speech_start_sec=start / SAMPLE_RATE, speech_end_sec=end / SAMPLE_RATE,
        **metrics
    )
