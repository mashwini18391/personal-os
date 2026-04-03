/**
 * auth.js
 * Handles all Supabase Auth flows:
 *   - Google OAuth sign-in
 *   - Sign-out
 *   - Session restoration
 *   - Auto-create profile row on first login
 *   - Role-based redirect guard
 */


// ─── Constants ────────────────────────────────────────────────────────────────
const REDIRECT_BASE = window.location.origin + window.location.pathname.replace(/[^/]*$/, '');

// ─── Google OAuth Login ───────────────────────────────────────────────────────

async function signInWithGoogle() {
  const { error } = await window.supabaseClient.auth.signInWithOAuth({
    provider: 'google',
  });
  if (error) {
    console.error('Google OAuth error:', error);
  }
}

async function signInWithEmailPassword(email, password) {
  const { error } = await window.supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    console.error('[Auth] Sign-in error:', error);
    window.showToast(error.message === 'Invalid login credentials' ? 'Invalid password or email' : error.message, 'error');
    return false;
  }
  return true;
}

async function signUpWithEmailPassword(email, password) {
  const { data, error } = await window.supabaseClient.auth.signUp({ email, password });
  if (error) {
    console.error('[Auth] Sign-up error:', error);
    window.showToast('Sign-up failed: ' + error.message, 'error');
    return false;
  }
  if (data.user && !data.session) {
    window.showToast('Success! Check your email to confirm your account.', 'info', 6000);
    return false;
  }
  return true;
}

async function signOut() {
  const { error } = await window.supabaseClient.auth.signOut();
  if (error) console.error('[Auth] Sign-out error:', error);
  localStorage.removeItem('pos_user');
  window.location.replace('index.html');
}

async function getCurrentUser() {
  const { data: { user } } = await window.supabaseClient.auth.getUser();
  return user;
}

async function getUserProfile(user) {
  const { data: existing, error: fetchErr } = await window.supabaseClient
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (existing && !fetchErr) return existing;

  const name = window.sanitizeInput(user.user_metadata?.full_name || user.email?.split('@')[0] || 'User');
  const email = window.sanitizeInput(user.email || '');

  const { count } = await window.supabaseClient
    .from('profiles')
    .select('*', { count: 'exact', head: true });

  const role = count === 0 ? 'admin' : 'user';

  const { data: newProfile, error: insertErr } = await window.supabaseClient
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

async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) {
    window.showToast('Please sign in to continue.', 'warning');
    setTimeout(() => window.location.replace('index.html'), 1200);
    throw new Error('Unauthenticated');
  }

  const profile = await getUserProfile(user);
  localStorage.setItem('pos_user', JSON.stringify({ id: user.id, email: user.email, ...profile }));
  return { user, profile };
}

async function requireAdmin() {
  const { user, profile } = await requireAuth();
  if (profile.role !== 'admin') {
    window.showToast('Access denied: admin only.', 'error');
    setTimeout(() => window.location.replace('dashboard.html'), 1200);
    throw new Error('Forbidden');
  }
  return { user, profile };
}

async function redirectIfLoggedIn() {
  const user = await getCurrentUser();
  if (!user) return;

  const profile = await getUserProfile(user);
  const target = profile.role === 'admin' ? 'admin.html' : 'dashboard.html';
  window.location.replace(target);
}

function onAuthStateChange(callback) {
  return window.supabaseClient.auth.onAuthStateChange(callback);
}

// Attach to window for global access
window.signInWithGoogle = signInWithGoogle;
window.signInWithEmailPassword = signInWithEmailPassword;
window.signUpWithEmailPassword = signUpWithEmailPassword;
window.signOut = signOut;
window.getCurrentUser = getCurrentUser;
window.getUserProfile = getUserProfile;
window.requireAuth = requireAuth;
window.requireAdmin = requireAdmin;
window.redirectIfLoggedIn = redirectIfLoggedIn;
window.onAuthStateChange = onAuthStateChange;
