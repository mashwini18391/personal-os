/**
 * auth.js
 * Handles all Supabase Auth flows:
 *   - Google OAuth sign-in
 *   - Sign-out
 *   - Session restoration
 *   - Auto-create profile row on first login
 *   - Role-based redirect guard
 */

import { supabaseClient } from '../services/supabaseClient.js';
import { showToast, sanitizeInput } from '../utils/helpers.js';

// ─── Constants ────────────────────────────────────────────────────────────────
const REDIRECT_BASE = window.location.origin + window.location.pathname.replace(/[^/]*$/, '');

// ─── Google OAuth Login ───────────────────────────────────────────────────────

/**
 * signInWithGoogle – redirects user to Google's OAuth consent screen.
 */
export async function signInWithGoogle() {
  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider: 'google',
    options : {
      redirectTo: REDIRECT_BASE + 'dashboard.html',
      queryParams: { access_type: 'offline', prompt: 'consent' },
    },
  });
  if (error) {
    console.error('[Auth] Google OAuth error:', error);
    showToast('Login failed: ' + error.message, 'error');
  }
}

// ─── Email & Password Login ──────────────────────────────────────────────────

/**
 * signInWithEmailPassword – logs a user in with their active password
 */
export async function signInWithEmailPassword(email, password) {
  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    console.error('[Auth] Sign-in error:', error);
    showToast(error.message === 'Invalid login credentials' ? 'Invalid password or email' : error.message, 'error');
    return false;
  }
  return true;
}

/**
 * signUpWithEmailPassword – creates a new user account with a password
 */
export async function signUpWithEmailPassword(email, password) {
  const { data, error } = await supabaseClient.auth.signUp({ email, password });
  if (error) {
    console.error('[Auth] Sign-up error:', error);
    showToast('Sign-up failed: ' + error.message, 'error');
    return false;
  }
  if (data.user && !data.session) {
    showToast('Success! Check your email to confirm your account.', 'info', 6000);
    return false; // Auth flow paused for confirmation
  }
  return true;
}

// ─── Sign-Out ─────────────────────────────────────────────────────────────────

/**
 * signOut – clears session and returns user to login page.
 */
export async function signOut() {
  const { error } = await supabaseClient.auth.signOut();
  if (error) console.error('[Auth] Sign-out error:', error);
  localStorage.removeItem('pos_user');
  window.location.replace('index.html');
}

// ─── Session & Profile ────────────────────────────────────────────────────────

/**
 * getCurrentUser – returns the active Supabase user or null.
 * @returns {Promise<object|null>}
 */
export async function getCurrentUser() {
  const { data: { user } } = await supabaseClient.auth.getUser();
  return user;
}

/**
 * getUserProfile – fetches (or creates) the profile row for a user.
 * @param {object} user  Supabase auth user object
 * @returns {Promise<object>}  profile row
 */
export async function getUserProfile(user) {
  // Try to fetch existing profile
  const { data: existing, error: fetchErr } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (existing && !fetchErr) return existing;

  // First login — create profile
  const name  = sanitizeInput(user.user_metadata?.full_name || user.email?.split('@')[0] || 'User');
  const email = sanitizeInput(user.email || '');

  // First registered user gets admin role
  const { count } = await supabaseClient
    .from('profiles')
    .select('*', { count: 'exact', head: true });

  const role = count === 0 ? 'admin' : 'user';

  const { data: newProfile, error: insertErr } = await supabaseClient
    .from('profiles')
    .insert([{ id: user.id, email, name, role }])
    .select()
    .single();

  if (insertErr) {
    console.error('[Auth] Profile creation error:', insertErr);
    throw new Error('Could not create profile: ' + insertErr.message);
  }

  return newProfile;
}

// ─── Route Guards ─────────────────────────────────────────────────────────────

/**
 * requireAuth – call at the top of protected pages.
 * Redirects to index.html if no session is found.
 * @returns {Promise<{ user: object, profile: object }>}
 */
export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) {
    showToast('Please sign in to continue.', 'warning');
    setTimeout(() => window.location.replace('index.html'), 1200);
    throw new Error('Unauthenticated');
  }

  const profile = await getUserProfile(user);
  // Cache locally for quick reads
  localStorage.setItem('pos_user', JSON.stringify({ id: user.id, email: user.email, ...profile }));
  return { user, profile };
}

/**
 * requireAdmin – extends requireAuth; also checks role === 'admin'.
 * @returns {Promise<{ user: object, profile: object }>}
 */
export async function requireAdmin() {
  const { user, profile } = await requireAuth();
  if (profile.role !== 'admin') {
    showToast('Access denied: admin only.', 'error');
    setTimeout(() => window.location.replace('dashboard.html'), 1200);
    throw new Error('Forbidden');
  }
  return { user, profile };
}

/**
 * redirectIfLoggedIn – call on the login page.
 * Auto-redirects authenticated users to dashboard.
 */
export async function redirectIfLoggedIn() {
  const user = await getCurrentUser();
  if (!user) return;

  const profile = await getUserProfile(user);
  const target  = profile.role === 'admin' ? 'admin.html' : 'dashboard.html';
  window.location.replace(target);
}

// ─── Auth State Listener ──────────────────────────────────────────────────────

/**
 * onAuthStateChange – subscribe to session changes.
 * @param {Function} callback  (event, session) => void
 */
export function onAuthStateChange(callback) {
  return supabaseClient.auth.onAuthStateChange(callback);
}
