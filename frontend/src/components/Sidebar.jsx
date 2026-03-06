import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  FolderOpen, Monitor, ChevronDown, ChevronRight, Database, CalendarDays
} from 'lucide-react';
import { useStore } from '../store';

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export default function Sidebar({ onRefreshTags }) {
  const { stats, sidebarOpen, setSidebarOpen } = useStore();
  const [vaultOpen, setVaultOpen] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  const isResources = location.pathname === '/resources';
  const isCalendar  = location.pathname === '/calendar';

  const goTo = (path) => {
    navigate(path);
    setSidebarOpen(false);
  };

  return (
    <aside className={`w-64 bg-gray-900 dark:bg-gray-900 bg-gray-50 border-r border-gray-800 dark:border-gray-800 border-gray-200 flex flex-col shrink-0 overflow-y-auto
      fixed md:relative inset-y-0 left-0 z-40 transform transition-transform duration-200 ease-in-out
      ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>

      {/* ── Machine Resources ── */}
      <div className="p-4 pb-2">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Monitor</p>
        <button
          onClick={() => goTo('/resources')}
          className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm transition ${
            isResources
              ? 'bg-red-500/20 text-red-400'
              : 'text-gray-400 hover:bg-gray-800 hover:text-white'
          }`}
        >
          <Monitor className="w-4 h-4" />
          Machine Resources
        </button>
        <button
          onClick={() => goTo('/calendar')}
          className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm transition ${
            isCalendar
              ? 'bg-red-500/20 text-red-400'
              : 'text-gray-400 hover:bg-gray-800 hover:text-white'
          }`}
        >
          <CalendarDays className="w-4 h-4" />
          Tia's Schedule
        </button>
      </div>

      {/* ── File Vault ── */}
      <div className="p-4 pt-2">
        <button
          className="w-full flex items-center justify-between mb-2 group"
          onClick={() => setVaultOpen(!vaultOpen)}
        >
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider group-hover:text-gray-400 transition">
            File Vault
          </p>
          {vaultOpen
            ? <ChevronDown className="w-3.5 h-3.5 text-gray-600" />
            : <ChevronRight className="w-3.5 h-3.5 text-gray-600" />
          }
        </button>

        {vaultOpen && (
          <button
            onClick={() => goTo('/')}
            className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm transition ${
              !isResources && !isCalendar
                ? 'bg-ocean-600/20 text-ocean-400'
                : 'text-gray-400 hover:bg-gray-800 hover:text-white'
            }`}
          >
            <FolderOpen className="w-4 h-4" />
            All Files
          </button>
        )}
      </div>

      {/* Storage Stats */}
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
