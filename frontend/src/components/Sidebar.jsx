import { useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  FolderOpen, Monitor, ChevronDown, ChevronRight, Database,
  CalendarDays, LayoutDashboard, Users, Brain, GripVertical, Radio
} from 'lucide-react';
import { useStore } from '../store';

const ICON_MAP = {
  LayoutDashboard,
  Brain,
  Monitor,
  CalendarDays,
  Users,
  FolderOpen,
  Radio,
};

const DEFAULT_NAV = [
  { id: 'home',      label: 'Home',              path: '/',          icon: 'LayoutDashboard', section: 'main' },
  { id: 'memory',    label: 'Memory',            path: '/memory',    icon: 'Brain',           section: 'main' },
  { id: 'resources', label: 'Machine Resources',  path: '/resources', icon: 'Monitor',         section: 'monitor' },
  { id: 'calendar',  label: 'Schedule',           path: '/calendar',  icon: 'CalendarDays',    section: 'monitor' },
  { id: 'team',      label: 'Team',              path: '/team',      icon: 'Users',           section: 'monitor' },
  { id: 'sessions',  label: 'Sessions',           path: '/sessions',  icon: 'Radio',           section: 'monitor' },
  { id: 'files',     label: 'All Files',          path: '/files',     icon: 'FolderOpen',      section: 'vault' },
];

const STORAGE_KEY = 'clawmissions_nav_order';

function getOrderedNav() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const order = JSON.parse(saved);
      const navMap = Object.fromEntries(DEFAULT_NAV.map(n => [n.id, n]));
      const ordered = order.map(id => navMap[id]).filter(Boolean);
      // Add any new items not in saved order
      const seen = new Set(order);
      DEFAULT_NAV.forEach(n => { if (!seen.has(n.id)) ordered.push(n); });
      return ordered;
    }
  } catch {}
  return [...DEFAULT_NAV];
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export default function Sidebar({ onRefreshTags }) {
  const { stats, sidebarOpen, setSidebarOpen } = useStore();
  const [navItems, setNavItems] = useState(getOrderedNav);
  const [dragIdx, setDragIdx] = useState(null);
  const [overIdx, setOverIdx] = useState(null);
  const dragRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();

  const goTo = (path) => {
    navigate(path);
    setSidebarOpen(false);
  };

  const handleDragStart = (e, idx) => {
    setDragIdx(idx);
    dragRef.current = idx;
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, idx) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setOverIdx(idx);
  };

  const handleDragLeave = () => {
    setOverIdx(null);
  };

  const handleDrop = (e, dropIdx) => {
    e.preventDefault();
    const fromIdx = dragRef.current;
    if (fromIdx === null || fromIdx === dropIdx) {
      setDragIdx(null);
      setOverIdx(null);
      return;
    }
    const updated = [...navItems];
    const [moved] = updated.splice(fromIdx, 1);
    updated.splice(dropIdx, 0, moved);
    setNavItems(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated.map(n => n.id)));
    setDragIdx(null);
    setOverIdx(null);
  };

  const handleDragEnd = () => {
    setDragIdx(null);
    setOverIdx(null);
  };

  return (
    <aside className={`w-64 bg-gray-900 border-r border-gray-800 flex flex-col shrink-0 overflow-y-auto
      fixed md:relative inset-y-0 left-0 z-40 transform transition-transform duration-200 ease-in-out
      ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>

      {/* Nav Items */}
      <div className="p-4 space-y-1">
        {navItems.map((item, idx) => {
          const IconComp = ICON_MAP[item.icon] || FolderOpen;
          const isActive = item.path === '/'
            ? location.pathname === '/'
            : location.pathname.startsWith(item.path);

          return (
            <div
              key={item.id}
              draggable
              onDragStart={(e) => handleDragStart(e, idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, idx)}
              onDragEnd={handleDragEnd}
              className={`group transition-all ${dragIdx === idx ? 'opacity-40' : ''} ${
                overIdx === idx && dragIdx !== idx ? 'border-t-2 border-red-500' : 'border-t-2 border-transparent'
              }`}
            >
              <button
                onClick={() => goTo(item.path)}
                className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm transition ${
                  isActive
                    ? 'bg-red-500/20 text-red-400'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                }`}
              >
                <GripVertical className="w-3 h-3 text-gray-600 opacity-0 group-hover:opacity-100 transition cursor-grab shrink-0" />
                <IconComp className="w-4 h-4 shrink-0" />
                <span className="flex-1 text-left">{item.label}</span>
              </button>
            </div>
          );
        })}
      </div>

      {/* Storage Stats — pinned at bottom */}
      {stats && (
        <div className="mt-auto p-4 border-t border-gray-800">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Storage</h3>
          <div className="flex items-center gap-2 text-gray-400 text-sm">
            <Database className="w-4 h-4 shrink-0" />
            <span>{formatBytes(stats.total_size)}</span>
          </div>
          <p className="text-gray-600 text-xs mt-1">{stats.total_files ?? 0} files</p>
        </div>
      )}
    </aside>
  );
}
