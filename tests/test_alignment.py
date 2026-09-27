import pytest
from app.alignment.cmudict_service import cmu_service
from app.alignment.aligner import phoneme_aligner
from app.alignment.mapping import normalize_phoneme_sequence

def test_cmudict_expected_phonemes():
    # Verify standard CMUdict lookups without numeric stress digits
    think_phones = cmu_service.get_phonemes("think")
    assert think_phones == ["TH", "IH", "NG", "K"]

    ship_phones = cmu_service.get_phonemes("ship")
    assert ship_phones == ["SH", "IH", "P"]

    vine_phones = cmu_service.get_phonemes("vine")
    assert vine_phones == ["V", "AY", "N"]

    chair_phones = cmu_service.get_phonemes("chair")
    assert chair_phones == ["CH", "EH", "R"]

def test_ipa_to_arpabet_normalization():
    # Test converting IPA characters from speech recognizer to ARPAbet
    ipa_sample = ["θ", "ɪ", "ŋ", "k"]
    normalized = normalize_phoneme_sequence(ipa_sample)
    assert normalized == ["TH", "IH", "NG", "K"]

    ipa_sh = ["ʃ", "ɪ", "p"]
    assert normalize_phoneme_sequence(ipa_sh) == ["SH", "IH", "P"]

def test_phoneme_aligner_perfect_match():
    # Spoken exactly as expected
    expected = ["TH", "IH", "NG", "K"]
    detected = ["TH", "IH", "NG", "K"]

    result = phoneme_aligner.align("think", expected, detected)
    assert len(result.errors) == 0
    assert result.target_sound_stats["TH"]["correct"] == 1
    assert result.target_sound_stats["TH"]["incorrect"] == 0

def test_phoneme_aligner_substitution_th_to_t():
    # User pronounced 'think' as 'tink' (TH -> T)
    expected = ["TH", "IH", "NG", "K"]
    detected = ["T", "IH", "NG", "K"]

    result = phoneme_aligner.align("think", expected, detected)
    assert len(result.errors) == 1
    assert result.errors[0] == {"expected": "TH", "actual": "T"}
    assert result.target_sound_stats["TH"]["correct"] == 0
    assert result.target_sound_stats["TH"]["incorrect"] == 1

def test_phoneme_aligner_ipa_input_substitution():
    # Recognizer outputs IPA: 't', 'ɪ', 'ŋ', 'k'
    expected = ["TH", "IH", "NG", "K"]
    detected_ipa = ["t", "ɪ", "ŋ", "k"]

    result = phoneme_aligner.align("think", expected, detected_ipa)
    assert len(result.errors) == 1
    assert result.errors[0] == {"expected": "TH", "actual": "T"}

def test_phoneme_aligner_multiple_target_sounds():
    # 'church' has two CH sounds: expected ['CH', 'ER', 'CH']
    # If first is replaced with 'SH' and second is correct:
    expected = ["CH", "ER", "CH"]
    detected = ["SH", "ER", "CH"]

    result = phoneme_aligner.align("church", expected, detected)
    assert result.target_sound_stats["CH"]["correct"] == 1
    assert result.target_sound_stats["CH"]["incorrect"] == 1
    assert result.errors == [{"expected": "CH", "actual": "SH"}]
