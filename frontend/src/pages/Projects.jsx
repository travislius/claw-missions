import { useState, useEffect, useRef } from 'react';
import { RefreshCw, FolderKanban, LayoutGrid, FileText, Save, X, Pencil, Eye, Code2 } from 'lucide-react';
import api from '../api';

function timeAgo(ms) {
  if (!ms) return '—';
  const diff = Date.now() - ms;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

// ── Status config ────────────────────────────────────────────────────────────

const STATUS_BADGE = {
  '🟢': { color: 'bg-green-500/20 text-green-400 border-green-500/40', label: 'ACTIVE' },
  '🟡': { color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40', label: 'WIP' },
  '⏸️': { color: 'bg-gray-500/20 text-gray-400 border-gray-500/40', label: 'PAUSED' },
  '🔴': { color: 'bg-red-500/20 text-red-400 border-red-500/40', label: 'BLOCKED' },
  '⛔': { color: 'bg-red-800/30 text-red-500 border-red-800/40', label: 'STOPPED' },
  '🔵': { color: 'bg-blue-500/20 text-blue-400 border-blue-500/40', label: 'PLANNED' },
  '⏳': { color: 'bg-amber-500/20 text-amber-400 border-amber-500/40', label: 'WAITING' },
};

const STATUS_COLORS = {
  '🟢': 'text-green-400 bg-green-500/10 border-green-500/20',
  '🟡': 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  '🔴': 'text-red-400 bg-red-500/10 border-red-500/20',
  '🔵': 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  '⏸️': 'text-gray-400 bg-gray-500/10 border-gray-500/20',
  '⏳': 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  '⛔': 'text-red-400 bg-red-500/10 border-red-500/20',
};

const META_KEYWORDS = ['key dates', 'cron', 'health', 'schedule', 'overview', 'summary', 'changelog', 'notes'];

// ── Parser ───────────────────────────────────────────────────────────────────

function parseProjects(markdown) {
  if (!markdown) return { projects: [], meta: [] };
  const sections = markdown.split(/(?=^## )/m).filter(s => s.trim());
  const projects = [];
  const meta = [];

  for (const section of sections) {
    const lines = section.split('\n');
    const headingLine = lines[0];

    if (headingLine.startsWith('# ') && !headingLine.startsWith('## ')) {
      meta.push({ name: headingLine.replace(/^# /, ''), rawSection: section });
      continue;
    }
    if (!headingLine.startsWith('## ')) {
      meta.push({ name: 'Preamble', rawSection: section });
      continue;
    }

    const headingText = headingLine.replace(/^## /, '').trim();
    const isMeta = META_KEYWORDS.some(kw => headingText.toLowerCase().includes(kw));
    const emojiMatch = headingText.match(/^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F?)\s*/u);
    const emoji = emojiMatch ? emojiMatch[1] : '';
    const name = emojiMatch ? headingText.slice(emojiMatch[0].length).trim() : headingText;
    const cleanName = name.replace(/\s*\|.*$/, '').trim();

    let statusEmoji = '';
    let statusLabel = '';
    const statusMatch = section.match(/\*\*Status:\*\*\s*(🟢|🟡|🔴|🔵|⏸️|⏳|⛔)\s*(\w*)/);
    if (statusMatch) {
      statusEmoji = statusMatch[1];
      statusLabel = statusMatch[2] || STATUS_BADGE[statusMatch[1]]?.label || '';
    }

    let description = '';
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      if (line.startsWith('**Status:') || line.startsWith('**Tags:') || line.startsWith('**Next:')) continue;
      if (line.startsWith('- ') || line.startsWith('* ') || line.startsWith('### ') || line.startsWith('|')) break;
      description = line.replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1');
      break;
    }

    let nextAction = '';
    const todoMatch = section.match(/- \[ \]\s*(.+)/);
    const nextMatch = section.match(/\*\*Next:\*\*\s*(.+)/);
    if (nextMatch) nextAction = nextMatch[1].trim();
    else if (todoMatch) nextAction = todoMatch[1].replace(/\*\*(.*?)\*\*/g, '$1').trim();

    let tags = [];
    const tagsMatch = section.match(/\*\*Tags:\*\*\s*(.+)/);
    if (tagsMatch) tags = tagsMatch[1].split(',').map(t => t.trim()).filter(Boolean);

    const entry = { name: cleanName, emoji, statusEmoji, statusLabel, description, nextAction, tags, rawSection: section, headingText };
    if (isMeta) meta.push(entry);
    else projects.push(entry);
  }
  return { projects, meta };
}

// ── Markdown renderer ─────────────────────────────────────────────────────────

function renderMarkdown(text) {
  if (!text) return [];
  const lines = text.split('\n');
  const elements = [];
  let key = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('## ')) {
      elements.push(
        <div key={key++} className="mt-6 mb-3 border-b border-gray-800 pb-2">
          <h2 className="text-lg font-bold text-white">{line.slice(3)}</h2>
        </div>
      );
    } else if (line.startsWith('### ')) {
      elements.push(<h3 key={key++} className="text-sm font-semibold text-gray-300 mt-4 mb-2 uppercase tracking-wider">{line.slice(4)}</h3>);
    } else if (line.startsWith('# ')) {
      elements.push(<h1 key={key++} className="text-xl font-bold text-white mb-1">{line.slice(2)}</h1>);
    } else if (line.match(/^- \[[ x]\]/)) {
      const checked = line.includes('- [x]');
      const t = line.replace(/^- \[[ x]\]\s*/, '');
      elements.push(
        <div key={key++} className={`flex items-start gap-2 py-1 text-sm ${checked ? 'text-gray-600 line-through' : 'text-gray-300'}`}>
          <span className="shrink-0 mt-0.5">{checked ? '☑' : '☐'}</span>
          <span dangerouslySetInnerHTML={{ __html: t.replace(/`([^`]+)`/g, '<code class="bg-gray-800 text-sky-400 px-1 rounded text-xs">$1</code>').replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>') }} />
        </div>
      );
    } else if (line.startsWith('- ')) {
      elements.push(
        <div key={key++} className="flex items-start gap-2 py-0.5 text-sm text-gray-400">
          <span className="text-gray-600 mt-1 shrink-0">•</span>
          <span dangerouslySetInnerHTML={{ __html: line.slice(2).replace(/`([^`]+)`/g, '<code class="bg-gray-800 text-sky-400 px-1 rounded text-xs">$1</code>').replace(/\*\*(.*?)\*\*/g, '<strong class="text-gray-300">$1</strong>') }} />
        </div>
      );
    } else if (line.startsWith('|')) {
      const cells = line.split('|').map(c => c.trim()).filter(Boolean);
      if (cells.every(c => c.match(/^[-:]+$/))) continue;
      if (cells.length >= 2) {
        elements.push(
          <div key={key++} className="flex items-center gap-3 py-1 text-sm border-b border-gray-800/50 last:border-0">
            <span className="text-gray-500 w-32 shrink-0 truncate">{cells[0]}</span>
            <span className="text-gray-300 flex-1" dangerouslySetInnerHTML={{ __html: (cells[1] || '').replace(/`([^`]+)`/g, '<code class="bg-gray-800 text-sky-400 px-1 rounded text-xs">$1</code>').replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>') }} />
          </div>
        );
      }
    } else if (line.includes('**Status:**')) {
      const sm = line.match(/(🟢|🟡|🔴|🔵|⏸️|⏳|⛔)\s*(\w+)/);
      if (sm) {
        const cc = STATUS_COLORS[sm[1]] || 'text-gray-400 bg-gray-500/10 border-gray-500/20';
        elements.push(
          <div key={key++} className="flex flex-wrap items-center gap-2 mb-3">
            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${cc}`}>{sm[1]} {sm[2]}</span>
          </div>
        );
      }
    } else if (line.startsWith('---')) {
      elements.push(<hr key={key++} className="border-gray-800 my-4" />);
    } else if (line.trim()) {
      elements.push(
        <p key={key++} className="text-sm text-gray-400 py-0.5"
          dangerouslySetInnerHTML={{ __html: line.replace(/`([^`]+)`/g, '<code class="bg-gray-800 text-sky-400 px-1 rounded text-xs">$1</code>').replace(/\*\*(.*?)\*\*/g, '<strong class="text-gray-300">$1</strong>').replace(/\*(.*?)\*/g, '<em class="text-gray-500">$1</em>') }} />
      );
    } else {
      elements.push(<div key={key++} className="h-1" />);
    }
  }
  return elements;
}

// ── Edit Dialog ──────────────────────────────────────────────────────────────

function ProjectEditDialog({ project, onSave, onClose, saving }) {
  const [draft, setDraft] = useState(project.rawSection);
  const [tab, setTab] = useState('edit'); // 'edit' | 'preview'
  const textareaRef = useRef(null);
  const badge = STATUS_BADGE[project.statusEmoji];
  const hasChanges = draft !== project.rawSection;

  // Trap escape key
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Prevent body scroll while open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  // Auto-focus textarea on open
  useEffect(() => {
    if (tab === 'edit' && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(0, 0);
    }
  }, [tab]);

  const handleSave = () => onSave(project, draft, onClose);

  // Keyboard shortcut: Cmd/Ctrl+S to save
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (hasChanges) handleSave();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [draft, hasChanges]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative w-full max-w-5xl max-h-[90vh] bg-gray-950 border border-gray-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-4 px-6 py-4 border-b border-gray-800 shrink-0">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {project.emoji && <span className="text-2xl">{project.emoji}</span>}
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-white truncate">{project.name}</h2>
              <p className="text-xs text-gray-600 font-mono truncate">{project.headingText}</p>
            </div>
          </div>
          {badge && (
            <span className={`shrink-0 text-xs px-3 py-1 rounded-full border font-medium ${badge.color}`}>
              {project.statusEmoji} {project.statusLabel}
            </span>
          )}

          {/* Tab switcher */}
          <div className="flex bg-gray-800 rounded-lg p-0.5 shrink-0">
            <button
              onClick={() => setTab('edit')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition ${
                tab === 'edit' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-white'
              }`}
            >
              <Code2 className="w-3 h-3" /> Edit
            </button>
            <button
              onClick={() => setTab('preview')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition ${
                tab === 'preview' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-white'
              }`}
            >
              <Eye className="w-3 h-3" /> Preview
            </button>
          </div>

          <button onClick={onClose} className="shrink-0 p-2 rounded-lg text-gray-500 hover:text-white hover:bg-gray-800 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden">
          {tab === 'edit' ? (
            <div className="h-full flex flex-col">
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={e => setDraft(e.target.value)}
                className="flex-1 w-full bg-transparent px-6 py-4 text-sm text-gray-200 font-mono leading-relaxed focus:outline-none resize-none overflow-y-auto"
                placeholder="Markdown content..."
                spellCheck={false}
                style={{ minHeight: 0 }}
              />
              {/* Character count */}
              <div className="px-6 py-1 text-xs text-gray-700 border-t border-gray-800/50 flex items-center gap-3">
                <span>{draft.split('\n').length} lines</span>
                <span>{draft.length} chars</span>
                {hasChanges && <span className="text-amber-500/70">● unsaved changes</span>}
              </div>
            </div>
          ) : (
            <div className="h-full overflow-y-auto px-6 py-4">
              {renderMarkdown(draft)}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-800 shrink-0 bg-gray-950">
          <p className="text-xs text-gray-600">
            {tab === 'edit' ? 'Tip: ⌘S to save' : 'Rendered preview of your edits'}
          </p>
          <div className="flex items-center gap-3">
            {hasChanges && (
              <button
                onClick={() => setDraft(project.rawSection)}
                className="px-3 py-1.5 rounded-lg text-xs text-gray-500 hover:text-white hover:bg-gray-800 transition"
              >
                Reset
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white hover:bg-gray-800 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !hasChanges}
              className="flex items-center gap-2 px-5 py-1.5 rounded-lg text-xs bg-sky-600 hover:bg-sky-500 text-white font-medium transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Project Card ─────────────────────────────────────────────────────────────

function ProjectCard({ project, onClick }) {
  const badge = STATUS_BADGE[project.statusEmoji] || STATUS_BADGE['🔵'];

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-gray-900/70 border border-gray-800 rounded-2xl p-5 flex flex-col gap-3
        hover:border-sky-500/40 hover:bg-gray-900 hover:shadow-lg hover:shadow-sky-500/5
        active:scale-[0.99] transition-all group cursor-pointer min-h-[180px]"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-bold text-white flex items-center gap-2 leading-tight">
          {project.emoji && <span className="text-xl">{project.emoji}</span>}
          {project.name}
        </h3>
        <div className="flex items-center gap-2 shrink-0">
          {project.statusEmoji && (
            <span className={`text-xs px-2.5 py-1 rounded-full border whitespace-nowrap font-medium ${badge.color}`}>
              {project.statusEmoji} {project.statusLabel}
            </span>
          )}
          <Pencil className="w-3.5 h-3.5 text-gray-700 group-hover:text-sky-400 transition shrink-0" />
        </div>
      </div>

      {/* Description */}
      {project.description && (
        <p className="text-sm text-gray-400 leading-relaxed line-clamp-2">{project.description}</p>
      )}

      {/* Tags */}
      {project.tags.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          {project.tags.map(tag => (
            <span key={tag} className="text-xs bg-gray-800 text-gray-500 px-2 py-0.5 rounded-full">{tag}</span>
          ))}
        </div>
      )}

      {/* Next action */}
      {project.nextAction && (
        <div className="mt-auto pt-2 border-t border-gray-800">
          <p className="text-xs text-gray-600">
            <span className="text-gray-700 font-medium">Next → </span>
            <span className="text-gray-500">{project.nextAction}</span>
          </p>
        </div>
      )}
    </button>
  );
}

// ── Meta Card ─────────────────────────────────────────────────────────────────

function MetaCard({ item, onClick }) {
  const lines = item.rawSection.split('\n').filter(l => l.trim()).slice(1, 5);
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-gray-900/40 border border-gray-800/60 rounded-lg p-3
        hover:border-gray-700 hover:bg-gray-900/60 transition group"
    >
      <div className="flex items-center justify-between mb-1.5">
        <h4 className="text-xs font-semibold text-gray-400">{item.emoji || ''} {item.name}</h4>
        <Pencil className="w-3 h-3 text-gray-700 group-hover:text-sky-400 transition" />
      </div>
      <div className="text-xs text-gray-600 line-clamp-3 font-mono">
        {lines.map((l, i) => <div key={i}>{l}</div>)}
      </div>
    </button>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function Projects() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState('grid');
  const [savingId, setSavingId] = useState(null);
  const [editingProject, setEditingProject] = useState(null);

  const fetchData = async (bg = false) => {
    if (!bg) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await api.get('/system/projects');
      setData(res.data);
      setError(null);
    } catch (e) {
      if (!bg) setError(e.response?.data?.detail || 'Failed to load projects');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleSave = async (project, newContent, onDone) => {
    setSavingId(project.name);
    try {
      await api.patch('/system/projects', {
        section: project.headingText || project.name,
        content: newContent,
      });
      onDone();
      setEditingProject(null);
      fetchData(true);
    } catch (err) {
      console.error('Failed to save project section:', err);
      alert('Failed to save. Check console for details.');
    } finally {
      setSavingId(null);
    }
  };

  const { projects, meta } = parseProjects(data?.content);

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-gray-500">
      <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading projects…
    </div>
  );

  if (error) return (
    <div className="flex items-center justify-center h-64 text-red-400">{error}</div>
  );

  return (
    <>
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500/10 flex items-center justify-center">
              <FolderKanban className="w-5 h-5 text-sky-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Projects</h1>
              <p className="text-xs text-gray-500">
                ~/clawd/PROJECTS.md · updated {timeAgo(data?.updated_at)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex bg-gray-800 rounded-lg p-0.5">
              <button onClick={() => setView('grid')} className={`p-1.5 rounded-md transition ${view === 'grid' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-white'}`}>
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button onClick={() => setView('raw')} className={`p-1.5 rounded-md transition ${view === 'raw' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-white'}`}>
                <FileText className="w-4 h-4" />
              </button>
            </div>
            <button onClick={() => fetchData(true)} className="p-2 text-gray-500 hover:text-white hover:bg-gray-800 rounded-lg transition">
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Content */}
        {view === 'grid' ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.map((p, i) => (
                <ProjectCard key={i} project={p} onClick={() => setEditingProject(p)} />
              ))}
            </div>

            {meta.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">Meta</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {meta.map((m, i) => (
                    <MetaCard key={i} item={m} onClick={() => setEditingProject(m)} />
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
            {renderMarkdown(data?.content)}
          </div>
        )}
      </div>

      {/* Edit Dialog */}
      {editingProject && (
        <ProjectEditDialog
          project={editingProject}
          onSave={handleSave}
          onClose={() => setEditingProject(null)}
          saving={savingId === editingProject.name}
        />
      )}
    </>
  );
}
