// progress.js — Persistent XP, streak, level unlock logic & cloud sync restoration
import { stages, getStageForLevel } from './levels.js';
import { upsertStudentProgress, fetchStudentProgressFromSupabase } from './supabase.js';

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
    const key = storageKey(userId);
    const stored = JSON.parse(localStorage.getItem(key));
    // Fallback: check un-normalized key if uppercase didn't match
    if (!stored && userId && userId !== 'guest') {
      const rawStored = JSON.parse(localStorage.getItem(`${STORAGE_KEY}:${userId}`));
      if (rawStored) return { ...initialProgress, ...rawStored };
    }
    return { ...initialProgress, ...stored };
  } catch {
    return { ...initialProgress };
  }
}

// ── CLOUD SYNC & RESTORE ──────────────────────────────────────────────────────
// Async loader that restores progress from Supabase cloud on login/refresh
export async function syncAndLoadProgressForUser(userId = 'guest') {
  const localProg = loadProgressForUser(userId);
  if (!userId || userId === 'guest') return localProg;

  try {
    const cloudProg = await fetchStudentProgressFromSupabase(userId);
    if (!cloudProg) return localProg;

    // Merge local and cloud (keep best score for each question, highest XP, max streak)
    const mergedCompleted = { ...localProg.completed };
    Object.entries(cloudProg.completed || {}).forEach(([lvlId, data]) => {
      const existing = mergedCompleted[lvlId];
      if (!existing) {
        mergedCompleted[lvlId] = data;
      } else {
        mergedCompleted[lvlId] = {
          bestScore: Math.max(existing.bestScore || 0, data.bestScore || 0),
          attempts: (existing.attempts || 0) + (data.attempts || 0)
        };
      }
    });

    const mergedAttempts = dedupeAttempts([
      ...(localProg.attempts || []),
      ...(cloudProg.attempts || [])
    ]);

    const merged = {
      xp: Math.max(localProg.xp || 0, cloudProg.xp || 0),
      streak: Math.max(localProg.streak || 0, cloudProg.streak || 0),
      lastPracticeDate: localProg.lastPracticeDate || cloudProg.lastPracticeDate || '',
      completed: mergedCompleted,
      attempts: mergedAttempts.slice(0, 50)
    };

    // Save merged to localStorage and cloud
    localStorage.setItem(storageKey(userId), JSON.stringify(merged));
    upsertStudentProgress(userId, merged).catch(() => {});

    return merged;
  } catch (e) {
    console.warn('syncAndLoadProgressForUser error:', e.message);
    return localProg;
  }
}

export function saveAttempt(progress, level, score, userId = 'guest', analysis = {}) {
  const cleanUserId = (userId || 'guest').trim().toUpperCase();
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
      ...(progress.attempts || [])
    ].slice(0, 50)
  };

  // Save to localStorage (primary)
  localStorage.setItem(storageKey(cleanUserId), JSON.stringify(next));

  // Sync to Supabase cloud (fire-and-forget)
  if (cleanUserId && cleanUserId !== 'GUEST') {
    upsertStudentProgress(cleanUserId, next).catch(() => {});
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
  const clean = (userId || 'guest').trim().toUpperCase();
  return `${STORAGE_KEY}:${clean}`;
}

function collectWeakSounds(analysis) {
  const comparison = analysis.comparison || [];
  return comparison
    .filter((item) => item.type && !['correct', 'accent_match'].includes(item.type))
    .map((item) => item.expected || item.spoken)
    .filter(Boolean)
    .slice(0, 6);
}

function dedupeAttempts(attempts) {
  const seen = new Set();
  const out = [];
  attempts.forEach((a) => {
    const key = `${a.levelId}:${a.date || ''}:${a.score}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(a);
    }
  });
  return out;
}
