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
    return initialProgress;
  }
}

export function saveAttempt(progress, level, score, userId = 'guest', analysis = {}) {
  const today = new Date().toISOString().slice(0, 10);
  const passed = score >= 75;
  const existing = progress.completed[level.id] || { bestScore: 0, attempts: 0 };
  const wasAlreadyPassed = existing.bestScore >= 75;
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
        levelId: level.id,
        label: level.label,
        target: level.target,
        score,
        passed,
        weakSounds: collectWeakSounds(analysis),
        date: new Date().toISOString()
      },
      ...progress.attempts
    ].slice(0, 12)
  };

  localStorage.setItem(storageKey(userId), JSON.stringify(next));
  return { next, xpEarned, passed };
}

export function isUnlocked(level, progress) {
  // All Word Practice levels (id 1-12) are always unlocked
  if (level.id <= 12) return true;
  const previous = progress.completed[level.id - 1];
  return previous?.bestScore >= 75;
}

function xpFor(score) {
  if (score >= 95) return 40;
  if (score >= 85) return 30;
  return 20;
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
