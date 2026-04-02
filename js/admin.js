/**
 * admin.js
 * Admin Dashboard:
 *  - Requires admin role
 *  - Lists all users with stats
 *  - Site-wide metrics
 *  - Delete / Disable user actions
 */

import { requireAdmin, signOut } from './auth.js';
import { supabaseClient } from '../services/supabaseClient.js';
import {
  showToast, sanitizeHTML, formatDate,
  timeAgo, showSkeleton, setLoadingState,
} from '../utils/helpers.js';

// Local applyTheme — avoids circular import with dashboard.js
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

(async () => {
  showLoader();
  try {
    const { profile } = await requireAdmin();
    populateAdminUI(profile);
    setupTheme();
    setupSignOut();
    await Promise.all([loadSiteStats(), loadUsersTable()]);
    hideLoader();
  } catch (err) {
    console.error('[Admin]', err);
  }
})();

// ─── Loader ───────────────────────────────────────────────────────────────────

function showLoader() { document.getElementById('page-loader')?.classList.remove('hidden'); }
function hideLoader()  {
  const el = document.getElementById('page-loader');
  if (el) { el.style.opacity = '0'; setTimeout(() => el.remove(), 400); }
}

// ─── Populate ─────────────────────────────────────────────────────────────────

function populateAdminUI(profile) {
  document.querySelectorAll('[data-user-name]').forEach(el => el.textContent = sanitizeHTML(profile.name || 'Admin'));
  document.querySelectorAll('[data-user-role]').forEach(el => { el.textContent = 'Admin'; });
}

// ─── Site Stats ───────────────────────────────────────────────────────────────

async function loadSiteStats() {
  const [
    { count: usersCount   },
    { count: notesCount   },
    { count: ytCount      },
    { count: researchCount },
  ] = await Promise.all([
    supabaseClient.from('profiles').select('*', { count: 'exact', head: true }),
    supabaseClient.from('notes').select('*', { count: 'exact', head: true }),
    supabaseClient.from('activity').select('*', { count: 'exact', head: true }).eq('type','summarize'),
    supabaseClient.from('activity').select('*', { count: 'exact', head: true }).eq('type','research'),
  ]);

  animateCount('admin-stat-users',    usersCount    || 0);
  animateCount('admin-stat-notes',    notesCount    || 0);
  animateCount('admin-stat-yt',       ytCount       || 0);
  animateCount('admin-stat-research', researchCount || 0);
}

function animateCount(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  let cur = 0;
  const step = Math.max(1, Math.ceil(target / 30));
  const t = setInterval(() => {
    cur = Math.min(cur + step, target);
    el.textContent = cur;
    if (cur >= target) clearInterval(t);
  }, 30);
}

// ─── Users Table ─────────────────────────────────────────────────────────────

async function loadUsersTable() {
  const wrap = document.getElementById('users-table-wrap');
  if (!wrap) return;

  wrap.innerHTML = '<div style="padding:32px;text-align:center"><div class="loader-ring" style="margin:auto"></div></div>';

  // Fetch profiles
  const { data: profiles, error } = await supabaseClient
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });

  if (error || !profiles?.length) {
    wrap.innerHTML = `<div class="empty-state"><div class="empty-icon">👤</div><h3>No users found</h3></div>`;
    return;
  }

  // Fetch per-user note counts in parallel
  const noteCountsPromises = profiles.map(p =>
    supabaseClient.from('notes').select('*', { count: 'exact', head: true }).eq('user_id', p.id)
  );
  const activityPromises = profiles.map(p =>
    supabaseClient.from('activity').select('*', { count: 'exact', head: true }).eq('user_id', p.id)
  );

  const noteCounts    = await Promise.all(noteCountsPromises);
  const activityCounts = await Promise.all(activityPromises);

  wrap.innerHTML = `
    <div class="table-wrap">
      <table class="data-table" id="users-table">
        <thead>
          <tr>
            <th>User</th>
            <th>Email</th>
            <th>Role</th>
            <th>Notes</th>
            <th>Activities</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${profiles.map((p, i) => renderUserRow(p, noteCounts[i]?.count || 0, activityCounts[i]?.count || 0)).join('')}
        </tbody>
      </table>
    </div>
  `;

  // Bind action buttons
  wrap.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => handleUserAction(btn.dataset.action, btn.dataset.uid, btn.dataset.email));
  });
}

function renderUserRow(profile, noteCount, activityCount) {
  const isDisabled = profile.disabled === true;
  const initials   = (profile.name || profile.email || '?').charAt(0).toUpperCase();

  return `
    <tr id="user-row-${profile.id}">
      <td>
        <div class="flex items-center gap-2">
          <div class="user-avatar" style="width:32px;height:32px;font-size:12px">${initials}</div>
          <span style="font-weight:600;color:var(--text-primary)">${sanitizeHTML(profile.name || '—')}</span>
        </div>
      </td>
      <td>${sanitizeHTML(profile.email || '—')}</td>
      <td>
        <span class="badge ${profile.role === 'admin' ? 'badge-admin' : 'badge-user'}">
          ${sanitizeHTML(profile.role || 'user')}
        </span>
      </td>
      <td>${noteCount}</td>
      <td>${activityCount}</td>
      <td>
        <span class="badge ${isDisabled ? 'badge-red' : 'badge-green'}">
          ${isDisabled ? 'Disabled' : 'Active'}
        </span>
      </td>
      <td>
        <div class="flex gap-2">
          <button class="btn btn-secondary btn-sm"
            data-action="${isDisabled ? 'enable' : 'disable'}"
            data-uid="${profile.id}"
            data-email="${sanitizeHTML(profile.email || '')}">
            ${isDisabled ? '✅ Enable' : '🚫 Disable'}
          </button>
          <button class="btn btn-danger btn-sm"
            data-action="delete"
            data-uid="${profile.id}"
            data-email="${sanitizeHTML(profile.email || '')}">
            🗑️ Delete
          </button>
        </div>
      </td>
    </tr>
  `;
}

// ─── User Actions ─────────────────────────────────────────────────────────────

async function handleUserAction(action, uid, email) {
  if (action === 'delete') {
    if (!confirm(`Permanently delete user "${email}"? This is irreversible!`)) return;
    await deleteUser(uid, email);
  } else if (action === 'disable') {
    if (!confirm(`Disable user "${email}"?`)) return;
    await setUserDisabled(uid, true);
  } else if (action === 'enable') {
    await setUserDisabled(uid, false);
  }
}

async function deleteUser(uid, email) {
  // Delete profile + all their data
  const { error: noteErr } = await supabaseClient.from('notes').delete().eq('user_id', uid);
  const { error: actErr  } = await supabaseClient.from('activity').delete().eq('user_id', uid);
  const { error: profErr } = await supabaseClient.from('profiles').delete().eq('id', uid);

  if (profErr) {
    showToast('Delete failed: ' + profErr.message, 'error');
    return;
  }

  document.getElementById(`user-row-${uid}`)?.remove();
  showToast(`User ${email} deleted.`, 'success');

  // Refresh stats
  await loadSiteStats();
}

async function setUserDisabled(uid, disabled) {
  const { error } = await supabaseClient
    .from('profiles')
    .update({ disabled })
    .eq('id', uid);

  if (error) {
    showToast('Action failed: ' + error.message, 'error');
    return;
  }

  showToast(`User ${disabled ? 'disabled' : 'enabled'}.`, 'success');
  await loadUsersTable(); // Re-render
}

// ─── Theme & Sign Out ─────────────────────────────────────────────────────────

function setupTheme() {
  const saved = localStorage.getItem('pos_theme') || 'dark';
  applyTheme(saved);
  document.getElementById('theme-toggle')?.addEventListener('click', () => {
    const current = document.documentElement.dataset.theme || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    localStorage.setItem('pos_theme', next);
  });
}

function setupSignOut() {
  document.getElementById('signout-btn')?.addEventListener('click', async () => {
    if (confirm('Sign out?')) await signOut();
  });
}
