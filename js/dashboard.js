/**
 * dashboard.js
 * Orchestrates the user dashboard:
 *  - Auth guard
 *  - Sidebar navigation
 *  - Section lazy-loading
 *  - Stats counters
 *  - Recent activity feed
 *  - Theme toggle
 *  - Responsive sidebar
 */

import { requireAuth, signOut } from './auth.js';
import { initNotes, openNoteModal } from './notes.js';
import { initYoutube } from './youtube.js';
import { initResearch } from './research.js';
import {
  showToast, formatDate, timeAgo,
  showSkeleton, sanitizeHTML,
} from '../utils/helpers.js';
import { supabaseClient } from '../services/supabaseClient.js';

// ─── State ────────────────────────────────────────────────────────────────────
let currentUser    = null;
let currentProfile = null;
let activeSection  = 'overview';
const initializedSections = new Set();

// ─── Bootstrap ────────────────────────────────────────────────────────────────

(async () => {
  showPageLoader();
  try {
    const { user, profile } = await requireAuth();
    currentUser    = user;
    currentProfile = profile;

    populateUserUI();
    setupSidebar();
    setupThemeToggle();
    setupSignOut();
    setupQuickActions();

    // Navigate to hash section if present
    const hash = window.location.hash.slice(1);
    await navigateTo(hash || 'overview');

    hidePageLoader();
  } catch (err) {
    // requireAuth already redirects on failure
    console.error('[Dashboard]', err);
  }
})();

// ─── Page Loader ──────────────────────────────────────────────────────────────

function showPageLoader() {
  document.getElementById('page-loader')?.classList.remove('hidden');
}
function hidePageLoader() {
  const el = document.getElementById('page-loader');
  if (el) {
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 400);
  }
}

// ─── Populate UI ─────────────────────────────────────────────────────────────

function populateUserUI() {
  const name     = currentProfile.name  || 'User';
  const email    = currentProfile.email || '';
  const role     = currentProfile.role  || 'user';
  const avatarUrl = currentUser.user_metadata?.avatar_url;

  // Sidebar user block
  const nameEls  = document.querySelectorAll('[data-user-name]');
  const roleEls  = document.querySelectorAll('[data-user-role]');
  const avatarEls = document.querySelectorAll('[data-user-avatar]');

  nameEls.forEach  (el => el.textContent = sanitizeHTML(name));
  roleEls.forEach  (el => {
    el.textContent = role.charAt(0).toUpperCase() + role.slice(1);
    el.className   = `user-role badge badge-${role}`;
  });

  avatarEls.forEach(el => {
    if (avatarUrl) {
      el.innerHTML = `<img src="${avatarUrl}" alt="${sanitizeHTML(name)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`;
    } else {
      el.textContent = name.charAt(0).toUpperCase();
    }
  });

  // Show admin link only for admins
  if (role === 'admin') {
    document.getElementById('admin-nav-item')?.classList.remove('hidden');
  }
}

// ─── Sidebar Navigation ───────────────────────────────────────────────────────

function setupSidebar() {
  const sidebar  = document.getElementById('sidebar');
  const overlay  = document.getElementById('sidebar-overlay');
  const menuBtn  = document.getElementById('menu-toggle');

  // Nav items
  document.querySelectorAll('[data-section]').forEach(item => {
    item.addEventListener('click', async () => {
      const section = item.dataset.section;
      if (section === 'admin') { window.location.href = 'admin.html'; return; }
      await navigateTo(section);
      // Close mobile sidebar
      if (window.innerWidth <= 768) closeSidebar();
    });
  });

  // Mobile toggle
  menuBtn?.addEventListener('click', () => {
    sidebar?.classList.toggle('open');
    overlay?.classList.toggle('open');
  });

  overlay?.addEventListener('click', closeSidebar);

  function closeSidebar() {
    sidebar?.classList.remove('open');
    overlay?.classList.remove('open');
  }
}

// ─── Section Navigation ───────────────────────────────────────────────────────

async function navigateTo(section) {
  if (!['overview','notes','youtube','research','activity'].includes(section)) {
    section = 'overview';
  }

  activeSection = section;
  window.location.hash = section;

  // Update active nav state
  document.querySelectorAll('[data-section]').forEach(item => {
    item.classList.toggle('active', item.dataset.section === section);
  });

  // Show/hide sections
  document.querySelectorAll('.section').forEach(el => {
    el.classList.toggle('active', el.id === `section-${section}`);
  });

  // Update topbar title
  const titles = {
    overview : { title: 'Overview',           sub: `Welcome back, ${currentProfile.name}!` },
    notes    : { title: '📝 Notes',            sub: 'Manage your personal notes' },
    youtube  : { title: '🎥 YouTube Summarizer', sub: 'Summarize any YouTube video with AI' },
    research : { title: '🔍 AI Research',      sub: 'Ask anything, get researched answers' },
    activity : { title: '📊 Activity',         sub: 'Your recent actions' },
  };
  const t = titles[section] || titles.overview;
  const titleEl = document.getElementById('topbar-title');
  const subEl   = document.getElementById('topbar-sub');
  if (titleEl) titleEl.textContent = t.title;
  if (subEl)   subEl.textContent   = t.sub;

  // Lazy init
  if (!initializedSections.has(section)) {
    initializedSections.add(section);
    await initSection(section);
  }
}

async function initSection(section) {
  const uid = currentUser.id;
  switch (section) {
    case 'overview':  await loadOverview();         break;
    case 'notes':     await initNotes(uid);         break;
    case 'youtube':         initYoutube(uid);       break;
    case 'research':        initResearch(uid);      break;
    case 'activity':  await loadFullActivity();     break;
  }
}

// ─── Overview ─────────────────────────────────────────────────────────────────

async function loadOverview() {
  await Promise.all([loadStats(), loadRecentActivity()]);
}

async function loadStats() {
  const uid = currentUser.id;

  const [
    { count: notesCount },
    { count: summaryCount },
    { count: researchCount },
  ] = await Promise.all([
    supabaseClient.from('notes').select('*', { count: 'exact', head: true }).eq('user_id', uid),
    supabaseClient.from('activity').select('*', { count: 'exact', head: true }).eq('user_id', uid).eq('type', 'summarize'),
    supabaseClient.from('activity').select('*', { count: 'exact', head: true }).eq('user_id', uid).eq('type', 'research'),
  ]);

  animateCount('stat-notes',    notesCount    || 0);
  animateCount('stat-summaries', summaryCount || 0);
  animateCount('stat-research',  researchCount|| 0);
  animateCount('stat-total',     (notesCount || 0) + (summaryCount || 0) + (researchCount || 0));
}

function animateCount(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  if (target === 0) { el.textContent = 0; return; }
  let current = 0;
  const step  = Math.max(1, Math.ceil(target / 30));
  const timer = setInterval(() => {
    current = Math.min(current + step, target);
    el.textContent = current;
    if (current >= target) clearInterval(timer);
  }, 30);
}

async function loadRecentActivity() {
  const uid  = currentUser.id;
  const feed = document.getElementById('recent-activity-feed');
  if (!feed) return;

  showSkeleton(feed, 5, 'list');

  const { data, error } = await supabaseClient
    .from('activity')
    .select('*')
    .eq('user_id', uid)
    .order('created_at', { ascending: false })
    .limit(10);

  if (error || !data?.length) {
    feed.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">✨</div>
        <h3>No activity yet</h3>
        <p>Create a note, summarize a video, or ask a question to get started.</p>
      </div>`;
    return;
  }

  feed.innerHTML = data.map(item => renderActivityItem(item)).join('');
}

function renderActivityItem(item) {
  const typeMap = {
    note     : { icon: '📝', label: 'Created a note', dot: 'note' },
    summarize: { icon: '🎥', label: 'Summarized a video', dot: 'summarize' },
    research : { icon: '🔍', label: 'Researched a topic', dot: 'research' },
  };
  const t = typeMap[item.type] || { icon: '📌', label: 'Action', dot: 'note' };
  const detail = item.data?.title || item.data?.question || item.data?.url || '';

  return `
    <div class="activity-item">
      <div class="activity-dot ${t.dot}">${t.icon}</div>
      <div class="activity-body">
        <div class="activity-text">${t.label}${detail ? `: <em>${sanitizeHTML(detail.slice(0,60))}</em>` : ''}</div>
        <div class="activity-time">${timeAgo(item.created_at)}</div>
      </div>
    </div>`;
}

async function loadFullActivity() {
  const uid  = currentUser.id;
  const feed = document.getElementById('full-activity-feed');
  if (!feed) return;

  showSkeleton(feed, 8, 'list');

  const { data, error } = await supabaseClient
    .from('activity')
    .select('*')
    .eq('user_id', uid)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error || !data?.length) {
    feed.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📊</div>
        <h3>No activity yet</h3>
      </div>`;
    return;
  }

  feed.innerHTML = data.map(item => renderActivityItem(item)).join('');
}

// ─── Quick Actions ────────────────────────────────────────────────────────────

function setupQuickActions() {
  document.getElementById('qa-create-note')?.addEventListener('click', async () => {
    await navigateTo('notes');
    setTimeout(() => openNoteModal(), 300);
  });

  document.getElementById('qa-summarize')?.addEventListener('click', () => navigateTo('youtube'));
  document.getElementById('qa-research')?.addEventListener('click',  () => navigateTo('research'));
}

// ─── Theme Toggle ─────────────────────────────────────────────────────────────

function setupThemeToggle() {
  const saved = localStorage.getItem('pos_theme') || 'dark';
  applyTheme(saved);

  document.getElementById('theme-toggle')?.addEventListener('click', () => {
    const current = document.documentElement.dataset.theme || 'dark';
    const next    = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    localStorage.setItem('pos_theme', next);
  });
}

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
}

// ─── Sign Out ─────────────────────────────────────────────────────────────────

function setupSignOut() {
  document.getElementById('signout-btn')?.addEventListener('click', async () => {
    if (confirm('Sign out of Personal OS?')) await signOut();
  });
}
