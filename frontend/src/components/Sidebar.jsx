import { useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  FolderOpen, CalendarDays, LayoutDashboard, Users, Brain, GripVertical, Radio, FolderKanban, ListTodo, Puzzle, Bot, Shield, NotebookText,
  Crosshair, LogOut, Menu,
} from 'lucide-react';
import { useStore } from '../store';

const ICON_MAP = {
  LayoutDashboard,
  Brain,
  CalendarDays,
  Users,
  FolderOpen,
  Radio,
  FolderKanban,
  ListTodo,
  Puzzle,
  Bot,
  Shield,
  NotebookText,
};

const DEFAULT_NAV = [
  { id: 'home',      label: 'Home',              path: '/',          icon: 'LayoutDashboard', section: 'main' },
  { id: 'tasks',     label: 'Tasks',             path: '/tasks',     icon: 'ListTodo',        section: 'main' },
  { id: 'memory',    label: 'Memory',            path: '/memory',    icon: 'Brain',           section: 'main' },
  { id: 'projects',  label: 'Projects',           path: '/projects',  icon: 'FolderKanban',    section: 'main' },
  { id: 'notes',     label: 'Notes',              path: '/notes',     icon: 'NotebookText',    section: 'main' },
  { id: 'calendar',  label: 'Schedule',           path: '/calendar',  icon: 'CalendarDays',    section: 'monitor' },
  { id: 'monitor',   label: 'Monitor',            path: '/monitor',   icon: 'Shield',          section: 'monitor' },
  { id: 'team',      label: 'Team',              path: '/team',      icon: 'Users',           section: 'monitor' },
  { id: 'sessions',  label: 'Sessions',           path: '/sessions',  icon: 'Radio',           section: 'monitor' },
  { id: 'agents',    label: 'Agents',             path: '/agents',    icon: 'Bot',             section: 'monitor' },
  { id: 'files',     label: 'Documents',          path: '/files',     icon: 'FolderOpen',      section: 'vault' },
  { id: 'skills',    label: 'Skills',             path: '/skills',    icon: 'Puzzle',          section: 'vault' },
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

export default function Sidebar({ onRefreshTags }) {
  const { stats, sidebarOpen, setSidebarOpen, logout } = useStore();
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
    <aside className={`w-64 bg-gradient-to-b from-sky-100 to-ocean-50 border-r border-ocean-200 flex flex-col shrink-0 overflow-y-auto
      fixed md:relative inset-y-0 left-0 z-40 transform transition-transform duration-200 ease-in-out
      ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>

      {/* Brand header */}
      <div className="px-4 pt-4 pb-3 flex items-center gap-2 border-b border-ocean-200 shrink-0">
        <div className="flex items-center gap-2 flex-1 cursor-pointer" onClick={() => goTo('/')}>
          <Crosshair className="w-5 h-5 text-ocean-500" />
          <span className="text-base font-bold text-gray-800">Companion</span>
        </div>
        <button onClick={logout} className="p-1.5 rounded-lg text-gray-500 hover:text-coral-500 hover:bg-white/70 transition" title="Logout">
          <LogOut className="w-4 h-4" />
        </button>
      </div>

      {/* Nav Items */}
      <div className="p-4 space-y-1 flex-1">
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
                overIdx === idx && dragIdx !== idx ? 'border-t-2 border-ocean-500' : 'border-t-2 border-transparent'
              }`}
            >
              <button
                onClick={() => goTo(item.path)}
                className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-r-xl text-sm transition ${
                  isActive
                    ? 'bg-ocean-100 text-ocean-800 border-l-4 border-ocean-500'
                    : 'text-gray-700 hover:bg-ocean-50 hover:text-ocean-700 border-l-4 border-transparent'
                }`}
              >
                <GripVertical className="w-3 h-3 text-ocean-300 opacity-0 group-hover:opacity-100 transition cursor-grab shrink-0" />
                <IconComp className="w-4 h-4 shrink-0" />
                <span className="flex-1 text-left">{item.label}</span>
              </button>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
