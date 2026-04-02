/**
 * youtube.js
 * YouTube Summarizer module:
 *  - Validates + extracts video ID from URL
 *  - Fetches metadata + generates AI summary via Gemini
 *  - Displays result with key points
 *  - "Save as Note" button
 *  - Saves to activity log
 */

import { supabaseClient } from '../services/supabaseClient.js';
import { summarizeYouTubeVideo } from '../services/api.js';
import { saveAsNote } from './notes.js';
import {
  showToast, sanitizeInput, sanitizeHTML,
  setLoadingState, formatDate, timeAgo,
  showSkeleton,
} from '../utils/helpers.js';

// ─── State ────────────────────────────────────────────────────────────────────
let currentUserId   = null;
let lastSummaryData = null;

// ─── Init ─────────────────────────────────────────────────────────────────────

/**
 * initYoutube – mount the YouTube summariser.
 * @param {string} userId
 */
export function initYoutube(userId) {
  currentUserId = userId;
  setupYoutubeForm();
  loadSummaryHistory();
}

// ─── Form Setup ───────────────────────────────────────────────────────────────

function setupYoutubeForm() {
  const form    = document.getElementById('youtube-form');
  const input   = document.getElementById('youtube-url');
  const saveBtn = document.getElementById('yt-save-note-btn');

  if (!form || !input) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await handleSummarize(input.value.trim());
  });

  if (saveBtn) {
    saveBtn.addEventListener('click', handleSaveAsNote);
  }

  // Paste helper
  input.addEventListener('paste', () => {
    setTimeout(() => {
      if (input.value.includes('youtube.com') || input.value.includes('youtu.be')) {
        input.classList.add('valid-url');
      }
    }, 0);
  });
}

// ─── Summarize ────────────────────────────────────────────────────────────────

async function handleSummarize(url) {
  const submitBtn = document.getElementById('yt-submit-btn');
  const resultEl  = document.getElementById('yt-result');

  if (!url) { showToast('Please enter a YouTube URL.', 'warning'); return; }

  const cleanUrl = sanitizeInput(url);

  setLoadingState(submitBtn, true, 'Summarizing…');
  showLoadingState(resultEl);

  try {
    const data = await summarizeYouTubeVideo(cleanUrl);
    lastSummaryData = data;

    renderSummary(resultEl, data);
    await logActivity('summarize', { url: cleanUrl, title: data.title });
    await loadSummaryHistory();
    showToast('Summary ready!', 'success');
  } catch (err) {
    resultEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <h3>Summarization failed</h3>
        <p>${sanitizeHTML(err.message)}</p>
      </div>`;
    showToast('Error: ' + err.message, 'error');
  } finally {
    setLoadingState(submitBtn, false);
  }
}

// ─── Render Summary ───────────────────────────────────────────────────────────

function showLoadingState(container) {
  container.innerHTML = `
    <div class="card" style="animation:fadeSlideUp .3s ease">
      <div style="display:flex;gap:20px;align-items:flex-start">
        <div class="skeleton-line" style="width:280px;height:160px;border-radius:var(--r-md);flex-shrink:0"></div>
        <div style="flex:1;display:flex;flex-direction:column;gap:12px">
          <div class="skeleton-line wide"></div>
          <div class="skeleton-line medium"></div>
          <div class="skeleton-line narrow"></div>
          <div class="skeleton-line wide"></div>
          <div class="skeleton-line medium"></div>
        </div>
      </div>
    </div>`;
}

function renderSummary(container, data) {
  const kpHTML = data.keyPoints.map((pt, i) => `
    <div class="key-point">
      <span class="key-point-num">${i + 1}.</span>
      <span>${sanitizeHTML(pt)}</span>
    </div>
  `).join('');

  container.innerHTML = `
    <div class="yt-result fade-in">
      <div class="yt-thumb">
        <img src="${sanitizeHTML(data.thumbnail)}" alt="Video thumbnail" loading="lazy">
      </div>
      <div class="yt-info">
        <h3 class="yt-title">${sanitizeHTML(data.title)}</h3>
        <p class="yt-summary">${sanitizeHTML(data.summary)}</p>
        <div>
          <h4 style="margin-bottom:10px;font-size:.875rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em">Key Takeaways</h4>
          <div class="key-points">${kpHTML}</div>
        </div>
        <div class="flex gap-2 mt-4">
          <button class="btn btn-primary btn-sm" id="yt-save-note-btn">📝 Save as Note</button>
          <button class="btn btn-secondary btn-sm" id="yt-copy-btn">📋 Copy Summary</button>
        </div>
      </div>
    </div>
  `;

  // Bind buttons
  document.getElementById('yt-save-note-btn')?.addEventListener('click', handleSaveAsNote);
  document.getElementById('yt-copy-btn')?.addEventListener('click', () => {
    navigator.clipboard.writeText(
      `${data.title}\n\nSummary:\n${data.summary}\n\nKey Points:\n${data.keyPoints.map((p,i)=>`${i+1}. ${p}`).join('\n')}`
    ).then(() => showToast('Copied to clipboard!', 'success'));
  });
}

// ─── Save as Note ─────────────────────────────────────────────────────────────

async function handleSaveAsNote(e) {
  const btn = e.currentTarget;
  if (!lastSummaryData) { showToast('No summary to save.', 'warning'); return; }

  setLoadingState(btn, true, 'Saving…');
  try {
    const { title, summary, keyPoints } = lastSummaryData;
    const content = `
      <h2>Summary</h2>
      <p>${summary}</p>
      <h3>Key Takeaways</h3>
      <ol>${keyPoints.map(p => `<li>${p}</li>`).join('')}</ol>
    `;
    await saveAsNote(`📺 ${title}`, content);

    // Provide visual success state and add reset button
    btn.dataset.originalText = '✓ Saved as Note';
    
    if (!document.getElementById('yt-new-summary')) {
      const newBtn = document.createElement('button');
      newBtn.id = 'yt-new-summary';
      newBtn.className = 'btn btn-secondary btn-sm fade-in';
      newBtn.innerHTML = '🔄 Summarize Another';
      newBtn.addEventListener('click', () => {
        document.getElementById('yt-result').innerHTML = '';
        document.getElementById('youtube-url').value = '';
        document.getElementById('youtube-url').classList.remove('valid-url');
        lastSummaryData = null;
      });
      btn.parentElement.appendChild(newBtn);
    }
  } finally {
    setLoadingState(btn, false);
    if (btn.dataset.originalText === '✓ Saved as Note') {
       btn.disabled = true;
       btn.style.opacity = '0.7';
    }
  }
}

// ─── Activity / History ───────────────────────────────────────────────────────

async function logActivity(type, data) {
  if (!currentUserId) return;
  const { error } = await supabaseClient
    .from('activity')
    .insert([{ user_id: currentUserId, type, data }]);
  if (error) console.warn('[YouTube] Activity log failed:', error);
}

async function loadSummaryHistory() {
  const list = document.getElementById('yt-history-list');
  if (!list || !currentUserId) return;

  list.innerHTML = '<div class="loader-ring" style="margin:20px auto"></div>';

  const { data, error } = await supabaseClient
    .from('activity')
    .select('*')
    .eq('user_id', currentUserId)
    .eq('type', 'summarize')
    .order('created_at', { ascending: false })
    .limit(10);

  if (error || !data?.length) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🎥</div>
        <p>No summaries yet. Paste a YouTube URL above!</p>
      </div>`;
    return;
  }

  list.innerHTML = data.map(item => `
    <div class="activity-item">
      <div class="activity-dot summarize">🎥</div>
      <div class="activity-body">
        <div class="activity-text">${sanitizeHTML(item.data?.title || 'YouTube Video')}</div>
        <div class="activity-time">${timeAgo(item.created_at)}</div>
      </div>
    </div>
  `).join('');
}
