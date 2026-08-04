// ────────────────────────────────────────────────────────────────────────────
//  auth.js — Student & Teacher Auth + Cloud Analytics
// ────────────────────────────────────────────────────────────────────────────
import {
  supabase,
  isSupabaseConfigured,
  libraryIdToEmail,
  validateLibraryId,
  upsertStudentProfile,
  fetchAllStudentProgress
} from './supabase.js';

const AUTH_KEY         = 'sapphireSpeechCoachSession';
const TEACHER_KEY      = 'sapphireTeacherSession';
const USERS_KEY        = 'sapphireSpeechCoachUsers';

// ── SESSION LOADERS ──────────────────────────────────────────────────────────
export function loadSession() {
  try { return JSON.parse(localStorage.getItem(AUTH_KEY)); } catch { return null; }
}

export function loadTeacherSession() {
  try { return JSON.parse(localStorage.getItem(TEACHER_KEY)); } catch { return null; }
}

// ── TEACHER AUTH ─────────────────────────────────────────────────────────────
// Simple: any teacher ID + any password works (as per requirement for now)
export function signInTeacher({ teacherId, password }) {
  if (!teacherId || !teacherId.trim()) throw new Error('Please enter a Teacher ID.');
  if (!password || !password.trim()) throw new Error('Please enter a password.');

  const id = teacherId.trim().toUpperCase();
  const teacher = {
    id,
    name: `Faculty (${id})`,
    role: 'teacher',
    loginAt: new Date().toISOString()
  };
  localStorage.setItem(TEACHER_KEY, JSON.stringify(teacher));
  return teacher;
}

export function signOutTeacher() {
  localStorage.removeItem(TEACHER_KEY);
}

// ── STUDENT SIGN UP ──────────────────────────────────────────────────────────
export async function signUpUser({ name, email, libraryId, branch, password, avatar }) {
  const cleanLibraryId = (libraryId || '').trim().toUpperCase();
  const cleanName      = (name || '').trim();
  const cleanEmail     = (email || '').trim().toLowerCase();
  const cleanBranch    = (branch || 'CSE').trim();
  const cleanAvatar    = avatar || '👨‍🎓';

  if (!validateLibraryId(cleanLibraryId)) {
    throw new Error('Invalid Library ID format. Example: 2428CSEAIML994');
  }
  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    throw new Error('Please enter a valid College Email ID (e.g. xyz.2428cse112@kiet.edu)');
  }
  if (!password || password.length < 6) {
    throw new Error('Password must be at least 6 characters.');
  }

  const userData = {
    id:        cleanLibraryId,
    name:      cleanName || 'Student',
    email:     cleanEmail,
    libraryId: cleanLibraryId,
    branch:    cleanBranch,
    avatar:    cleanAvatar,
    joinedAt:  new Date().toISOString()
  };

  // Supabase Auth
  if (isSupabaseConfigured && supabase) {
    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: { name: cleanName, libraryId: cleanLibraryId, email: cleanEmail, branch: cleanBranch, avatar: cleanAvatar }
        }
      });
      if (authError && !authError.message.includes('already registered')) {
        console.warn('Supabase auth notice:', authError.message);
      }
    } catch (e) {
      console.warn('Supabase sign up warning:', e.message);
    }

    // Save profile to student_profiles table (fire-and-forget)
    upsertStudentProfile(userData).catch(() => {});
  }

  // Persist locally
  const users    = loadUsers();
  const nextUsers = [userData, ...users.filter((u) => u.id !== userData.id && u.libraryId !== userData.libraryId)];
  localStorage.setItem(USERS_KEY, JSON.stringify(nextUsers));
  localStorage.setItem(AUTH_KEY, JSON.stringify(userData));

  return userData;
}

// ── STUDENT SIGN IN ──────────────────────────────────────────────────────────
export async function signInUser({ libraryId, password }) {
  const cleanInput    = (libraryId || '').trim();
  const isEmail       = cleanInput.includes('@');
  const cleanLibraryId = cleanInput.toUpperCase();

  if (!isEmail && !validateLibraryId(cleanLibraryId)) {
    throw new Error('Invalid Library ID format. Example: 2428CSEAIML994');
  }
  if (!password) throw new Error('Please enter your password.');

  const users        = loadUsers();
  const existingUser = users.find((u) => u.libraryId === cleanLibraryId || u.email === cleanInput.toLowerCase() || u.id === cleanLibraryId);
  const targetEmail  = isEmail ? cleanInput.toLowerCase() : (existingUser?.email || libraryIdToEmail(cleanLibraryId));

  if (isSupabaseConfigured && supabase) {
    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email: targetEmail, password });
      if (!authError && authData.user) {
        const meta = authData.user?.user_metadata || {};
        const user = {
          id:        meta.libraryId || cleanLibraryId,
          name:      meta.name || existingUser?.name || 'Student',
          email:     authData.user?.email || targetEmail,
          libraryId: meta.libraryId || cleanLibraryId,
          branch:    meta.branch || existingUser?.branch || 'CSE',
          avatar:    meta.avatar || existingUser?.avatar || '👨‍🎓',
          joinedAt:  authData.user?.created_at || new Date().toISOString()
        };
        localStorage.setItem(AUTH_KEY, JSON.stringify(user));
        // Ensure profile is in cloud
        upsertStudentProfile(user).catch(() => {});
        return user;
      }
    } catch (e) {
      console.warn('Supabase signin notice:', e.message);
    }
  }

  // Local fallback
  const user = existingUser || {
    id:        cleanLibraryId,
    name:      `Student (${cleanLibraryId.slice(-4)})`,
    email:     targetEmail,
    libraryId: cleanLibraryId,
    branch:    'CSE',
    avatar:    '👨‍🎓',
    joinedAt:  new Date().toISOString()
  };
  localStorage.setItem(AUTH_KEY, JSON.stringify(user));
  // Ensure profile is in cloud
  if (isSupabaseConfigured) upsertStudentProfile(user).catch(() => {});
  return user;
}

// ── PASSWORD RESET ───────────────────────────────────────────────────────────
export async function resetUserPassword({ email, newPassword }) {
  const cleanEmail = (email || '').trim().toLowerCase();
  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    throw new Error('Please enter a valid College Email ID.');
  }
  if (!newPassword || newPassword.length < 6) {
    throw new Error('New password must be at least 6 characters.');
  }

  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.auth.resetPasswordForEmail(cleanEmail, { redirectTo: `${window.location.origin}` });
    } catch (e) {
      console.warn('Supabase SMTP notice:', e.message);
    }
  }

  const users        = loadUsers();
  const existingUser = users.find((u) => u.email === cleanEmail);
  if (existingUser) {
    existingUser.password = newPassword;
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  }
  return cleanEmail;
}

// ── SIGN OUT ─────────────────────────────────────────────────────────────────
export function signOutUser() {
  if (isSupabaseConfigured && supabase) supabase.auth.signOut().catch(() => {});
  localStorage.removeItem(AUTH_KEY);
}

// ── TEACHER: GET ALL STUDENT REPORTS ────────────────────────────────────────
// Tries Supabase cloud first, falls back to localStorage
// Returns enriched report objects for teacher dashboard
export async function getAllStudentReports() {
  // 1. Try Supabase cloud
  const cloudData = await fetchAllStudentProgress();
  if (cloudData && cloudData.length > 0) {
    return cloudData.map((row) => buildReport(
      {
        id:       row.library_id,
        name:     row.name,
        email:    row.email,
        libraryId: row.library_id,
        branch:   row.branch,
        avatar:   row.avatar,
        joinedAt: row.joined_at
      },
      {
        xp:               row.xp,
        streak:           row.streak,
        completed:        row.completed,
        attempts:         row.attempts,
        lastPracticeDate: row.last_practice_date
      }
    ));
  }

  // 2. localStorage fallback
  const users = loadUsers();
  const studentList = users.length > 0 ? users : DEMO_STUDENTS;
  return studentList.map((user) => {
    const progressKey = `sapphireSpeechCoachProgress:${user.libraryId || user.id}`;
    let progress = { xp: 0, streak: 0, completed: {}, attempts: [] };
    try {
      const stored = localStorage.getItem(progressKey);
      if (stored) progress = JSON.parse(stored);
    } catch {}
    return buildReport(user, progress);
  });
}

// ── CSV EXPORT ───────────────────────────────────────────────────────────────
export function exportCSVReport(reports) {
  const headers = ['Student Name', 'Library ID', 'Branch', 'College Email', 'Total XP', 'Questions Passed', 'Avg Accuracy %', 'Weakest Sounds', 'Last Active Date'];
  const rows = reports.map((r) => [
    `"${r.name}"`, `"${r.libraryId}"`, `"${r.branch}"`, `"${r.email}"`,
    r.xp, r.completedCount, `"${r.avgScore}%"`, `"${r.weakestSounds}"`, `"${r.lastActive}"`
  ]);
  const csvContent = 'data:text/csv;charset=utf-8,' +
    [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
  const link = document.createElement('a');
  link.setAttribute('href', encodeURI(csvContent));
  link.setAttribute('download', `Sapphire_Class_Report_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ── PRIVATE HELPERS ───────────────────────────────────────────────────────────
function buildReport(user, progress) {
  const completedEntries = Object.entries(progress.completed || {});
  const passedEntries    = completedEntries.filter(([, c]) => (c.bestScore || 0) >= 70);
  const completedCount   = passedEntries.length;
  const scores           = completedEntries.map(([, c]) => c.bestScore || 0);
  const avgScore         = scores.length > 0
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : 0;

  const weakCounts = {};
  (progress.attempts || []).forEach((att) => {
    (att.weakSounds || []).forEach((snd) => {
      if (snd) weakCounts[snd] = (weakCounts[snd] || 0) + 1;
    });
  });
  const weakList = Object.entries(weakCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([snd]) => snd);

  // Build level-by-level detail for drilldown
  const levelDetail = completedEntries
    .map(([levelId, data]) => ({
      levelId:   parseInt(levelId, 10),
      bestScore: data.bestScore || 0,
      attempts:  data.attempts  || 1,
      passed:    (data.bestScore || 0) >= 70
    }))
    .sort((a, b) => a.levelId - b.levelId);

  return {
    id:          user.id || user.libraryId,
    name:        user.name || 'Student',
    email:       user.email || 'N/A',
    libraryId:   user.libraryId || user.id || 'N/A',
    branch:      user.branch || 'CSE',
    avatar:      user.avatar || '👨‍🎓',
    xp:          progress.xp || 0,
    streak:      progress.streak || 0,
    completedCount,
    avgScore,
    weakestSounds: weakList.join(', ') || '—',
    weakestSoundsList: weakList,
    lastActive:  progress.lastPracticeDate || (user.joinedAt ? user.joinedAt.slice(0, 10) : '—'),
    // Drilldown data
    levelDetail,
    recentAttempts: (progress.attempts || []).slice(0, 12)
  };
}

function loadUsers() {
  try { return JSON.parse(localStorage.getItem(USERS_KEY)) || []; } catch { return []; }
}

const DEMO_STUDENTS = [
  { id: '2428CSEAIML994', name: 'Arpit Agarwal',  libraryId: '2428CSEAIML994', branch: 'CSE(AIML)', email: 'arpit.2428cseaiml994@kiet.edu', avatar: '👨‍🎓', joinedAt: '2026-08-01' },
  { id: '2327IT411',      name: 'Rohan Sharma',    libraryId: '2327IT411',      branch: 'IT',        email: 'rohan.2327it411@kiet.edu',      avatar: '👩‍💻', joinedAt: '2026-08-02' },
  { id: '2428ECE088',     name: 'Priya Verma',     libraryId: '2428ECE088',     branch: 'ECE',       email: 'priya.2428ece088@kiet.edu',     avatar: '⚡', joinedAt: '2026-08-03' }
];
