import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Crosshair, ChevronRight, Pin, PinOff, Plus, RefreshCw,
  Monitor, FolderOpen, CalendarDays, Users, Radio, Brain,
  ListTodo, FolderKanban, Shield, Bot, Puzzle, NotebookText
} from 'lucide-react';
import api from '../api';

// ── Widget definitions ──────────────────────────────────────────────
const WIDGET_DEFS = [
  { id: 'system',    label: 'System',    icon: Monitor,      color: 'red',    endpoint: '/system/resources' },
  { id: 'documents', label: 'Documents', icon: FolderOpen,   color: 'ocean',  endpoint: '/stats' },
  { id: 'schedule',  label: 'Schedule',  icon: CalendarDays, color: 'amber',  endpoint: '/crons/jobs' },
  { id: 'team',      label: 'Team',      icon: Users,        color: 'green',  endpoint: '/crons/team' },
  { id: 'sessions',  label: 'Sessions',  icon: Radio,        color: 'purple', endpoint: '/system/sessions' },
  { id: 'memory',    label: 'Memory',    icon: Brain,        color: 'blue',   endpoint: null },
  { id: 'tasks',     label: 'Tasks',     icon: ListTodo,     color: 'red',    endpoint: '/tasks' },
  { id: 'projects',  label: 'Projects',  icon: FolderKanban, color: 'amber',  endpoint: '/system/projects' },
  { id: 'notes',     label: 'Notes',     icon: NotebookText, color: 'blue',   endpoint: '/notes/summary' },
  { id: 'monitor',   label: 'Monitor',   icon: Shield,       color: 'green',  endpoint: '/system/health-check' },
  { id: 'agents',    label: 'Agents',    icon: Bot,          color: 'purple', endpoint: '/system/agents' },
  { id: 'skills',    label: 'Skills',    icon: Puzzle,       color: 'ocean',  endpoint: '/system/skills' },
];

const COLORS = {
  red:    { soft: 'bg-coral-500/10',   accent: 'bg-coral-500',   border: 'border-coral-200',   icon: 'text-coral-500',   bar: 'bg-coral-500' },
  ocean:  { soft: 'bg-ocean-500/10',   accent: 'bg-ocean-500',   border: 'border-ocean-200',   icon: 'text-ocean-500',   bar: 'bg-ocean-500' },
  amber:  { soft: 'bg-sand-200/60',    accent: 'bg-sand-500',    border: 'border-sand-200',    icon: 'text-sand-500',    bar: 'bg-sand-400' },
  green:  { soft: 'bg-seafoam-100',    accent: 'bg-seafoam-500', border: 'border-seafoam-200', icon: 'text-seafoam-500', bar: 'bg-seafoam-500' },
  purple: { soft: 'bg-sky-100',        accent: 'bg-sky-400',     border: 'border-sky-200',     icon: 'text-sky-500',     bar: 'bg-sky-400' },
  blue:   { soft: 'bg-sky-100',        accent: 'bg-sky-500',     border: 'border-sky-200',     icon: 'text-sky-500',     bar: 'bg-sky-500' },
};

const STORAGE_KEY = 'clawmissions_widgets';
const ALL_IDS = WIDGET_DEFS.map(w => w.id);

function loadWidgetState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.pinned?.length) return saved;
  } catch {}
  return { pinned: [...ALL_IDS], order: [...ALL_IDS] };
}

function saveWidgetState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ── Helpers ─────────────────────────────────────────────────────────
function formatBytes(n) {
  if (!n) return '0 B';
  for (const u of ['B', 'KB', 'MB', 'GB']) { if (n < 1024) return `${n.toFixed(1)} ${u}`; n /= 1024; }
  return `${n.toFixed(1)} TB`;
}

function timeAgo(date) {
  if (!date) return '';
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function MiniBar({ value, color }) {
  const pct = Math.min(100, Math.max(0, value || 0));
  const barColor = pct > 85 ? 'bg-coral-500' : pct > 60 ? 'bg-sand-400' : color;
  return (
    <div className="w-full bg-ocean-100 rounded-full h-1 mt-0.5">
      <div className={`${barColor} h-1 rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ── Widget Card ─────────────────────────────────────────────────────
function WidgetCard({ def, data, onUnpin, dragHandlers }) {
  const navigate = useNavigate();
  const c = COLORS[def.color];
  const Icon = def.icon;

  const routes = { system: '/team', documents: '/files', schedule: '/calendar', team: '/team', sessions: '/sessions', memory: '/memory', tasks: '/tasks', projects: '/projects', notes: '/notes', monitor: '/monitor', agents: '/agents', skills: '/skills' };

  const renderContent = () => {
    switch (def.id) {
      case 'system': {
        const cpu = data?.cpu?.percent ?? null;
        const ram = data?.memory?.percent ?? null;
        const up = data?.system?.uptime_human;
        return cpu !== null ? (
          <>
            <div className="text-xs text-gray-400">CPU {cpu.toFixed(0)}%<MiniBar value={cpu} color={c.bar} /></div>
            <div className="text-xs text-gray-400 mt-1">RAM {ram?.toFixed(0)}%<MiniBar value={ram} color={c.bar} /></div>
            {up && <div className="text-[10px] text-gray-500 mt-1">⏱ {up}</div>}
          </>
        ) : <Shimmer />;
      }
      case 'documents': {
        const files = data?.total_files;
        const size = data?.total_size;
        return files != null ? (
          <>
            <div className="text-lg font-bold text-gray-800">{files}</div>
            <div className="text-[10px] text-gray-500">files · {formatBytes(size)}</div>
          </>
        ) : <Shimmer />;
      }
      case 'schedule': {
        const total = data?.total;
        const errors = data?.by_status?.error ?? 0;
        const next = data?.jobs?.find(j => j.next_run);
        return total != null ? (
          <>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-gray-800">{total}</span>
              {errors > 0 && <span className="text-[10px] bg-coral-500/15 text-coral-600 px-1.5 py-0.5 rounded-full">{errors} err</span>}
            </div>
            {next && <div className="text-[10px] text-gray-500 truncate">Next: {next.name}</div>}
          </>
        ) : <Shimmer />;
      }
      case 'team': {
        const members = data?.members;
        if (!members) return <Shimmer />;
        const online = members.filter(m => m.status === 'online');
        return (
          <>
            <div className="text-lg font-bold text-gray-800">{online.length}/{members.length} online</div>
            <div className="flex gap-1 mt-1">
              {members.map(m => (
                <span key={m.name} className={`w-2 h-2 rounded-full ${m.status === 'online' ? 'bg-seafoam-500' : 'bg-ocean-200'}`} title={m.name} />
              ))}
            </div>
          </>
        );
      }
      case 'sessions': {
        if (!data) return <Shimmer />;
        const sessions = Array.isArray(data) ? data : data?.sessions ?? [];
        const total = sessions.length;
        const dayAgo = Date.now() - 86400000;
        const active = sessions.filter(s => new Date(s.updatedAt || s.updated_at || 0).getTime() > dayAgo).length;
        return (
          <>
            <div className="text-lg font-bold text-gray-800">{total}</div>
            <div className="text-[10px] text-gray-500">{active} active today</div>
          </>
        );
      }
      case 'memory':
        return (
          <div className="text-xs text-gray-400 space-y-0.5">
            <div>🌿 Soul · 🧠 Memory · 📝 Today</div>
          </div>
        );
      case 'tasks': {
        const tasks = data?.tasks;
        if (!tasks) return <Shimmer />;
        const open = tasks.filter(t => t.status !== 'done' && t.status !== 'cancelled').length;
        const done = tasks.filter(t => t.status === 'done').length;
        return (
          <>
            <div className="text-lg font-bold text-gray-800">{open}</div>
            <div className="text-[10px] text-gray-500">open · {done} done</div>
          </>
        );
      }
      case 'projects': {
        if (!data?.content) return <Shimmer />;
        const sections = (data.content.match(/^## /gm) || []).length;
        return (
          <>
            <div className="text-lg font-bold text-gray-800">{sections}</div>
            <div className="text-[10px] text-gray-500">active projects</div>
          </>
        );
      }
      case 'notes': {
        if (data?.total_topics == null) return <Shimmer />;
        return (
          <>
            <div className="text-lg font-bold text-gray-800">{data.total_topics}</div>
            <div className="text-[10px] text-gray-500">{data.total_channels} categories · {data.total_replies} replies</div>
          </>
        );
      }
      case 'monitor': {
        if (!data?.sites) return <Shimmer />;
        const allUp = data.all_ok;
        const down = data.sites.filter(s => !s.ok).length;
        return (
          <>
            <div className={`text-lg font-bold ${allUp ? 'text-seafoam-500' : 'text-coral-500'}`}>
              {allUp ? '✓ All Up' : `${down} Down`}
            </div>
            <div className="text-[10px] text-gray-500">{data.sites.length} sites monitored</div>
          </>
        );
      }
      case 'agents': {
        if (!data?.agents) return <Shimmer />;
        return (
          <>
            <div className="text-lg font-bold text-gray-800">{data.agents.length}</div>
            <div className="text-[10px] text-gray-500">registered agents</div>
          </>
        );
      }
      case 'skills': {
        if (!data?.skills) return <Shimmer />;
        const user = data.skills.filter(s => s.source === 'user').length;
        const builtin = data.skills.filter(s => s.source === 'builtin').length;
        return (
          <>
            <div className="text-lg font-bold text-gray-800">{data.total}</div>
            <div className="text-[10px] text-gray-500">{user} custom · {builtin} builtin</div>
          </>
        );
      }
      default: return null;
    }
  };

  return (
    <div
      {...dragHandlers}
      onClick={() => navigate(routes[def.id] || '/')}
      className="relative group flex flex-col min-w-[160px] rounded-2xl border border-ocean-100 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-ocean-200 hover:shadow-md"
    >
      <div className={`absolute inset-x-0 top-0 h-1 rounded-t-2xl ${c.accent}`} />
      {/* Pin toggle on hover */}
      <button
        onClick={(e) => { e.stopPropagation(); onUnpin(def.id); }}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition p-1 rounded hover:bg-sky-50"
        title="Unpin widget"
      >
        <PinOff className="w-3 h-3 text-gray-500" />
      </button>

      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${c.soft}`}>
          <Icon className={`w-4 h-4 ${c.icon}`} />
        </div>
        <span className="text-xs font-medium text-gray-700">{def.label}</span>
        <ChevronRight className="w-3 h-3 text-ocean-300 ml-auto" />
      </div>

      {/* Content */}
      <div className="flex-1">{renderContent()}</div>
    </div>
  );
}

function Shimmer() {
  return <div className="h-4 w-20 bg-ocean-100 rounded animate-pulse" />;
}

// ── Feed Item ───────────────────────────────────────────────────────
function FeedItem({ icon, text, sub, time, color = 'bg-ocean-300' }) {
  return (
    <div className="flex items-start gap-3 py-2.5 px-1 border-b border-ocean-100 last:border-0">
      <span className="text-base mt-0.5 shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-gray-700">{text}</div>
        {sub && <div className="text-xs text-gray-500 truncate">{sub}</div>}
      </div>
      <span className="text-[10px] text-gray-400 whitespace-nowrap mt-0.5">{time}</span>
    </div>
  );
}

// ── Add Widget Popover ──────────────────────────────────────────────
function AddWidgetButton({ unpinned, onPin }) {
  const [open, setOpen] = useState(false);
  if (unpinned.length === 0) return null;
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex flex-col items-center justify-center min-h-[100px] w-full rounded-2xl border border-dashed border-ocean-200 bg-white/70 p-4 text-gray-500 transition hover:border-ocean-300 hover:text-ocean-600"
      >
        <Plus className="w-5 h-5 mb-1" />
        <span className="text-xs">Add Widget</span>
      </button>
      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 min-w-[180px] rounded-lg border border-ocean-200 bg-white py-1 shadow-xl">
          {unpinned.map(def => {
            const Icon = def.icon;
            const c = COLORS[def.color];
            return (
              <button
                key={def.id}
                onClick={() => { onPin(def.id); setOpen(false); }}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 transition hover:bg-sky-50"
              >
                <Icon className={`w-4 h-4 ${c.icon}`} />
                <span>{def.label}</span>
                <Pin className="w-3 h-3 ml-auto text-gray-400" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────
export default function Home() {
  const [widgetState, setWidgetState] = useState(loadWidgetState);
  const [widgetData, setWidgetData] = useState({});
  const [feedItems, setFeedItems] = useState([]);
  const [feedUpdated, setFeedUpdated] = useState(null);
  const [dragIdx, setDragIdx] = useState(null);
  const [overIdx, setOverIdx] = useState(null);
  const dragRef = useRef(null);

  // ── Widget data fetching (every 30s) ──
  const fetchWidgetData = useCallback(async () => {
    const fetches = WIDGET_DEFS.filter(w => w.endpoint).map(async (w) => {
      try {
        const r = await api.get(w.endpoint);
        return [w.id, r.data];
      } catch { return [w.id, null]; }
    });
    const results = await Promise.all(fetches);
    setWidgetData(Object.fromEntries(results));
  }, []);

  useEffect(() => {
    fetchWidgetData();
    const iv = setInterval(fetchWidgetData, 30000);
    return () => clearInterval(iv);
  }, [fetchWidgetData]);

  // ── Feed fetching (every 15s) ──
  const fetchFeed = useCallback(async () => {
    const items = [];
    const now = Date.now();

    try {
      const [sessRes, filesRes, sysRes, cronRes] = await Promise.all([
        api.get('/system/sessions').catch(() => ({ data: [] })),
        api.get('/files', { params: { sort_by: 'created_at', sort_dir: 'desc', per_page: 5 } }).catch(() => ({ data: { files: [] } })),
        api.get('/system/resources').catch(() => ({ data: null })),
        api.get('/crons/jobs').catch(() => ({ data: null })),
      ]);

      // Sessions (last 2h)
      const sessions = Array.isArray(sessRes.data) ? sessRes.data : sessRes.data?.sessions ?? [];
      const twoHoursAgo = now - 7200000;
      const recentSessions = sessions.filter(s => new Date(s.updatedAt || s.updated_at || 0).getTime() > twoHoursAgo);
      const cronSessions = recentSessions.filter(s => s.type === 'cron' || s.label?.toLowerCase().includes('cron'));
      const normalSessions = recentSessions.filter(s => s.type !== 'cron' && !s.label?.toLowerCase().includes('cron'));

      normalSessions.forEach(s => {
        items.push({ icon: '🔵', text: `Session started: ${s.label || s.id}`, time: s.updatedAt || s.updated_at, sort: new Date(s.updatedAt || s.updated_at || 0).getTime() });
      });
      if (cronSessions.length > 0) {
        const latest = cronSessions.reduce((a, b) => new Date(a.updatedAt || a.updated_at || 0) > new Date(b.updatedAt || b.updated_at || 0) ? a : b);
        items.push({ icon: '🟡', text: `${cronSessions.length} cron job${cronSessions.length > 1 ? 's' : ''} ran recently`, time: latest.updatedAt || latest.updated_at, sort: new Date(latest.updatedAt || latest.updated_at || 0).getTime() });
      }

      // Files
      const files = filesRes.data?.files ?? (Array.isArray(filesRes.data) ? filesRes.data : []);
      files.slice(0, 5).forEach(f => {
        items.push({ icon: '📄', text: `${f.filename || f.name} uploaded`, time: f.created_at || f.createdAt, sort: new Date(f.created_at || f.createdAt || 0).getTime() });
      });

      // System alerts
      const sys = sysRes.data;
      if (sys) {
        const cpu = sys.cpu?.percent;
        const ram = sys.memory?.percent;
        const t = new Date().toISOString();
        if (cpu > 80) items.push({ icon: '⚠️', text: `High CPU: ${cpu.toFixed(0)}%`, time: t, sort: now, color: 'text-yellow-400' });
        if (ram > 85) items.push({ icon: '⚠️', text: `High RAM: ${ram.toFixed(0)}%`, time: t, sort: now, color: 'text-yellow-400' });
        const badDisk = sys.disks?.find(d => d.percent > 90);
        if (badDisk) items.push({ icon: '⚠️', text: `Disk ${badDisk.mountpoint} at ${badDisk.percent.toFixed(0)}%`, time: t, sort: now });
        if (!(cpu > 80) && !(ram > 85) && !badDisk) {
          items.push({ icon: '✅', text: `All systems nominal — CPU ${cpu?.toFixed(0)}%, RAM ${ram?.toFixed(0)}%`, time: t, sort: now - 1 });
        }
      }

      // Cron status
      const crons = cronRes.data;
      if (crons) {
        const errors = crons.by_status?.error ?? 0;
        const t = new Date().toISOString();
        if (errors > 0) {
          items.push({ icon: '❌', text: `${errors} cron job${errors > 1 ? 's' : ''} failed`, time: t, sort: now + 1 });
        } else {
          items.push({ icon: '✅', text: `${crons.total} scheduled jobs running`, time: t, sort: now - 2 });
        }
      }
    } catch {}

    items.sort((a, b) => b.sort - a.sort);
    setFeedItems(items);
    setFeedUpdated(new Date());
  }, []);

  useEffect(() => {
    fetchFeed();
    const iv = setInterval(fetchFeed, 15000);
    return () => clearInterval(iv);
  }, [fetchFeed]);

  // ── Widget pin/unpin ──
  const unpin = (id) => {
    setWidgetState(prev => {
      const next = { pinned: prev.pinned.filter(p => p !== id), order: prev.order.filter(p => p !== id) };
      saveWidgetState(next);
      return next;
    });
  };

  const pin = (id) => {
    setWidgetState(prev => {
      const next = { pinned: [...prev.pinned, id], order: [...prev.order, id] };
      saveWidgetState(next);
      return next;
    });
  };

  // ── Drag to reorder ──
  const handleDragStart = (e, idx) => {
    setDragIdx(idx);
    dragRef.current = idx;
    e.dataTransfer.effectAllowed = 'move';
  };
  const handleDragOver = (e, idx) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOverIdx(idx); };
  const handleDragLeave = () => setOverIdx(null);
  const handleDrop = (e, dropIdx) => {
    e.preventDefault();
    const fromIdx = dragRef.current;
    if (fromIdx === null || fromIdx === dropIdx) { setDragIdx(null); setOverIdx(null); return; }
    setWidgetState(prev => {
      const ordered = prev.order.filter(id => prev.pinned.includes(id));
      const [moved] = ordered.splice(fromIdx, 1);
      ordered.splice(dropIdx, 0, moved);
      const next = { ...prev, order: ordered };
      saveWidgetState(next);
      return next;
    });
    setDragIdx(null);
    setOverIdx(null);
  };
  const handleDragEnd = () => { setDragIdx(null); setOverIdx(null); };

  // ── Derived ──
  const pinnedDefs = widgetState.order
    .filter(id => widgetState.pinned.includes(id))
    .map(id => WIDGET_DEFS.find(w => w.id === id))
    .filter(Boolean);
  const unpinnedDefs = WIDGET_DEFS.filter(w => !widgetState.pinned.includes(w.id));

  const [showAll, setShowAll] = useState(false);
  const visibleFeed = showAll ? feedItems : feedItems.slice(0, 15);

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8 flex items-center gap-3 rounded-3xl border border-ocean-100 bg-gradient-to-r from-sky-100 via-white to-sand-50 px-5 py-4 shadow-sm">
        <div className="w-10 h-10 rounded-xl bg-ocean-100 flex items-center justify-center">
          <Crosshair className="w-5 h-5 text-ocean-500" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Mission Control</h1>
          <p className="text-sm text-gray-500">
            Tia's personal dashboard · {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>
      </div>

      {/* ── Pinned Widgets ── */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm font-semibold text-gray-700">📌 Pinned Widgets</span>
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
          {pinnedDefs.map((def, idx) => (
            <div
              key={def.id}
              className={`transition-all ${dragIdx === idx ? 'opacity-40 scale-95' : ''} ${
                overIdx === idx && dragIdx !== idx ? 'ring-2 ring-ocean-300 rounded-2xl' : ''
              }`}
            >
              <WidgetCard
                def={def}
                data={widgetData[def.id]}
                onUnpin={unpin}
                dragHandlers={{
                  draggable: true,
                  onDragStart: (e) => handleDragStart(e, idx),
                  onDragOver: (e) => handleDragOver(e, idx),
                  onDragLeave: handleDragLeave,
                  onDrop: (e) => handleDrop(e, idx),
                  onDragEnd: handleDragEnd,
                }}
              />
            </div>
          ))}
          <AddWidgetButton unpinned={unpinnedDefs} onPin={pin} />
        </div>
      </div>

      {/* ── Live Feed ── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm font-semibold text-gray-700">📡 Live Feed</span>
          <button onClick={fetchFeed} className="ml-auto rounded p-1 transition hover:bg-sky-100" title="Refresh">
            <RefreshCw className="w-3.5 h-3.5 text-ocean-500" />
          </button>
          {feedUpdated && <span className="text-[10px] text-gray-500">{timeAgo(feedUpdated)}</span>}
        </div>
        <div className="rounded-2xl border border-ocean-100 bg-sky-50/50 px-3 py-1 shadow-sm">
          {visibleFeed.length === 0 ? (
            <div className="py-6 text-center text-sm text-gray-500">No recent activity</div>
          ) : (
            visibleFeed.map((item, i) => (
              <FeedItem key={i} icon={item.icon} text={item.text} sub={item.sub} time={timeAgo(item.time)} color={item.color} />
            ))
          )}
          {!showAll && feedItems.length > 15 && (
            <button onClick={() => setShowAll(true)} className="w-full py-2 text-xs text-gray-500 transition hover:text-ocean-600">
              Load more ({feedItems.length - 15} remaining)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
