/**
 * notes.js
 * Full CRUD for notes with Supabase, Quill rich-text editor,
 * search, sort, and "AI search" via Gemini.
 */


// ─── State ────────────────────────────────────────────────────────────────────
window.currentUserId = window.currentUserId || null;
let allNotes      = [];
let editingNoteId = null;
let quill         = null;

// ─── Init ─────────────────────────────────────────────────────────────────────

/**
 * initNotes – bootstraps the notes module.
 * @param {string} userId
 */
async function initNotes(userId) {
  window.currentUserId = userId;
  setupNoteModal();
  setupSearch();
  setupSort();
  await loadNotes();
}

async function fetchNotes(sortBy = 'created_at') {
  const { data, error } = await window.supabaseClient
    .from('notes')
    .select('*')
    .eq('user_id', window.currentUserId)
    .order(sortBy, { ascending: false });

  if (error) throw new Error(error.message);
  return data || [];
}

async function createNote(title, content) {
  const { data, error } = await window.supabaseClient
    .from('notes')
    .insert([{ user_id: window.currentUserId, title, content }])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

async function updateNote(id, title, content) {
  const { data, error } = await window.supabaseClient
    .from('notes')
    .update({ title, content })
    .eq('id', id)
    .eq('user_id', window.currentUserId)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

async function deleteNote(id) {
  const { error } = await window.supabaseClient
    .from('notes')
    .delete()
    .eq('id', id)
    .eq('user_id', window.currentUserId);

  if (error) throw new Error(error.message);
}

async function logActivity(type, data) {
  await window.supabaseClient
    .from('activity')
    .insert([{ user_id: window.currentUserId, type, data }])
    .then(({ error }) => { if (error) console.warn('[Notes] Activity log failed:', error); });
}

async function loadNotes() {
  const container = document.getElementById('notes-grid');
  if (!container) return;

  window.showSkeleton(container, 6, 'card');

  try {
    const sortBy = document.getElementById('notes-sort')?.value || 'created_at';
    allNotes = await fetchNotes(sortBy);
    renderNotes(allNotes);
  } catch (err) {
    window.showToast('Failed to load notes: ' + err.message, 'error');
    container.innerHTML = '<p class="text-center" style="color:var(--text-muted)">Error loading notes.</p>';
  }
}

function renderNotes(notes) {
  const container = document.getElementById('notes-grid');
  if (!container) return;

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
         aria-label="Note: ${window.sanitizeHTML(note.title)}">
      <div class="note-title">${window.sanitizeHTML(note.title)}</div>
      <div class="note-content">${window.truncate(stripHTML(note.content), 140)}</div>
      <div class="note-meta">
        <span class="note-date">🕐 ${window.timeAgo(note.created_at)}</span>
        <div class="note-actions">
          <button class="btn btn-ghost btn-sm btn-icon" data-action="edit" data-id="${note.id}"
                  title="Edit note" aria-label="Edit note">✏️</button>
          <button class="btn btn-danger btn-sm btn-icon" data-action="delete" data-id="${note.id}"
                  title="Delete note" aria-label="Delete note">🗑️</button>
        </div>
      </div>
    </div>
  `).join('');

  container.addEventListener('click', handleNoteClick);
  container.addEventListener('keydown', e => {
    if (e.key === 'Enter') handleNoteClick(e);
  });
}

function stripHTML(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html || '';
  return tmp.textContent || '';
}

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

function setupNoteModal() {
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

  document.getElementById('note-modal-close').addEventListener('click', closeNoteModal);
  document.getElementById('note-cancel-btn').addEventListener('click', closeNoteModal);
  document.getElementById('note-save-btn').addEventListener('click', handleSaveNote);
  modal.addEventListener('click', e => { if (e.target === modal) closeNoteModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeNoteModal(); });
}

function openNoteModal(noteId = null) {
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
  const title    = window.sanitizeInput(titleRaw);

  if (!title) { window.showToast('Title is required.', 'warning'); return; }

  const content = quill
    ? quill.root.innerHTML
    : (document.getElementById('note-quill-editor')?.innerHTML || '');

  window.setLoadingState(btn, true, editingNoteId ? 'Updating…' : 'Saving…');

  try {
    if (editingNoteId) {
      const updated = await updateNote(editingNoteId, title, content);
      const idx = allNotes.findIndex(n => n.id === editingNoteId);
      if (idx !== -1) allNotes[idx] = updated;
      window.showToast('Note updated!', 'success');
    } else {
      const created = await createNote(title, content);
      allNotes.unshift(created);
      await logActivity('note', { action: 'create', title });
      window.showToast('Note created!', 'success');
    }
    renderNotes(allNotes);
    closeNoteModal();
  } catch (err) {
    window.showToast('Error saving note: ' + err.message, 'error');
  } finally {
    window.setLoadingState(btn, false);
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
    window.showToast('Note deleted.', 'info');
  } catch (err) {
    window.showToast('Delete failed: ' + err.message, 'error');
  }
}

function setupSearch() {
  const bar = document.getElementById('notes-search');
  if (!bar) return;

  const doSearch = window.debounce(async (query) => {
    if (!query.trim()) { renderNotes(allNotes); return; }

    const aiBtn = document.getElementById('ai-search-btn');
    if (aiBtn?.dataset.aiMode === 'on') {
      try {
        const indices = await window.generateAINoteSearch(query, allNotes);
        renderNotes(indices.length ? allNotes.filter((_, i) => indices.includes(i)) : []);
        return;
      } catch { /* fall through to text search */ }
    }

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

async function saveAsNote(title, content) {
  try {
    const created = await createNote(window.sanitizeInput(title), content);
    allNotes.unshift(created);
    renderNotes(allNotes);
    await logActivity('note', { action: 'save_from_summary', title });
    window.showToast('Saved as note!', 'success');
  } catch (err) {
    window.showToast('Could not save: ' + err.message, 'error');
  }
}

// Attach to window for global access
window.initNotes      = initNotes;
window.loadNotes      = loadNotes;
window.openNoteModal  = openNoteModal;
window.saveAsNote     = saveAsNote;
