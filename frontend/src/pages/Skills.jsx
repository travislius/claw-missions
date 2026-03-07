import { useState, useEffect } from 'react';
import { RefreshCw, Puzzle, Search, Star, Package } from 'lucide-react';
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
  builtin: { label: 'Built-in', className: 'bg-gray-700/50 text-gray-400 border-gray-600/30' },
};

export default function Skills() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // all | user | builtin
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState(null);

  const fetchData = async (bg = false) => {
    if (!bg) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await api.get('/system/skills');
      setData(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

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
            <h1 className="text-xl font-bold text-white">Skills</h1>
            <p className="text-xs text-gray-500">
              {userCount} custom · {builtinCount} built-in · {skills.length} total
            </p>
          </div>
        </div>
        <button onClick={() => fetchData(true)}
          className="p-2 text-gray-500 hover:text-white hover:bg-gray-800 rounded-lg transition">
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Search + Filter */}
      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search skills…"
            className="w-full pl-9 pr-4 py-2 bg-gray-900 border border-gray-800 rounded-xl text-sm text-white placeholder-gray-600 focus:outline-none focus:border-gray-600"
          />
        </div>
        <div className="flex items-center gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1">
          {[['all', 'All'], ['user', 'Custom'], ['builtin', 'Built-in']].map(([val, lbl]) => (
            <button key={val} onClick={() => setFilter(val)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                filter === val ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
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
                onToggle={() => setExpanded(expanded === skill.id ? null : skill.id)} />
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
              <Package className="w-4 h-4 text-gray-400" />
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Built-in Skills</h2>
              <span className="text-xs text-gray-600">{builtinCount} available</span>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.filter(s => s.source === 'builtin').map(skill => (
              <SkillCard key={skill.id} skill={skill} expanded={expanded === skill.id}
                onToggle={() => setExpanded(expanded === skill.id ? null : skill.id)} />
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
    </div>
  );
}

function SkillCard({ skill, expanded, onToggle }) {
  const src = SOURCE_STYLES[skill.source] || SOURCE_STYLES.builtin;

  return (
    <div
      onClick={onToggle}
      className={`bg-gray-900 border rounded-xl p-4 cursor-pointer transition-all
        ${expanded ? 'border-gray-600' : 'border-gray-800 hover:border-gray-700'}`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          {skill.emoji ? (
            <span className="text-xl shrink-0">{skill.emoji}</span>
          ) : (
            <div className="w-7 h-7 rounded-lg bg-gray-800 flex items-center justify-center shrink-0">
              <Puzzle className="w-3.5 h-3.5 text-gray-500" />
            </div>
          )}
          <span className="text-sm font-semibold text-white truncate">{skill.name}</span>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full border shrink-0 ${src.className}`}>
          {src.label}
        </span>
      </div>

      <p className={`text-xs text-gray-400 leading-relaxed ${expanded ? '' : 'line-clamp-2'}`}>
        {skill.description || <span className="text-gray-600 italic">No description</span>}
      </p>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-gray-800 flex items-center justify-between">
          <code className="text-xs text-gray-600 truncate max-w-[200px]">{skill.path}</code>
          <span className="text-xs text-gray-600 shrink-0 ml-2">updated {timeAgo(skill.updated_at)}</span>
        </div>
      )}
    </div>
  );
}
