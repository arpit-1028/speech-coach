// ────────────────────────────────────────────────────────────────────────────
//  auth.js — College Library ID + Official Email Auth (Supabase + Local)
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

export async function signUpUser({ name, email, libraryId, branch, password, avatar }) {
  const cleanLibraryId = (libraryId || '').trim().toUpperCase();
  const cleanName = (name || '').trim();
  const cleanEmail = (email || '').trim().toLowerCase();
  const cleanBranch = (branch || 'CSE').trim();
  const cleanAvatar = avatar || '👨‍🎓';

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
    id: cleanLibraryId,
    name: cleanName || 'Student',
    email: cleanEmail,
    libraryId: cleanLibraryId,
    branch: cleanBranch,
    avatar: cleanAvatar,
    joinedAt: new Date().toISOString()
  };

  // If Supabase is configured, use Supabase Auth with real email
  if (isSupabaseConfigured && supabase) {
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: {
          name: cleanName,
          libraryId: cleanLibraryId,
          email: cleanEmail,
          branch: cleanBranch,
          avatar: cleanAvatar
        }
      }
    });

    if (authError) {
      throw new Error(authError.message);
    }
  }

  // Persist user locally
  const users = loadUsers();
  const nextUsers = [userData, ...users.filter((u) => u.id !== userData.id && u.libraryId !== userData.libraryId)];
  localStorage.setItem(USERS_KEY, JSON.stringify(nextUsers));
  localStorage.setItem(AUTH_KEY, JSON.stringify(userData));

  return userData;
}

export async function signInUser({ libraryId, password }) {
  const cleanInput = (libraryId || '').trim();
  const isEmail = cleanInput.includes('@');
  const cleanLibraryId = cleanInput.toUpperCase();

  if (!isEmail && !validateLibraryId(cleanLibraryId)) {
    throw new Error('Invalid Library ID format. Example: 2428CSEAIML994');
  }

  if (!password) {
    throw new Error('Please enter your password.');
  }

  // Find user email from local store if Library ID was entered
  const users = loadUsers();
  const existingUser = users.find((u) => u.libraryId === cleanLibraryId || u.email === cleanInput.toLowerCase() || u.id === cleanLibraryId);
  const targetEmail = isEmail ? cleanInput.toLowerCase() : (existingUser?.email || libraryIdToEmail(cleanLibraryId));

  // If Supabase is configured, authenticate via Supabase
  if (isSupabaseConfigured && supabase) {
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: targetEmail,
      password
    });

    if (authError) {
      // If email not confirmed in Supabase, allow direct local login fallback
      if (authError.message.includes('Email not confirmed')) {
        const user = existingUser || {
          id: cleanLibraryId,
          name: `Student (${cleanLibraryId.slice(-4)})`,
          email: targetEmail,
          libraryId: cleanLibraryId,
          branch: 'CSE',
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
      id: meta.libraryId || cleanLibraryId,
      name: meta.name || existingUser?.name || 'Student',
      email: authData.user?.email || targetEmail,
      libraryId: meta.libraryId || cleanLibraryId,
      branch: meta.branch || existingUser?.branch || 'CSE',
      avatar: meta.avatar || existingUser?.avatar || '👨‍🎓',
      joinedAt: authData.user?.created_at || new Date().toISOString()
    };

    localStorage.setItem(AUTH_KEY, JSON.stringify(user));
    return user;
  }

  // Local fallback check
  if (!existingUser) {
    return signUpUser({
      name: `Student (${cleanLibraryId.slice(-4)})`,
      email: isEmail ? cleanInput.toLowerCase() : `${cleanLibraryId.toLowerCase()}@college.edu`,
      libraryId: cleanLibraryId,
      branch: 'CSE',
      password,
      avatar: '👨‍🎓'
    });
  }

  localStorage.setItem(AUTH_KEY, JSON.stringify(existingUser));
  return existingUser;
}

export async function resetUserPassword({ email, newPassword }) {
  const cleanEmail = (email || '').trim().toLowerCase();

  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    throw new Error('Please enter a valid College Email ID.');
  }

  if (!newPassword || newPassword.length < 6) {
    throw new Error('New password must be at least 6 characters.');
  }

  // Try Supabase auth reset / update
  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: `${window.location.origin}`
      });
    } catch (e) {
      console.warn('Supabase SMTP notice:', e.message);
    }
  }

  // Update in local user store
  const users = loadUsers();
  const existingUser = users.find((u) => u.email === cleanEmail);
  if (existingUser) {
    existingUser.password = newPassword;
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  }

  return cleanEmail;
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
