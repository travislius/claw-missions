import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Crosshair, ChevronRight, Pin, PinOff, Plus, RefreshCw,
  Monitor, FolderOpen, CalendarDays, Users, Radio, Brain
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
];

const COLORS = {
  red:    { bg: 'bg-red-500/10',    border: 'border-red-500/20',    icon: 'text-red-400',    bar: 'bg-red-500' },
  ocean:  { bg: 'bg-ocean-500/10',  border: 'border-ocean-500/20',  icon: 'text-ocean-400',  bar: 'bg-ocean-500' },
  amber:  { bg: 'bg-amber-500/10',  border: 'border-amber-500/20',  icon: 'text-amber-400',  bar: 'bg-amber-500' },
  green:  { bg: 'bg-green-500/10',  border: 'border-green-500/20',  icon: 'text-green-400',  bar: 'bg-green-500' },
  purple: { bg: 'bg-purple-500/10', border: 'border-purple-500/20', icon: 'text-purple-400', bar: 'bg-purple-500' },
  blue:   { bg: 'bg-blue-500/10',   border: 'border-blue-500/20',   icon: 'text-blue-400',   bar: 'bg-blue-500' },
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
  const barColor = pct > 85 ? 'bg-red-500' : pct > 60 ? 'bg-yellow-500' : color;
  return (
    <div className="w-full bg-gray-700 rounded-full h-1 mt-0.5">
      <div className={`${barColor} h-1 rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ── Widget Card ─────────────────────────────────────────────────────
function WidgetCard({ def, data, onUnpin, dragHandlers }) {
  const navigate = useNavigate();
  const c = COLORS[def.color];
  const Icon = def.icon;

  const routes = { system: '/resources', documents: '/files', schedule: '/calendar', team: '/team', sessions: '/sessions', memory: '/memory' };

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
            {up && <div className="text-[10px] text-gray-600 mt-1">⏱ {up}</div>}
          </>
        ) : <Shimmer />;
      }
      case 'documents': {
        const files = data?.total_files;
        const size = data?.total_size;
        return files != null ? (
          <>
            <div className="text-lg font-bold text-white">{files}</div>
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
              <span className="text-lg font-bold text-white">{total}</span>
              {errors > 0 && <span className="text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full">{errors} err</span>}
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
            <div className="text-lg font-bold text-white">{online.length}/{members.length} online</div>
            <div className="flex gap-1 mt-1">
              {members.map(m => (
                <span key={m.name} className={`w-2 h-2 rounded-full ${m.status === 'online' ? 'bg-green-400' : 'bg-gray-600'}`} title={m.name} />
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
            <div className="text-lg font-bold text-white">{total}</div>
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
      default: return null;
    }
  };

  return (
    <div
      {...dragHandlers}
      onClick={() => navigate(routes[def.id] || '/')}
      className={`relative group flex flex-col p-4 rounded-xl border cursor-pointer transition-all hover:scale-[1.02]
        ${c.bg} ${c.border} min-w-[160px]`}
    >
      {/* Pin toggle on hover */}
      <button
        onClick={(e) => { e.stopPropagation(); onUnpin(def.id); }}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition p-1 rounded hover:bg-gray-700/50"
        title="Unpin widget"
      >
        <PinOff className="w-3 h-3 text-gray-500" />
      </button>

      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 ${c.icon}`} />
        <span className="text-xs font-medium text-gray-300">{def.label}</span>
        <ChevronRight className="w-3 h-3 text-gray-600 ml-auto" />
      </div>

      {/* Content */}
      <div className="flex-1">{renderContent()}</div>
    </div>
  );
}

function Shimmer() {
  return <div className="h-4 w-20 bg-gray-700/50 rounded animate-pulse" />;
}

// ── Feed Item ───────────────────────────────────────────────────────
function FeedItem({ icon, text, sub, time, color = 'bg-gray-500' }) {
  return (
    <div className="flex items-start gap-3 py-2.5 px-1 border-b border-gray-800/50 last:border-0">
      <span className="text-base mt-0.5 shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-gray-200">{text}</div>
        {sub && <div className="text-xs text-gray-500 truncate">{sub}</div>}
      </div>
      <span className="text-[10px] text-gray-600 whitespace-nowrap mt-0.5">{time}</span>
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
        className="flex flex-col items-center justify-center p-4 rounded-xl border border-dashed border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-500 transition min-h-[100px] w-full"
      >
        <Plus className="w-5 h-5 mb-1" />
        <span className="text-xs">Add Widget</span>
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1 min-w-[180px]">
          {unpinned.map(def => {
            const Icon = def.icon;
            const c = COLORS[def.color];
            return (
              <button
                key={def.id}
                onClick={() => { onPin(def.id); setOpen(false); }}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 transition"
              >
                <Icon className={`w-4 h-4 ${c.icon}`} />
                <span>{def.label}</span>
                <Pin className="w-3 h-3 ml-auto text-gray-600" />
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
      <div className="mb-8 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center">
          <Crosshair className="w-5 h-5 text-red-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Mission Control</h1>
          <p className="text-sm text-gray-500">
            Tia's personal dashboard · {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>
      </div>

      {/* ── Pinned Widgets ── */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm font-semibold text-gray-300">📌 Pinned Widgets</span>
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
          {pinnedDefs.map((def, idx) => (
            <div
              key={def.id}
              className={`transition-all ${dragIdx === idx ? 'opacity-40 scale-95' : ''} ${
                overIdx === idx && dragIdx !== idx ? 'ring-2 ring-red-500/50 rounded-xl' : ''
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
          <span className="text-sm font-semibold text-gray-300">📡 Live Feed</span>
          <button onClick={fetchFeed} className="ml-auto p-1 rounded hover:bg-gray-800 transition" title="Refresh">
            <RefreshCw className="w-3.5 h-3.5 text-gray-500" />
          </button>
          {feedUpdated && <span className="text-[10px] text-gray-600">{timeAgo(feedUpdated)}</span>}
        </div>
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl px-3 py-1">
          {visibleFeed.length === 0 ? (
            <div className="py-6 text-center text-sm text-gray-600">No recent activity</div>
          ) : (
            visibleFeed.map((item, i) => (
              <FeedItem key={i} icon={item.icon} text={item.text} sub={item.sub} time={timeAgo(item.time)} color={item.color} />
            ))
          )}
          {!showAll && feedItems.length > 15 && (
            <button onClick={() => setShowAll(true)} className="w-full py-2 text-xs text-gray-500 hover:text-gray-300 transition">
              Load more ({feedItems.length - 15} remaining)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
