import os
import sys
import tempfile
from pathlib import Path
import gradio as gr

# Ensure project root is in sys.path
BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from app.config import settings
from app.data.word_sets import DIAGNOSTIC_WORD_SETS, ALL_WORDS
from app.alignment.cmudict_service import cmu_service
from app.alignment.aligner import phoneme_aligner
from app.alignment.mapping import ARPABET_TO_IPA, normalize_phoneme_sequence
from app.speech.factory import get_phoneme_recognizer

# In-memory session stats for live testing
session_stats = {
    sound: {"correct": 0, "incorrect": 0} for sound in settings.TARGET_SOUNDS
}
substitution_history = []

def extract_words_for_sound(sound: str):
    data = DIAGNOSTIC_WORD_SETS.get(sound, [])
    if isinstance(data, dict):
        words = []
        for pos in ["initial", "middle", "final"]:
            words.extend(data.get(pos, []))
        return words
    elif isinstance(data, list):
        return data
    return []

try:
    import spaces
except ImportError:
    class spaces:
        @staticmethod
        def GPU(fn=None, duration=60):
            if fn is None:
                def decorator(f):
                    return f
                return decorator
            return fn

def get_words_for_sound(sound: str):
    words = extract_words_for_sound(sound)
    return gr.Dropdown(choices=words, value=words[0] if words else None)

@spaces.GPU
def evaluate_recording(sound: str, word: str, audio_path: str):
    if not word or not word.strip():
        return "ΓÜá∩╕Å Please select a target word.", "", "", ""

    if not audio_path:
        return "ΓÜá∩╕Å Please record your voice or upload an audio file first.", "", "", ""

    clean_word = word.strip().lower()

    # 1. Expected phonemes
    try:
        expected_arpabet = cmu_service.get_phonemes(clean_word)
        expected_ipa = [ARPABET_TO_IPA.get(p, p) for p in expected_arpabet]
    except Exception as e:
        return f"Γ¥î Error retrieving phonemes for '{clean_word}': {e}", "", "", ""

    # 2. Extract detected phonemes via Speech Recognizer (Allosaurus)
    try:
        recognizer = get_phoneme_recognizer()
        raw_detected_ipa = recognizer.extract_phonemes(audio_path)
    except Exception as e:
        return f"Γ¥î Phoneme recognition failed: {e}", "", "", ""

    # 3. Align expected vs detected via Needleman-Wunsch
    try:
        analysis = phoneme_aligner.align(
            word=clean_word,
            expected=expected_arpabet,
            detected=raw_detected_ipa
        )
    except Exception as e:
        return f"Γ¥î Alignment failed: {e}", "", "", ""

    # 4. Update session statistics
    for s, counts in analysis.target_sound_stats.items():
        session_stats[s]["correct"] += counts["correct"]
        session_stats[s]["incorrect"] += counts["incorrect"]

    for err in analysis.errors:
        substitution_history.append({
            "word": clean_word,
            "target": sound,
            "expected": err.get("expected"),
            "actual": err.get("actual")
        })

    # 5. Format Status Banner
    is_correct = len(analysis.errors) == 0
    if is_correct:
        status_md = f"### Γ£à Excellent! All phonemes matched accurately for **'{clean_word}'**."
    else:
        err_details = ", ".join([f"{e['expected']} Γ₧ö {e['actual']}" for e in analysis.errors])
        status_md = f"### ΓÜá∩╕Å Needs Practice: Substitution detected: **{err_details}**"

    # 6. Build Alignment Visual Table (HTML)
    table_rows = []
    for align in analysis.alignments:
        exp = align.expected or "ΓÇö"
        act = align.actual or "ΓÇö"
        exp_ipa = ARPABET_TO_IPA.get(exp, exp) if exp != "ΓÇö" else "ΓÇö"
        act_ipa = ARPABET_TO_IPA.get(act, act) if act != "ΓÇö" else "ΓÇö"

        if align.is_match:
            badge = "<span style='color: #10b981; font-weight: bold;'>Γ£ö MATCH</span>"
            row_bg = "rgba(16, 185, 129, 0.1)"
        else:
            badge = "<span style='color: #ef4444; font-weight: bold;'>Γ£û MISMATCH</span>"
            row_bg = "rgba(239, 68, 68, 0.1)"

        target_mark = "≡ƒÄ»" if align.is_target_sound else ""

        table_rows.append(f"""
        <tr style='background: {row_bg}; border-bottom: 1px solid #334155;'>
            <td style='padding: 8px 12px;'><b>{target_mark} {exp}</b> <span style='color: #94a3b8;'>/{exp_ipa}/</span></td>
            <td style='padding: 8px 12px;'><b>{act}</b> <span style='color: #94a3b8;'>/{act_ipa}/</span></td>
            <td style='padding: 8px 12px;'>{badge}</td>
        </tr>
        """)

    alignment_html = f"""
    <div style='background: #1e293b; border-radius: 10px; padding: 12px; margin-top: 8px;'>
        <table style='width: 100%; border-collapse: collapse; text-align: left; font-size: 0.95rem; color: #f8fafc;'>
            <thead>
                <tr style='border-bottom: 2px solid #475569; color: #60a5fa;'>
                    <th style='padding: 8px 12px;'>Expected Phoneme</th>
                    <th style='padding: 8px 12px;'>Heard Acoustic</th>
                    <th style='padding: 8px 12px;'>Status</th>
                </tr>
            </thead>
            <tbody>
                {''.join(table_rows)}
            </tbody>
        </table>
    </div>
    """

    # 7. Raw Phoneme Breakdown
    raw_details = f"""
**Word:** `{clean_word.upper()}`  
**Expected Canonical (ARPAbet):** `{' '.join(analysis.expected_phonemes)}`  
**Detected Acoustic (IPA):** `{' '.join(raw_detected_ipa)}`  
**Normalized Detected (ARPAbet):** `{' '.join(analysis.detected_phonemes)}`  
    """

    # 8. Sound Stats Summary
    tot = session_stats[sound]["correct"] + session_stats[sound]["incorrect"]
    pct = round((session_stats[sound]["correct"] / tot * 100)) if tot > 0 else 0
    stats_md = f"""
**Sound `{sound}` Session Accuracy:** **{pct}%** ({session_stats[sound]['correct']} / {tot} correct)  
*(Accumulated over your practice in this session)*
    """

    return status_md, alignment_html, raw_details, stats_md

def generate_report():
    lines = ["## ≡ƒôè Cumulative Diagnostic Assessment Report\n"]
    lines.append("| Sound | Total Tested | Correct | Incorrect | Mastery % | Clinical Status |")
    lines.append("|:---:|:---:|:---:|:---:|:---:|:---:|")

    for sound in settings.TARGET_SOUNDS:
        c = session_stats[sound]["correct"]
        inc = session_stats[sound]["incorrect"]
        tot = c + inc
        if tot == 0:
            status = "ΓÜ¬ Untested"
            pct_str = "ΓÇö"
        else:
            pct = round((c / tot) * 100)
            pct_str = f"{pct}%"
            if pct >= settings.STRONG_THRESHOLD:
                status = "≡ƒƒó Strong"
            elif pct < settings.WEAK_THRESHOLD:
                status = "≡ƒö┤ Weak"
            else:
                status = "≡ƒƒí Developing"

        lines.append(f"| **{sound}** | {tot} | {c} | {inc} | {pct_str} | {status} |")

    lines.append("\n### ≡ƒöì Recent Substitution Errors:")
    if not substitution_history:
        lines.append("*No errors recorded yet. Practice some words to generate evidence!*")
    else:
        recent = substitution_history[-10:]
        for e in reversed(recent):
            lines.append(f"- In word **'{e['word']}'**: Expected `{e['expected']}`, heard `{e['actual']}`")

    return "\n".join(lines)

def reset_stats():
    global substitution_history
    for s in settings.TARGET_SOUNDS:
        session_stats[s]["correct"] = 0
        session_stats[s]["incorrect"] = 0
    substitution_history = []
    return "Session stats reset successfully."

# ΓöÇΓöÇ Build Gradio UI ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
with gr.Blocks(title="Speech Coach - Phoneme Diagnostic Platform") as demo:
    gr.Markdown("""
    # ≡ƒÄÖ∩╕Å Pure Phoneme Diagnostic Platform
    ### Mobile-Friendly Testing Harness ΓÇö *Allosaurus + Needleman-Wunsch Global Alignment*
    *This tests pure acoustic phoneme extraction directly from your voice without Speech-to-Text bias.*
    """)

    with gr.Tab("≡ƒÄ» Live Word Diagnostic"):
        with gr.Row():
            with gr.Column(scale=1):
                sound_dropdown = gr.Dropdown(
                    choices=settings.TARGET_SOUNDS,
                    value="TH",
                    label="1. Target Sound"
                )
                initial_words = extract_words_for_sound("TH")
                word_dropdown = gr.Dropdown(
                    choices=initial_words,
                    value=initial_words[0] if initial_words else None,
                    label="2. Target Word"
                )

                sound_dropdown.change(
                    fn=get_words_for_sound,
                    inputs=[sound_dropdown],
                    outputs=[word_dropdown]
                )

                audio_input = gr.Audio(
                    sources=["microphone", "upload"],
                    type="filepath",
                    label="3. Speak into your microphone",
                )

                eval_btn = gr.Button("≡ƒÜÇ Submit & Evaluate Pronunciation", variant="primary", size="lg")

            with gr.Column(scale=1):
                status_output = gr.Markdown("### ≡ƒÄÖ∩╕Å Ready. Select a word, speak, and tap Submit.")
                alignment_output = gr.HTML()
                stats_output = gr.Markdown()
                raw_output = gr.Markdown()

        eval_btn.click(
            fn=evaluate_recording,
            inputs=[sound_dropdown, word_dropdown, audio_input],
            outputs=[status_output, alignment_output, raw_output, stats_output]
        )

    with gr.Tab("≡ƒôê Full Sound Mastery & Confusion Report"):
        gr.Markdown("Click below to compute your evidence-based diagnostic report across all target sounds.")
        report_btn = gr.Button("Generate Full Diagnostic Report", variant="secondary")
        report_output = gr.Markdown()
        reset_btn = gr.Button("Reset Session Stats", size="sm")
        reset_msg = gr.Markdown()

        report_btn.click(fn=generate_report, outputs=[report_output])
        reset_btn.click(fn=reset_stats, outputs=[reset_msg])

demo.queue()
demo.launch(server_name="0.0.0.0", server_port=7860, ssr_mode=False)
