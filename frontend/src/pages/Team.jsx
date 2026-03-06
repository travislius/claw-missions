import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Wifi, WifiOff, Monitor, CalendarDays, ChevronRight,
  Apple, Cpu, MemoryStick, HardDrive, MapPin, RefreshCw
} from 'lucide-react';
import api from '../api';

const OS_ICON = {
  macOS:   <Apple className="w-3.5 h-3.5" />,
  windows: <Monitor className="w-3.5 h-3.5" />,
};

const ROLE_COLOR = {
  tia:    'border-ocean-500/40 bg-ocean-500/5',
  dexter: 'border-amber-500/40 bg-amber-500/5',
  sia:    'border-purple-500/40 bg-purple-500/5',
};

const ACCENT = {
  tia:    { text: 'text-ocean-400',  badge: 'bg-ocean-500/20 text-ocean-300',   dot: 'bg-ocean-400' },
  dexter: { text: 'text-amber-400',  badge: 'bg-amber-500/20 text-amber-300',   dot: 'bg-amber-400' },
  sia:    { text: 'text-purple-400', badge: 'bg-purple-500/20 text-purple-300', dot: 'bg-purple-400' },
};

function StatusBadge({ online, hasHost }) {
  if (online) return (
    <span className="flex items-center gap-1.5 text-xs text-green-400">
      <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" /> Online
    </span>
  );
  if (!hasHost) return (
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

function MemberCard({ member, onViewCalendar }) {
  const a = ACCENT[member.id] || ACCENT.tia;

  return (
    <div className={`bg-gray-900 border rounded-2xl overflow-hidden ${ROLE_COLOR[member.id] || 'border-gray-800'}`}>
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
        <StatusBadge online={member.online} hasHost={member.has_host} />
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

      {/* Footer actions */}
      <div className="px-4 pb-4 flex gap-2">
        <button
          onClick={() => onViewCalendar(member.id)}
          disabled={!member.online}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition
            ${member.online
              ? `${a.badge} hover:brightness-125 cursor-pointer`
              : 'bg-gray-800 text-gray-600 cursor-not-allowed'}`}
        >
          <CalendarDays className="w-3.5 h-3.5" />
          {member.online ? 'View Schedule' : 'Offline'}
          {member.online && <ChevronRight className="w-3 h-3" />}
        </button>
      </div>

      {/* Connection hint for offline machines */}
      {!member.online && member.has_host && (
        <div className="mx-4 mb-4 px-3 py-2 bg-gray-800/60 rounded-lg">
          <p className="text-xs text-gray-600 flex items-center gap-1.5">
            <WifiOff className="w-3 h-3" /> SSH key auth needed to connect
          </p>
        </div>
      )}
      {!member.online && !member.has_host && (
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
  const navigate = useNavigate();

  const fetchTeam = async () => {
    try {
      const res = await api.get('/crons/team');
      setMembers(res.data.members || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchTeam(); }, []);

  const onlineCount = members.filter(m => m.online).length;

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
            onViewCalendar={(id) => navigate(`/calendar?agent=${id}`)}
          />
        ))}
      </div>

      {/* Coming soon hint */}
      <div className="mt-6 p-4 bg-gray-900 border border-gray-800 rounded-xl">
        <p className="text-xs text-gray-600 text-center">
          🔜 Machine Resources per member · Live process list · Cross-agent task coordination
        </p>
      </div>
    </div>
  );
}
