/**
 * notes.js
 * Full CRUD for notes with Supabase, Quill rich-text editor,
 * search, sort, and "AI search" via Gemini.
 */

import { supabaseClient } from '../services/supabaseClient.js';
import { generateAINoteSearch } from '../services/api.js';
import {
  showToast, sanitizeInput, sanitizeHTML,
  formatDate, timeAgo, debounce, showSkeleton,
  setLoadingState, truncate,
} from '../utils/helpers.js';

// ─── State ────────────────────────────────────────────────────────────────────
let currentUserId = null;
let allNotes      = [];
let editingNoteId = null;
let quill         = null;

// ─── Init ─────────────────────────────────────────────────────────────────────

/**
 * initNotes – bootstraps the notes module.
 * @param {string} userId
 */
export async function initNotes(userId) {
  currentUserId = userId;
  setupNoteModal();
  setupSearch();
  setupSort();
  await loadNotes();
}

// ─── Supabase CRUD ────────────────────────────────────────────────────────────

/** Fetch all notes for the current user, ordered by created_at desc. */
async function fetchNotes(sortBy = 'created_at') {
  const { data, error } = await supabaseClient
    .from('notes')
    .select('*')
    .eq('user_id', currentUserId)
    .order(sortBy, { ascending: false });

  if (error) throw new Error(error.message);
  return data || [];
}

/** Create a new note. */
async function createNote(title, content) {
  const { data, error } = await supabaseClient
    .from('notes')
    .insert([{ user_id: currentUserId, title, content }])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/** Update an existing note. */
async function updateNote(id, title, content) {
  const { data, error } = await supabaseClient
    .from('notes')
    .update({ title, content })
    .eq('id', id)
    .eq('user_id', currentUserId)  // RLS double-check
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/** Delete a note by id. */
async function deleteNote(id) {
  const { error } = await supabaseClient
    .from('notes')
    .delete()
    .eq('id', id)
    .eq('user_id', currentUserId);

  if (error) throw new Error(error.message);
}

// ─── Activity Logger ──────────────────────────────────────────────────────────

async function logActivity(type, data) {
  await supabaseClient
    .from('activity')
    .insert([{ user_id: currentUserId, type, data }])
    .then(({ error }) => { if (error) console.warn('[Notes] Activity log failed:', error); });
}

// ─── UI / Render ──────────────────────────────────────────────────────────────

/** Load and render notes. */
export async function loadNotes() {
  const container = document.getElementById('notes-grid');
  if (!container) return;

  showSkeleton(container, 6, 'card');

  try {
    const sortBy = document.getElementById('notes-sort')?.value || 'created_at';
    allNotes = await fetchNotes(sortBy);
    renderNotes(allNotes);
  } catch (err) {
    showToast('Failed to load notes: ' + err.message, 'error');
    container.innerHTML = '<p class="text-center" style="color:var(--text-muted)">Error loading notes.</p>';
  }
}

/** Render an array of notes into the grid. */
function renderNotes(notes) {
  const container = document.getElementById('notes-grid');
  if (!container) return;

  // Update count badge
  const badge = document.getElementById('notes-count');
  if (badge) badge.textContent = notes.length;

  if (!notes.length) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <div class="empty-icon">📝</div>
        <h3>No notes yet</h3>
        <p>Create your first note to get started.</p>
      </div>`;
    return;
  }

  container.innerHTML = notes.map(note => `
    <div class="note-card fade-in" data-id="${note.id}" role="button" tabindex="0"
         aria-label="Note: ${sanitizeHTML(note.title)}">
      <div class="note-title">${sanitizeHTML(note.title)}</div>
      <div class="note-content">${truncate(stripHTML(note.content), 140)}</div>
      <div class="note-meta">
        <span class="note-date">🕐 ${timeAgo(note.created_at)}</span>
        <div class="note-actions">
          <button class="btn btn-ghost btn-sm btn-icon" data-action="edit" data-id="${note.id}"
                  title="Edit note" aria-label="Edit note">✏️</button>
          <button class="btn btn-danger btn-sm btn-icon" data-action="delete" data-id="${note.id}"
                  title="Delete note" aria-label="Delete note">🗑️</button>
        </div>
      </div>
    </div>
  `).join('');

  // Event delegation
  container.addEventListener('click', handleNoteClick);
  container.addEventListener('keydown', e => {
    if (e.key === 'Enter') handleNoteClick(e);
  });
}

/** Strip HTML from Quill content for preview. */
function stripHTML(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html || '';
  return tmp.textContent || '';
}

/** Handle clicks inside the notes grid. */
function handleNoteClick(e) {
  const btn = e.target.closest('[data-action]');
  if (btn) {
    e.stopPropagation();
    const { action, id } = btn.dataset;
    if (action === 'edit')   openNoteModal(id);
    if (action === 'delete') confirmDeleteNote(id);
    return;
  }
  const card = e.target.closest('.note-card');
  if (card) openNoteModal(card.dataset.id);
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function setupNoteModal() {
  // Create modal HTML once
  if (document.getElementById('note-modal')) return;

  const modal = document.createElement('div');
  modal.id = 'note-modal';
  modal.className = 'modal-backdrop';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h3 id="note-modal-title">New Note</h3>
        <button class="modal-close" id="note-modal-close" aria-label="Close">✕</button>
      </div>
      <div class="form-group">
        <label class="form-label" for="note-title-input">Title *</label>
        <input class="form-input" id="note-title-input" placeholder="Note title…" maxlength="200" autocomplete="off">
      </div>
      <div class="form-group">
        <label class="form-label">Content</label>
        <div id="note-editor-container">
          <div id="note-quill-editor"></div>
        </div>
      </div>
      <div class="flex gap-2 mt-4" style="justify-content:flex-end">
        <button class="btn btn-secondary" id="note-cancel-btn">Cancel</button>
        <button class="btn btn-primary" id="note-save-btn">Save Note</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  // Init Quill
  if (window.Quill) {
    quill = new Quill('#note-quill-editor', {
      theme  : 'snow',
      placeholder: 'Write your note here…',
      modules: { toolbar: [
        [{ header: [1,2,3,false] }],
        ['bold','italic','underline','strike'],
        [{ list: 'ordered' }, { list: 'bullet' }],
        ['link', 'blockquote', 'code-block'],
        ['clean'],
      ]},
    });
  }

  // Listeners
  document.getElementById('note-modal-close').addEventListener('click', closeNoteModal);
  document.getElementById('note-cancel-btn').addEventListener('click', closeNoteModal);
  document.getElementById('note-save-btn').addEventListener('click', handleSaveNote);
  modal.addEventListener('click', e => { if (e.target === modal) closeNoteModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeNoteModal(); });
}

/** Open modal for creating or editing. */
export function openNoteModal(noteId = null) {
  const modal = document.getElementById('note-modal');
  if (!modal) { setupNoteModal(); }

  editingNoteId = noteId;
  const titleEl = document.getElementById('note-modal-title');
  const inputEl = document.getElementById('note-title-input');

  if (noteId) {
    const note = allNotes.find(n => n.id === noteId);
    if (!note) return;
    titleEl.textContent = 'Edit Note';
    inputEl.value = note.title;
    if (quill) quill.root.innerHTML = note.content || '';
    else document.getElementById('note-quill-editor').innerHTML = note.content || '';
  } else {
    titleEl.textContent = 'New Note';
    inputEl.value = '';
    if (quill) quill.setText('');
    else document.getElementById('note-quill-editor').innerHTML = '';
  }

  document.getElementById('note-modal').classList.add('open');
  setTimeout(() => inputEl.focus(), 100);
}

function closeNoteModal() {
  document.getElementById('note-modal')?.classList.remove('open');
  editingNoteId = null;
}

async function handleSaveNote() {
  const btn     = document.getElementById('note-save-btn');
  const titleRaw = document.getElementById('note-title-input').value;
  const title    = sanitizeInput(titleRaw);

  if (!title) { showToast('Title is required.', 'warning'); return; }

  const content = quill
    ? quill.root.innerHTML
    : (document.getElementById('note-quill-editor')?.innerHTML || '');

  setLoadingState(btn, true, editingNoteId ? 'Updating…' : 'Saving…');

  try {
    if (editingNoteId) {
      const updated = await updateNote(editingNoteId, title, content);
      const idx = allNotes.findIndex(n => n.id === editingNoteId);
      if (idx !== -1) allNotes[idx] = updated;
      showToast('Note updated!', 'success');
    } else {
      const created = await createNote(title, content);
      allNotes.unshift(created);
      await logActivity('note', { action: 'create', title });
      showToast('Note created!', 'success');
    }
    renderNotes(allNotes);
    closeNoteModal();
  } catch (err) {
    showToast('Error saving note: ' + err.message, 'error');
  } finally {
    setLoadingState(btn, false);
  }
}

async function confirmDeleteNote(id) {
  const note = allNotes.find(n => n.id === id);
  if (!note) return;
  if (!confirm(`Delete "${note.title}"? This cannot be undone.`)) return;

  try {
    await deleteNote(id);
    allNotes = allNotes.filter(n => n.id !== id);
    renderNotes(allNotes);
    showToast('Note deleted.', 'info');
  } catch (err) {
    showToast('Delete failed: ' + err.message, 'error');
  }
}

// ─── Search & Sort ────────────────────────────────────────────────────────────

function setupSearch() {
  const bar = document.getElementById('notes-search');
  if (!bar) return;

  const doSearch = debounce(async (query) => {
    if (!query.trim()) { renderNotes(allNotes); return; }

    // Try AI search first
    const aiBtn = document.getElementById('ai-search-btn');
    if (aiBtn?.dataset.aiMode === 'on') {
      try {
        const indices = await generateAINoteSearch(query, allNotes);
        renderNotes(indices.length ? allNotes.filter((_, i) => indices.includes(i)) : []);
        return;
      } catch { /* fall through to text search */ }
    }

    // Fuzzy text search
    const q = query.toLowerCase();
    const filtered = allNotes.filter(n =>
      n.title.toLowerCase().includes(q) ||
      stripHTML(n.content).toLowerCase().includes(q)
    );
    renderNotes(filtered);
  }, 350);

  bar.addEventListener('input', () => doSearch(bar.value));
}

function setupSort() {
  const sel = document.getElementById('notes-sort');
  if (!sel) return;
  sel.addEventListener('change', loadNotes);
}

/**
 * saveAsNote – called from YouTube/Research modules.
 * @param {string} title
 * @param {string} content  HTML string
 */
export async function saveAsNote(title, content) {
  try {
    const created = await createNote(sanitizeInput(title), content);
    allNotes.unshift(created);
    renderNotes(allNotes);
    await logActivity('note', { action: 'save_from_summary', title });
    showToast('Saved as note!', 'success');
  } catch (err) {
    showToast('Could not save: ' + err.message, 'error');
  }
}
