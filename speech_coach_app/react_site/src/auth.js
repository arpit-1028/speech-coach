// ────────────────────────────────────────────────────────────────────────────
//  auth.js — College Library ID Auth & User Profiles (Supabase + Local)
// ────────────────────────────────────────────────────────────────────────────
import { supabase, isSupabaseConfigured, libraryIdToEmail, validateLibraryId } from './supabase.js';

const AUTH_KEY = 'sapphireSpeechCoachSession';
const USERS_KEY = 'sapphireSpeechCoachUsers';

export function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_KEY));
  } catch {
    return null;
  }
}

export async function signUpUser({ name, libraryId, branch, password, avatar }) {
  const cleanLibraryId = (libraryId || '').trim().toUpperCase();
  const cleanName = (name || '').trim();
  const cleanBranch = (branch || 'CSE-AIML').trim();
  const cleanAvatar = avatar || '👨‍🎓';

  if (!validateLibraryId(cleanLibraryId)) {
    throw new Error('Invalid Library ID format. Example: 2428CSEAIML994');
  }

  if (!password || password.length < 6) {
    throw new Error('Password must be at least 6 characters.');
  }

  const userData = {
    id: cleanLibraryId,
    name: cleanName || 'Student',
    libraryId: cleanLibraryId,
    branch: cleanBranch,
    avatar: cleanAvatar,
    joinedAt: new Date().toISOString()
  };

  // If Supabase is configured, use Supabase Auth & DB
  if (isSupabaseConfigured && supabase) {
    const email = libraryIdToEmail(cleanLibraryId);
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: cleanName,
          libraryId: cleanLibraryId,
          branch: cleanBranch,
          avatar: cleanAvatar
        }
      }
    });

    if (authError) {
      throw new Error(authError.message);
    }
  }

  // Always persist session locally
  const users = loadUsers();
  const nextUsers = [userData, ...users.filter((u) => u.id !== userData.id)];
  localStorage.setItem(USERS_KEY, JSON.stringify(nextUsers));
  localStorage.setItem(AUTH_KEY, JSON.stringify(userData));

  return userData;
}

export async function signInUser({ libraryId, password }) {
  const cleanLibraryId = (libraryId || '').trim().toUpperCase();

  if (!validateLibraryId(cleanLibraryId)) {
    throw new Error('Invalid Library ID format. Example: 2428CSEAIML994');
  }

  if (!password) {
    throw new Error('Please enter your password.');
  }

  // If Supabase is configured, authenticate via Supabase
  if (isSupabaseConfigured && supabase) {
    const email = libraryIdToEmail(cleanLibraryId);
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (authError) {
      if (authError.message.includes('Email not confirmed')) {
        const users = loadUsers();
        const existing = users.find((u) => u.libraryId === cleanLibraryId || u.id === cleanLibraryId);
        const user = existing || {
          id: cleanLibraryId,
          name: `Student (${cleanLibraryId.slice(-4)})`,
          libraryId: cleanLibraryId,
          branch: 'CSE-AIML',
          avatar: '👨‍🎓',
          joinedAt: new Date().toISOString()
        };
        localStorage.setItem(AUTH_KEY, JSON.stringify(user));
        return user;
      }
      throw new Error(authError.message);
    }

    const meta = authData.user?.user_metadata || {};
    const user = {
      id: cleanLibraryId,
      name: meta.name || 'Student',
      libraryId: cleanLibraryId,
      branch: meta.branch || 'CSE-AIML',
      avatar: meta.avatar || '👨‍🎓',
      joinedAt: authData.user?.created_at || new Date().toISOString()
    };

    localStorage.setItem(AUTH_KEY, JSON.stringify(user));
    return user;
  }

  // Fallback: local user store check
  const users = loadUsers();
  const existing = users.find((u) => u.libraryId === cleanLibraryId || u.id === cleanLibraryId);

  if (!existing) {
    // If user doesn't exist locally, auto-register for seamless local experience
    return signUpUser({
      name: `Student (${cleanLibraryId.slice(-4)})`,
      libraryId: cleanLibraryId,
      branch: 'CSE-AIML',
      password,
      avatar: '👨‍🎓'
    });
  }

  localStorage.setItem(AUTH_KEY, JSON.stringify(existing));
  return existing;
}

export function signOutUser() {
  if (isSupabaseConfigured && supabase) {
    supabase.auth.signOut().catch(() => {});
  }
  localStorage.removeItem(AUTH_KEY);
}

function loadUsers() {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY)) || [];
  } catch {
    return [];
  }
}
