---
title: Speech Coach Sapphire
emoji: 🏆
colorFrom: purple
colorTo: purple
sdk: docker
pinned: false
---

#  Pronunciation Coach

A backend system that analyzes user speech and provides pronunciation feedback.

##  Features
- Audio input processing
- Phoneme extraction using Allosaurus
- Pronunciation comparison
- Score generation
- Feedback generation

##  Goal
To build a teacher-like pronunciation system that explains mistakes and helps users improve.

##  Tech Stack
- FastAPI
- Python
- Allosaurus
- Librosa

##  Run Locally

```bash
uvicorn app.main:app --reload