import { useState, useCallback, useRef, useEffect } from 'react';
import {
  Calendar as CalIcon, RefreshCw, X, AlertTriangle, CheckCircle,
  HelpCircle, ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
  Edit2, Save, Loader, WifiOff, GripVertical,
} from 'lucide-react';
import api from '../api';

const ACTIVE_AGENT = 'tia';
const AGENTS = [{ id: 'tia', label: 'Tia Schedule' }, { id: 'maru', label: 'Maru Schedule' }];

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOUR_PX = 96;
const TILE_MINS = 28;
const TOTAL_H = 24 * HOUR_PX;
const DRAG_MINUTE_STEP = 15;

const CAT = {
  trading:  { label: 'Trading',  bg: 'bg-amber-500/20',   border: 'border-amber-500/50',  text: 'text-amber-300',  dot: 'bg-amber-400',  badge: 'bg-amber-500/30 text-amber-300' },
  youtube:  { label: 'YouTube',  bg: 'bg-purple-500/20',  border: 'border-purple-500/50', text: 'text-purple-300', dot: 'bg-purple-400', badge: 'bg-purple-500/30 text-purple-300' },
  email:    { label: 'Email',    bg: 'bg-blue-500/20',    border: 'border-blue-500/50',   text: 'text-blue-300',   dot: 'bg-blue-400',   badge: 'bg-blue-500/30 text-blue-300' },
  content:  { label: 'Content',  bg: 'bg-emerald-500/20', border: 'border-emerald-500/50',text: 'text-emerald-300',dot: 'bg-emerald-400',badge: 'bg-emerald-500/30 text-emerald-300' },
  projects: { label: 'Projects', bg: 'bg-ocean-500/20',   border: 'border-ocean-500/50',  text: 'text-ocean-300',  dot: 'bg-ocean-400',  badge: 'bg-ocean-500/30 text-ocean-300' },
  system:   { label: 'System',   bg: 'bg-ocean-300/20',    border: 'border-ocean-200',   text: 'text-gray-600',   dot: 'bg-ocean-300',   badge: 'bg-ocean-300/30 text-gray-600' },
};

const KIND_BADGE = {
  cron: 'bg-gray-700 text-gray-700',
  every: 'bg-indigo-900/50 text-indigo-300',
  at: 'bg-rose-900/50 text-rose-300',
};

const SESSION_OPTS = ['isolated', 'main'];
const WAKE_OPTS = ['now', 'next-heartbeat'];
const TZ_OPTS = [
  'America/Los_Angeles', 'America/New_York', 'America/Chicago',
  'America/Denver', 'UTC', 'Europe/London', 'Asia/Shanghai', 'Asia/Tokyo',
];

function StatusIcon({ status, size = 'w-3 h-3' }) {
  if (status === 'ok') return <CheckCircle className={`${size} text-seafoam-500 shrink-0`} />;
  if (status === 'error') return <AlertTriangle className={`${size} text-coral-500 shrink-0`} />;
  return <HelpCircle className={`${size} text-gray-500 shrink-0`} />;
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

function fmtAbsolute(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function fmtEvery(ms) {
  if (!ms) return 'Interval';
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `Every ${mins}m`;
  const hours = mins / 60;
  if (Number.isInteger(hours)) return `Every ${hours}h`;
  return `Every ${(hours).toFixed(1)}h`;
}

function toDate(value) {
  if (value == null) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isToday(date) {
  const t = new Date();
  return date.getDate() === t.getDate() && date.getMonth() === t.getMonth() && date.getFullYear() === t.getFullYear();
}

function sameLocalDate(a, b) {
  return a && b
    && a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function startOfDay(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function startOfWeek(date) {
  const next = startOfDay(date);
  const offset = (next.getDay() + 6) % 7;
  next.setDate(next.getDate() - offset);
  return next;
}

function addDays(date, amount) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function dayDiff(a, b) {
  return Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / 86400000);
}

function dateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function roundMinutes(mins) {
  const rounded = Math.round(mins / DRAG_MINUTE_STEP) * DRAG_MINUTE_STEP;
  return Math.max(0, Math.min(23 * 60 + 45, rounded));
}

function toDatetimeLocalValue(value) {
  const date = toDate(value);
  if (!date) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromDropPosition(targetDate, clientY, element) {
  const rect = element.getBoundingClientRect();
  const mins = roundMinutes(((clientY - rect.top) / rect.height) * 24 * 60);
  const next = new Date(targetDate);
  next.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
  return next;
}

function normalizeJobs(rawJobs, weekStart) {
  return rawJobs.map((job) => {
    const normalized = {
      ...job,
      scheduledAt: null,
      weekDayIndices: [],
      isDraggable: Boolean(job.supports_drag && job.source === 'openclaw' && job.kind === 'at'),
    };

    if (job.kind === 'at') {
      const scheduledAt = toDate(job.at || job.next_run_at_ms);
      if (scheduledAt) {
        normalized.scheduledAt = scheduledAt;
        normalized.hour = scheduledAt.getHours();
        normalized.minute = scheduledAt.getMinutes();
        const diff = dayDiff(scheduledAt, weekStart);
        normalized.weekDayIndices = diff >= 0 && diff < 7 ? [diff] : [];
      }
      return normalized;
    }

    if (job.kind === 'every') {
      const anchor = toDate(job.next_run_at_ms || job.anchor_ms);
      if (anchor) {
        normalized.scheduledAt = anchor;
        normalized.hour = anchor.getHours();
        normalized.minute = anchor.getMinutes();
        const diff = dayDiff(anchor, weekStart);
        normalized.weekDayIndices = diff >= 0 && diff < 7 ? [diff] : [];
      }
      return normalized;
    }

    normalized.weekDayIndices = Array.isArray(job.days) ? job.days : [];
    return normalized;
  });
}

function occursOnDate(job, date) {
  if (job.kind === 'cron') {
    return job.weekDayIndices.includes((date.getDay() + 6) % 7);
  }
  return job.scheduledAt ? sameLocalDate(job.scheduledAt, date) : false;
}

function scheduleSummary(job) {
  if (job.kind === 'at') return job.scheduledAt ? fmtAbsolute(job.scheduledAt) : 'One-time job';
  if (job.kind === 'every') return `${fmtEvery(job.every_ms)}${job.scheduledAt ? ` · next ${fmtAbsolute(job.scheduledAt)}` : ''}`;
  return job.expr;
}

function applyOptimisticMove(rawJobs, jobId, targetDate) {
  return rawJobs.map((job) => {
    if (job.id !== jobId) return job;
    return {
      ...job,
      at: targetDate.toISOString(),
      next_run_at_ms: targetDate.getTime(),
      next_run: `Scheduled for ${fmtAbsolute(targetDate)}`,
    };
  });
}

function computeLayout(dayJobs) {
  const sorted = [...dayJobs].sort((a, b) => (a.hour * 60 + a.minute) - (b.hour * 60 + b.minute));
  const layout = new Map();

  let i = 0;
  while (i < sorted.length) {
    const clusterStart = sorted[i].hour * 60 + sorted[i].minute;
    const cluster = [sorted[i]];
    let j = i + 1;
    while (j < sorted.length) {
      const t = sorted[j].hour * 60 + sorted[j].minute;
      if (t - clusterStart < TILE_MINS) {
        cluster.push(sorted[j]);
        j += 1;
      } else {
        break;
      }
    }
    cluster.forEach((job, idx) => layout.set(job.id, { col: idx, total: cluster.length }));
    i = j;
  }
  return layout;
}

function NowLine() {
  const now = new Date();
  const topPx = (now.getHours() * 60 + now.getMinutes()) / 60 * HOUR_PX;
  return (
    <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top: `${topPx}px` }}>
      <div className="h-0.5 bg-coral-500 opacity-70 relative">
        <div className="absolute -left-1 -top-1 w-2.5 h-2.5 rounded-full bg-coral-500" />
      </div>
    </div>
  );
}

function EditModal({ job, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: job.name,
    cron: job.expr,
    at: toDatetimeLocalValue(job.at || job.next_run_at_ms),
    tz: job.tz === 'system' ? 'America/Los_Angeles' : (job.tz || 'America/Los_Angeles'),
    session: job.session_target || 'isolated',
    wake: job.wake_mode || 'now',
    enabled: job.enabled ?? true,
    timeout_seconds: job.timeout_s || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: form.name,
        session: form.session,
        wake: form.wake,
        enabled: form.enabled,
      };
      if (job.kind === 'cron') {
        payload.cron = form.cron;
        payload.tz = form.tz;
      }
      if (job.kind === 'at') {
        if (!form.at) throw new Error('Pick a valid date and time');
        payload.at = new Date(form.at).toISOString();
      }
      if (form.timeout_seconds) payload.timeout_seconds = Number(form.timeout_seconds);
      await api.patch(`/crons/${job.id}`, payload);
      onSaved();
      onClose();
    } catch (e) {
      setError(e.response?.data?.detail || e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const parts = form.cron.trim().split(/\s+/);
  const cronLabels = ['min', 'hour', 'dom', 'month', 'dow'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ocean-900/20 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white border border-ocean-200 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-ocean-100 flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-800 flex items-center gap-2">
            <Edit2 className="w-4 h-4 text-ocean-400" /> Edit Schedule
          </h2>
          <button onClick={onClose} className="p-1.5 text-gray-500 hover:text-ocean-700 hover:bg-sky-50 rounded-lg transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="text-xs text-gray-500 uppercase tracking-wider block mb-1">Name</label>
            <input
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              className="w-full bg-sky-50 border border-ocean-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-ocean-500"
            />
          </div>

          {job.kind === 'cron' && (
            <>
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wider block mb-1">Schedule (cron expr)</label>
                <input
                  value={form.cron}
                  onChange={(e) => set('cron', e.target.value)}
                  className="w-full bg-sky-50 border border-ocean-200 rounded-lg px-3 py-2 text-sm font-mono text-gray-800 focus:outline-none focus:border-ocean-500"
                  placeholder="0 3 * * *"
                />
                <div className="flex gap-1.5 mt-1.5">
                  {cronLabels.map((label, i) => (
                    <div key={label} className="flex-1 bg-sky-50/90 rounded px-1.5 py-1 text-center">
                      <p className="text-xs text-gray-600">{label}</p>
                      <p className="text-xs font-mono text-gray-700">{parts[i] ?? '?'}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wider block mb-1">Timezone</label>
                <select
                  value={form.tz}
                  onChange={(e) => set('tz', e.target.value)}
                  className="w-full bg-sky-50 border border-ocean-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-ocean-500"
                >
                  {TZ_OPTS.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                </select>
              </div>
            </>
          )}

          {job.kind === 'at' && (
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wider block mb-1">Run at</label>
              <input
                type="datetime-local"
                value={form.at}
                onChange={(e) => set('at', e.target.value)}
                className="w-full bg-sky-50 border border-ocean-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-ocean-500"
              />
              <p className="mt-1 text-xs text-gray-500">Shown in your browser timezone and saved as an absolute timestamp.</p>
            </div>
          )}

          {job.kind === 'every' && (
            <div className="bg-sky-50/90 border border-ocean-200 rounded-lg px-3 py-3 text-sm text-gray-700">
              Interval jobs are shown on the calendar for visibility, but drag rescheduling is disabled for this schedule type.
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wider block mb-1">Session target</label>
              <select
                value={form.session}
                onChange={(e) => set('session', e.target.value)}
                className="w-full bg-sky-50 border border-ocean-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-ocean-500"
              >
                {SESSION_OPTS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wider block mb-1">Wake mode</label>
              <select
                value={form.wake}
                onChange={(e) => set('wake', e.target.value)}
                className="w-full bg-sky-50 border border-ocean-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-ocean-500"
              >
                {WAKE_OPTS.map((w) => <option key={w} value={w}>{w}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wider block mb-1">Timeout (seconds)</label>
              <input
                type="number"
                value={form.timeout_seconds}
                onChange={(e) => set('timeout_seconds', e.target.value)}
                className="w-full bg-sky-50 border border-ocean-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-ocean-500"
                placeholder="120"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wider block mb-1">Enabled</label>
              <button
                onClick={() => set('enabled', !form.enabled)}
                className={`w-full rounded-lg px-3 py-2 text-sm font-medium transition ${
                  form.enabled ? 'bg-seafoam-100 text-seafoam-500 border border-seafoam-200' : 'bg-coral-500/20 text-coral-500 border border-coral-200'
                }`}
              >
                {form.enabled ? 'Enabled' : 'Disabled'}
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-900/20 border border-coral-200 rounded-lg px-3 py-2 text-xs text-coral-600">{error}</div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-ocean-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-ocean-700 transition">Cancel</button>
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

function DetailModal({ job, onClose, onEdit }) {
  const c = CAT[job.category] || CAT.system;
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ocean-900/20 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white border border-ocean-200 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-ocean-100">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${c.dot}`} />
                <span className="text-xs font-semibold text-gray-600 bg-sky-50 px-2 py-0.5 rounded-full">{c.label}</span>
                {job.kind && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-mono ${KIND_BADGE[job.kind] || KIND_BADGE.cron}`}>
                    {job.kind}
                  </span>
                )}
                <StatusIcon status={job.status} />
                <span className={`text-xs ${job.status === 'ok' ? 'text-seafoam-500' : job.status === 'error' ? 'text-coral-500' : 'text-gray-500'}`}>
                  {job.status}
                </span>
              </div>
              <h2 className="text-lg font-bold text-gray-800 leading-tight">{job.name}</h2>
            </div>
            <div className="flex gap-1 shrink-0">
              {job.source === 'openclaw' && (
                <button
                  onClick={() => { onClose(); onEdit(job); }}
                  className="p-1.5 text-gray-500 hover:text-ocean-400 hover:bg-sky-50 rounded-lg transition"
                  title="Edit"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
              )}
              <button onClick={onClose} className="p-1.5 text-gray-500 hover:text-ocean-700 hover:bg-sky-50 rounded-lg transition">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="px-5 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Schedule</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-sky-50/90 rounded-lg px-3 py-2">
                <p className="text-xs text-gray-500 mb-0.5">Time</p>
                <p className="text-sm font-mono text-gray-800">{fmtTime(job.hour, job.minute)}</p>
              </div>
              <div className="bg-sky-50/90 rounded-lg px-3 py-2">
                <p className="text-xs text-gray-500 mb-0.5">Pattern</p>
                <p className="text-sm text-gray-800">{scheduleSummary(job)}</p>
              </div>
              <div className="bg-sky-50/90 rounded-lg px-3 py-2">
                <p className="text-xs text-gray-500 mb-0.5">Next run</p>
                <p className="text-sm text-gray-800">{job.next_run ?? '—'}</p>
              </div>
              <div className="bg-sky-50/90 rounded-lg px-3 py-2">
                <p className="text-xs text-gray-500 mb-0.5">Last run</p>
                <p className="text-sm text-gray-800">{job.last_run ?? '—'}</p>
              </div>
              {job.duration_ms && (
                <div className="bg-sky-50/90 rounded-lg px-3 py-2">
                  <p className="text-xs text-gray-500 mb-0.5">Duration</p>
                  <p className="text-sm text-gray-800">{fmtDuration(job.duration_ms)}</p>
                </div>
              )}
              {job.timeout_s && (
                <div className="bg-sky-50/90 rounded-lg px-3 py-2">
                  <p className="text-xs text-gray-500 mb-0.5">Timeout</p>
                  <p className="text-sm text-gray-800">{job.timeout_s}s</p>
                </div>
              )}
            </div>
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              {job.kind === 'cron' && <code className="text-xs text-gray-600 bg-sky-50 px-2 py-1 rounded font-mono">{job.expr}</code>}
              {job.kind === 'cron' && job.tz !== 'system' && <span className="text-xs text-gray-600">{job.tz}</span>}
              {job.isDraggable && <span className="text-xs text-rose-300 bg-rose-500/10 px-2 py-1 rounded">Drag enabled</span>}
              {!job.isDraggable && job.source === 'openclaw' && <span className="text-xs text-gray-500 bg-sky-50 px-2 py-1 rounded">Drag disabled for this schedule type</span>}
            </div>
          </div>

          {job.status === 'error' && job.last_error && (
            <div className="bg-red-900/20 border border-coral-200 rounded-lg px-3 py-2">
              <p className="text-xs text-coral-500 font-semibold mb-1">Last error ({job.consecutive_errors} consecutive)</p>
              <p className="text-xs text-coral-600 font-mono break-words">{job.last_error}</p>
            </div>
          )}

          {job.task_preview && (
            <div>
              <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition mb-2"
              >
                {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                Task description
              </button>
              {expanded && (
                <div className="bg-sky-50/80 rounded-lg p-3">
                  <p className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">{job.task_preview}</p>
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

function CronTile({ job, layout, onClick, onDragStart, onDragEnd, saving }) {
  const c = CAT[job.category] || CAT.system;
  const { col, total } = layout;
  const topPx = (job.hour * 60 + job.minute) / 60 * HOUR_PX;
  const pct = (v) => `${(v * 100).toFixed(1)}%`;
  const left = pct(col / total);
  const width = pct(1 / total);
  const gap = total > 1 ? 2 : 0;

  return (
    <button
      draggable={job.isDraggable && !saving}
      onDragStart={(event) => onDragStart(event, job)}
      onDragEnd={onDragEnd}
      onClick={() => onClick(job)}
      title={job.isDraggable ? 'Drag to reschedule' : job.source === 'openclaw' ? 'Recurring and interval jobs cannot be dragged yet' : 'View details'}
      className={`absolute border rounded-lg px-1.5 py-1 text-left transition overflow-hidden ${
        job.isDraggable
          ? 'bg-rose-900/35 border-rose-500/40 hover:border-rose-400 cursor-grab active:cursor-grabbing'
          : 'bg-sky-50/90 border-ocean-200/80 hover:bg-sky-100 hover:border-ocean-200 cursor-pointer'
      } ${saving ? 'opacity-60' : ''}`}
      style={{ top: `${topPx}px`, left: `calc(${left} + 2px)`, width: `calc(${width} - ${4 + gap}px)`, minHeight: '34px', zIndex: 1 }}
    >
      <div className="flex items-center gap-1.5">
        {job.isDraggable ? <GripVertical className="w-3 h-3 text-rose-300 shrink-0" /> : <span className={`w-2 h-2 rounded-full shrink-0 ${c.dot}`} />}
        <StatusIcon status={job.status} size="w-2.5 h-2.5" />
        <span className="text-xs font-medium text-gray-800 truncate leading-tight">{job.name}</span>
      </div>
      <p className="text-xs text-gray-600 leading-none mt-0.5 pl-4">{fmtTime(job.hour, job.minute)}</p>
    </button>
  );
}

function Legend({ summary }) {
  return (
    <div className="flex flex-wrap gap-3">
      {Object.entries(CAT).map(([key, c]) => {
        const count = summary.by_category?.[key] || 0;
        if (!count) return null;
        return (
          <div key={key} className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-full ${c.dot}`} />
            <span className="text-xs text-gray-600">{c.label}</span>
            <span className="text-xs text-gray-600">{count}</span>
          </div>
        );
      })}
      <div className="flex items-center gap-3 ml-auto">
        <div className="flex items-center gap-1.5"><GripVertical className="w-3 h-3 text-rose-300" /><span className="text-xs text-gray-600">one-time draggable</span></div>
        <div className="flex items-center gap-1.5"><CheckCircle className="w-3 h-3 text-seafoam-500" /><span className="text-xs text-gray-600">{summary.by_status?.ok ?? 0} ok</span></div>
        <div className="flex items-center gap-1.5"><AlertTriangle className="w-3 h-3 text-coral-500" /><span className="text-xs text-gray-600">{summary.by_status?.error ?? 0} errors</span></div>
      </div>
    </div>
  );
}

function CategoryFilter({ active, counts, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => onChange(null)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition border ${
          active === null
            ? 'bg-gray-700 border-ocean-200 text-gray-800'
            : 'bg-sky-50/80 border-ocean-100 text-gray-600 hover:text-ocean-700 hover:border-ocean-200'
        }`}
      >
        All
        <span className="text-gray-500 text-xs">{Object.values(counts).reduce((a, b) => a + b, 0)}</span>
      </button>
      {Object.entries(CAT).map(([key, c]) => {
        const count = counts[key] || 0;
        if (!count) return null;
        return (
          <button
            key={key}
            onClick={() => onChange(active === key ? null : key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition border ${
              active === key
                ? `${c.badge} border-transparent`
                : 'bg-sky-50/80 border-ocean-100 text-gray-600 hover:text-ocean-700 hover:border-ocean-200'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${c.dot}`} />
            {c.label}
            <span className={active === key ? 'opacity-70' : 'text-gray-600'}>{count}</span>
          </button>
        );
      })}
    </div>
  );
}

function DropPreview({ preview }) {
  if (!preview) return null;
  return (
    <div className="absolute inset-x-0 z-30 pointer-events-none" style={{ top: `${preview.top}px` }}>
      <div className="h-0.5 bg-rose-400/80" />
      <div className="absolute right-2 -top-3 px-2 py-0.5 rounded-full bg-rose-500 text-[11px] font-medium text-gray-800 shadow-lg">
        {preview.label}
      </div>
    </div>
  );
}

export default function CalendarPage() {
  const activeAgent = ACTIVE_AGENT;
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  const [calView, setCalView] = useState(isMobile ? 'day' : 'week');
  const [dayDate, setDayDate] = useState(new Date());
  const [filterCat, setFilterCat] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(null);
  const [draggingId, setDraggingId] = useState(null);
  const [savingJobId, setSavingJobId] = useState(null);
  const [dropPreview, setDropPreview] = useState(null);
  const [notice, setNotice] = useState(null);
  const gridRef = useRef(null);

  const fetchData = useCallback(async ({ background = false } = {}) => {
    if (!background) {
      setLoading(true);
      setData(null);
    }
    try {
      const res = await api.get(`/crons/jobs?agent=${activeAgent}`);
      setData(res.data);
    } catch (e) {
      console.error(e);
      setNotice({ type: 'error', text: 'Could not refresh schedule data.' });
    } finally {
      if (!background) setLoading(false);
    }
  }, [activeAgent]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) setCalView('day');
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const weekStart = startOfWeek(dayDate);
  const weekDates = DAYS.map((_, idx) => addDays(weekStart, idx));
  const allJobs = normalizeJobs(data?.jobs || [], weekStart);
  const catCounts = allJobs.reduce((acc, j) => { acc[j.category] = (acc[j.category] || 0) + 1; return acc; }, {});
  const jobs = filterCat ? allJobs.filter((j) => j.category === filterCat) : allJobs;
  const byDay = weekDates.map((date) => jobs.filter((job) => occursOnDate(job, date)));
  const layouts = byDay.map(computeLayout);
  const todayKey = dateKey(new Date());

  useEffect(() => {
    if (data && gridRef.current) {
      const firstHour = Math.min(...(allJobs.length ? allJobs : [{ hour: 8 }]).map((j) => j.hour ?? 8));
      setTimeout(() => gridRef.current?.scrollTo({ top: Math.max(0, (firstHour - 0.5) * HOUR_PX), behavior: 'smooth' }), 150);
    }
  }, [data, allJobs]);

  const clearDragState = useCallback(() => {
    setDraggingId(null);
    setDropPreview(null);
  }, []);

  const handleDragStart = useCallback((event, job) => {
    if (!job.isDraggable) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', job.id);
    setDraggingId(job.id);
    setNotice(null);
  }, []);

  const updateDropPreview = useCallback((event, targetDate) => {
    if (!draggingId) return null;
    const target = fromDropPosition(targetDate, event.clientY, event.currentTarget);
    setDropPreview({
      dayKey: dateKey(targetDate),
      top: ((target.getHours() * 60 + target.getMinutes()) / 60) * HOUR_PX,
      label: fmtAbsolute(target),
    });
    return target;
  }, [draggingId]);

  const handleDrop = useCallback(async (event, targetDate) => {
    event.preventDefault();
    const target = updateDropPreview(event, targetDate);
    const job = allJobs.find((item) => item.id === draggingId);
    if (!job || !job.isDraggable || !target) {
      clearDragState();
      return;
    }

    const snapshot = JSON.parse(JSON.stringify(data));
    clearDragState();
    setSavingJobId(job.id);
    setData((current) => current ? { ...current, jobs: applyOptimisticMove(current.jobs || [], job.id, target) } : current);

    try {
      await api.patch(`/crons/${job.id}`, { at: target.toISOString() });
      await fetchData({ background: true });
      setNotice({ type: 'success', text: `${job.name} moved to ${fmtAbsolute(target)}.` });
    } catch (e) {
      setData(snapshot);
      setNotice({ type: 'error', text: e.response?.data?.detail || 'Could not reschedule this job.' });
    } finally {
      setSavingJobId(null);
    }
  }, [allJobs, clearDragState, data, draggingId, fetchData, updateDropPreview]);

  const handleDragOver = useCallback((event, targetDate) => {
    const job = allJobs.find((item) => item.id === draggingId);
    if (!job?.isDraggable) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    updateDropPreview(event, targetDate);
  }, [allJobs, draggingId, updateDropPreview]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Fetching schedule…
      </div>
    );
  }

  if (!data) return null;

  if (data.online === false) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-gray-500">
        <WifiOff className="w-8 h-8 text-gray-600" />
        <p className="text-sm font-medium">Agent offline</p>
        <p className="text-xs text-gray-600">{data.error || 'Could not connect'}</p>
      </div>
    );
  }

  const weekLabel = `${weekDates[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekDates[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  const dayIdx = (dayDate.getDay() + 6) % 7;
  const dayJobs = jobs.filter((job) => occursOnDate(job, dayDate));
  const dayLayout = computeLayout(dayJobs);

  return (
    <div className="flex flex-col h-full max-w-full">
      <div className="mb-4 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
              <CalIcon className="w-5 h-5 text-coral-500" />
              {AGENTS.find((a) => a.id === activeAgent)?.label ?? 'Schedule'}
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">
              {data.total} cron jobs · drag one-time tiles to reschedule · recurring jobs stay locked
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-sky-50 rounded-lg p-1">
              <button
                onClick={() => setCalView('week')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${calView === 'week' ? 'bg-ocean-500 text-white' : 'text-gray-600 hover:text-ocean-700'}`}
              >
                Week
              </button>
              <button
                onClick={() => setCalView('day')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${calView === 'day' ? 'bg-ocean-500 text-white' : 'text-gray-600 hover:text-ocean-700'}`}
              >
                Day
              </button>
            </div>
            <button onClick={() => fetchData()} className="p-2 text-gray-500 hover:text-ocean-700 hover:bg-sky-50 rounded-lg transition" title="Refresh">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {notice && (
          <div className={`rounded-xl border px-4 py-3 text-sm ${
            notice.type === 'error'
              ? 'bg-coral-500/10 border-coral-200 text-coral-600'
              : 'bg-emerald-950/30 border-emerald-500/30 text-emerald-200'
          }`}>
            {notice.text}
          </div>
        )}

        <Legend summary={data} />
        <CategoryFilter active={filterCat} counts={catCounts} onChange={setFilterCat} />
      </div>

      {calView === 'week' && (
        <div className="mb-3 flex items-center justify-between bg-white border border-ocean-100 rounded-xl px-4 py-2">
          <button onClick={() => setDayDate((d) => addDays(d, -7))} className="p-1.5 text-gray-600 hover:text-ocean-700 hover:bg-sky-50 rounded-lg transition">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="text-center">
            <span className="text-gray-800 font-semibold">{weekLabel}</span>
            {weekDates.some((date) => sameLocalDate(date, new Date())) && <span className="ml-2 text-xs bg-coral-500/15 text-coral-500 px-2 py-0.5 rounded-full">This week</span>}
          </div>
          <div className="flex items-center gap-1">
            {dayDiff(new Date(), weekStart) < 0 || dayDiff(new Date(), weekStart) > 6 ? (
              <button onClick={() => setDayDate(new Date())} className="text-xs text-ocean-400 hover:text-ocean-300 px-2 py-1 rounded-lg hover:bg-sky-50 transition mr-1">
                Today
              </button>
            ) : null}
            <button onClick={() => setDayDate((d) => addDays(d, 7))} className="p-1.5 text-gray-600 hover:text-ocean-700 hover:bg-sky-50 rounded-lg transition">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {calView === 'day' && (
        <div className="mb-3 flex items-center justify-between bg-white border border-ocean-100 rounded-xl px-4 py-2">
          <button onClick={() => setDayDate((d) => addDays(d, -1))} className="p-1.5 text-gray-600 hover:text-ocean-700 hover:bg-sky-50 rounded-lg transition">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="text-center">
            <span className="text-gray-800 font-semibold">
              {dayDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </span>
            {isToday(dayDate) && <span className="ml-2 text-xs bg-coral-500/15 text-coral-500 px-2 py-0.5 rounded-full">Today</span>}
          </div>
          <div className="flex items-center gap-1">
            {!isToday(dayDate) && (
              <button onClick={() => setDayDate(new Date())} className="text-xs text-ocean-400 hover:text-ocean-300 px-2 py-1 rounded-lg hover:bg-sky-50 transition mr-1">
                Today
              </button>
            )}
            <button onClick={() => setDayDate((d) => addDays(d, 1))} className="p-1.5 text-gray-600 hover:text-ocean-700 hover:bg-sky-50 rounded-lg transition">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {calView === 'week' && (
        <div className="flex flex-col flex-1 bg-white border border-ocean-100 rounded-xl overflow-hidden">
          <div className="flex shrink-0 border-b border-ocean-100 bg-white sticky top-0 z-10">
            <div className="w-12 shrink-0 border-r border-ocean-100" />
            {weekDates.map((date, i) => (
              <div key={dateKey(date)} className={`flex-1 min-w-0 py-2 text-center border-r border-ocean-100 last:border-0 ${dateKey(date) === todayKey ? 'bg-ocean-900/30' : ''}`}>
                <p className={`text-xs font-semibold uppercase tracking-wider ${dateKey(date) === todayKey ? 'text-ocean-400' : 'text-gray-500'}`}>{DAYS[i]}</p>
                <p className="text-xs text-gray-600 mt-0.5">{date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                <p className="text-xs text-gray-600 mt-0.5">{byDay[i].length}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-1 overflow-y-auto" ref={gridRef}>
            <div className="w-12 shrink-0 border-r border-ocean-100 relative" style={{ minHeight: `${TOTAL_H}px` }}>
              {Array.from({ length: 24 }, (_, h) => (
                <div key={h} className="absolute w-full flex items-start justify-end pr-2 pt-1" style={{ top: `${h * HOUR_PX}px`, height: `${HOUR_PX}px` }}>
                  <span className="text-xs text-gray-600 font-mono leading-none">
                    {h === 0 ? '12A' : h < 12 ? `${h}A` : h === 12 ? '12P' : `${h - 12}P`}
                  </span>
                </div>
              ))}
            </div>

            {weekDates.map((date, idx) => (
              <div
                key={dateKey(date)}
                onDragOver={(event) => handleDragOver(event, date)}
                onDrop={(event) => handleDrop(event, date)}
                onDragLeave={() => setDropPreview((current) => current?.dayKey === dateKey(date) ? null : current)}
                className={`flex-1 min-w-0 relative border-r border-ocean-100 last:border-0 ${dateKey(date) === todayKey ? 'bg-ocean-900/10' : ''} ${draggingId ? 'bg-white/[0.01]' : ''}`}
                style={{ height: `${TOTAL_H}px` }}
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} className="absolute w-full border-t border-ocean-100" style={{ top: `${h * HOUR_PX}px` }} />
                ))}
                {dateKey(date) === todayKey && <NowLine />}
                {dropPreview?.dayKey === dateKey(date) && <DropPreview preview={dropPreview} />}
                {byDay[idx].map((job) => (
                  <CronTile
                    key={job.id}
                    job={job}
                    layout={layouts[idx].get(job.id) || { col: 0, total: 1 }}
                    onClick={setSelected}
                    onDragStart={handleDragStart}
                    onDragEnd={clearDragState}
                    saving={savingJobId === job.id}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {calView === 'day' && (
        <div className="flex flex-col flex-1 bg-white border border-ocean-100 rounded-xl overflow-hidden">
          <div className="flex shrink-0 border-b border-ocean-100 bg-white sticky top-0 z-10">
            <div className="w-14 shrink-0 border-r border-ocean-100" />
            <div className={`flex-1 py-2 text-center ${isToday(dayDate) ? 'bg-ocean-900/30' : ''}`}>
              <p className={`text-xs font-semibold uppercase tracking-wider ${isToday(dayDate) ? 'text-ocean-400' : 'text-gray-500'}`}>
                {dayDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              </p>
              <p className="text-xs text-gray-600 mt-0.5">{dayJobs.length} job{dayJobs.length !== 1 ? 's' : ''}</p>
            </div>
          </div>

          <div className="flex flex-1 overflow-y-auto" ref={gridRef}>
            <div className="w-14 shrink-0 border-r border-ocean-100 relative" style={{ minHeight: `${TOTAL_H}px` }}>
              {Array.from({ length: 24 }, (_, h) => (
                <div key={h} className="absolute w-full flex items-start justify-end pr-2 pt-1" style={{ top: `${h * HOUR_PX}px`, height: `${HOUR_PX}px` }}>
                  <span className="text-xs text-gray-600 font-mono leading-none">
                    {h === 0 ? '12A' : h < 12 ? `${h}A` : h === 12 ? '12P' : `${h - 12}P`}
                  </span>
                </div>
              ))}
            </div>

            <div
              onDragOver={(event) => handleDragOver(event, dayDate)}
              onDrop={(event) => handleDrop(event, dayDate)}
              onDragLeave={() => setDropPreview((current) => current?.dayKey === dateKey(dayDate) ? null : current)}
              className={`flex-1 relative ${isToday(dayDate) ? 'bg-ocean-900/10' : ''} ${draggingId ? 'bg-white/[0.01]' : ''}`}
              style={{ height: `${TOTAL_H}px` }}
            >
              {Array.from({ length: 24 }, (_, h) => (
                <div key={h} className="absolute w-full border-t border-ocean-100" style={{ top: `${h * HOUR_PX}px` }} />
              ))}
              {isToday(dayDate) && <NowLine />}
              {dropPreview?.dayKey === dateKey(dayDate) && <DropPreview preview={dropPreview} />}
              {dayJobs.map((job) => (
                <CronTile
                  key={job.id}
                  job={job}
                  layout={dayLayout.get(job.id) || { col: 0, total: 1 }}
                  onClick={setSelected}
                  onDragStart={handleDragStart}
                  onDragEnd={clearDragState}
                  saving={savingJobId === job.id}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {selected && !editing && (
        <DetailModal job={selected} onClose={() => setSelected(null)} onEdit={(j) => { setSelected(null); setEditing(j); }} />
      )}
      {editing && (
        <EditModal job={editing} onClose={() => setEditing(null)} onSaved={() => fetchData({ background: true })} />
      )}
    </div>
  );
}
