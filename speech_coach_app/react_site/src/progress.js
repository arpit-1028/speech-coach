// progress.js — Persistent XP, streak, and level unlock logic
//
// Unlock Rules:
//   • First 2 questions of EVERY stage are always unlocked.
//   • Within a stage: need 70+ on question N to unlock question N+1.
//   • Stage N+1's first 2 questions unlock once ALL 20 of stage N are passed (70+).

import { stages, getStageForLevel } from './levels.js';
import { upsertStudentProgress } from './supabase.js';

const STORAGE_KEY = 'sapphireSpeechCoachProgress';

const initialProgress = {
  xp: 0,
  streak: 0,
  lastPracticeDate: '',
  completed: {},
  attempts: []
};

export function loadProgress() {
  return loadProgressForUser('guest');
}

export function loadProgressForUser(userId = 'guest') {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey(userId)));
    return { ...initialProgress, ...stored };
  } catch {
    return { ...initialProgress };
  }
}

export function saveAttempt(progress, level, score, userId = 'guest', analysis = {}) {
  const today = new Date().toISOString().slice(0, 10);
  const passed = score >= 70;
  const existing = progress.completed[level.id] || { bestScore: 0, attempts: 0 };
  const wasAlreadyPassed = existing.bestScore >= 70;
  const xpEarned = passed && !wasAlreadyPassed ? xpFor(score) : 0;
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const nextStreak =
    progress.lastPracticeDate === today
      ? progress.streak
      : progress.lastPracticeDate === yesterday
        ? progress.streak + 1
        : 1;

  const next = {
    ...progress,
    xp: progress.xp + xpEarned,
    streak: nextStreak,
    lastPracticeDate: today,
    completed: {
      ...progress.completed,
      [level.id]: {
        bestScore: Math.max(existing.bestScore || 0, score),
        attempts: (existing.attempts || 0) + 1
      }
    },
    attempts: [
      {
        levelId:  level.id,
        label:    level.label,
        target:   level.target,
        score,
        passed,
        weakSounds: collectWeakSounds(analysis),
        date: new Date().toISOString()
      },
      ...progress.attempts
    ].slice(0, 50) // keep last 50 attempts for teacher drilldown
  };

  // Save to localStorage (primary, always works)
  localStorage.setItem(storageKey(userId), JSON.stringify(next));

  // Sync to Supabase cloud (fire-and-forget — won't break if offline)
  if (userId && userId !== 'guest') {
    upsertStudentProgress(userId, next).catch(() => {});
  }

  return { next, xpEarned, passed };
}

// ── Unlock logic ───────────────────────────────────────────────────────────────
export function isUnlocked(level, progress) {
  const stage = getStageForLevel(level.id);
  if (!stage) return false;

  const questionsInStage = stage.questions;
  const indexInStage = questionsInStage.findIndex((q) => q.id === level.id);

  // First 2 questions of EVERY stage are ALWAYS unlocked from the start
  if (indexInStage < 2) {
    return true;
  }

  // Questions 3-20 within a stage: need 70+ on the previous question
  const prevQuestion = questionsInStage[indexInStage - 1];
  return (progress.completed[prevQuestion.id]?.bestScore || 0) >= 70;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function xpFor(score) {
  if (score >= 95) return 50;
  if (score >= 85) return 35;
  if (score >= 70) return 20;
  return 0;
}

function storageKey(userId) {
  return `${STORAGE_KEY}:${userId || 'guest'}`;
}

function collectWeakSounds(analysis) {
  const comparison = analysis.comparison || [];
  return comparison
    .filter((item) => item.type && !['correct', 'accent_match'].includes(item.type))
    .map((item) => item.expected || item.spoken)
    .filter(Boolean)
    .slice(0, 6);
}
