// ────────────────────────────────────────────────────────────────────────────
//  supabase.js — Supabase Auth & Database Client + Teacher Analytics Helpers
// ────────────────────────────────────────────────────────────────────────────
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const supabase = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

// Library ID validation: e.g. "2428CSEAIML994"
export function validateLibraryId(libraryId) {
  if (!libraryId) return false;
  const clean = libraryId.trim().toUpperCase();
  return /^[A-Z0-9]{6,20}$/.test(clean);
}

// Convert Library ID to a valid email format for Supabase auth
export function libraryIdToEmail(libraryId) {
  const clean = (libraryId || '').trim().toLowerCase();
  return `${clean}@speechcoach.com`;
}

// ── STUDENT PROFILE UPSERT ──────────────────────────────────────────────────
// Called on registration: saves name, branch, email, library_id to cloud
export async function upsertStudentProfile(profile) {
  if (!isSupabaseConfigured || !supabase) return;
  try {
    const { error } = await supabase.from('student_profiles').upsert({
      library_id: profile.libraryId,
      name:       profile.name,
      email:      profile.email,
      branch:     profile.branch,
      avatar:     profile.avatar,
      joined_at:  profile.joinedAt || new Date().toISOString()
    }, { onConflict: 'library_id' });
    if (error) console.warn('upsertStudentProfile:', error.message);
  } catch (e) {
    console.warn('upsertStudentProfile error:', e.message);
  }
}

// ── STUDENT PROGRESS UPSERT ──────────────────────────────────────────────────
// Called after every practice attempt: syncs XP, completed, attempts to cloud
export async function upsertStudentProgress(libraryId, progress) {
  if (!isSupabaseConfigured || !supabase || !libraryId || libraryId === 'guest') return;
  try {
    const { error } = await supabase.from('student_progress').upsert({
      library_id:         libraryId,
      xp:                 progress.xp || 0,
      streak:             progress.streak || 0,
      completed:          progress.completed || {},
      attempts:           (progress.attempts || []).slice(0, 50),
      last_practice_date: progress.lastPracticeDate || '',
      updated_at:         new Date().toISOString()
    }, { onConflict: 'library_id' });
    if (error) console.warn('upsertStudentProgress:', error.message);
  } catch (e) {
    console.warn('upsertStudentProgress error:', e.message);
  }
}

// ── FETCH ALL STUDENT DATA FOR TEACHER DASHBOARD ────────────────────────────
// Returns joined data from student_profiles + student_progress
// Teacher dashboard calls this for real-time data from all devices/browsers
export async function fetchAllStudentProgress() {
  if (!isSupabaseConfigured || !supabase) return null;
  try {
    const { data: profiles, error: pErr } = await supabase
      .from('student_profiles')
      .select('*');
    if (pErr) throw pErr;

    const { data: progresses, error: prErr } = await supabase
      .from('student_progress')
      .select('*');
    if (prErr) throw prErr;

    if (!profiles || profiles.length === 0) return null;

    return profiles.map((profile) => {
      const prog = progresses?.find((p) => p.library_id === profile.library_id) || {};
      return {
        library_id:         profile.library_id,
        name:               profile.name,
        email:              profile.email,
        branch:             profile.branch,
        avatar:             profile.avatar || '👨‍🎓',
        joined_at:          profile.joined_at,
        xp:                 prog.xp || 0,
        streak:             prog.streak || 0,
        completed:          prog.completed || {},
        attempts:           prog.attempts || [],
        last_practice_date: prog.last_practice_date || (profile.joined_at ? profile.joined_at.slice(0, 10) : '')
      };
    });
  } catch (e) {
    console.warn('fetchAllStudentProgress error:', e.message);
    return null;
  }
}
