import wave

import numpy as np
import pytest

from app.engines.sound_mastery import wilson_interval
from app.speech.gop_engine import GOPScorer, non_rhotic_variant
from app.speech.pipeline import _analysis_from_gop
from app.speech.quality import assess_audio, _spectral_denoise

TOKENS = ["<pad>", "<s>", "</s>", "<unk>", "θ", "t", "ɪ", "ŋ", "k", "ɹ", "iː", "ɑː", "ts.h"]


class SyntheticGOPScorer(GOPScorer):
    """GOP scorer over a tiny vocabulary with hand-made posteriors (no model download)."""

    def __init__(self, frames):
        super().__init__(model_name="synthetic")
        self._token_to_id = {t: i for i, t in enumerate(TOKENS)}
        self._id_to_token = dict(enumerate(TOKENS))
        self._blank_id = 0
        self._special_ids = [0, 1, 2, 3]
        self._english_ids = np.array([i for i, t in enumerate(TOKENS) if i > 3 and t != "ts.h"])
        self._frames = frames

    def log_posteriors(self, audio):
        # Each frame: dict token -> probability; remainder goes to blank
        logp = np.full((len(self._frames), len(TOKENS)), 1e-6)
        for t, frame in enumerate(self._frames):
            for tok, p in frame.items():
                logp[t, self._token_to_id[tok]] = p
            logp[t, 0] = max(1e-6, 1 - sum(frame.values()))
        logp /= logp.sum(axis=1, keepdims=True)
        return np.log(logp)


def _frames(*spikes):
    """Builds blank / spike / blank frames for a sequence of {token: prob} spikes."""
    frames = [{}]
    for spike in spikes:
        frames += [spike, {}]
    return frames


def test_gop_correct_pronunciation_scores_high():
    scorer = SyntheticGOPScorer(_frames({"θ": 0.9}, {"ɪ": 0.9}, {"ŋ": 0.9}, {"k": 0.9}))
    result = scorer.score_audio(np.zeros(1), [["TH", "IH", "NG", "K"]])
    assert [p.status for p in result.phoneme_scores] == ["correct"] * 4
    assert all(p.score > 90 for p in result.phoneme_scores)
    assert result.word_score > 90


def test_gop_detects_th_to_t_substitution():
    scorer = SyntheticGOPScorer(_frames({"t": 0.85, "θ": 0.05}, {"ɪ": 0.9}, {"ŋ": 0.9}, {"k": 0.9}))
    result = scorer.score_audio(np.zeros(1), [["TH", "IH", "NG", "K"]])
    th = result.phoneme_scores[0]
    assert th.status == "wrong"
    assert th.heard == "T"
    assert th.gop < 0
    assert all(p.status == "correct" for p in result.phoneme_scores[1:])


def test_gop_ignores_non_english_competitors():
    # Mass on a Mandarin token must not be reported as the substitute
    scorer = SyntheticGOPScorer(_frames({"ts.h": 0.6, "t": 0.3}, {"ɹ": 0.9}, {"iː": 0.9}))
    result = scorer.score_audio(np.zeros(1), [["TH", "R", "IY"]])
    assert result.phoneme_scores[0].heard == "T"


def test_gop_detects_deleted_phoneme():
    # "thin" without the final K: nothing is emitted for K
    scorer = SyntheticGOPScorer(_frames({"θ": 0.9}, {"ɪ": 0.9}, {"ŋ": 0.9}) + [{}, {}])
    result = scorer.score_audio(np.zeros(1), [["TH", "IH", "NG", "K"]])
    assert result.phoneme_scores[-1].status == "deleted"


def test_gop_accepts_non_rhotic_pronunciation():
    # "car" said as K AA (no R) should not be penalised
    scorer = SyntheticGOPScorer(_frames({"k": 0.9}, {"ɑː": 0.9}))
    result = scorer.score_audio(np.zeros(1), [["K", "AA", "R"]])
    assert result.expected_phonemes == ["K", "AA"]
    assert all(p.status == "correct" for p in result.phoneme_scores)


def test_non_rhotic_variant_only_drops_postvocalic_r():
    assert non_rhotic_variant(["K", "AA", "R"]) == ["K", "AA"]
    assert non_rhotic_variant(["V", "EH", "R", "IY"]) is None  # R before a vowel stays
    assert non_rhotic_variant(["R", "EH", "D"]) is None


def test_gop_non_rhotic_disabled_for_r_target():
    # When R is the sound actually under test, dropping it must not be silently
    # accepted as a pass - only enabled for accent fairness on *other* sound tests.
    scorer = SyntheticGOPScorer(_frames({"k": 0.9}, {"ɑː": 0.9}))
    result = scorer.score_audio(np.zeros(1), [["K", "AA", "R"]], allow_non_rhotic=False)
    assert result.expected_phonemes == ["K", "AA", "R"]
    assert result.phoneme_scores[-1].status == "deleted"


def test_gop_status_follows_log_ratio_not_mass_share():
    # Target captures only ~23% of total English probability mass - spread thin
    # across several competitors, as real (non-synthetic) multilingual posteriors
    # often are - but still clearly beats every individual competitor. The old
    # "majority of all mass" rule called this "wrong"; the textbook GOP log-ratio
    # (target vs. its single best competitor) correctly calls it "correct".
    frame = {"θ": 0.15, "t": 0.10, "ɪ": 0.09, "ŋ": 0.08, "k": 0.07, "ɹ": 0.06, "iː": 0.05, "ɑː": 0.05}
    scorer = SyntheticGOPScorer(_frames(frame))
    result = scorer.score_audio(np.zeros(1), [["TH"]])
    th = result.phoneme_scores[0]
    assert th.score < 25  # the display "mass share" metric is still low...
    assert th.gop > 0
    assert th.status == "correct"  # ...but it no longer drives the status decision


def test_gop_analysis_feeds_mastery_and_confusion():
    scorer = SyntheticGOPScorer(_frames({"t": 0.85}, {"ɪ": 0.9}, {"ŋ": 0.9}, {"k": 0.9}))
    analysis = _analysis_from_gop("think", scorer.score_audio(np.zeros(1), [["TH", "IH", "NG", "K"]]), {})
    assert analysis.errors == [{"expected": "TH", "actual": "T"}]
    assert analysis.target_sound_stats["TH"]["incorrect"] == 1
    assert analysis.target_sound_stats["TH"]["scored"] == 1
    assert analysis.engine == "gop"
    assert len(analysis.phoneme_scores) == 4


def test_wilson_interval_widens_for_small_samples():
    low1, high1 = wilson_interval(1, 1)
    low10, high10 = wilson_interval(10, 10)
    assert low1 < 25 and high1 == 100.0
    assert low10 > 70
    low, high = wilson_interval(9, 25)
    assert low < 36 < high


# ── Noise reduction ──────────────────────────────────────────────────────

def test_spectral_denoise_reduces_noise_energy():
    rng = np.random.default_rng(3)
    noise = rng.normal(0, 0.2, 16000).astype(np.float32)
    frame, hop = 400, 160  # 25ms / 10ms at 16kHz
    n_frames = 1 + (len(noise) - frame) // hop
    mask = np.zeros(n_frames, dtype=bool)  # the whole clip is the noise reference

    denoised = _spectral_denoise(noise, mask, frame, hop)
    assert denoised.shape == noise.shape
    raw_rms = float(np.sqrt(np.mean(noise ** 2)))
    clean_rms = float(np.sqrt(np.mean(denoised ** 2)))
    assert clean_rms < raw_rms
    # Never amplifies: a noise-reduction step must not output more energy than it was given
    assert float(np.max(np.abs(denoised))) <= float(np.max(np.abs(noise))) + 1e-6


def test_spectral_denoise_preserves_speech_while_cutting_noise():
    # A tone burst (stand-in for voiced speech) in the middle third, silence
    # elsewhere, plus background noise everywhere. The denoiser must cut the
    # noise-only thirds without also wiping out the speech third.
    rng = np.random.default_rng(7)
    sr = 16000
    t = np.arange(int(sr * 0.8)) / sr
    tone = 0.5 * np.sin(2 * np.pi * 200 * t) + 0.2 * np.sin(2 * np.pi * 400 * t)
    speech_region = np.zeros(len(t), dtype=bool)
    speech_region[len(t) // 3: 2 * len(t) // 3] = True
    speech = np.where(speech_region, tone, 0.0)
    noisy = (speech + rng.normal(0, 0.08, len(t))).astype(np.float32)

    frame, hop = 400, 160
    n_frames = 1 + (len(noisy) - frame) // hop
    mask = np.zeros(n_frames, dtype=bool)
    mask[n_frames // 3: 2 * n_frames // 3] = True

    denoised = _spectral_denoise(noisy, mask, frame, hop)
    assert denoised.shape == noisy.shape
    assert float(np.max(np.abs(denoised))) <= float(np.max(np.abs(noisy))) + 1e-6

    lo, hi = len(t) // 3, 2 * len(t) // 3
    speech_rms_in = float(np.sqrt(np.mean(noisy[lo:hi] ** 2)))
    speech_rms_out = float(np.sqrt(np.mean(denoised[lo:hi] ** 2)))
    noise_rms_in = float(np.sqrt(np.mean(noisy[:2000] ** 2)))
    noise_rms_out = float(np.sqrt(np.mean(denoised[:2000] ** 2)))

    assert speech_rms_out > 0.7 * speech_rms_in  # speech mostly kept...
    assert noise_rms_out < 0.5 * noise_rms_in    # ...noise substantially cut


# ── Recording quality gate ───────────────────────────────────────────────

def _write_wav(path, audio):
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(16000)
        wf.writeframes((np.clip(audio, -1, 1) * 32767).astype("<i2").tobytes())


def _speech_like(seconds=0.4, amp=0.5):
    """Harmonic tone with a syllable-like envelope, padded with near-silence."""
    rng = np.random.default_rng(0)
    t = np.arange(int(16000 * seconds)) / 16000
    voiced = amp * np.sin(2 * np.pi * 150 * t) * np.hanning(len(t))
    pad = rng.normal(0, 0.0005, 8000)
    return np.concatenate([pad, voiced, pad])


@pytest.mark.parametrize("name, audio, ok, reason_part", [
    ("good", _speech_like(), True, None),
    ("silence", np.random.default_rng(1).normal(0, 0.0005, 32000), False, "No voice"),
    ("clipped", np.clip(_speech_like(amp=20), -1, 1), False, "distorted"),
    ("noisy", _speech_like() + np.random.default_rng(2).normal(0, 0.2, 22400), False, "noise"),
    ("too_short", _speech_like(seconds=0.05), False, "too short"),
    # Said the word twice (with a clear pause) instead of once - forced alignment
    # assumes a single utterance, so this must be rejected before scoring, not
    # produce a confusing/garbage result.
    ("repeated", np.concatenate([_speech_like(), _speech_like()]), False, "more than one"),
])
def test_quality_gate(tmp_path, name, audio, ok, reason_part):
    path = tmp_path / f"{name}.wav"
    _write_wav(path, audio)
    report = assess_audio(path)
    assert report.ok is ok, report.to_dict()
    if ok:
        assert report.audio is not None and len(report.audio) < len(audio)
    else:
        assert reason_part.lower() in report.reason.lower()
