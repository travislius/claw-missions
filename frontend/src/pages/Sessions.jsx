import { useState, useEffect, useRef } from 'react';
import { Radio, MessageSquare, Cpu, Zap, Database, Search } from 'lucide-react';
import { useStore } from '../store';

const API = import.meta.env.VITE_API_URL || '';

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

function fmtTokens(n) {
  if (!n) return '0';
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function shortModel(model) {
  if (!model) return '—';
  return model.replace(/^claude-/, '').replace(/^anthropic\/claude-/, '');
}

const KIND_STYLES = {
  main: 'bg-blue-500/20 text-blue-300',
  cron: 'bg-sand-100 text-sand-500',
  subagent: 'bg-purple-500/20 text-purple-300',
};

const FILTERS = ['all', 'main', 'cron', 'subagent'];
const AGENTS = [{ id: 'tia', label: 'Tia Sessions', emoji: '🌿' }, { id: 'maru', label: 'Maru Sessions', emoji: '⚔️' }];

export default function Sessions() {
  const token = useStore((s) => s.token);
  const [data, setData] = useState(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [activeAgent, setActiveAgent] = useState('tia');
  const intervalRef = useRef(null);

  const fetchSessions = async (isBackground = false) => {
    try {
      const res = await fetch(`${API}/api/system/sessions?agent=${activeAgent}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (e) {
      if (!isBackground) setError(e.message);
    } finally {
      if (!isBackground) setInitialLoading(false);
    }
  };

  useEffect(() => {
    setInitialLoading(true);
    setData(null);
    fetchSessions(false);
    intervalRef.current = setInterval(() => fetchSessions(true), 10000);
    return () => clearInterval(intervalRef.current);
  }, [activeAgent]);

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-ocean-500" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="text-coral-500 text-center py-12">
        <p className="text-lg font-medium">Failed to load sessions</p>
        <p className="text-sm text-gray-500 mt-1">{error}</p>
      </div>
    );
  }

  const sessions = (data?.sessions || []).filter((s) => {
    if (filter !== 'all' && s.kind !== filter) return false;
    if (search && !s.label.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const stats = data?.stats || {};

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
        <Radio className="w-6 h-6 text-coral-500" />
        Sessions
      </h1>

      {/* Agent Tabs */}
      <div className="flex gap-1 bg-sky-50/80 rounded-lg p-1 w-fit">
        {AGENTS.map((a) => (
          <button
            key={a.id}
            onClick={() => setActiveAgent(a.id)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition ${
              activeAgent === a.id
                ? 'bg-ocean-500 text-white'
                : 'text-gray-600 hover:text-ocean-700'
            }`}
          >
            {a.emoji} {a.label}
          </button>
        ))}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={<Radio className="w-5 h-5" />} label="Total Sessions" value={data?.total || 0} color="text-blue-400" />
        <StatCard icon={<Zap className="w-5 h-5" />} label="Total Tokens" value={fmtTokens(stats.total_tokens)} color="text-seafoam-500" />
        <StatCard icon={<Cpu className="w-5 h-5" />} label="Input Tokens" value={fmtTokens(stats.total_input_tokens)} color="text-sand-500" />
        <StatCard icon={<Database className="w-5 h-5" />} label="Cache Read" value={fmtTokens(stats.total_cache_read)} color="text-purple-400" />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-1 bg-sky-50/80 rounded-lg p-1">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${
                filter === f
                  ? 'bg-ocean-500 text-white'
                  : 'text-gray-600 hover:text-ocean-700'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search sessions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-sky-50/80 border border-ocean-200 rounded-lg text-sm text-gray-800 placeholder-ocean-400 focus:outline-none focus:border-ocean-200"
          />
        </div>
        <span className="text-gray-500 text-sm self-center">{sessions.length} sessions</span>
      </div>

      {/* Session List */}
      <div className="space-y-2">
        {sessions.map((s) => (
          <div
            key={s.key}
            className="bg-sky-50/70 border border-ocean-100 rounded-lg p-4 hover:bg-sky-50/90 transition cursor-pointer"
            onClick={() => setExpandedId(expandedId === s.key ? null : s.key)}
          >
            <div className="flex items-center gap-3 flex-wrap">
              {/* Kind badge */}
              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold uppercase ${KIND_STYLES[s.kind] || 'bg-ocean-100 text-ocean-700'}`}>
                {s.kind}
              </span>

              {/* Label */}
              <span className="text-gray-800 text-sm font-medium truncate max-w-[280px]" title={s.label}>
                {s.label.length > 40 ? s.label.slice(0, 40) + '…' : s.label}
              </span>

              {/* Spacer */}
              <div className="flex-1" />

              {/* Model */}
              <span className="text-gray-500 text-xs font-mono hidden sm:inline">
                {shortModel(s.model)}
              </span>

              {/* Messages */}
              <span className="flex items-center gap-1 text-gray-600 text-xs" title="Messages">
                <MessageSquare className="w-3.5 h-3.5" />
                {s.message_count}
              </span>

              {/* Tokens */}
              <span className="flex items-center gap-1 text-gray-600 text-xs" title="Total tokens">
                <Zap className="w-3.5 h-3.5" />
                {fmtTokens(s.total_tokens)}
              </span>

              {/* Last active */}
              <span className="text-gray-500 text-xs w-16 text-right">
                {timeAgo(s.updated_at)}
              </span>
            </div>

            {/* Expanded: last message preview */}
            {expandedId === s.key && s.last_message && (
              <div className="mt-3 pt-3 border-t border-ocean-100">
                <p className="text-xs text-gray-500 mb-1">
                  Last {s.last_message.role === 'user' ? 'user' : 'assistant'} message:
                </p>
                <p className="text-sm text-gray-700 italic line-clamp-2">
                  "{s.last_message.text}"
                </p>
                <div className="flex gap-4 mt-2 text-xs text-gray-600">
                  <span>Input: {fmtTokens(s.input_tokens)}</span>
                  <span>Output: {fmtTokens(s.output_tokens)}</span>
                  <span>Cache: {fmtTokens(s.cache_read)}</span>
                  {s.compaction_count > 0 && <span>Compactions: {s.compaction_count}</span>}
                </div>
              </div>
            )}
          </div>
        ))}

        {sessions.length === 0 && (
          <div className="text-center text-gray-500 py-12">
            No sessions match your filters.
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, color }) {
  return (
    <div className="bg-sky-50/70 border border-ocean-100 rounded-xl p-4">
      <div className={`${color} mb-2`}>{icon}</div>
      <p className="text-2xl font-bold text-gray-800">{value}</p>
      <p className="text-xs text-gray-500 mt-1">{label}</p>
    </div>
  );
}
