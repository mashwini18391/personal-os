/**
 * helpers.js
 * Shared utility functions used across all modules.
 */

// ─── Toast Notification System ────────────────────────────────────────────────

let toastContainer = null;

function ensureToastContainer() {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    toastContainer.setAttribute('aria-live', 'polite');
    document.body.appendChild(toastContainer);
  }
  return toastContainer;
}

/**
 * showToast – displays a pop-up notification.
 * @param {string} message
 * @param {'success'|'error'|'info'|'warning'} type
 * @param {number} duration milliseconds
 */
function showToast(message, type = 'info', duration = 3500) {
  const container = ensureToastContainer();

  const icons = {
    success : '✓',
    error   : '✕',
    info    : 'ℹ',
    warning : '⚠',
  };

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || icons.info}</span>
    <span class="toast-msg">${sanitizeHTML(message)}</span>
    <button class="toast-close" aria-label="Close">✕</button>
  `;

  toast.querySelector('.toast-close').addEventListener('click', () => removeToast(toast));
  container.appendChild(toast);

  // Trigger animation
  requestAnimationFrame(() => toast.classList.add('toast-visible'));

  // Auto-remove
  setTimeout(() => removeToast(toast), duration);
}

function removeToast(toast) {
  toast.classList.remove('toast-visible');
  toast.classList.add('toast-hiding');
  setTimeout(() => toast.remove(), 400);
}

// ─── Security ─────────────────────────────────────────────────────────────────

/**
 * sanitizeHTML – escapes HTML entities to prevent XSS.
 * @param {string} str
 * @returns {string}
 */
function sanitizeHTML(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

/**
 * sanitizeInput – trims and removes dangerous characters from user input.
 * @param {string} input
 * @returns {string}
 */
function sanitizeInput(input) {
  if (!input) return '';
  return String(input)
    .trim()
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '');
}

// ─── Date / Time ──────────────────────────────────────────────────────────────

function getUTCDate(dateInput) {
  let dStr = String(dateInput);
  // If it's a Supabase timestamp without time zone, it lacks a trailing 'Z' or offset.
  if (dStr.includes('T') && !dStr.endsWith('Z') && !dStr.match(/[+-]\d{2}:?\d{2}$/)) {
    dStr += 'Z';
  }
  return new Date(dStr);
}

/**
 * formatDate – returns a human-friendly date string.
 * @param {string|Date} dateInput
 * @returns {string}
 */
function formatDate(dateInput) {
  if (!dateInput) return '—';
  const d = getUTCDate(dateInput);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString('en-US', {
    year : 'numeric',
    month: 'short',
    day  : 'numeric',
    hour : '2-digit',
    minute: '2-digit',
  });
}

/**
 * timeAgo – returns a relative time string (e.g. "2 hours ago").
 * @param {string|Date} dateInput
 * @returns {string}
 */
function timeAgo(dateInput) {
  if (!dateInput) return '';
  const now  = Date.now();
  const then = getUTCDate(dateInput).getTime();
  const diff = Math.floor((now - then) / 1000);

  if (diff < 60)     return 'just now';
  if (diff < 3600)   return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)  return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return formatDate(dateInput);
}

// ─── Performance ──────────────────────────────────────────────────────────────

/**
 * debounce – delay function execution until after a quiet period.
 * @param {Function} fn
 * @param {number} delay ms
 * @returns {Function}
 */
function debounce(fn, delay = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/**
 * throttle – ensure function fires at most once per interval.
 * @param {Function} fn
 * @param {number} limit ms
 * @returns {Function}
 */
function throttle(fn, limit = 300) {
  let last = 0;
  return (...args) => {
    const now = Date.now();
    if (now - last >= limit) { last = now; fn(...args); }
  };
}

// ─── DOM Helpers ──────────────────────────────────────────────────────────────

/**
 * createElement – tiny helper for creating DOM nodes with properties.
 * @param {string} tag
 * @param {object} props
 * @param {string|Node|Array} children
 * @returns {HTMLElement}
 */
function createElement(tag, props = {}, children = []) {
  const el = document.createElement(tag);
  Object.entries(props).forEach(([k, v]) => {
    if (k === 'className') el.className = v;
    else if (k === 'dataset') Object.entries(v).forEach(([dk, dv]) => (el.dataset[dk] = dv));
    else el.setAttribute(k, v);
  });
  [children].flat().forEach(child => {
    if (typeof child === 'string') el.appendChild(document.createTextNode(child));
    else if (child) el.appendChild(child);
  });
  return el;
}

/**
 * showSkeleton – renders skeleton loading cards in a container.
 * @param {HTMLElement} container
 * @param {number} count
 * @param {string} type 'card'|'list'
 */
function showSkeleton(container, count = 3, type = 'card') {
  container.innerHTML = Array.from({ length: count }, () =>
    type === 'card'
      ? `<div class="skeleton-card">
           <div class="skeleton-line wide"></div>
           <div class="skeleton-line medium"></div>
           <div class="skeleton-line narrow"></div>
         </div>`
      : `<div class="skeleton-list-item">
           <div class="skeleton-circle"></div>
           <div class="skeleton-lines">
             <div class="skeleton-line wide"></div>
             <div class="skeleton-line medium"></div>
           </div>
         </div>`
  ).join('');
}

/**
 * setLoadingState – toggles a button's loading state.
 * @param {HTMLButtonElement} btn
 * @param {boolean} loading
 * @param {string} loadingText
 */
function setLoadingState(btn, loading, loadingText = 'Loading...') {
  if (!btn) return;
  if (loading) {
    btn.dataset.originalText = btn.textContent;
    btn.innerHTML = `<span class="btn-spinner"></span>${loadingText}`;
    btn.disabled = true;
  } else {
    btn.textContent = btn.dataset.originalText || 'Submit';
    btn.disabled = false;
  }
}

// ─── Storage Cache ────────────────────────────────────────────────────────────

/**
 * cache – simple localStorage-based cache with TTL.
 */
const cache = {
  set(key, value, ttlMs = 300_000) {
    try {
      localStorage.setItem(`cache_${key}`, JSON.stringify({ value, exp: Date.now() + ttlMs }));
    } catch { /* storage full */ }
  },
  get(key) {
    try {
      const raw  = localStorage.getItem(`cache_${key}`);
      if (!raw) return null;
      const item = JSON.parse(raw);
      if (Date.now() > item.exp) { localStorage.removeItem(`cache_${key}`); return null; }
      return item.value;
    } catch { return null; }
  },
  del(key) {
    localStorage.removeItem(`cache_${key}`);
  },
};

// ─── String Helpers ───────────────────────────────────────────────────────────

/**
 * truncate – shorten a string and add ellipsis.
 * @param {string} str
 * @param {number} max
 */
function truncate(str, max = 120) {
  if (!str || str.length <= max) return str || '';
  return str.slice(0, max).trimEnd() + '…';
}

/**
 * generateId – random short ID for temporary client-side keys.
 */
function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

// Attach to window for global access (vanilla JS)
window.showToast      = showToast;
window.sanitizeHTML   = sanitizeHTML;
window.sanitizeInput  = sanitizeInput;
window.formatDate     = formatDate;
window.timeAgo        = timeAgo;
window.debounce       = debounce;
window.throttle       = throttle;
window.createElement  = createElement;
window.showSkeleton   = showSkeleton;
window.setLoadingState = setLoadingState;
window.cache          = cache;
window.truncate       = truncate;
window.generateId     = generateId;
