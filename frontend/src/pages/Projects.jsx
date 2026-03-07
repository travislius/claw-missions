import { useState, useEffect, useRef } from 'react';
import { RefreshCw, FolderKanban, LayoutGrid, FileText, Pencil, X, Save } from 'lucide-react';
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

// ── Parser ──────────────────────────────────────────────────────────────────

const STATUS_BADGE = {
  '🟢': { color: 'bg-green-500/20 text-green-400 border-green-500/40', label: 'ACTIVE' },
  '🟡': { color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40', label: 'WIP' },
  '⏸️': { color: 'bg-gray-500/20 text-gray-400 border-gray-500/40', label: 'PAUSED' },
  '🔴': { color: 'bg-red-500/20 text-red-400 border-red-500/40', label: 'BLOCKED' },
  '⛔': { color: 'bg-red-800/30 text-red-500 border-red-800/40', label: 'STOPPED' },
  '🔵': { color: 'bg-blue-500/20 text-blue-400 border-blue-500/40', label: 'PLANNED' },
  '⏳': { color: 'bg-amber-500/20 text-amber-400 border-amber-500/40', label: 'WAITING' },
};

const META_KEYWORDS = ['key dates', 'cron', 'health', 'schedule', 'overview', 'summary', 'changelog', 'notes'];

function parseProjects(markdown) {
  if (!markdown) return { projects: [], meta: [] };

  const sections = markdown.split(/(?=^## )/m).filter(s => s.trim());
  const projects = [];
  const meta = [];

  for (const section of sections) {
    const lines = section.split('\n');
    const headingLine = lines[0];

    // Skip H1 lines
    if (headingLine.startsWith('# ') && !headingLine.startsWith('## ')) {
      meta.push({ name: headingLine.replace(/^# /, ''), rawSection: section });
      continue;
    }

    if (!headingLine.startsWith('## ')) {
      meta.push({ name: 'Preamble', rawSection: section });
      continue;
    }

    const headingText = headingLine.replace(/^## /, '').trim();

    // Check if this is a meta section
    const isMeta = META_KEYWORDS.some(kw => headingText.toLowerCase().includes(kw));

    // Extract emoji (first char if emoji)
    const emojiMatch = headingText.match(/^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F?)\s*/u);
    const emoji = emojiMatch ? emojiMatch[1] : '';
    const name = emojiMatch ? headingText.slice(emojiMatch[0].length).trim() : headingText;

    // Clean name: strip trailing | separators
    const cleanName = name.replace(/\s*\|.*$/, '').trim();

    // Extract status
    let statusEmoji = '';
    let statusLabel = '';
    const statusMatch = section.match(/\*\*Status:\*\*\s*(🟢|🟡|🔴|🔵|⏸️|⏳|⛔)\s*(\w*)/);
    if (statusMatch) {
      statusEmoji = statusMatch[1];
      statusLabel = statusMatch[2] || STATUS_BADGE[statusMatch[1]]?.label || '';
    }

    // Extract description: first paragraph after heading (skip status/tags/blank lines)
    let description = '';
    let foundDescription = false;
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      if (line.startsWith('**Status:') || line.startsWith('**Tags:') || line.startsWith('**Next:')) continue;
      if (line.startsWith('- ') || line.startsWith('* ') || line.startsWith('### ') || line.startsWith('|')) break;
      if (!foundDescription) {
        description = line.replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1');
        foundDescription = true;
        break;
      }
    }

    // Extract next action
    let nextAction = '';
    const todoMatch = section.match(/- \[ \]\s*(.+)/);
    const nextMatch = section.match(/\*\*Next:\*\*\s*(.+)/);
    if (nextMatch) nextAction = nextMatch[1].trim();
    else if (todoMatch) nextAction = todoMatch[1].replace(/\*\*(.*?)\*\*/g, '$1').trim();

    // Extract tags
    let tags = [];
    const tagsMatch = section.match(/\*\*Tags:\*\*\s*(.+)/);
    if (tagsMatch) {
      tags = tagsMatch[1].split(',').map(t => t.trim()).filter(Boolean);
    }

    const entry = {
      name: cleanName,
      emoji,
      statusEmoji,
      statusLabel,
      description,
      nextAction,
      tags,
      rawSection: section,
      headingText, // original heading for API matching
    };

    if (isMeta) {
      meta.push(entry);
    } else {
      projects.push(entry);
    }
  }

  return { projects, meta };
}

// ── Edit Modal ──────────────────────────────────────────────────────────────

function EditModal({ project, onSave, onCancel, saving }) {
  const [content, setContent] = useState(project.rawSection);
  const textareaRef = useRef(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [content]);

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onCancel}>
      <div
        onClick={e => e.stopPropagation()}
        className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl"
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800">
          <h2 className="text-sm font-bold text-white">
            Editing: {project.emoji} {project.name}
          </h2>
          <button onClick={onCancel} className="text-gray-500 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-5">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={e => setContent(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-sm text-gray-200 font-mono leading-relaxed focus:outline-none focus:border-sky-500 resize-none min-h-[200px]"
          />
        </div>
        <div className="flex justify-end gap-3 px-5 py-3 border-t border-gray-800">
          <button onClick={onCancel} className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition">
            Cancel
          </button>
          <button
            onClick={() => onSave(content)}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm bg-sky-600 hover:bg-sky-500 text-white font-medium transition disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Project Card ────────────────────────────────────────────────────────────

function ProjectCard({ project, onEdit }) {
  const badge = STATUS_BADGE[project.statusEmoji] || STATUS_BADGE['🔵'];

  return (
    <div className="bg-gray-900/70 border border-gray-800 rounded-xl p-4 flex flex-col gap-2 hover:border-ocean-500/50 transition group">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
          {project.emoji && <span>{project.emoji}</span>}
          {project.name}
        </h3>
        {project.statusEmoji && (
          <span className={`text-xs px-2 py-0.5 rounded-full border whitespace-nowrap ${badge.color}`}>
            {project.statusEmoji} {project.statusLabel}
          </span>
        )}
      </div>

      {/* Description */}
      {project.description && (
        <p className="text-xs text-gray-400 line-clamp-3 leading-relaxed">{project.description}</p>
      )}

      {/* Tags */}
      {project.tags.length > 0 && (
        <div className="flex gap-1 flex-wrap">
          {project.tags.map(tag => (
            <span key={tag} className="text-xs bg-gray-800 text-gray-500 px-1.5 py-0.5 rounded">{tag}</span>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-end justify-between mt-auto pt-1">
        {project.nextAction ? (
          <p className="text-xs text-gray-600 truncate flex-1 mr-2">
            Next: {project.nextAction}
          </p>
        ) : <span />}
        <button
          onClick={() => onEdit(project)}
          className="p-1.5 text-gray-700 hover:text-sky-400 hover:bg-gray-800 rounded-lg transition opacity-0 group-hover:opacity-100"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ── Meta Card ───────────────────────────────────────────────────────────────

function MetaCard({ item, onEdit }) {
  const lines = item.rawSection.split('\n').filter(l => l.trim()).slice(0, 5);
  return (
    <div className="bg-gray-900/40 border border-gray-800/60 rounded-lg p-3 hover:border-ocean-500/30 transition group">
      <div className="flex items-center justify-between mb-1">
        <h4 className="text-xs font-semibold text-gray-400">{item.emoji || ''} {item.name}</h4>
        <button
          onClick={() => onEdit(item)}
          className="p-1 text-gray-700 hover:text-sky-400 rounded transition opacity-0 group-hover:opacity-100"
        >
          <Pencil className="w-3 h-3" />
        </button>
      </div>
      <div className="text-xs text-gray-600 line-clamp-3 font-mono">
        {lines.slice(1).map((l, i) => <div key={i}>{l}</div>)}
      </div>
    </div>
  );
}

// ── Raw Markdown View (existing) ────────────────────────────────────────────

const STATUS_COLORS = {
  '🟢': 'text-green-400 bg-green-500/10 border-green-500/20',
  '🟡': 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  '🔴': 'text-red-400 bg-red-500/10 border-red-500/20',
  '🔵': 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  '⏸️': 'text-gray-400 bg-gray-500/10 border-gray-500/20',
  '⏳': 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  '⛔': 'text-red-400 bg-red-500/10 border-red-500/20',
};

function renderMarkdown(text) {
  if (!text) return [];
  const lines = text.split('\n');
  const elements = [];
  let key = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('## ')) {
      elements.push(
        <div key={key++} className="mt-8 mb-3 border-b border-gray-800 pb-2">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">{line.slice(3)}</h2>
        </div>
      );
    } else if (line.startsWith('### ')) {
      elements.push(<h3 key={key++} className="text-sm font-semibold text-gray-300 mt-4 mb-2 uppercase tracking-wider">{line.slice(4)}</h3>);
    } else if (line.startsWith('# ')) {
      elements.push(<h1 key={key++} className="text-xl font-bold text-white mb-1">{line.slice(2)}</h1>);
    } else if (line.startsWith('*') && line.endsWith('*') && !line.startsWith('**')) {
      elements.push(<p key={key++} className="text-xs text-gray-600 italic mb-2">{line.replace(/\*/g, '')}</p>);
    } else if (line.match(/^- \[[ x]\]/)) {
      const checked = line.includes('- [x]');
      const t = line.replace(/^- \[[ x]\]\s*/, '').replace(/\*\*(.*?)\*\*/g, '$1');
      elements.push(
        <div key={key++} className={`flex items-start gap-2 py-1 text-sm ${checked ? 'text-gray-600 line-through' : 'text-gray-300'}`}>
          <span className="shrink-0 mt-0.5">{checked ? '☑' : '☐'}</span>
          <span dangerouslySetInnerHTML={{ __html: t.replace(/`([^`]+)`/g, '<code class="bg-gray-800 text-ocean-400 px-1 rounded text-xs">$1</code>').replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>') }} />
        </div>
      );
    } else if (line.startsWith('- ')) {
      elements.push(
        <div key={key++} className="flex items-start gap-2 py-0.5 text-sm text-gray-400">
          <span className="text-gray-600 mt-1 shrink-0">•</span>
          <span dangerouslySetInnerHTML={{ __html: line.slice(2).replace(/`([^`]+)`/g, '<code class="bg-gray-800 text-ocean-400 px-1 rounded text-xs">$1</code>').replace(/\*\*(.*?)\*\*/g, '<strong class="text-gray-300">$1</strong>') }} />
        </div>
      );
    } else if (line.startsWith('|')) {
      const cells = line.split('|').map(c => c.trim()).filter(Boolean);
      if (cells.every(c => c.match(/^[-:]+$/))) continue;
      if (cells.length >= 2) {
        elements.push(
          <div key={key++} className="flex items-center gap-3 py-1 text-sm border-b border-gray-800/50 last:border-0">
            <span className="text-gray-500 w-32 shrink-0 truncate">{cells[0]}</span>
            <span className="text-gray-300 flex-1" dangerouslySetInnerHTML={{ __html: (cells[1] || '').replace(/`([^`]+)`/g, '<code class="bg-gray-800 text-ocean-400 px-1 rounded text-xs">$1</code>').replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>') }} />
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
          dangerouslySetInnerHTML={{ __html: line.replace(/`([^`]+)`/g, '<code class="bg-gray-800 text-ocean-400 px-1 rounded text-xs">$1</code>').replace(/\*\*(.*?)\*\*/g, '<strong class="text-gray-300">$1</strong>').replace(/\*(.*?)\*/g, '<em class="text-gray-500">$1</em>') }} />
      );
    } else {
      elements.push(<div key={key++} className="h-1" />);
    }
  }
  return elements;
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function Projects() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState('grid'); // grid | raw
  const [editingProject, setEditingProject] = useState(null);
  const [saving, setSaving] = useState(false);

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

  const handleSave = async (newContent) => {
    if (!editingProject) return;
    setSaving(true);
    try {
      await api.patch('/system/projects', {
        section: editingProject.headingText || editingProject.name,
        content: newContent,
      });
      setEditingProject(null);
      fetchData(true);
    } catch (err) {
      console.error('Failed to save project section:', err);
      alert('Failed to save. Check console for details.');
    } finally {
      setSaving(false);
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
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-ocean-500/20 flex items-center justify-center">
            <FolderKanban className="w-5 h-5 text-ocean-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Projects</h1>
            <p className="text-xs text-gray-500">
              ~/clawd/PROJECTS.md · updated {timeAgo(data?.updated_at)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
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
          {/* Project Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {projects.map((p, i) => (
              <ProjectCard key={i} project={p} onEdit={setEditingProject} />
            ))}
          </div>

          {/* Meta sections */}
          {meta.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">Meta</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {meta.map((m, i) => (
                  <MetaCard key={i} item={m} onEdit={setEditingProject} />
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

      {/* Edit Modal */}
      {editingProject && (
        <EditModal
          project={editingProject}
          onSave={handleSave}
          onCancel={() => setEditingProject(null)}
          saving={saving}
        />
      )}
    </div>
  );
}
