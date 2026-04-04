import { useState, useEffect, useMemo } from 'react';
import {
  Wifi, WifiOff, Monitor, Terminal,
  Apple, Cpu, MapPin, RefreshCw, X
} from 'lucide-react';
import api from '../api';
import ResourcePanel from '../components/ResourcePanel';

const OS_ICON = {
  macOS:   <Apple className="w-3.5 h-3.5" />,
  windows: <Monitor className="w-3.5 h-3.5" />,
  linux:   <Terminal className="w-3.5 h-3.5" />,
};

const ROLE_COLOR = {
  tia:  'border-ocean-500/40 bg-ocean-500/5',
  max:  'border-amber-500/40 bg-amber-500/5',
  sia:  'border-purple-500/40 bg-purple-500/5',
  zed:  'border-zinc-500/40 bg-zinc-500/5',
};

const ACCENT = {
  tia:  { text: 'text-ocean-400',  badge: 'bg-ocean-500/20 text-ocean-300',   dot: 'bg-ocean-400' },
  max:  { text: 'text-amber-400',  badge: 'bg-amber-500/20 text-amber-300',   dot: 'bg-amber-400' },
  sia:  { text: 'text-purple-400', badge: 'bg-purple-500/20 text-purple-300', dot: 'bg-purple-400' },
  zed:  { text: 'text-zinc-300',   badge: 'bg-zinc-500/20 text-zinc-300',     dot: 'bg-zinc-400' },
};

const ORDER_KEY = 'clawmissions_team_order';
const MOBILE_MEMBER_IDS = new Set(['sia']);
const DEVICE_ENDPOINTS = {
  tia: '/system/resources',
  max: '/system/resources/max',
  zed: '/system/resources/zed',
};
const RESOURCE_ACCENTS = {
  tia: 'ocean',
  max: 'amber',
  zed: 'zinc',
};

function sortMembers(members) {
  const saved = JSON.parse(localStorage.getItem(ORDER_KEY) || '[]');
  const rank = new Map(saved.map((id, idx) => [id, idx]));
  return [...members].sort((a, b) => {
    const ar = rank.has(a.id) ? rank.get(a.id) : Number.MAX_SAFE_INTEGER;
    const br = rank.has(b.id) ? rank.get(b.id) : Number.MAX_SAFE_INTEGER;
    if (ar !== br) return ar - br;
    return a.name.localeCompare(b.name);
  });
}

function persistOrder(members) {
  localStorage.setItem(ORDER_KEY, JSON.stringify(members.map((m) => m.id)));
}

function StatusBadge({ member }) {
  if (member.online) return (
    <span className="flex items-center gap-1.5 text-xs text-green-400">
      <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" /> Online
    </span>
  );
  if (MOBILE_MEMBER_IDS.has(member.id)) return (
    <span className="flex items-center gap-1.5 text-xs text-purple-300">
      <span className="w-2 h-2 rounded-full bg-purple-400" /> On the go
    </span>
  );
  if (!member.has_host) return (
    <span className="flex items-center gap-1.5 text-xs text-gray-500">
      <span className="w-2 h-2 rounded-full bg-gray-600" /> No connection
    </span>
  );
  return (
    <span className="flex items-center gap-1.5 text-xs text-gray-500">
      <span className="w-2 h-2 rounded-full bg-gray-600" /> Offline
    </span>
  );
}

function DeviceModal({ member, endpoint, onClose }) {
  const a = ACCENT[member.id] || ACCENT.tia;

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-5xl max-h-[90vh] overflow-y-auto bg-gray-950 border border-gray-800 rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 px-5 py-4 bg-gray-950/95 backdrop-blur border-b border-gray-800 flex items-start justify-between gap-4">
          <div>
            <p className={`text-xs font-semibold uppercase tracking-wider ${a.text}`}>Device Status</p>
            <h2 className="text-lg font-bold text-white mt-1">{member.name}</h2>
            <p className="text-xs text-gray-500 mt-0.5">{member.machine} / Live resource telemetry</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-gray-500 hover:text-white hover:bg-gray-800 transition"
            aria-label="Close device status"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5">
          <ResourcePanel endpoint={endpoint} accent={RESOURCE_ACCENTS[member.id] || 'ocean'} />
        </div>
      </div>
    </div>
  );
}

function MemberCard({ member, onViewDevice, onDragStart, onDragOver, onDrop, isDragging }) {
  const a = ACCENT[member.id] || ACCENT.tia;
  const deviceEndpoint = DEVICE_ENDPOINTS[member.id];
  const clickable = !!deviceEndpoint;

  return (
    <div
      draggable
      onDragStart={() => onDragStart(member.id)}
      onDragOver={(e) => onDragOver(e, member.id)}
      onDrop={() => onDrop(member.id)}
      onClick={() => clickable && onViewDevice(member)}
      className={`bg-gray-900 border rounded-2xl overflow-hidden transition ${ROLE_COLOR[member.id] || 'border-gray-800'} ${isDragging ? 'opacity-60 scale-[0.98]' : ''} ${clickable ? 'cursor-pointer hover:brightness-110' : 'cursor-move'}`}
      title={clickable ? 'Click for device status' : 'No device endpoint'}
    >
      {/* Header */}
      <div className="px-5 pt-5 pb-4 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl bg-gray-800`}>
            {member.emoji}
          </div>
          <div>
            <h3 className={`text-base font-bold ${a.text}`}>{member.name}</h3>
            <p className="text-xs text-gray-500">{member.role}</p>
          </div>
        </div>
        <StatusBadge member={member} />
      </div>

      {/* Specs */}
      <div className="px-5 pb-4 space-y-2">
        <div className="flex items-center gap-2 text-xs text-gray-400">
          {OS_ICON[member.os] || <Monitor className="w-3.5 h-3.5" />}
          <span className="font-medium text-gray-300">{member.machine}</span>
        </div>
        <div className="grid grid-cols-1 gap-1.5">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Cpu className="w-3 h-3 text-gray-600" />
            <span>{member.specs}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <MapPin className="w-3 h-3 text-gray-600" />
            <span>{member.location}</span>
          </div>
        </div>
      </div>

      {/* Connection hint for offline machines */}
      {!member.online && MOBILE_MEMBER_IDS.has(member.id) && (
        <div className="mx-4 mb-4 px-3 py-2 bg-purple-500/10 rounded-lg">
          <p className="text-xs text-purple-200 flex items-center gap-1.5">
            <Wifi className="w-3 h-3" /> Mobile machine — availability varies
          </p>
        </div>
      )}
      {!member.online && member.has_host && !MOBILE_MEMBER_IDS.has(member.id) && (
        <div className="mx-4 mb-4 px-3 py-2 bg-gray-800/60 rounded-lg">
          <p className="text-xs text-gray-600 flex items-center gap-1.5">
            <WifiOff className="w-3 h-3" /> SSH key auth needed to connect
          </p>
        </div>
      )}
      {!member.online && !member.has_host && !MOBILE_MEMBER_IDS.has(member.id) && (
        <div className="mx-4 mb-4 px-3 py-2 bg-gray-800/60 rounded-lg">
          <p className="text-xs text-gray-600 flex items-center gap-1.5">
            <WifiOff className="w-3 h-3" /> Tailscale IP not configured
          </p>
        </div>
      )}
    </div>
  );
}

export default function Team() {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draggingId, setDraggingId] = useState(null);
  const [activeDeviceMember, setActiveDeviceMember] = useState(null);

  const fetchTeam = async () => {
    try {
      const res = await api.get('/crons/team');
      setMembers(sortMembers(res.data.members || []));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchTeam(); }, []);

  const onlineCount = useMemo(
    () => members.filter(m => m.online || MOBILE_MEMBER_IDS.has(m.id)).length,
    [members]
  );

  const moveMember = (fromId, toId) => {
    if (!fromId || !toId || fromId === toId) return;
    setMembers((prev) => {
      const next = [...prev];
      const from = next.findIndex((m) => m.id === fromId);
      const to = next.findIndex((m) => m.id === toId);
      if (from === -1 || to === -1) return prev;
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      persistOrder(next);
      return next;
    });
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-gray-500">
      <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Pinging team…
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">The Team</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {onlineCount}/{members.length} machines online
          </p>
        </div>
        <button onClick={fetchTeam} className="p-2 text-gray-500 hover:text-white hover:bg-gray-800 rounded-lg transition">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {members.map(m => (
          <MemberCard
            key={m.id}
            member={m}
            isDragging={draggingId === m.id}
            onViewDevice={setActiveDeviceMember}
            onDragStart={setDraggingId}
            onDragOver={(e, id) => {
              e.preventDefault();
              if (draggingId && draggingId !== id) moveMember(draggingId, id);
            }}
            onDrop={() => setDraggingId(null)}
          />
        ))}
      </div>

      {activeDeviceMember && DEVICE_ENDPOINTS[activeDeviceMember.id] && (
        <DeviceModal
          member={activeDeviceMember}
          endpoint={DEVICE_ENDPOINTS[activeDeviceMember.id]}
          onClose={() => setActiveDeviceMember(null)}
        />
      )}
    </div>
  );
}
