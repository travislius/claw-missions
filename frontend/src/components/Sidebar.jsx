import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Tag, HardDrive, FolderOpen, Plus, Pencil, Trash2, Settings,
  Monitor, ChevronDown, ChevronRight, Database
} from 'lucide-react';
import { useStore } from '../store';
import { createTag, updateTag, deleteTag as apiDeleteTag } from '../api';

const PRESET_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f97316',
  '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6',
];

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function InlineTagEdit({ tag, onDone }) {
  const [name, setName] = useState(tag?.name || '');
  const [color, setColor] = useState(tag?.color || PRESET_COLORS[0]);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (tag?.id) await updateTag(tag.id, { name: name.trim(), color });
      else await createTag({ name: name.trim(), color });
      onDone(true);
    } catch (err) {
      alert(err.response?.data?.detail || 'Error');
    } finally { setSaving(false); }
  };

  return (
    <div className="px-3 py-2 space-y-2 bg-gray-800/50 rounded-lg mx-2">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && save()}
        placeholder="Tag name"
        className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-ocean-500"
      />
      <div className="flex flex-wrap gap-1.5">
        {PRESET_COLORS.map((c) => (
          <button
            key={c}
            onClick={() => setColor(c)}
            className={`w-5 h-5 rounded-full ${color === c ? 'ring-2 ring-white ring-offset-1 ring-offset-gray-800' : ''}`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
      <div className="flex gap-2">
        <button onClick={save} disabled={saving || !name.trim()} className="text-xs text-ocean-400 hover:text-ocean-300 disabled:opacity-40">
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button onClick={() => onDone(false)} className="text-xs text-gray-500 hover:text-gray-300">Cancel</button>
      </div>
    </div>
  );
}

export default function Sidebar({ onRefreshTags }) {
  const { tags, selectedTag, setSelectedTag, stats, sidebarOpen, setSidebarOpen } = useStore();
  const [managing, setManaging] = useState(false);
  const [editingTag, setEditingTag] = useState(null);
  const [vaultOpen, setVaultOpen] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  const isResources = location.pathname === '/resources';

  const handleDelete = async (tag) => {
    if (!confirm(`Delete tag "${tag.name}"?`)) return;
    try {
      await apiDeleteTag(tag.id);
      if (selectedTag === tag.id) setSelectedTag(null);
      onRefreshTags?.();
    } catch { alert('Failed to delete'); }
  };

  const handleEditDone = (saved) => {
    setEditingTag(null);
    if (saved) onRefreshTags?.();
  };

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
          <>
            {/* All Files */}
            <button
              onClick={() => { setSelectedTag(null); goTo('/'); }}
              className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm transition ${
                !selectedTag && !isResources
                  ? 'bg-ocean-600/20 text-ocean-400'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`}
            >
              <FolderOpen className="w-4 h-4" />
              All Files
            </button>

            {/* Tags header */}
            <div className="flex items-center justify-between mt-3 mb-1 px-1">
              <span className="text-xs text-gray-600 uppercase tracking-wider">Tags</span>
              <div className="flex gap-1">
                <button
                  onClick={() => setEditingTag('new')}
                  className="p-1 text-gray-600 hover:text-ocean-400 transition"
                  title="New tag"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
                {tags.length > 0 && (
                  <button
                    onClick={() => setManaging(!managing)}
                    className="p-1 text-gray-600 hover:text-gray-400 transition"
                    title="Manage tags"
                  >
                    <Settings className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-0.5">
              {tags.map((tag) => (
                <div key={tag.id} className="group flex items-center">
                  <button
                    onClick={() => { setSelectedTag(tag.id === selectedTag ? null : tag.id); goTo('/'); }}
                    className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition ${
                      selectedTag === tag.id
                        ? 'bg-ocean-600/20 text-ocean-400'
                        : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
                    <span className="truncate">{tag.name}</span>
                  </button>
                  {managing && (
                    <div className="flex shrink-0 mr-1">
                      <button onClick={() => setEditingTag(tag)} className="p-1 text-gray-600 hover:text-white transition">
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button onClick={() => handleDelete(tag)} className="p-1 text-gray-600 hover:text-red-400 transition">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              ))}

              {editingTag && (
                <InlineTagEdit
                  tag={editingTag === 'new' ? null : editingTag}
                  onDone={handleEditDone}
                />
              )}

              {tags.length === 0 && !editingTag && (
                <p className="text-gray-600 text-xs px-3 py-2">No tags yet</p>
              )}
            </div>
          </>
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
