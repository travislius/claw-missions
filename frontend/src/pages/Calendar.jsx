import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Calendar as CalIcon, RefreshCw, X, AlertTriangle, CheckCircle,
  HelpCircle, ChevronDown, ChevronUp, Edit2, Save, Loader, WifiOff
} from 'lucide-react';
import api from '../api';

const AGENTS = [
  { id: 'tia',    label: 'Tia 🌿',    color: 'text-ocean-400',  active: 'bg-ocean-500/20 border-ocean-500/50' },
  { id: 'dexter', label: 'Dexter 🔬', color: 'text-amber-400',  active: 'bg-amber-500/20 border-amber-500/50' },
  { id: 'sia',    label: 'Sia 🤖',    color: 'text-purple-400', active: 'bg-purple-500/20 border-purple-500/50' },
];

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOUR_PX = 96;          // pixels per hour — bigger = more breathing room
const TILE_MINS = 28;        // treat each tile as occupying this many minutes for overlap detection
const TOTAL_H = 24 * HOUR_PX;

// ── category config ──────────────────────────────────────────────────────────
const CAT = {
  trading:  { label: 'Trading',  bg: 'bg-amber-500/20',   border: 'border-amber-500/50',  text: 'text-amber-300',  dot: 'bg-amber-400',  badge: 'bg-amber-500/30 text-amber-300' },
  youtube:  { label: 'YouTube',  bg: 'bg-purple-500/20',  border: 'border-purple-500/50', text: 'text-purple-300', dot: 'bg-purple-400', badge: 'bg-purple-500/30 text-purple-300' },
  email:    { label: 'Email',    bg: 'bg-blue-500/20',    border: 'border-blue-500/50',   text: 'text-blue-300',   dot: 'bg-blue-400',   badge: 'bg-blue-500/30 text-blue-300' },
  content:  { label: 'Content',  bg: 'bg-emerald-500/20', border: 'border-emerald-500/50',text: 'text-emerald-300',dot: 'bg-emerald-400',badge: 'bg-emerald-500/30 text-emerald-300' },
  projects: { label: 'Projects', bg: 'bg-ocean-500/20',   border: 'border-ocean-500/50',  text: 'text-ocean-300',  dot: 'bg-ocean-400',  badge: 'bg-ocean-500/30 text-ocean-300' },
  system:   { label: 'System',   bg: 'bg-gray-500/20',    border: 'border-gray-500/50',   text: 'text-gray-400',   dot: 'bg-gray-500',   badge: 'bg-gray-500/30 text-gray-400' },
};

// OpenClaw schedule kinds
const KIND_BADGE = {
  cron:     'bg-gray-700 text-gray-400',
  interval: 'bg-indigo-900/50 text-indigo-300',
  once:     'bg-rose-900/50 text-rose-300',
};

// Edit form options
const SESSION_OPTS  = ['isolated', 'main'];
const WAKE_OPTS     = ['now', 'next-heartbeat'];
const TZ_OPTS = [
  'America/Los_Angeles', 'America/New_York', 'America/Chicago',
  'America/Denver', 'UTC', 'Europe/London', 'Asia/Shanghai', 'Asia/Tokyo',
];

// ── helpers ───────────────────────────────────────────────────────────────────
function StatusIcon({ status, size = 'w-3 h-3' }) {
  if (status === 'ok')    return <CheckCircle   className={`${size} text-green-400 shrink-0`} />;
  if (status === 'error') return <AlertTriangle className={`${size} text-red-400 shrink-0`} />;
  return                         <HelpCircle    className={`${size} text-gray-500 shrink-0`} />;
}
function fmtTime(h, m) {
  const ap = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 || 12;
  return `${hh}:${String(m).padStart(2, '0')} ${ap}`;
}
function fmtDuration(ms) {
  if (!ms) return null;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

// ── overlap layout ────────────────────────────────────────────────────────────
// Returns Map<id, {col, total}>
function computeLayout(dayJobs) {
  const sorted = [...dayJobs].sort((a, b) => (a.hour * 60 + a.minute) - (b.hour * 60 + b.minute));
  const layout = new Map();

  let i = 0;
  while (i < sorted.length) {
    // Build cluster: all jobs whose start is within TILE_MINS of cluster start
    const clusterStart = sorted[i].hour * 60 + sorted[i].minute;
    const cluster = [sorted[i]];
    let j = i + 1;
    while (j < sorted.length) {
      const t = sorted[j].hour * 60 + sorted[j].minute;
      if (t - clusterStart < TILE_MINS) { cluster.push(sorted[j]); j++; }
      else break;
    }
    cluster.forEach((job, idx) => layout.set(job.id, { col: idx, total: cluster.length }));
    i = j;
  }
  return layout;
}

// ── Edit Modal ────────────────────────────────────────────────────────────────
function EditModal({ job, onClose, onSaved }) {
  const [form, setForm] = useState({
    name:            job.name,
    cron:            job.expr,
    tz:              job.tz === 'system' ? 'America/Los_Angeles' : job.tz,
    session:         job.session_target || 'isolated',
    wake:            job.wake_mode || 'now',
    enabled:         job.enabled ?? true,
    timeout_seconds: job.timeout_s || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = { name: form.name, cron: form.cron, tz: form.tz,
        session: form.session, wake: form.wake, enabled: form.enabled };
      if (form.timeout_seconds) payload.timeout_seconds = Number(form.timeout_seconds);
      await api.patch(`/crons/${job.id}`, payload);
      onSaved();
      onClose();
    } catch (e) {
      setError(e.response?.data?.detail || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  // Live cron expression breakdown
  const parts = form.cron.trim().split(/\s+/);
  const cronLabels = ['min', 'hour', 'dom', 'month', 'dow'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Edit2 className="w-4 h-4 text-ocean-400" /> Edit Cron
          </h2>
          <button onClick={onClose} className="p-1.5 text-gray-500 hover:text-white hover:bg-gray-700 rounded-lg transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Name */}
          <div>
            <label className="text-xs text-gray-500 uppercase tracking-wider block mb-1">Name</label>
            <input
              value={form.name}
              onChange={e => set('name', e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-ocean-500"
            />
          </div>

          {/* Cron expression + breakdown */}
          <div>
            <label className="text-xs text-gray-500 uppercase tracking-wider block mb-1">Schedule (cron expr)</label>
            <input
              value={form.cron}
              onChange={e => set('cron', e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-ocean-500"
              placeholder="0 3 * * *"
            />
            {/* Visual breakdown */}
            <div className="flex gap-1.5 mt-1.5">
              {cronLabels.map((label, i) => (
                <div key={label} className="flex-1 bg-gray-800/60 rounded px-1.5 py-1 text-center">
                  <p className="text-xs text-gray-600">{label}</p>
                  <p className="text-xs font-mono text-gray-300">{parts[i] ?? '?'}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Timezone */}
          <div>
            <label className="text-xs text-gray-500 uppercase tracking-wider block mb-1">Timezone</label>
            <select
              value={form.tz}
              onChange={e => set('tz', e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-ocean-500"
            >
              {TZ_OPTS.map(tz => <option key={tz} value={tz}>{tz}</option>)}
            </select>
          </div>

          {/* Session + Wake */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wider block mb-1">Session target</label>
              <select
                value={form.session}
                onChange={e => set('session', e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-ocean-500"
              >
                {SESSION_OPTS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wider block mb-1">Wake mode</label>
              <select
                value={form.wake}
                onChange={e => set('wake', e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-ocean-500"
              >
                {WAKE_OPTS.map(w => <option key={w} value={w}>{w}</option>)}
              </select>
            </div>
          </div>

          {/* Timeout + Enabled */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wider block mb-1">Timeout (seconds)</label>
              <input
                type="number"
                value={form.timeout_seconds}
                onChange={e => set('timeout_seconds', e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-ocean-500"
                placeholder="120"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wider block mb-1">Enabled</label>
              <button
                onClick={() => set('enabled', !form.enabled)}
                className={`w-full rounded-lg px-3 py-2 text-sm font-medium transition ${
                  form.enabled ? 'bg-green-600/30 text-green-400 border border-green-600/50' : 'bg-red-600/20 text-red-400 border border-red-600/50'
                }`}
              >
                {form.enabled ? 'Enabled' : 'Disabled'}
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-900/20 border border-red-500/30 rounded-lg px-3 py-2 text-xs text-red-300">{error}</div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-800 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition">Cancel</button>
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-ocean-600 hover:bg-ocean-500 text-white text-sm font-medium rounded-lg transition disabled:opacity-50"
          >
            {saving ? <Loader className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Detail Modal ──────────────────────────────────────────────────────────────
function DetailModal({ job, onClose, onEdit }) {
  const c = CAT[job.category] || CAT.system;
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
        <div className={`px-5 py-4 ${c.bg} border-b border-gray-800`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${c.badge}`}>{c.label}</span>
                {job.kind && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-mono ${KIND_BADGE[job.kind] || KIND_BADGE.cron}`}>
                    {job.kind}
                  </span>
                )}
                <StatusIcon status={job.status} />
                <span className={`text-xs ${job.status === 'ok' ? 'text-green-400' : job.status === 'error' ? 'text-red-400' : 'text-gray-500'}`}>
                  {job.status}
                </span>
              </div>
              <h2 className={`text-lg font-bold ${c.text} leading-tight`}>{job.name}</h2>
            </div>
            <div className="flex gap-1 shrink-0">
              {job.source === 'openclaw' && (
                <button
                  onClick={() => { onClose(); onEdit(job); }}
                  className="p-1.5 text-gray-500 hover:text-ocean-400 hover:bg-gray-700 rounded-lg transition"
                  title="Edit"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
              )}
              <button onClick={onClose} className="p-1.5 text-gray-500 hover:text-white hover:bg-gray-700 rounded-lg transition">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="px-5 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Schedule</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-800/60 rounded-lg px-3 py-2">
                <p className="text-xs text-gray-500 mb-0.5">Time</p>
                <p className="text-sm font-mono text-white">{fmtTime(job.hour, job.minute)}</p>
              </div>
              <div className="bg-gray-800/60 rounded-lg px-3 py-2">
                <p className="text-xs text-gray-500 mb-0.5">Days</p>
                <div className="flex gap-1">
                  {DAYS.map((d, i) => (
                    <span key={i} className={`text-xs font-mono px-1 rounded ${job.days.includes(i) ? `${c.badge} font-bold` : 'text-gray-600'}`}>
                      {d[0]}
                    </span>
                  ))}
                </div>
              </div>
              <div className="bg-gray-800/60 rounded-lg px-3 py-2">
                <p className="text-xs text-gray-500 mb-0.5">Next run</p>
                <p className="text-sm text-white">{job.next_run ?? '—'}</p>
              </div>
              <div className="bg-gray-800/60 rounded-lg px-3 py-2">
                <p className="text-xs text-gray-500 mb-0.5">Last run</p>
                <p className="text-sm text-white">{job.last_run ?? '—'}</p>
              </div>
              {job.duration_ms && (
                <div className="bg-gray-800/60 rounded-lg px-3 py-2">
                  <p className="text-xs text-gray-500 mb-0.5">Duration</p>
                  <p className="text-sm text-white">{fmtDuration(job.duration_ms)}</p>
                </div>
              )}
              {job.timeout_s && (
                <div className="bg-gray-800/60 rounded-lg px-3 py-2">
                  <p className="text-xs text-gray-500 mb-0.5">Timeout</p>
                  <p className="text-sm text-white">{job.timeout_s}s</p>
                </div>
              )}
            </div>
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <code className="text-xs text-gray-400 bg-gray-800 px-2 py-1 rounded font-mono">{job.expr}</code>
              {job.tz !== 'system' && <span className="text-xs text-gray-600">{job.tz}</span>}
            </div>
          </div>

          {job.status === 'error' && job.last_error && (
            <div className="bg-red-900/20 border border-red-500/30 rounded-lg px-3 py-2">
              <p className="text-xs text-red-400 font-semibold mb-1">Last error ({job.consecutive_errors} consecutive)</p>
              <p className="text-xs text-red-300 font-mono break-words">{job.last_error}</p>
            </div>
          )}

          {job.task_preview && (
            <div>
              <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition mb-2"
              >
                {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                Task description
              </button>
              {expanded && (
                <div className="bg-gray-800/50 rounded-lg p-3">
                  <p className="text-xs text-gray-300 whitespace-pre-wrap leading-relaxed">{job.task_preview}</p>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2 text-xs text-gray-600">
            <span>source: {job.source}</span>·
            <span>target: {job.session_target || job.target}</span>·
            <span>wake: {job.wake_mode}</span>
            {job.id && <span className="font-mono truncate max-w-[180px]">id: {job.id.slice(0, 8)}…</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Cron Tile ─────────────────────────────────────────────────────────────────
function CronTile({ job, layout, onClick }) {
  const c = CAT[job.category] || CAT.system;
  const { col, total } = layout;
  const topPx  = (job.hour * 60 + job.minute) / 60 * HOUR_PX;
  const pct    = (v) => `${(v * 100).toFixed(1)}%`;
  const left   = pct(col / total);
  const width  = pct(1 / total);
  const gap    = total > 1 ? 2 : 0;

  return (
    <button
      onClick={() => onClick(job)}
      className={`absolute ${c.bg} ${c.border} border rounded-lg px-1.5 py-1 text-left hover:brightness-125 transition cursor-pointer overflow-hidden`}
      style={{ top: `${topPx}px`, left: `calc(${left} + 2px)`, width: `calc(${width} - ${4 + gap}px)`, minHeight: '30px', zIndex: 1 }}
    >
      <div className="flex items-center gap-1">
        <StatusIcon status={job.status} size="w-2.5 h-2.5" />
        <span className={`text-xs font-medium ${c.text} truncate leading-tight`}>{job.name}</span>
      </div>
      <p className="text-xs text-gray-500 leading-none mt-0.5">{fmtTime(job.hour, job.minute)}</p>
    </button>
  );
}

// ── Legend ────────────────────────────────────────────────────────────────────
function Legend({ summary }) {
  return (
    <div className="flex flex-wrap gap-3">
      {Object.entries(CAT).map(([key, c]) => {
        const count = summary.by_category?.[key] || 0;
        if (!count) return null;
        return (
          <div key={key} className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-full ${c.dot}`} />
            <span className="text-xs text-gray-400">{c.label}</span>
            <span className="text-xs text-gray-600">{count}</span>
          </div>
        );
      })}
      <div className="flex items-center gap-3 ml-auto">
        <div className="flex items-center gap-1.5"><CheckCircle className="w-3 h-3 text-green-400" /><span className="text-xs text-gray-400">{summary.by_status?.ok ?? 0} ok</span></div>
        <div className="flex items-center gap-1.5"><AlertTriangle className="w-3 h-3 text-red-400" /><span className="text-xs text-gray-400">{summary.by_status?.error ?? 0} errors</span></div>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function CalendarPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeAgent = searchParams.get('agent') || 'tia';

  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [editing, setEditing]   = useState(null);
  const gridRef = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setData(null);
    try {
      const res = await api.get(`/crons/jobs?agent=${activeAgent}`);
      setData(res.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [activeAgent]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (data && gridRef.current) {
      const firstHour = Math.min(...(data.jobs || []).map(j => j.hour));
      setTimeout(() => gridRef.current?.scrollTo({ top: Math.max(0, (firstHour - 0.5) * HOUR_PX), behavior: 'smooth' }), 150);
    }
  }, [data]);

  if (loading) return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        {AGENTS.map(ag => (
          <button key={ag.id} onClick={() => setSearchParams({ agent: ag.id })}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition ${activeAgent === ag.id ? ag.active : 'border-gray-700 text-gray-500'}`}>
            <span className={activeAgent === ag.id ? ag.color : ''}>{ag.label}</span>
          </button>
        ))}
      </div>
      <div className="flex items-center justify-center h-64 text-gray-500">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Fetching schedule…
      </div>
    </div>
  );

  if (!data) return null;

  if (data.online === false) return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        {AGENTS.map(ag => (
          <button key={ag.id} onClick={() => setSearchParams({ agent: ag.id })}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition ${activeAgent === ag.id ? ag.active : 'border-gray-700 text-gray-500'}`}>
            <span className={activeAgent === ag.id ? ag.color : ''}>{ag.label}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-gray-500">
        <WifiOff className="w-8 h-8 text-gray-600" />
        <p className="text-sm font-medium">
          {AGENTS.find(a => a.id === activeAgent)?.label ?? activeAgent} is offline
        </p>
        <p className="text-xs text-gray-600">{data.error || 'Could not connect to this machine'}</p>
      </div>
    </div>
  );

  const jobs = data.jobs || [];
  const byDay = DAYS.map((_, di) => jobs.filter(j => j.days.includes(di)));
  const layouts = byDay.map(computeLayout);
  const todayIdx = (new Date().getDay() + 6) % 7;

  return (
    <div className="flex flex-col h-full max-w-full">
      {/* Page header */}
      <div className="mb-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <CalIcon className="w-5 h-5 text-red-400" />
              {AGENTS.find(a => a.id === activeAgent)?.label ?? 'Schedule'}
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">
              {data.total} cron jobs · click tile to view · ✏️ to edit
            </p>
          </div>
          <button onClick={fetchData} className="p-2 text-gray-500 hover:text-white hover:bg-gray-800 rounded-lg transition" title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Agent tab switcher */}
        <div className="flex gap-2">
          {AGENTS.map(ag => (
            <button
              key={ag.id}
              onClick={() => setSearchParams({ agent: ag.id })}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition ${
                activeAgent === ag.id
                  ? ag.active
                  : 'border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-600'
              }`}
            >
              <span className={activeAgent === ag.id ? ag.color : ''}>{ag.label}</span>
            </button>
          ))}
        </div>

        <Legend summary={data} />
      </div>

      {/* Grid */}
      <div className="flex flex-col flex-1 bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        {/* Day header */}
        <div className="flex shrink-0 border-b border-gray-800 bg-gray-900 sticky top-0 z-10">
          <div className="w-12 shrink-0 border-r border-gray-800" />
          {DAYS.map((day, i) => (
            <div key={i} className={`flex-1 min-w-0 py-2 text-center border-r border-gray-800 last:border-0 ${i === todayIdx ? 'bg-ocean-900/30' : ''}`}>
              <p className={`text-xs font-semibold uppercase tracking-wider ${i === todayIdx ? 'text-ocean-400' : 'text-gray-500'}`}>{day}</p>
              {i === todayIdx && <div className="w-1.5 h-1.5 rounded-full bg-ocean-400 mx-auto mt-0.5" />}
              <p className="text-xs text-gray-600 mt-0.5">{byDay[i].length}</p>
            </div>
          ))}
        </div>

        {/* Scrollable timeline */}
        <div className="flex flex-1 overflow-y-auto" ref={gridRef}>
          {/* Time gutter */}
          <div className="w-12 shrink-0 border-r border-gray-800 relative" style={{ minHeight: `${TOTAL_H}px` }}>
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="absolute w-full flex items-start justify-end pr-2 pt-1" style={{ top: `${h * HOUR_PX}px`, height: `${HOUR_PX}px` }}>
                <span className="text-xs text-gray-600 font-mono leading-none">
                  {h === 0 ? '12A' : h < 12 ? `${h}A` : h === 12 ? '12P' : `${h - 12}P`}
                </span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          {DAYS.map((_, dayIdx) => (
            <div
              key={dayIdx}
              className={`flex-1 min-w-0 relative border-r border-gray-800 last:border-0 ${dayIdx === todayIdx ? 'bg-ocean-900/10' : ''}`}
              style={{ height: `${TOTAL_H}px` }}
            >
              {Array.from({ length: 24 }, (_, h) => (
                <div key={h} className={`absolute w-full border-t ${h % 6 === 0 ? 'border-gray-700' : 'border-gray-800/50'}`} style={{ top: `${h * HOUR_PX}px` }} />
              ))}
              {byDay[dayIdx].map(job => (
                <CronTile
                  key={job.id}
                  job={job}
                  layout={layouts[dayIdx].get(job.id) || { col: 0, total: 1 }}
                  onClick={setSelected}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {selected && !editing && (
        <DetailModal job={selected} onClose={() => setSelected(null)} onEdit={(j) => { setSelected(null); setEditing(j); }} />
      )}
      {editing && (
        <EditModal job={editing} onClose={() => setEditing(null)} onSaved={fetchData} />
      )}
    </div>
  );
}
