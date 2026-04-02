/**
 * research.js
 * AI Research Tool module:
 *  - Takes user question
 *  - Calls Gemini to generate a researched answer with sources
 *  - Renders answer + clickable source links
 *  - Saves query to activity log
 *  - Optionally saves answer as a note
 */

import { supabaseClient } from '../services/supabaseClient.js';
import { performAIResearch } from '../services/api.js';
import { saveAsNote } from './notes.js';
import {
  showToast, sanitizeInput, sanitizeHTML,
  setLoadingState, timeAgo,
} from '../utils/helpers.js';

// ─── State ────────────────────────────────────────────────────────────────────
let currentUserId    = null;
let lastResearchData = null;

// ─── Init ─────────────────────────────────────────────────────────────────────

/**
 * initResearch – set up the research module.
 * @param {string} userId
 */
export function initResearch(userId) {
  currentUserId = userId;
  setupResearchForm();
  loadResearchHistory();
}

// ─── Form Setup ───────────────────────────────────────────────────────────────

function setupResearchForm() {
  const form  = document.getElementById('research-form');
  const input = document.getElementById('research-input');

  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = sanitizeInput(input.value.trim());
    if (!q) { showToast('Please enter a question.', 'warning'); return; }
    await handleResearch(q);
  });

  // Ctrl+Enter shortcut in textarea
  input?.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      form.dispatchEvent(new Event('submit'));
    }
  });

  // Suggested questions
  document.querySelectorAll('[data-suggest]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (input) {
        input.value = btn.dataset.suggest;
        input.focus();
      }
    });
  });
}

// ─── Research ─────────────────────────────────────────────────────────────────

async function handleResearch(question) {
  const submitBtn = document.getElementById('research-submit-btn');
  const resultEl  = document.getElementById('research-result');

  setLoadingState(submitBtn, true, 'Researching…');
  showResearchSkeleton(resultEl);

  try {
    const data = await performAIResearch(question);
    lastResearchData = { question, ...data };

    renderResearchResult(resultEl, question, data);
    await logActivity('research', { question, sourcesCount: data.sources.length });
    await loadResearchHistory();
    showToast('Research complete!', 'success');
  } catch (err) {
    resultEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <h3>Research failed</h3>
        <p>${sanitizeHTML(err.message)}</p>
      </div>`;
    showToast('Error: ' + err.message, 'error');
  } finally {
    setLoadingState(submitBtn, false);
  }
}

// ─── Render ───────────────────────────────────────────────────────────────────

function showResearchSkeleton(container) {
  container.innerHTML = `
    <div class="research-answer" style="animation:fadeSlideUp .3s ease">
      <div class="skeleton-line wide mb-4" style="height:20px;margin-bottom:16px"></div>
      <div class="skeleton-line wide" style="margin-bottom:8px"></div>
      <div class="skeleton-line medium" style="margin-bottom:8px"></div>
      <div class="skeleton-line wide" style="margin-bottom:8px"></div>
      <div class="skeleton-line narrow" style="margin-bottom:24px"></div>
      <div class="skeleton-line medium" style="height:40px;border-radius:var(--r-md)"></div>
    </div>`;
}

function renderResearchResult(container, question, { answer, sources }) {
  // Format paragraphs
  const paragraphs = answer.split('\n').filter(Boolean).map(p =>
    `<p style="margin-bottom:14px">${sanitizeHTML(p)}</p>`
  ).join('');

  const sourcesHTML = sources.length ? `
    <div style="margin-top:24px">
      <h4 style="font-size:.85rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:14px">
        🔗 Sources (${sources.length})
      </h4>
      <div class="sources-list">
        ${sources.map((s, i) => `
          <a href="${sanitizeHTML(s.url)}" target="_blank" rel="noopener noreferrer" class="source-item">
            <span class="source-icon">🌐</span>
            <span class="source-title">${sanitizeHTML(s.title)}</span>
            <span style="margin-left:auto;color:var(--text-muted);font-size:.75rem">↗</span>
          </a>
        `).join('')}
      </div>
    </div>
  ` : '';

  container.innerHTML = `
    <div class="research-answer fade-in">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:20px">
        <div>
          <h3 style="font-size:1rem;margin-bottom:4px">🔍 Research Result</h3>
          <p style="font-size:.82rem;color:var(--text-muted)">Q: ${sanitizeHTML(question)}</p>
        </div>
        <div class="flex gap-2" style="flex-shrink:0">
          <button class="btn btn-primary btn-sm" id="research-save-btn">📝 Save as Note</button>
          <button class="btn btn-secondary btn-sm" id="research-copy-btn">📋 Copy</button>
        </div>
      </div>

      <div class="research-body">${paragraphs}</div>
      ${sourcesHTML}
    </div>
  `;

  document.getElementById('research-save-btn')?.addEventListener('click', handleSaveAsNote);
  document.getElementById('research-copy-btn')?.addEventListener('click', () => {
    navigator.clipboard.writeText(`Q: ${question}\n\nA: ${answer}\n\nSources:\n${sources.map(s=>`• ${s.title}: ${s.url}`).join('\n')}`)
      .then(() => showToast('Copied!', 'success'));
  });
}

// ─── Save as Note ─────────────────────────────────────────────────────────────

async function handleSaveAsNote() {
  if (!lastResearchData) { showToast('No research to save.', 'warning'); return; }
  const { question, answer, sources } = lastResearchData;
  const content = `
    <h2>Question</h2>
    <p>${question}</p>
    <h2>Answer</h2>
    ${answer.split('\n').filter(Boolean).map(p => `<p>${p}</p>`).join('')}
    ${sources.length ? `<h3>Sources</h3><ul>${sources.map(s => `<li><a href="${s.url}">${s.title}</a></li>`).join('')}</ul>` : ''}
  `;
  await saveAsNote(`🔍 ${question.slice(0, 80)}`, content);
}

// ─── Activity / History ───────────────────────────────────────────────────────

async function logActivity(type, data) {
  if (!currentUserId) return;
  const { error } = await supabaseClient
    .from('activity')
    .insert([{ user_id: currentUserId, type, data }]);
  if (error) console.warn('[Research] Activity log error:', error);
}

async function loadResearchHistory() {
  const list = document.getElementById('research-history');
  if (!list || !currentUserId) return;

  const { data, error } = await supabaseClient
    .from('activity')
    .select('*')
    .eq('user_id', currentUserId)
    .eq('type', 'research')
    .order('created_at', { ascending: false })
    .limit(8);

  if (error || !data?.length) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔍</div>
        <p>No research queries yet.</p>
      </div>`;
    return;
  }

  list.innerHTML = data.map(item => `
    <div class="activity-item" style="cursor:pointer" data-question="${sanitizeHTML(item.data?.question || '')}">
      <div class="activity-dot research">🔍</div>
      <div class="activity-body">
        <div class="activity-text">${sanitizeHTML(item.data?.question || 'Research query')}</div>
        <div class="activity-time">${timeAgo(item.created_at)}</div>
      </div>
    </div>
  `).join('');

  // Click to re-run
  list.querySelectorAll('[data-question]').forEach(row => {
    row.addEventListener('click', () => {
      const q = row.dataset.question;
      const input = document.getElementById('research-input');
      if (input && q) {
        input.value = q;
        document.getElementById('research-form')?.dispatchEvent(new Event('submit'));
      }
    });
  });
}
