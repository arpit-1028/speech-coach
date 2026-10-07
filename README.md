---
title: Speech Coach New Approach
emoji: 🎙️
colorFrom: indigo
colorTo: blue
sdk: gradio
app_file: app.py
pinned: false
---

# Phoneme-Based Pronunciation Diagnostic Platform

A high-precision, modular FastAPI backend built for **pure phoneme-based pronunciation diagnostics**.

---

## 🚫 Key Architectural Differentiators

Unlike generic speech apps, this system strictly follows these non-negotiable diagnostic rules:
1. **NO Speech-to-Text**: Business logic operates strictly on phoneme sequences, not orthographic transcripts.
2. **NO Transcript Comparison**: Phonetic errors are identified by comparing expected phoneme sequences from CMUdict against acoustic phoneme sequences extracted by the speech engine.
3. **NO Arbitrary Scores**: Mastery percentages are computed exclusively from actual occurrences:
   $$\text{Mastery \%} = \left(\frac{\text{correct\_occurrences}}{\text{correct\_occurrences} + \text{incorrect\_occurrences}}\right) \times 100$$
4. **Evidence Accumulation**: Weaknesses are never diagnosed from a single word attempt. Conclusions require multi-word evidence across positional contexts (initial, middle, final).
5. **Decoupled Engine Layer**: The speech extraction layer (`PhonemeRecognizer`) is fully abstracted. Allosaurus can be hot-swapped for Sherpa, MFA, GOP, or Wav2Vec2 without modifying a single line of business or database logic.

---

## 🏗️ Architecture

```
User Audio / Input
        │
        ▼
POST /diagnostic/submit
        │
        ├─► [Phoneme Recognizer Layer] (Allosaurus / Mock / Sherpa / MFA / GOP)
        │       └─► Extracted Acoustic Phonemes (IPA)
        │
        ├─► [CMUdict Service]
        │       └─► Expected Canonical Phonemes (ARPAbet)
        │
        ▼
[Dynamic Programming Aligner] (Needleman-Wunsch / Levenshtein)
        │
        ├─► Identifies exact substitutions: TH -> T, SH -> S, V -> W, etc.
        │
        ▼
[WordAttempts DB] (Logs expected, detected, errors, audio path, timestamp)
        │
   ┌────┴────────────────────────┐
   ▼                             ▼
[Confusion Matrix Engine]     [Sound Mastery Engine]
(Cumulative substitutions)   (Occurrence-based mastery %)
   │                             │
   └─────────────┬───────────────┘
                 ▼
     [Diagnostic Report Generator]
     - Categorizes Strong vs Weak Sounds
     - Sample-size Confidence (High / Med / Low)
     - Clinical assessment & Concrete examples
                 │
                 ▼
     [Dynamic Learning Path Engine]
     - Sound-based (Foundation -> Words -> ...)
     - Unlocks weak sounds (< 60%)
     - Advances on mastery (> 80%)
```

---

## 🎯 Target Sounds & Diagnostic Word Sets

Evaluates 8 target consonant sounds across phonological positions:
* **TH** (Voiceless dental fricative):
  - *Initial*: `think`, `three`, `thumb`, `thunder`, `thirty`, `thank`, `theory`, `thought`, `theme`, `thread`
  - *Middle*: `author`, `nothing`, `method`, `athlete`, `healthy`, `birthday`, `anything`, `bathroom`
  - *Final*: `bath`, `both`, `math`, `teeth`, `mouth`, `truth`
* **SH**: `ship`, `shop`, `sheep`, `shark`, `shine`, `short`, `she`, `show`, `shadow`, `fashion`, `nation`, `machine`, `ocean`, `wish`, `fish`, `dish`, `brush`, `crash`
* **V**: `vine`, `very`, `visit`, `voice`, `value`, `victory`, `video`, `village`, `seven`, `river`, `movie`, `travel`, `love`, `give`, `live`, `solve`
* **W**: `water`, `west`, `wind`, `wood`, `white`, `winter`, `window`, `wonder`, `always`, `away`, `reward`, `between`
* **R**: `red`, `right`, `road`, `rain`, `river`, `rocket`, `rose`, `rabbit`, `around`, `correct`, `arrive`, `orange`, `car`, `star`, `door`
* **L**: `light`, `look`, `lamp`, `love`, `long`, `learn`, `letter`, `lion`, `yellow`, `believe`, `follow`, `holiday`, `ball`, `call`, `school`, `hotel`
* **S**: `sun`, `city`, `sister`, `glass`, `pencil`, `dance`, `space`, `voice`, `house`, `simple`
* **CH**: `chair`, `cheese`, `child`, `watch`, `teacher`, `catch`, `nature`, `match`, `church`, `beach`

---

## 📊 Database Schema

* **`users`**: `id`, `name`, `email`, `created_at`
* **`diagnostic_sessions`**: `id`, `user_id`, `status` (`in_progress`, `completed`), `created_at`, `completed_at`
* **`word_attempts`**: `id`, `session_id`, `user_id`, `word`, `expected_phonemes` (JSON), `detected_phonemes` (JSON), `phoneme_errors` (JSON), `audio_path`, `timestamp`
* **`sound_scores`**: `id`, `user_id`, `phoneme`, `correct_occurrences`, `incorrect_occurrences`, `mastery_percentage`, `last_updated`
* **`confusion_matrix`**: `id`, `user_id`, `source_phoneme`, `target_phoneme`, `count`, `last_updated`
* **`unlocked_paths`**: `id`, `user_id`, `sound`, `stage`, `is_unlocked`, `unlocked_at`

---

## 🚀 Dynamic Learning Path Structure

Each sound possesses an independent 6-stage progression path:
```
[Sound: e.g., TH]
├─ Foundation
├─ Words
├─ Minimal Pairs
├─ Sentences
├─ Tongue Twisters
└─ Conversation
```
* **Auto-Unlock Rules**:
  - Sound Mastery $< 60\%$ $\rightarrow$ Automatically unlocks `<Sound> Foundation`.
  - Sound Mastery $\ge 80\%$ (or stage score $> 80\%$) $\rightarrow$ Automatically unlocks `<Sound> Words` and downstream stages.

---

## 🔌 API Endpoints Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/diagnostic/words` | Returns all diagnostic test word sets grouped by target sound |
| `POST` | `/diagnostic/start` | Initializes a diagnostic session for a user |
| `POST` | `/diagnostic/submit` | Submits audio or detected phonemes for alignment & mastery analysis |
| `GET` | `/diagnostic/report/{user_id}` | Generates evidence-based diagnostic report (JSON & ASCII) |
| `GET` | `/sound-profile/{user_id}` | Retrieves phoneme mastery stats and cumulative confusion matrix |
| `GET` | `/learning-path/{user_id}` | Retrieves unlocked progression stages for all target sounds |
| `POST` | `/learning-path/advance` | Advances a user to the next stage upon achieving score > 80% |
| `GET` | `/health` | Server health check |

---

## 💻 Quickstart

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```

### 2. Run Database Migrations & Start Server
```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
Interactive Swagger documentation is available at `http://localhost:8000/docs`.

### 3. Run Test Suite
```bash
pytest -v
```

---

## 🧪 Sample Diagnostic Report Output

```
=================================================
PRONUNCIATION DIAGNOSTIC REPORT
=================================================

Strong Sounds:
W
L
SH

Weak Sounds:
TH
V

---
TH ANALYSIS

Occurrences Tested:
25

Correct:
9

Incorrect:
16

Common Error:
TH -> T

Examples:
think -> tink
three -> tree
thirty -> tirty

Assessment:
User frequently substitutes TH with T.

Confidence:
High

=================================================
Recommended Learning Path:
1. TH Foundation
2. V Foundation
```
