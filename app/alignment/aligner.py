from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any
from app.config import settings
from app.alignment.mapping import normalize_phoneme_sequence

@dataclass
class PhonemeAlignment:
    expected: Optional[str]
    actual: Optional[str]
    is_match: bool
    is_target_sound: bool

@dataclass
class AlignmentAnalysis:
    word: str
    expected_phonemes: List[str]
    detected_phonemes: List[str]
    alignments: List[PhonemeAlignment]
    errors: List[Dict[str, str]]
    target_sound_stats: Dict[str, Dict[str, float]] = field(default_factory=dict)
    # target_sound_stats: { "TH": {"correct": 0, "incorrect": 1, "score_sum": 12.5, "scored": 1} }
    # Filled by the GOP engine only: per-phoneme 0-100 scores and the recording quality report
    phoneme_scores: List[Dict[str, Any]] = field(default_factory=list)
    word_score: Optional[float] = None
    quality: Optional[Dict[str, Any]] = None
    engine: str = "alignment"

class PhonemeAligner:
    """
    Performs dynamic programming global sequence alignment (Needleman-Wunsch)
    on expected ARPAbet phonemes vs detected phonemes.
    Identifies exact substitutions, omissions, and insertions.
    """

    MATCH_SCORE = 2
    MISMATCH_PENALTY = -1
    GAP_PENALTY = -2

    def align(self, word: str, expected: List[str], detected: List[str]) -> AlignmentAnalysis:
        norm_expected = [p.upper() for p in expected]
        norm_detected = normalize_phoneme_sequence(detected)

        n = len(norm_expected)
        m = len(norm_detected)

        # Initialize DP table
        dp = [[0] * (m + 1) for _ in range(n + 1)]
        # Traceback pointers: 'D' (diagonal), 'U' (up/deletion), 'L' (left/insertion)
        trace = [[None] * (m + 1) for _ in range(n + 1)]

        for i in range(1, n + 1):
            dp[i][0] = dp[i - 1][0] + self.GAP_PENALTY
            trace[i][0] = 'U'

        for j in range(1, m + 1):
            dp[0][j] = dp[0][j - 1] + self.GAP_PENALTY
            trace[0][j] = 'L'

        for i in range(1, n + 1):
            for j in range(1, m + 1):
                exp_p = norm_expected[i - 1]
                det_p = norm_detected[j - 1]

                diag_score = dp[i - 1][j - 1] + (self.MATCH_SCORE if exp_p == det_p else self.MISMATCH_PENALTY)
                up_score = dp[i - 1][j] + self.GAP_PENALTY
                left_score = dp[i][j - 1] + self.GAP_PENALTY

                best_score = max(diag_score, up_score, left_score)
                dp[i][j] = best_score

                if best_score == diag_score:
                    trace[i][j] = 'D'
                elif best_score == up_score:
                    trace[i][j] = 'U'
                else:
                    trace[i][j] = 'L'

        # Traceback
        i, j = n, m
        aligned_pairs = []

        while i > 0 or j > 0:
            direction = trace[i][j]
            if direction == 'D':
                aligned_pairs.append((norm_expected[i - 1], norm_detected[j - 1]))
                i -= 1
                j -= 1
            elif direction == 'U':
                aligned_pairs.append((norm_expected[i - 1], None))
                i -= 1
            elif direction == 'L':
                aligned_pairs.append((None, norm_detected[j - 1]))
                j -= 1
            else:
                break

        aligned_pairs.reverse()

        # Parse alignments and build stats
        alignments: List[PhonemeAlignment] = []
        errors: List[Dict[str, str]] = []
        target_sound_stats: Dict[str, Dict[str, int]] = {
            sound: {"correct": 0, "incorrect": 0} for sound in settings.TARGET_SOUNDS
        }

        for exp_p, det_p in aligned_pairs:
            is_match = (exp_p is not None and det_p is not None and exp_p == det_p)
            is_target = (exp_p in settings.TARGET_SOUNDS) if exp_p else False

            alignments.append(PhonemeAlignment(
                expected=exp_p,
                actual=det_p,
                is_match=is_match,
                is_target_sound=is_target
            ))

            if not is_match:
                if exp_p is not None and det_p is not None:
                    # Direct substitution
                    errors.append({"expected": exp_p, "actual": det_p})
                elif exp_p is not None and det_p is None:
                    # Deletion
                    errors.append({"expected": exp_p, "actual": "<DELETED>"})

            if is_target and exp_p:
                if is_match:
                    target_sound_stats[exp_p]["correct"] += 1
                else:
                    target_sound_stats[exp_p]["incorrect"] += 1

        return AlignmentAnalysis(
            word=word,
            expected_phonemes=norm_expected,
            detected_phonemes=norm_detected,
            alignments=alignments,
            errors=errors,
            target_sound_stats=target_sound_stats
        )

phoneme_aligner = PhonemeAligner()
