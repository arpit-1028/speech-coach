import json
import logging
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Union

import numpy as np

from app.config import settings
from app.speech.base import PhonemeRecognizer

logger = logging.getLogger(__name__)

# wav2vec2 outputs one frame every 20 ms
FRAME_SEC = 0.02

# Model tokens (espeak IPA) that count as an acceptable realisation of each ARPAbet phoneme.
# Compound r-coloured tokens (e.g. "ɑːɹ") are accepted by both the vowel and the R because
# the model often emits them as a single unit.
ARPABET_TO_MODEL_TOKENS: Dict[str, List[str]] = {
    # Vowels
    "AA": ["ɑː", "ɑ", "a", "ɒ", "ɑːɹ"],
    "AE": ["æ", "a"],
    "AH": ["ʌ", "ə", "ɐ", "əl"],
    "AO": ["ɔː", "ɔ", "ɒ", "ɑː", "ɔːɹ", "oːɹ"],
    "AW": ["aʊ"],
    "AY": ["aɪ", "aɪɚ", "aɪə"],
    "EH": ["ɛ", "e", "ɛɹ"],
    "ER": ["ɚ", "ɜː", "ɜ"],
    "EY": ["eɪ", "e", "eː"],
    "IH": ["ɪ", "ᵻ", "i", "ɪɹ"],
    "IY": ["iː", "i", "iə"],
    "OW": ["oʊ", "əʊ", "o", "oː", "oːɹ"],
    "OY": ["ɔɪ"],
    "UH": ["ʊ", "ʊɹ"],
    "UW": ["uː", "u"],
    # Consonants
    "B": ["b"],
    "CH": ["tʃ"],
    "D": ["d", "ɾ"],
    "DH": ["ð"],
    "F": ["f"],
    "G": ["ɡ"],
    "HH": ["h"],
    "JH": ["dʒ"],
    "K": ["k"],
    "L": ["l", "ɫ", "əl"],
    "M": ["m"],
    "N": ["n", "n̩"],
    "NG": ["ŋ"],
    "P": ["p"],
    "R": ["ɹ", "r", "ɻ", "ɚ", "ɑːɹ", "ɔːɹ", "oːɹ", "ɛɹ", "ɪɹ", "ʊɹ", "aɪɚ"],
    "S": ["s"],
    "SH": ["ʃ"],
    "T": ["t", "ɾ", "ʔ"],
    "TH": ["θ"],
    "V": ["v"],
    "W": ["w"],
    "Y": ["j"],
    "Z": ["z"],
    "ZH": ["ʒ"],
}

# How a competing model token is reported back (for the confusion matrix)
MODEL_TOKEN_TO_ARPABET: Dict[str, str] = {
    "θ": "TH", "ð": "DH", "t": "T", "t̪": "T", "d": "D", "s": "S", "s̪": "S", "z": "Z",
    "ʃ": "SH", "ʂ": "SH", "ʒ": "ZH", "tʃ": "CH", "dʒ": "JH", "f": "F", "v": "V", "w": "W",
    "ɹ": "R", "r": "R", "ɻ": "R", "ʁ": "R", "ɽ": "R", "l": "L", "ɫ": "L", "ɭ": "L",
    "m": "M", "n": "N", "n̩": "N", "ŋ": "NG", "h": "HH", "j": "Y", "p": "P", "b": "B",
    "k": "K", "ɡ": "G", "ɾ": "T", "ʔ": "T", "ʈ": "T", "ɖ": "D", "ts": "S",
    "i": "IY", "iː": "IY", "iə": "IY", "ɪ": "IH", "ᵻ": "IH", "ɪɹ": "IH",
    "e": "EY", "eɪ": "EY", "eː": "EY", "ɛ": "EH", "ɛɹ": "EH", "æ": "AE",
    "a": "AA", "aː": "AA", "ɑ": "AA", "ɑː": "AA", "ɑːɹ": "AA",
    "ɒ": "AO", "ɔ": "AO", "ɔː": "AO", "ɔːɹ": "AO", "oːɹ": "AO",
    "o": "OW", "oː": "OW", "oʊ": "OW", "əʊ": "OW",
    "ʊ": "UH", "ʊɹ": "UH", "u": "UW", "uː": "UW",
    "ʌ": "AH", "ɐ": "AH", "ə": "AH", "əl": "AH",
    "ɚ": "ER", "ɜ": "ER", "ɜː": "ER",
    "aɪ": "AY", "aɪɚ": "AY", "aɪə": "AY", "aʊ": "AW", "ɔɪ": "OY",
}

VOWELS = {"AA", "AE", "AH", "AO", "AW", "AY", "EH", "ER", "EY", "IH", "IY", "OW", "OY", "UH", "UW"}


@dataclass
class PhonemeScore:
    phoneme: str
    score: float            # 0-100: share of the phoneme's acoustic evidence that matches the target
    gop: float              # log-ratio of target vs best competitor (> 0 means target wins)
    status: str             # correct | unclear | wrong | deleted
    heard: Optional[str]    # best competing phoneme when not correct
    start_sec: float
    end_sec: float

    def to_dict(self) -> Dict:
        d = asdict(self)
        d["score"] = round(self.score, 1)
        d["gop"] = round(self.gop, 2)
        d["start_sec"] = round(self.start_sec, 2)
        d["end_sec"] = round(self.end_sec, 2)
        return d


@dataclass
class GOPResult:
    expected_phonemes: List[str]
    phoneme_scores: List[PhonemeScore]
    word_score: float
    free_decoding: List[str]


def non_rhotic_variant(phonemes: Sequence[str]) -> Optional[List[str]]:
    """Drops R after a vowel when not followed by a vowel ("car" -> K AA), as in British/Indian English."""
    out = []
    changed = False
    for i, p in enumerate(phonemes):
        prev_is_vowel = i > 0 and phonemes[i - 1] in VOWELS
        next_is_vowel = i + 1 < len(phonemes) and phonemes[i + 1] in VOWELS
        if p == "R" and prev_is_vowel and not next_is_vowel:
            changed = True
            continue
        out.append(p)
    return out if changed else None


class GOPScorer(PhonemeRecognizer):
    """
    Goodness-of-Pronunciation scorer built on a wav2vec2 CTC phoneme model.

    1. Computes frame-level phoneme posteriors for the (VAD-trimmed) recording.
    2. Forced-aligns the expected phonemes with CTC Viterbi, so each expected
       phoneme gets its own time span (no free-recognition guessing).
    3. Scores each phoneme as the share of non-blank posterior mass in its span that
       belongs to an acceptable realisation, and reports the strongest competitor.
    """

    uses_quality_gate = True

    def __init__(self, model_name: Optional[str] = None):
        self.model_name = model_name or settings.GOP_MODEL_NAME
        self._model = None
        self._feature_extractor = None
        self._id_to_token: Dict[int, str] = {}
        self._token_to_id: Dict[str, int] = {}
        self._blank_id = 0
        self._special_ids: List[int] = []

    # ── Model ─────────────────────────────────────────────────────────────
    def _load(self):
        if self._model is not None:
            return
        try:
            import torch  # noqa: F401
            from huggingface_hub import hf_hub_download
            from transformers import Wav2Vec2FeatureExtractor, Wav2Vec2ForCTC
        except ImportError as e:
            raise RuntimeError("GOP engine requires 'torch' and 'transformers' to be installed.") from e

        logger.info("Loading GOP phoneme model '%s'...", self.model_name)
        self._feature_extractor = Wav2Vec2FeatureExtractor.from_pretrained(self.model_name)
        self._model = Wav2Vec2ForCTC.from_pretrained(self.model_name).eval()

        # Read the vocabulary directly (the phoneme tokenizer would require espeak/phonemizer)
        with open(hf_hub_download(self.model_name, "vocab.json"), encoding="utf-8") as f:
            vocab: Dict[str, int] = json.load(f)
        self._token_to_id = vocab
        self._id_to_token = {i: t for t, i in vocab.items()}
        self._blank_id = vocab.get("<pad>", self._model.config.pad_token_id or 0)
        self._special_ids = [vocab[t] for t in ("<pad>", "<s>", "</s>", "<unk>") if t in vocab]
        # The model is multilingual; only English-relevant tokens compete with the target
        english_tokens = set(MODEL_TOKEN_TO_ARPABET) | {"ʋ"}
        for tokens in ARPABET_TO_MODEL_TOKENS.values():
            english_tokens.update(tokens)
        self._english_ids = np.array(sorted(vocab[t] for t in english_tokens if t in vocab))

    def log_posteriors(self, audio: np.ndarray) -> np.ndarray:
        """Returns [frames, vocab] log-probabilities."""
        import torch

        self._load()
        inputs = self._feature_extractor(audio, sampling_rate=16000, return_tensors="pt")
        with torch.inference_mode():
            logits = self._model(inputs.input_values).logits[0]
        return torch.log_softmax(logits.float(), dim=-1).cpu().numpy()

    def _acceptable_ids(self, phoneme: str) -> List[int]:
        tokens = ARPABET_TO_MODEL_TOKENS.get(phoneme, [])
        ids = [self._token_to_id[t] for t in tokens if t in self._token_to_id]
        if not ids:
            raise ValueError(f"Phoneme '{phoneme}' has no matching token in model vocabulary.")
        return ids

    # ── Free decoding (interface compatibility / debugging) ───────────────
    def greedy_decode(self, logp: np.ndarray) -> List[str]:
        best = logp.argmax(axis=1)
        out, prev = [], None
        for i in best:
            if i != prev and i not in self._special_ids:
                out.append(self._id_to_token[int(i)])
            prev = i
        return out

    def extract_phonemes(self, audio_path: Union[str, Path]) -> List[str]:
        from app.speech.quality import load_audio_16k

        return self.greedy_decode(self.log_posteriors(load_audio_16k(audio_path)))

    # ── Forced alignment ──────────────────────────────────────────────────
    @staticmethod
    def _ctc_viterbi(blank_lp: np.ndarray, unit_lp: np.ndarray, can_skip: List[bool]):
        """
        CTC Viterbi over states [blank, u0, blank, u1, ..., u(K-1), blank].
        blank_lp: [T], unit_lp: [T, K], can_skip[k]: unit k may follow unit k-1 without a blank.
        Returns (path log-likelihood, list of frame indices per unit).
        """
        T, K = unit_lp.shape
        S = 2 * K + 1
        emit = np.empty((T, S))
        emit[:, 0::2] = blank_lp[:, None]
        emit[:, 1::2] = unit_lp

        skip_ok = np.zeros(S, dtype=bool)
        for k in range(1, K):
            skip_ok[2 * k + 1] = can_skip[k]

        neg = -np.inf
        dp = np.full(S, neg)
        dp[0] = emit[0, 0]
        dp[1] = emit[0, 1]
        back = np.zeros((T, S), dtype=np.int8)  # 0 = stay, 1 = from s-1, 2 = from s-2

        for t in range(1, T):
            stay = dp
            prev1 = np.concatenate(([neg], dp[:-1]))
            prev2 = np.where(skip_ok, np.concatenate(([neg, neg], dp[:-2])), neg)
            stacked = np.stack([stay, prev1, prev2])
            choice = stacked.argmax(axis=0)
            dp = stacked[choice, np.arange(S)] + emit[t]
            back[t] = choice

        end = S - 1 if dp[S - 1] >= dp[S - 2] else S - 2
        score = float(dp[end])
        frames: List[List[int]] = [[] for _ in range(K)]
        s = end
        for t in range(T - 1, -1, -1):
            if s % 2 == 1:
                frames[s // 2].append(t)
            s -= int(back[t, s])
        for f in frames:
            f.reverse()
        return score, frames

    def _align(self, logp: np.ndarray, phonemes: List[str]):
        acc = [self._acceptable_ids(p) for p in phonemes]
        unit_lp = np.stack(
            [np.logaddexp.reduce(logp[:, ids], axis=1) for ids in acc], axis=1
        )
        can_skip = [True] + [set(acc[k]) != set(acc[k - 1]) for k in range(1, len(acc))]
        score, frames = self._ctc_viterbi(logp[:, self._blank_id], unit_lp, can_skip)
        return score, frames, acc

    # ── Scoring ───────────────────────────────────────────────────────────
    def _score_phoneme(self, probs: np.ndarray, phoneme: str, frames: List[int],
                       acc_ids: List[int]) -> PhonemeScore:
        seg = probs[frames]
        nonblank = seg.sum(axis=1) - seg[:, self._special_ids].sum(axis=1)
        nb_mass = float(nonblank.sum())
        acc_mass = float(seg[:, acc_ids].sum())
        english_mass = float(seg[:, self._english_ids].sum())

        competitor_mass = np.zeros(seg.shape[1])
        competitor_mass[self._english_ids] = seg[:, self._english_ids].sum(axis=0)
        competitor_mass[acc_ids] = 0.0
        best_comp_id = int(competitor_mass.argmax())
        best_comp_mass = float(competitor_mass[best_comp_id])

        score = min(100.0, 100.0 * acc_mass / max(english_mass, 1e-3))
        gop = float(np.log(acc_mass + 1e-6) - np.log(best_comp_mass + 1e-6))

        # Status follows the GOP log-ratio (target vs. its single best competitor) -
        # not `score` above, which measures share of mass across *all* English
        # phones and is too harsh: a correctly produced phoneme on a multilingual
        # model routinely wins against every individual competitor while still
        # holding well under half of the total probability mass.
        heard = None
        if nb_mass < 0.3 and acc_mass < 0.1:
            status = "deleted"
        elif gop >= settings.GOP_PASS_MARGIN and acc_mass >= settings.GOP_MIN_EVIDENCE:
            status = "correct"
        else:
            status = "wrong" if gop < -settings.GOP_FAIL_MARGIN else "unclear"
            if best_comp_mass > acc_mass:
                token = self._id_to_token[best_comp_id]
                heard = MODEL_TOKEN_TO_ARPABET.get(token, token)
                # The labiodental approximant ʋ sits between V and W (common in Indian English):
                # report it as the other member of the pair so the V/W confusion is visible.
                if token == "ʋ":
                    heard = "W" if phoneme == "V" else "V"
                if heard == phoneme:
                    heard = None

        return PhonemeScore(
            phoneme=phoneme, score=score, gop=gop, status=status, heard=heard,
            start_sec=frames[0] * FRAME_SEC, end_sec=(frames[-1] + 1) * FRAME_SEC,
        )

    def score_audio(
        self, audio: np.ndarray, pronunciations: List[List[str]], allow_non_rhotic: bool = True
    ) -> GOPResult:
        """
        Scores audio against the best-matching accepted pronunciation of the word.
        `allow_non_rhotic` should be False when R is the sound actually being tested,
        so a dropped R is scored as missing rather than silently accepted as a pass.
        """
        if not pronunciations:
            raise ValueError("No reference pronunciation supplied.")
        logp = self.log_posteriors(audio)

        accept_non_rhotic = settings.ACCEPT_NON_RHOTIC and allow_non_rhotic
        variants: List[List[str]] = []
        for pron in pronunciations:
            for v in (pron, non_rhotic_variant(pron) if accept_non_rhotic else None):
                if v and v not in variants:
                    variants.append(v)

        best = None
        for variant in variants:
            if len(variant) > logp.shape[0]:
                continue
            score, frames, acc = self._align(logp, variant)
            if best is None or score > best[0]:
                best = (score, variant, frames, acc)
        if best is None:
            raise ValueError("Recording is too short for the expected word.")

        _, variant, frames, acc = best
        probs = np.exp(logp)
        scores = [self._score_phoneme(probs, p, f, ids) for p, f, ids in zip(variant, frames, acc)]
        word_score = float(np.mean([s.score for s in scores]))
        return GOPResult(
            expected_phonemes=list(variant),
            phoneme_scores=scores,
            word_score=word_score,
            free_decoding=self.greedy_decode(logp),
        )
