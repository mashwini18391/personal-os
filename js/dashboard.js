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


// ─── State ────────────────────────────────────────────────────────────────────
window.currentUserId = window.currentUserId || null;
let currentUser    = null;
let currentProfile = null;
let activeSection  = 'overview';
const initializedSections = new Set();

// ─── Bootstrap ────────────────────────────────────────────────────────────────

(async () => {
  showPageLoader();
  try {
    const { user, profile } = await window.requireAuth();
    currentUser    = user;
    currentProfile = profile;
    window.currentUserId = user.id;

    populateUserUI();
    setupSidebar();
    setupThemeToggle();
    setupSignOut();
    setupQuickActions();

    const hash = window.location.hash.slice(1);
    await navigateTo(hash || 'overview');

    hidePageLoader();
  } catch (err) {
    console.error('[Dashboard]', err);
  }
})();

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

function populateUserUI() {
  const name     = currentProfile.name  || 'User';
  const email    = currentProfile.email || '';
  const role     = currentProfile.role  || 'user';
  const avatarUrl = currentUser.user_metadata?.avatar_url;

  const nameEls  = document.querySelectorAll('[data-user-name]');
  const roleEls  = document.querySelectorAll('[data-user-role]');
  const avatarEls = document.querySelectorAll('[data-user-avatar]');

  nameEls.forEach  (el => el.textContent = window.sanitizeHTML(name));
  roleEls.forEach  (el => {
    el.textContent = role.charAt(0).toUpperCase() + role.slice(1);
    el.className   = `user-role badge badge-${role}`;
  });

  avatarEls.forEach(el => {
    if (avatarUrl) {
      el.innerHTML = `<img src="${avatarUrl}" alt="${window.sanitizeHTML(name)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`;
    } else {
      el.textContent = name.charAt(0).toUpperCase();
    }
  });

  if (role === 'admin') {
    document.getElementById('admin-nav-item')?.classList.remove('hidden');
  }
}

function setupSidebar() {
  const sidebar  = document.getElementById('sidebar');
  const overlay  = document.getElementById('sidebar-overlay');
  const menuBtn  = document.getElementById('menu-toggle');

  document.querySelectorAll('[data-section]').forEach(item => {
    item.addEventListener('click', async () => {
      const section = item.dataset.section;
      if (section === 'admin') { window.location.href = 'admin.html'; return; }
      await navigateTo(section);
      if (window.innerWidth <= 768) closeSidebar();
    });
  });

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

async function navigateTo(section) {
  if (!['overview','notes','youtube','research','activity'].includes(section)) {
    section = 'overview';
  }

  activeSection = section;
  window.location.hash = section;

  document.querySelectorAll('[data-section]').forEach(item => {
    item.classList.toggle('active', item.dataset.section === section);
  });

  document.querySelectorAll('.section').forEach(el => {
    el.classList.toggle('active', el.id === `section-${section}`);
  });

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

  if (!initializedSections.has(section)) {
    initializedSections.add(section);
    await initSection(section);
  }
}

async function initSection(section) {
  switch (section) {
    case 'overview':  await loadOverview();         break;
    case 'notes':     await window.initNotes(window.currentUserId);  break;
    case 'youtube':         window.initYoutube(window.currentUserId);break;
    case 'research':        window.initResearch(window.currentUserId);break;
    case 'activity':  await loadFullActivity();     break;
  }
}

async function loadOverview() {
  await Promise.all([loadStats(), loadRecentActivity()]);
}

async function loadStats() {
  const [
    { count: notesCount },
    { count: summaryCount },
    { count: researchCount },
  ] = await Promise.all([
    window.supabaseClient.from('notes').select('*', { count: 'exact', head: true }).eq('user_id', window.currentUserId),
    window.supabaseClient.from('activity').select('*', { count: 'exact', head: true }).eq('user_id', window.currentUserId).eq('type', 'summarize'),
    window.supabaseClient.from('activity').select('*', { count: 'exact', head: true }).eq('user_id', window.currentUserId).eq('type', 'research'),
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
  const feed = document.getElementById('recent-activity-feed');
  if (!feed) return;

  window.showSkeleton(feed, 5, 'list');

  const { data, error } = await window.supabaseClient
    .from('activity')
    .select('*')
    .eq('user_id', window.currentUserId)
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
        <div class="activity-text">${t.label}${detail ? `: <em>${window.sanitizeHTML(detail.slice(0,60))}</em>` : ''}</div>
        <div class="activity-time">${window.timeAgo(item.created_at)}</div>
      </div>
    </div>`;
}

async function loadFullActivity() {
  const feed = document.getElementById('full-activity-feed');
  if (!feed) return;

  window.showSkeleton(feed, 8, 'list');

  const { data, error } = await window.supabaseClient
    .from('activity')
    .select('*')
    .eq('user_id', window.currentUserId)
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

function setupQuickActions() {
  document.getElementById('qa-create-note')?.addEventListener('click', async () => {
    await navigateTo('notes');
    setTimeout(() => window.openNoteModal(), 300);
  });

  document.getElementById('qa-summarize')?.addEventListener('click', () => navigateTo('youtube'));
  document.getElementById('qa-research')?.addEventListener('click',  () => navigateTo('research'));
}

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

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
}

function setupSignOut() {
  document.getElementById('signout-btn')?.addEventListener('click', async () => {
    if (confirm('Sign out of Personal OS?')) await window.signOut();
  });
}

// Attach to window for global access
window.applyTheme = applyTheme;
