import { useState, useEffect } from 'react';
import { RefreshCw, Puzzle, Search, Star, Package, X, ExternalLink } from 'lucide-react';
import api from '../api';

function timeAgo(ms) {
  if (!ms) return '—';
  const diff = Date.now() - ms;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

const SOURCE_STYLES = {
  user:    { label: 'Custom',   className: 'bg-ocean-500/20 text-ocean-300 border-ocean-500/30' },
  builtin: { label: 'Built-in', className: 'bg-ocean-100 text-ocean-700 border-ocean-200/30' },
};

// ── Skill Viewer Modal ────────────────────────────────────────────────────────
function SkillViewer({ skillId, onClose }) {
  const [content, setContent] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/system/skills/${skillId}`)
      .then(r => setContent(r.data))
      .catch(() => setContent({ content: 'Failed to load skill file.', path: '' }))
      .finally(() => setLoading(false));
  }, [skillId]);

  // Strip YAML frontmatter for display
  const body = content?.content
    ? content.content.replace(/^---[\s\S]*?---\n?/, '').trimStart()
    : '';

  return (
    <div className="fixed inset-0 bg-ocean-900/20 z-50 flex items-center justify-center p-4"
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="bg-white border border-ocean-200 rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-ocean-100 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Puzzle className="w-4 h-4 text-purple-400 shrink-0" />
            <code className="text-xs text-gray-600 truncate">{content?.path || skillId}</code>
          </div>
          <button onClick={onClose} className="text-gray-600 hover:text-ocean-700 transition ml-3 shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>
        {/* Content */}
        <div className="flex-1 overflow-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-gray-500">
              <RefreshCw className="w-4 h-4 animate-spin mr-2" /> Loading…
            </div>
          ) : (
            <pre className="text-xs text-gray-700 font-mono leading-relaxed whitespace-pre-wrap break-words">
              {body}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

const AGENTS = [
  { id: 'tia', label: '🌿 Tia Skills' },
  { id: 'maru', label: '⚔️ Maru Skills' },
];

export default function Skills() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // all | user | builtin
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [viewing, setViewing] = useState(null); // skill id being viewed
  const [agent, setAgent] = useState('tia');

  const fetchData = async (bg = false, agentId = agent) => {
    if (!bg) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await api.get(`/system/skills?agent=${agentId}`);
      setData(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const switchAgent = (agentId) => {
    setAgent(agentId);
    setExpanded(null);
    setSearch('');
    fetchData(false, agentId);
  };

  const skills = data?.skills || [];
  const filtered = skills.filter(s => {
    const matchFilter = filter === 'all' || s.source === filter;
    const q = search.toLowerCase();
    const matchSearch = !q || s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q);
    return matchFilter && matchSearch;
  });

  const userCount = skills.filter(s => s.source === 'user').length;
  const builtinCount = skills.filter(s => s.source === 'builtin').length;

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-gray-500">
      <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading skills…
    </div>
  );

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
            <Puzzle className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-800">Skills</h1>
            <p className="text-xs text-gray-500">
              {userCount} custom · {builtinCount} built-in · {skills.length} total
            </p>
          </div>
        </div>
        <button onClick={() => fetchData(true)}
          className="p-2 text-gray-500 hover:text-ocean-700 hover:bg-sky-50 rounded-lg transition">
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Agent selector */}
      <div className="flex items-center gap-1 mb-4 bg-white border border-ocean-100 rounded-xl p-1 w-fit">
        {AGENTS.map(a => (
          <button key={a.id} onClick={() => switchAgent(a.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              agent === a.id ? 'bg-ocean-500 text-white' : 'text-gray-600 hover:text-ocean-700'
            }`}>
            {a.label}
          </button>
        ))}
      </div>

      {/* Search + Filter */}
      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search skills…"
            className="w-full pl-9 pr-4 py-2 bg-white border border-ocean-100 rounded-xl text-sm text-gray-800 placeholder-ocean-300 focus:outline-none focus:border-ocean-200"
          />
        </div>
        <div className="flex items-center gap-1 bg-white border border-ocean-100 rounded-xl p-1">
          {[['all', 'All'], ['user', 'Custom'], ['builtin', 'Built-in']].map(([val, lbl]) => (
            <button key={val} onClick={() => setFilter(val)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                filter === val ? 'bg-ocean-500 text-white' : 'text-gray-600 hover:text-ocean-700'
              }`}>
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {/* Custom skills section */}
      {(filter === 'all' || filter === 'user') && (
        <div className="mb-6">
          {filter === 'all' && (
            <div className="flex items-center gap-2 mb-3">
              <Star className="w-4 h-4 text-ocean-400" />
              <h2 className="text-sm font-semibold text-ocean-400 uppercase tracking-wider">Custom Skills</h2>
              <span className="text-xs text-gray-600">{userCount} installed</span>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.filter(s => s.source === 'user').map(skill => (
              <SkillCard key={skill.id} skill={skill} expanded={expanded === skill.id}
                onToggle={() => setExpanded(expanded === skill.id ? null : skill.id)}
                onView={() => setViewing(skill.id)} />
            ))}
            {filtered.filter(s => s.source === 'user').length === 0 && filter === 'user' && (
              <p className="text-gray-600 text-sm col-span-3">No custom skills match your search.</p>
            )}
          </div>
        </div>
      )}

      {/* Built-in skills section */}
      {(filter === 'all' || filter === 'builtin') && (
        <div>
          {filter === 'all' && (
            <div className="flex items-center gap-2 mb-3">
              <Package className="w-4 h-4 text-gray-600" />
              <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wider">Built-in Skills</h2>
              <span className="text-xs text-gray-600">{builtinCount} available</span>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.filter(s => s.source === 'builtin').map(skill => (
              <SkillCard key={skill.id} skill={skill} expanded={expanded === skill.id}
                onToggle={() => setExpanded(expanded === skill.id ? null : skill.id)}
                onView={() => setViewing(skill.id)} />
            ))}
          </div>
        </div>
      )}

      {filtered.length === 0 && (
        <div className="text-center py-16 text-gray-600">
          <Puzzle className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No skills match "{search}"</p>
        </div>
      )}

      {viewing && <SkillViewer skillId={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

function SkillCard({ skill, expanded, onToggle, onView }) {
  const src = SOURCE_STYLES[skill.source] || SOURCE_STYLES.builtin;

  return (
    <div
      onClick={onToggle}
      className={`bg-white border rounded-xl p-4 cursor-pointer transition-all
        ${expanded ? 'border-ocean-200' : 'border-ocean-100 hover:border-ocean-200'}`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          {skill.emoji ? (
            <span className="text-xl shrink-0">{skill.emoji}</span>
          ) : (
            <div className="w-7 h-7 rounded-lg bg-sky-50 flex items-center justify-center shrink-0">
              <Puzzle className="w-3.5 h-3.5 text-gray-500" />
            </div>
          )}
          <span className="text-sm font-semibold text-gray-800 truncate">{skill.name}</span>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full border shrink-0 ${src.className}`}>
          {src.label}
        </span>
      </div>

      <p className={`text-xs text-gray-600 leading-relaxed ${expanded ? '' : 'line-clamp-2'}`}>
        {skill.description || <span className="text-gray-600 italic">No description</span>}
      </p>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-ocean-100 flex items-center justify-between gap-2">
          <button
            onClick={e => { e.stopPropagation(); onView(); }}
            className="flex items-center gap-1.5 min-w-0 text-left group/path"
            title="View SKILL.md"
          >
            <ExternalLink className="w-3 h-3 text-gray-600 group-hover/path:text-purple-400 shrink-0 transition" />
            <code className="text-xs text-gray-600 group-hover/path:text-purple-400 truncate transition">
              {skill.path.replace(/\/Users\/[^/]+/, '~')}
            </code>
          </button>
          <span className="text-xs text-gray-600 shrink-0">updated {timeAgo(skill.updated_at)}</span>
        </div>
      )}
    </div>
  );
}
