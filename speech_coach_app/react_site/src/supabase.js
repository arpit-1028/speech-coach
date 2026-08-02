// ────────────────────────────────────────────────────────────────────────────
//  supabase.js — Supabase Auth & Database Client
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
  // Format requirement: Alphanumeric 6 to 20 chars
  return /^[A-Z0-9]{6,20}$/.test(clean);
}

// Convert Library ID to a valid email format for Supabase auth
export function libraryIdToEmail(libraryId) {
  const clean = (libraryId || '').trim().toLowerCase();
  return `${clean}@speechcoach.com`;
}
