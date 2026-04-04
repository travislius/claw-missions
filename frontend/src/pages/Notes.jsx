import { useEffect, useMemo, useState } from 'react';
import { Link2, MenuSquare, NotebookPen, Pencil, RefreshCw, Save, Send, Sparkles, SquareStack, X } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  createNote,
  createNoteReply,
  getCategoryNotes,
  getNote,
  getNoteCategories,
  updateNote,
  updateNoteCategory,
  updateNoteReply,
} from '../api';

const CATEGORY_STYLES = {
  slate: 'border-gray-700 bg-gray-900/80 text-gray-200',
  red: 'border-red-500/30 bg-red-500/10 text-red-100',
  amber: 'border-amber-500/30 bg-amber-500/10 text-amber-100',
  blue: 'border-sky-500/30 bg-sky-500/10 text-sky-100',
  green: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100',
};

function timeAgo(iso) {
  if (!iso) return '-';
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function markdownPlaceholder(label) {
  return `${label}\n\n- bullet lists\n- links\n- code fences\n\n\`\`\`bash\nopenclaw status\n\`\`\``;
}

function Markdown({ children }) {
  return (
    <ReactMarkdown
      className="markdown-body"
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
      }}
    >
      {children || ''}
    </ReactMarkdown>
  );
}

function EmptyState({ title, text }) {
  return (
    <div className="h-full min-h-[260px] rounded-[28px] border border-dashed border-gray-700 bg-gray-950/60 px-6 py-10 text-center">
      <Sparkles className="mx-auto mb-3 h-6 w-6 text-gray-600" />
      <h3 className="text-base font-semibold text-white">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">{text}</p>
    </div>
  );
}

function PaneShell({ title, subtitle, actions, children, className = '' }) {
  return (
    <section className={`rounded-[28px] border border-gray-800 bg-[#080c14]/90 shadow-[0_30px_80px_rgba(0,0,0,0.35)] ${className}`}>
      <div className="flex items-start justify-between gap-3 border-b border-gray-800 px-4 py-4">
        <div>
          <h2 className="text-sm font-semibold text-white">{title}</h2>
          {subtitle ? <p className="mt-1 text-xs text-gray-500">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

function ActionButton({ icon: Icon, label, onClick, active = false, disabled = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${
        active
          ? 'border-sky-500/40 bg-sky-500/10 text-sky-100'
          : 'border-gray-700 bg-gray-900/60 text-gray-300 hover:border-gray-600 hover:text-white'
      } disabled:cursor-not-allowed disabled:opacity-50`}
    >
      <Icon className="h-4 w-4" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

export default function Notes() {
  const navigate = useNavigate();
  const { categorySlug, noteId } = useParams();

  const [categories, setCategories] = useState([]);
  const [activeCategoryId, setActiveCategoryId] = useState(null);
  const [notes, setNotes] = useState([]);
  const [activeNoteId, setActiveNoteId] = useState(null);
  const [noteDetail, setNoteDetail] = useState(null);

  const [loadingCategories, setLoadingCategories] = useState(true);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [loadingNote, setLoadingNote] = useState(false);
  const [error, setError] = useState('');

  const [showCategoriesPane, setShowCategoriesPane] = useState(true);
  const [showNoteListPane, setShowNoteListPane] = useState(true);
  const [showComposer, setShowComposer] = useState(false);

  const [savingNote, setSavingNote] = useState(false);
  const [savingReply, setSavingReply] = useState(false);
  const [savingCategory, setSavingCategory] = useState(false);
  const [copyState, setCopyState] = useState('idle');

  const [categoryDraft, setCategoryDraft] = useState({ name: '', description: '', color: 'slate' });
  const [editingCategory, setEditingCategory] = useState(false);
  const [newNoteDraft, setNewNoteDraft] = useState({ title: '', body: '' });
  const [editNoteDraft, setEditNoteDraft] = useState({ title: '', body: '' });
  const [editingNote, setEditingNote] = useState(false);
  const [replyDraft, setReplyDraft] = useState('');
  const [editingReplyId, setEditingReplyId] = useState(null);
  const [editingReplyBody, setEditingReplyBody] = useState('');

  const activeCategory = useMemo(
    () => categories.find((category) => category.id === activeCategoryId) || null,
    [categories, activeCategoryId]
  );

  useEffect(() => {
    let cancelled = false;

    async function loadCategories() {
      setLoadingCategories(true);
      setError('');
      try {
        const { data } = await getNoteCategories();
        if (cancelled) return;
        setCategories(data);
        setActiveCategoryId((current) => {
          if (current && data.some((category) => category.id === current)) return current;
          if (categorySlug) {
            const matched = data.find((category) => category.slug === categorySlug);
            if (matched) return matched.id;
          }
          return data[0]?.id ?? null;
        });
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.detail || 'Failed to load categories.');
      } finally {
        if (!cancelled) setLoadingCategories(false);
      }
    }

    loadCategories();
    return () => {
      cancelled = true;
    };
  }, [categorySlug]);

  useEffect(() => {
    if (!noteId) return;
    let cancelled = false;

    async function loadNoteFromRoute() {
      setLoadingNote(true);
      setError('');
      try {
        const { data } = await getNote(Number(noteId));
        if (cancelled) return;
        setNoteDetail(data);
        setActiveNoteId(data.id);
        setActiveCategoryId(data.channel_id);
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.detail || 'Failed to load note.');
      } finally {
        if (!cancelled) setLoadingNote(false);
      }
    }

    loadNoteFromRoute();
    return () => {
      cancelled = true;
    };
  }, [noteId]);

  useEffect(() => {
    if (!activeCategoryId) return;
    let cancelled = false;

    async function loadNotes() {
      setLoadingNotes(true);
      setError('');
      try {
        const { data } = await getCategoryNotes(activeCategoryId);
        if (cancelled) return;
        setNotes(data);
        setActiveNoteId((current) => {
          if (noteId) {
            const routedId = Number(noteId);
            if (data.some((note) => note.id === routedId)) return routedId;
          }
          if (current && data.some((note) => note.id === current)) return current;
          return data[0]?.id ?? null;
        });
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.detail || 'Failed to load notes.');
      } finally {
        if (!cancelled) setLoadingNotes(false);
      }
    }

    loadNotes();
    return () => {
      cancelled = true;
    };
  }, [activeCategoryId, noteId]);

  useEffect(() => {
    if (!activeCategory) return;
    setCategoryDraft({
      name: activeCategory.name,
      description: activeCategory.description || '',
      color: activeCategory.color || 'slate',
    });
  }, [activeCategory]);

  useEffect(() => {
    if (!activeNoteId) {
      setNoteDetail(null);
      return;
    }
    if (noteDetail?.id === activeNoteId) return;

    let cancelled = false;
    async function loadSelectedNote() {
      setLoadingNote(true);
      setError('');
      try {
        const { data } = await getNote(activeNoteId);
        if (!cancelled) setNoteDetail(data);
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.detail || 'Failed to load note.');
      } finally {
        if (!cancelled) setLoadingNote(false);
      }
    }

    loadSelectedNote();
    return () => {
      cancelled = true;
    };
  }, [activeNoteId, noteDetail?.id]);

  useEffect(() => {
    if (!noteDetail) return;
    setEditNoteDraft({ title: noteDetail.title, body: noteDetail.body });
  }, [noteDetail]);

  useEffect(() => {
    if (!noteDetail) return;
    const expectedPath = `/notes/${noteDetail.channel_slug}/${noteDetail.id}`;
    if (window.location.pathname !== expectedPath) {
      navigate(expectedPath, { replace: !!noteId });
    }
  }, [navigate, noteDetail, noteId]);

  async function reloadCategories() {
    const { data } = await getNoteCategories();
    setCategories(data);
    return data;
  }

  async function reloadNotes(categoryId, preferredNoteId = null) {
    if (!categoryId) return [];
    const { data } = await getCategoryNotes(categoryId);
    setNotes(data);
    setActiveNoteId((current) => {
      if (preferredNoteId && data.some((note) => note.id === preferredNoteId)) return preferredNoteId;
      if (current && data.some((note) => note.id === current)) return current;
      return data[0]?.id ?? null;
    });
    return data;
  }

  async function handleRefresh() {
    try {
      setError('');
      await reloadCategories();
      if (activeCategoryId) {
        await reloadNotes(activeCategoryId, activeNoteId);
      }
      if (activeNoteId) {
        const { data } = await getNote(activeNoteId);
        setNoteDetail(data);
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to refresh notes.');
    }
  }

  async function handleCreateNote(event) {
    event.preventDefault();
    if (!activeCategoryId || !newNoteDraft.title.trim() || !newNoteDraft.body.trim()) return;
    setSavingNote(true);
    setError('');
    try {
      const { data } = await createNote({
        channel_id: activeCategoryId,
        title: newNoteDraft.title.trim(),
        body: newNoteDraft.body.trim(),
      });
      setShowComposer(false);
      setEditingNote(false);
      setNewNoteDraft({ title: '', body: '' });
      setNoteDetail(data);
      setActiveNoteId(data.id);
      await reloadCategories();
      await reloadNotes(activeCategoryId, data.id);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create note.');
    } finally {
      setSavingNote(false);
    }
  }

  async function handleUpdateCategory(event) {
    event.preventDefault();
    if (!activeCategory) return;
    setSavingCategory(true);
    setError('');
    try {
      const { data } = await updateNoteCategory(activeCategory.id, {
        name: categoryDraft.name.trim(),
        description: categoryDraft.description.trim(),
        color: categoryDraft.color,
      });
      setCategories((current) => current.map((category) => (category.id === data.id ? { ...category, ...data } : category)));
      setNotes((current) => current.map((note) => (
        note.channel_id === data.id ? { ...note, channel_slug: data.slug } : note
      )));
      setNoteDetail((current) => (
        current && current.channel_id === data.id ? { ...current, channel_slug: data.slug } : current
      ));
      setEditingCategory(false);
      if (activeNoteId) {
        navigate(`/notes/${data.slug}/${activeNoteId}`, { replace: true });
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update category.');
    } finally {
      setSavingCategory(false);
    }
  }

  async function handleUpdateNote(event) {
    event.preventDefault();
    if (!noteDetail || !editNoteDraft.title.trim() || !editNoteDraft.body.trim()) return;
    setSavingNote(true);
    setError('');
    try {
      const { data } = await updateNote(noteDetail.id, {
        title: editNoteDraft.title.trim(),
        body: editNoteDraft.body.trim(),
      });
      setNoteDetail(data);
      setEditingNote(false);
      await reloadCategories();
      await reloadNotes(data.channel_id, data.id);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update note.');
    } finally {
      setSavingNote(false);
    }
  }

  async function handleCreateReply(event) {
    event.preventDefault();
    if (!noteDetail || !replyDraft.trim()) return;
    setSavingReply(true);
    setError('');
    try {
      const { data } = await createNoteReply(noteDetail.id, { body: replyDraft.trim() });
      setReplyDraft('');
      setNoteDetail(data);
      await reloadCategories();
      await reloadNotes(data.channel_id, data.id);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save reply.');
    } finally {
      setSavingReply(false);
    }
  }

  async function handleUpdateReply(event) {
    event.preventDefault();
    if (!editingReplyId || !editingReplyBody.trim()) return;
    setSavingReply(true);
    setError('');
    try {
      const { data } = await updateNoteReply(editingReplyId, { body: editingReplyBody.trim() });
      setNoteDetail(data);
      setEditingReplyId(null);
      setEditingReplyBody('');
      await reloadCategories();
      await reloadNotes(data.channel_id, data.id);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update reply.');
    } finally {
      setSavingReply(false);
    }
  }

  async function handleCopyLink() {
    if (!noteDetail) return;
    const url = `${window.location.origin}/notes/${noteDetail.channel_slug}/${noteDetail.id}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopyState('copied');
      window.setTimeout(() => setCopyState('idle'), 1500);
    } catch {
      setCopyState('error');
      window.setTimeout(() => setCopyState('idle'), 1500);
    }
  }

  return (
    <div className="mx-auto max-w-[1700px] space-y-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-sky-500/20 bg-sky-500/10 px-3 py-1 text-xs uppercase tracking-[0.22em] text-sky-200">
            <NotebookPen className="h-3.5 w-3.5" />
            Notes
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">Organized notes with direct links and editing</h1>
          <p className="mt-2 max-w-3xl text-sm text-gray-400">
            Browse notes by category, keep the reader front and center, and send a stable link for any note.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ActionButton icon={MenuSquare} label={showCategoriesPane ? 'Hide categories' : 'Show categories'} onClick={() => setShowCategoriesPane((current) => !current)} active={showCategoriesPane} />
          <ActionButton icon={SquareStack} label={showNoteListPane ? 'Hide notes' : 'Show notes'} onClick={() => setShowNoteListPane((current) => !current)} active={showNoteListPane} />
          <ActionButton icon={RefreshCw} label="Refresh" onClick={handleRefresh} />
          <button
            type="button"
            onClick={() => {
              setShowComposer((current) => !current);
              setEditingNote(false);
              setNewNoteDraft({ title: '', body: '' });
            }}
            className="rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-500"
          >
            {showComposer ? 'Close new note' : 'New note'}
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">{error}</div>
      ) : null}

      <div className="flex flex-col gap-4 xl:h-[calc(100vh-12.5rem)] xl:min-h-[720px] xl:flex-row">
        {showCategoriesPane ? (
          <PaneShell
            title="Categories"
            subtitle="Curated buckets for notes"
            className="xl:w-[280px] xl:shrink-0"
            actions={
              activeCategory ? (
                <ActionButton
                  icon={editingCategory ? X : Pencil}
                  label={editingCategory ? 'Cancel' : 'Edit'}
                  onClick={() => setEditingCategory((current) => !current)}
                />
              ) : null
            }
          >
            <div className="space-y-3 p-3">
              {loadingCategories ? (
                <div className="px-3 py-4 text-sm text-gray-500">Loading categories...</div>
              ) : categories.length === 0 ? (
                <div className="px-3 py-4 text-sm text-gray-500">No categories yet.</div>
              ) : (
                categories.map((category) => {
                  const active = category.id === activeCategoryId;
                  const style = CATEGORY_STYLES[category.color] || CATEGORY_STYLES.slate;
                  return (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() => {
                        setActiveCategoryId(category.id);
                        setShowComposer(false);
                      }}
                      className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                        active
                          ? style
                          : 'border-gray-800 bg-gray-950/70 text-gray-300 hover:border-gray-700 hover:bg-gray-900/80'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate text-sm font-medium">{category.name}</span>
                        <span className="rounded-full border border-gray-700 px-2 py-1 text-[11px] text-gray-400">
                          {category.topic_count}
                        </span>
                      </div>
                      <p className="mt-2 line-clamp-2 text-xs text-gray-400">{category.description || 'No description yet.'}</p>
                      <div className="mt-3 text-[11px] text-gray-500">Updated {timeAgo(category.latest_activity_at)}</div>
                    </button>
                  );
                })
              )}

              {editingCategory && activeCategory ? (
                <form onSubmit={handleUpdateCategory} className="rounded-2xl border border-sky-500/20 bg-sky-500/5 p-4">
                  <div>
                    <label className="text-xs text-gray-400">Name</label>
                    <input
                      value={categoryDraft.name}
                      onChange={(event) => setCategoryDraft((current) => ({ ...current, name: event.target.value }))}
                      className="mt-1 w-full rounded-xl border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
                    />
                  </div>
                  <div className="mt-3">
                    <label className="text-xs text-gray-400">Description</label>
                    <textarea
                      value={categoryDraft.description}
                      onChange={(event) => setCategoryDraft((current) => ({ ...current, description: event.target.value }))}
                      rows={4}
                      className="mt-1 w-full rounded-xl border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
                    />
                  </div>
                  <div className="mt-3">
                    <label className="text-xs text-gray-400">Accent</label>
                    <select
                      value={categoryDraft.color}
                      onChange={(event) => setCategoryDraft((current) => ({ ...current, color: event.target.value }))}
                      className="mt-1 w-full rounded-xl border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
                    >
                      <option value="slate">Slate</option>
                      <option value="red">Red</option>
                      <option value="amber">Amber</option>
                      <option value="blue">Blue</option>
                      <option value="green">Green</option>
                    </select>
                  </div>
                  <div className="mt-3 flex justify-end">
                    <button
                      type="submit"
                      disabled={savingCategory || !categoryDraft.name.trim()}
                      className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-500 disabled:opacity-50"
                    >
                      <Save className="h-4 w-4" />
                      {savingCategory ? 'Saving...' : 'Save category'}
                    </button>
                  </div>
                </form>
              ) : null}
            </div>
          </PaneShell>
        ) : null}

        {showNoteListPane ? (
          <PaneShell
            title={activeCategory?.name || 'Notes'}
            subtitle={activeCategory?.description || 'Select a category to browse notes'}
            className="xl:w-[340px] xl:shrink-0"
          >
            <div className="flex h-full flex-col">
              {showComposer && activeCategory ? (
                <form onSubmit={handleCreateNote} className="m-3 rounded-2xl border border-red-500/20 bg-red-500/5 p-4">
                  <div>
                    <label className="text-xs text-gray-400">Title</label>
                    <input
                      value={newNoteDraft.title}
                      onChange={(event) => setNewNoteDraft((current) => ({ ...current, title: event.target.value }))}
                      placeholder={`New note in ${activeCategory.name}`}
                      className="mt-1 w-full rounded-xl border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white focus:border-red-500 focus:outline-none"
                    />
                  </div>
                  <div className="mt-3">
                    <label className="text-xs text-gray-400">Body</label>
                    <textarea
                      value={newNoteDraft.body}
                      onChange={(event) => setNewNoteDraft((current) => ({ ...current, body: event.target.value }))}
                      rows={8}
                      placeholder={markdownPlaceholder('Write the note in markdown')}
                      className="mt-1 w-full rounded-xl border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white focus:border-red-500 focus:outline-none"
                    />
                  </div>
                  <div className="mt-3 flex justify-end">
                    <button
                      type="submit"
                      disabled={savingNote || !newNoteDraft.title.trim() || !newNoteDraft.body.trim()}
                      className="rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-500 disabled:opacity-50"
                    >
                      {savingNote ? 'Saving...' : 'Create note'}
                    </button>
                  </div>
                </form>
              ) : null}

              <div className="flex-1 space-y-2 overflow-y-auto p-3">
                {loadingNotes ? (
                  <div className="px-3 py-4 text-sm text-gray-500">Loading notes...</div>
                ) : notes.length === 0 ? (
                  <EmptyState title="No notes in this category" text="Create the first note here to turn this into a useful working shelf." />
                ) : (
                  notes.map((note) => {
                    const active = note.id === activeNoteId;
                    return (
                      <a
                        key={note.id}
                        href={`/notes/${note.channel_slug}/${note.id}`}
                        className={`block w-full rounded-2xl border px-4 py-4 text-left transition ${
                          active
                            ? 'border-sky-500/30 bg-sky-500/10'
                            : 'border-gray-800 bg-gray-950/70 hover:border-gray-700 hover:bg-gray-900/80'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="truncate text-sm font-semibold text-white">{note.title}</h3>
                            <p className="mt-2 line-clamp-4 text-xs leading-6 text-gray-400">{note.body_preview || 'No preview yet.'}</p>
                          </div>
                          <span className="shrink-0 rounded-full border border-gray-700 px-2 py-1 text-[11px] text-gray-400">
                            {note.reply_count}
                          </span>
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-gray-500">
                          <span>{note.author}</span>
                          <span>{timeAgo(note.updated_at)}</span>
                        </div>
                      </a>
                    );
                  })
                )}
              </div>
            </div>
          </PaneShell>
        ) : null}

        <PaneShell
          title="Reader"
          subtitle="Markdown stays readable and replies remain attached to the note"
          className="min-w-0 flex-1"
          actions={
            noteDetail ? (
              <>
                <ActionButton icon={editingNote ? X : Pencil} label={editingNote ? 'Cancel' : 'Edit note'} onClick={() => setEditingNote((current) => !current)} />
                <ActionButton
                  icon={Link2}
                  label={copyState === 'copied' ? 'Copied' : copyState === 'error' ? 'Copy failed' : 'Copy link'}
                  onClick={handleCopyLink}
                />
              </>
            ) : null
          }
        >
          <div className="h-full overflow-y-auto px-5 py-5">
            {loadingNote ? (
              <div className="text-sm text-gray-500">Loading note...</div>
            ) : !noteDetail ? (
              <EmptyState title="Pick a note" text="Choose a note from the list or open a direct note URL to jump straight into the right context." />
            ) : (
              <div className="space-y-5">
                {editingNote ? (
                  <form onSubmit={handleUpdateNote} className="rounded-[28px] border border-sky-500/20 bg-sky-500/5 p-5">
                    <div>
                      <label className="text-xs text-gray-400">Title</label>
                      <input
                        value={editNoteDraft.title}
                        onChange={(event) => setEditNoteDraft((current) => ({ ...current, title: event.target.value }))}
                        className="mt-1 w-full rounded-xl border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
                      />
                    </div>
                    <div className="mt-4">
                      <label className="text-xs text-gray-400">Body</label>
                      <textarea
                        value={editNoteDraft.body}
                        onChange={(event) => setEditNoteDraft((current) => ({ ...current, body: event.target.value }))}
                        rows={14}
                        className="mt-1 w-full rounded-xl border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
                      />
                    </div>
                    <div className="mt-4 flex justify-end">
                      <button
                        type="submit"
                        disabled={savingNote || !editNoteDraft.title.trim() || !editNoteDraft.body.trim()}
                        className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-500 disabled:opacity-50"
                      >
                        <Save className="h-4 w-4" />
                        {savingNote ? 'Saving...' : 'Save note'}
                      </button>
                    </div>
                  </form>
                ) : (
                  <article className="rounded-[32px] border border-gray-800 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.08),transparent_35%),linear-gradient(180deg,rgba(15,23,42,0.92),rgba(2,6,23,0.92))] px-6 py-6">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="text-xs uppercase tracking-[0.2em] text-sky-300">{activeCategory?.name || noteDetail.channel_slug}</div>
                        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white">{noteDetail.title}</h2>
                      </div>
                      <div className="text-right text-xs text-gray-500">
                        <div>By {noteDetail.author}</div>
                        <div className="mt-1">Updated {timeAgo(noteDetail.updated_at)}</div>
                      </div>
                    </div>
                    <div className="mt-6">
                      <Markdown>{noteDetail.body}</Markdown>
                    </div>
                  </article>
                )}

                <section className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-white">Replies</h3>
                    <span className="text-xs text-gray-500">{noteDetail.reply_count} total</span>
                  </div>

                  {noteDetail.replies.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-gray-700 bg-gray-950/40 px-4 py-5 text-sm text-gray-500">
                      No replies yet. Add supporting context, follow-up decisions, or code snippets here.
                    </div>
                  ) : (
                    noteDetail.replies.map((reply) => (
                      <article key={reply.id} className="rounded-2xl border border-gray-800 bg-gray-950/70 px-4 py-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-xs text-gray-500">
                            <span className="text-gray-300">{reply.author}</span>
                            <span className="ml-2">updated {timeAgo(reply.updated_at)}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingReplyId(reply.id);
                              setEditingReplyBody(reply.body);
                            }}
                            className="text-xs text-gray-500 transition hover:text-white"
                          >
                            Edit
                          </button>
                        </div>

                        {editingReplyId === reply.id ? (
                          <form onSubmit={handleUpdateReply} className="mt-3">
                            <textarea
                              value={editingReplyBody}
                              onChange={(event) => setEditingReplyBody(event.target.value)}
                              rows={7}
                              className="w-full rounded-xl border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
                            />
                            <div className="mt-3 flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingReplyId(null);
                                  setEditingReplyBody('');
                                }}
                                className="rounded-xl border border-gray-700 px-3 py-2 text-sm text-gray-300 transition hover:border-gray-600 hover:text-white"
                              >
                                Cancel
                              </button>
                              <button
                                type="submit"
                                disabled={savingReply || !editingReplyBody.trim()}
                                className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-500 disabled:opacity-50"
                              >
                                Save reply
                              </button>
                            </div>
                          </form>
                        ) : (
                          <div className="mt-3">
                            <Markdown>{reply.body}</Markdown>
                          </div>
                        )}
                      </article>
                    ))
                  )}

                  <form onSubmit={handleCreateReply} className="rounded-2xl border border-gray-800 bg-black/20 p-4">
                    <label className="text-xs text-gray-400">Add reply in markdown</label>
                    <textarea
                      value={replyDraft}
                      onChange={(event) => setReplyDraft(event.target.value)}
                      rows={7}
                      placeholder={markdownPlaceholder('Add supporting context, next steps, or snippets')}
                      className="mt-2 w-full rounded-xl border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
                    />
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <p className="text-xs text-gray-500">GitHub-flavored markdown is enabled.</p>
                      <button
                        type="submit"
                        disabled={savingReply || !noteDetail || !replyDraft.trim()}
                        className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-500 disabled:opacity-50"
                      >
                        <Send className="h-4 w-4" />
                        {savingReply ? 'Saving...' : 'Save reply'}
                      </button>
                    </div>
                  </form>
                </section>
              </div>
            )}
          </div>
        </PaneShell>
      </div>
    </div>
  );
}
