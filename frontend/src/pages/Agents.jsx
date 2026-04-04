import { useState, useEffect, useRef } from 'react';
import { Bot, Cpu, MemoryStick, Clock, Shield, CheckCircle, XCircle, User, Building, Tag, Zap, FolderOpen, RefreshCw } from 'lucide-react';
import { useStore } from '../store';

const API = import.meta.env.VITE_API_URL || '';

function timeAgo(ts) {
  if (!ts) return '—';
  const now = Date.now() / 1000;
  const diff = now - ts;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

// ── Agent type visual config ──────────────────────────────────────────────────

const AGENT_STYLES = {
  codex: {
    label: 'Codex CLI',
    color: 'text-orange-400',
    bg: 'bg-orange-500/10 border-orange-500/30',
    badge: 'bg-orange-500/20 text-orange-300',
    dot: 'bg-orange-400',
    icon: '⚡',
    provider: 'OpenAI',
    providerColor: 'text-seafoam-500',
  },
  claude: {
    label: 'Claude Code',
    color: 'text-purple-400',
    bg: 'bg-purple-500/10 border-purple-500/30',
    badge: 'bg-purple-500/20 text-purple-300',
    dot: 'bg-purple-400',
    icon: '🤖',
    provider: 'Anthropic',
    providerColor: 'text-orange-300',
  },
};

const STATUS_DOT = {
  running: 'bg-green-400 animate-pulse',
  sleeping: 'bg-yellow-400',
  default: 'bg-ocean-300',
};

// ── Sub-components ────────────────────────────────────────────────────────────

function RunningCard({ agent }) {
  const style = AGENT_STYLES[agent.type] || AGENT_STYLES.claude;
  const dotClass = STATUS_DOT[agent.status] || STATUS_DOT.default;

  return (
    <div className={`rounded-xl border p-4 ${style.bg} transition-all`}>
      <div className="flex items-center gap-3 mb-3">
        {/* Live dot */}
        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dotClass}`} />
        {/* Type badge */}
        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${style.badge}`}>
          {style.icon} {style.label}
        </span>
        <span className="text-gray-500 text-xs">PID {agent.pid}</span>
        <div className="flex-1" />
        <span className="text-gray-500 text-xs capitalize">{agent.status}</span>
      </div>

      {/* Command */}
      <p className="text-gray-700 text-xs font-mono bg-sky-50/80 rounded px-2 py-1.5 truncate mb-3" title={agent.cmd}>
        {agent.cmd_short || agent.cmd}
      </p>

      {/* Stats row */}
      <div className="flex gap-4 text-xs text-gray-600">
        <span className="flex items-center gap-1">
          <Cpu className="w-3 h-3" />
          {agent.cpu_percent}%
        </span>
        <span className="flex items-center gap-1">
          <MemoryStick className="w-3 h-3" />
          {agent.memory_mb} MB
        </span>
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {agent.started_at || timeAgo(agent.create_time)}
        </span>
      </div>
    </div>
  );
}

function ConfigCard({ type, config }) {
  const style = AGENT_STYLES[type] || AGENT_STYLES.claude;

  return (
    <div className={`rounded-2xl border ${style.bg} p-5 flex flex-col gap-4`}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="text-3xl">{style.icon}</span>
        <div>
          <h3 className={`text-lg font-bold ${style.color}`}>{style.label}</h3>
          <p className={`text-xs font-medium ${style.providerColor}`}>by {style.provider}</p>
        </div>
        <div className="ml-auto">
          {config.installed ? (
            <span className="flex items-center gap-1 text-seafoam-500 text-xs font-medium">
              <CheckCircle className="w-4 h-4" /> Installed
            </span>
          ) : (
            <span className="flex items-center gap-1 text-coral-500 text-xs font-medium">
              <XCircle className="w-4 h-4" /> Not found
            </span>
          )}
        </div>
      </div>

      {/* Version + path */}
      {config.version && (
        <div className="text-xs text-gray-600 font-mono bg-sky-50/70 rounded px-3 py-2">
          {config.version}
        </div>
      )}

      {/* Fields */}
      <div className="space-y-2.5">
        {config.model && (
          <ConfigRow icon={<Zap className="w-3.5 h-3.5" />} label="Model" value={config.model} />
        )}
        {config.reasoning_effort && (
          <ConfigRow icon={<Tag className="w-3.5 h-3.5" />} label="Reasoning" value={config.reasoning_effort} />
        )}
        {config.account && (
          <ConfigRow icon={<User className="w-3.5 h-3.5" />} label="Account" value={config.account} />
        )}
        {config.display_name && config.display_name !== config.account && (
          <ConfigRow icon={<User className="w-3.5 h-3.5" />} label="Name" value={config.display_name} />
        )}
        {config.organization && (
          <ConfigRow icon={<Building className="w-3.5 h-3.5" />} label="Org" value={config.organization} />
        )}
        {config.billing_type && (
          <ConfigRow
            icon={<Shield className="w-3.5 h-3.5" />}
            label="Plan"
            value={config.billing_type.replace(/_/g, ' ')}
          />
        )}
        {config.subscription_created && (
          <ConfigRow icon={<Clock className="w-3.5 h-3.5" />} label="Since" value={config.subscription_created} />
        )}
        {config.path && (
          <ConfigRow icon={<FolderOpen className="w-3.5 h-3.5" />} label="Path" value={config.path} mono />
        )}
      </div>

      {/* Trusted paths */}
      {config.trusted_paths?.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 mb-1.5 flex items-center gap-1">
            <Shield className="w-3 h-3" /> Trusted paths ({config.trusted_paths.length})
          </p>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {config.trusted_paths.map((tp, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="text-seafoam-500 shrink-0">✓</span>
                <span className="text-gray-600 font-mono truncate" title={tp.path}>
                  {tp.path.replace('/Users/tiali', '~')}
                </span>
                <span className="text-gray-600 shrink-0 ml-auto">{tp.trust_level}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ConfigRow({ icon, label, value, mono = false }) {
  return (
    <div className="flex items-start gap-2 text-xs">
      <span className="text-gray-500 shrink-0 mt-0.5">{icon}</span>
      <span className="text-gray-500 w-16 shrink-0">{label}</span>
      <span className={`text-gray-700 break-all ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Agents() {
  const token = useStore((s) => s.token);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const intervalRef = useRef(null);

  const fetchAgents = async (background = false) => {
    try {
      const res = await fetch(`${API}/api/system/agents`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setLastRefresh(Date.now());
      setError(null);
    } catch (e) {
      if (!background) setError(e.message);
    } finally {
      if (!background) setLoading(false);
    }
  };

  useEffect(() => {
    fetchAgents(false);
    intervalRef.current = setInterval(() => fetchAgents(true), 8000);
    return () => clearInterval(intervalRef.current);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-ocean-500" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="text-coral-500 text-center py-12">
        <p className="text-lg font-medium">Failed to load agents</p>
        <p className="text-sm text-gray-500 mt-1">{error}</p>
      </div>
    );
  }

  const running = data?.running || [];
  const configs = data?.configs || {};

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <Bot className="w-6 h-6 text-coral-500" />
          Coding Agents
        </h1>
        <div className="flex items-center gap-3">
          {lastRefresh && (
            <span className="text-xs text-gray-600">
              Updated {Math.floor((Date.now() - lastRefresh) / 1000)}s ago
            </span>
          )}
          <button
            onClick={() => fetchAgents(false)}
            className="p-1.5 rounded-lg text-gray-500 hover:text-ocean-700 hover:bg-sky-50 transition"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Running Instances ── */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-base font-semibold text-gray-700">Running Instances</h2>
          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
            running.length > 0 ? 'bg-seafoam-100 text-seafoam-500' : 'bg-gray-700 text-gray-500'
          }`}>
            {running.length} active
          </span>
        </div>

        {running.length === 0 ? (
          <div className="rounded-xl border border-ocean-100 bg-sky-50/50 p-8 text-center">
            <Bot className="w-10 h-10 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">No coding agents currently running</p>
            <p className="text-gray-600 text-xs mt-1">
              Spawn Codex or Claude Code to see them here
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {running.map((agent) => (
              <RunningCard key={agent.pid} agent={agent} />
            ))}
          </div>
        )}
      </section>

      {/* ── Configured Agents ── */}
      <section>
        <h2 className="text-base font-semibold text-gray-700 mb-4">Agent Configuration</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {Object.entries(configs).map(([type, config]) => (
            <ConfigCard key={type} type={type} config={config} />
          ))}
        </div>
      </section>
    </div>
  );
}
