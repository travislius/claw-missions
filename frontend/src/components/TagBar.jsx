import { useState } from 'react';
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react';
import { useStore } from '../store';
import { createTag, updateTag, deleteTag as apiDeleteTag } from '../api';

const PRESET_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f97316',
  '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6',
];

function TagRow({ tag, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 rounded-xl border px-3 py-2 text-sm text-left transition ${
        selected
          ? 'border-ocean-300 ring-2 ring-ocean-500/30 bg-sky-50'
          : 'border-ocean-100 bg-white hover:border-ocean-200 hover:bg-sky-50/70'
      }`}
    >
      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
      <span className="text-gray-700 truncate">{tag.name}</span>
      <span className="ml-auto text-xs text-gray-400">{tag.file_count ?? 0}</span>
    </button>
  );
}

function TagModal({ tag, onClose, onSaved }) {
  const [name, setName] = useState(tag?.name || '');
  const [color, setColor] = useState(tag?.color || PRESET_COLORS[0]);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (tag?.id) {
        await updateTag(tag.id, { name: name.trim(), color });
      } else {
        await createTag({ name: name.trim(), color });
      }
      onSaved();
      onClose();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to save tag');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-ocean-900/20 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white border border-ocean-200 rounded-xl p-6 w-full max-w-sm shadow-2xl">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">{tag?.id ? 'Edit Tag' : 'New Tag'}</h3>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Tag name"
          className="w-full bg-sky-50 border border-ocean-200 rounded-lg px-3 py-2 text-sm text-gray-800 placeholder-ocean-400 focus:outline-none focus:border-ocean-500 mb-4"
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
        />
        <div className="flex flex-wrap gap-2 mb-4">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`w-7 h-7 rounded-full transition-all ${color === c ? 'ring-2 ring-offset-2 ring-offset-gray-900 ring-white scale-110' : 'hover:scale-105'}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-ocean-700 transition">Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="px-4 py-2 text-sm bg-ocean-600 hover:bg-ocean-500 text-white rounded-lg transition disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TagBar({ onRefreshTags }) {
  const { tags, selectedTag, setSelectedTag } = useStore();
  const [showModal, setShowModal] = useState(false);
  const [editTag, setEditTag] = useState(null);
  const [showManage, setShowManage] = useState(false);
  const [showTags, setShowTags] = useState(false);

  const handleDelete = async (tag) => {
    if (!confirm(`Delete tag "${tag.name}"? This won't delete the files.`)) return;
    try {
      await apiDeleteTag(tag.id);
      if (selectedTag === tag.id) setSelectedTag(null);
      onRefreshTags();
    } catch (err) {
      alert('Failed to delete tag');
    }
  };

  const handleSaved = () => {
    onRefreshTags();
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setShowTags((open) => !open)}
          className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
            showTags || selectedTag
              ? 'border-ocean-300 bg-sky-50 text-ocean-700'
              : 'border-ocean-100 bg-white text-gray-700 hover:border-ocean-200 hover:bg-sky-50/70'
          }`}
        >
          {showTags ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          <span>Tags ({tags.length})</span>
        </button>
        <button
          onClick={() => { setEditTag(null); setShowModal(true); }}
          className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg text-xs text-gray-500 hover:text-ocean-700 hover:bg-sky-50 border border-dashed border-ocean-200 transition"
        >
          <Plus className="w-3 h-3" /> + Tag
        </button>
        {tags.length > 0 && (
          <button
            onClick={() => setShowManage(!showManage)}
            className="text-xs text-gray-600 hover:text-ocean-700 transition ml-1"
          >
            {showManage ? 'Done' : 'Manage'}
          </button>
        )}
      </div>

      {showTags && tags.length > 0 && (
        <div className="rounded-xl border border-ocean-100 bg-white p-3 shadow-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
            {tags.map((tag) => (
              <TagRow
                key={tag.id}
                tag={tag}
                selected={selectedTag === tag.id}
                onClick={() => setSelectedTag(selectedTag === tag.id ? null : tag.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Manage list */}
      {showManage && tags.length > 0 && (
        <div className="bg-sky-50/80 border border-ocean-100 rounded-lg p-3 space-y-1">
          {tags.map((tag) => (
            <div key={tag.id} className="flex items-center gap-2 group">
              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
              <span className="text-sm text-gray-700 flex-1 truncate">{tag.name}</span>
              <button
                onClick={() => { setEditTag(tag); setShowModal(true); }}
                className="p-1 text-gray-600 hover:text-ocean-700 opacity-0 group-hover:opacity-100 transition"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => handleDelete(tag)}
                className="p-1 text-gray-600 hover:text-coral-500 opacity-0 group-hover:opacity-100 transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit modal */}
      {showModal && (
        <TagModal tag={editTag} onClose={() => setShowModal(false)} onSaved={handleSaved} />
      )}
    </div>
  );
}
