import { useState } from 'react';
import { X, Tag, Trash2, CheckSquare } from 'lucide-react';
import { useStore } from '../store';
import { bulkAssignTags, bulkDeleteFiles } from '../api';

export default function BulkBar({ onRefresh }) {
  const { selectedFiles, clearSelection, selectAllFiles, files, tags } = useStore();
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const count = selectedFiles.size;

  if (count === 0) return null;

  const handleBulkTag = async (tagIds) => {
    setBusy(true);
    try {
      await bulkAssignTags([...selectedFiles], tagIds);
      setShowTagPicker(false);
      clearSelection();
      onRefresh();
    } catch (err) {
      alert('Failed to tag files');
    } finally { setBusy(false); }
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Delete ${count} file${count > 1 ? 's' : ''}? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await bulkDeleteFiles([...selectedFiles]);
      clearSelection();
      onRefresh();
    } catch (err) {
      alert('Failed to delete files');
    } finally { setBusy(false); }
  };

  return (
    <div className="sticky top-0 z-40 bg-ocean-600/95 backdrop-blur border border-ocean-500 rounded-xl px-4 py-3 flex items-center gap-4 shadow-lg">
      <span className="text-sm text-gray-800 font-medium">{count} selected</span>

      <div className="flex items-center gap-2 flex-1">
        <button
          onClick={() => selectAllFiles()}
          className="inline-flex items-center gap-1 text-xs text-ocean-200 hover:text-ocean-700 transition"
        >
          <CheckSquare className="w-3.5 h-3.5" /> Select all
        </button>
      </div>

      <div className="flex items-center gap-2 relative">
        {/* Tag */}
        <button
          onClick={() => setShowTagPicker(!showTagPicker)}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white/10 hover:bg-white/20 text-gray-800 rounded-lg transition disabled:opacity-40"
        >
          <Tag className="w-3.5 h-3.5" /> Tag
        </button>

        {showTagPicker && (
          <div className="absolute bottom-full right-12 mb-2 bg-sky-50 border border-ocean-200 rounded-lg shadow-xl p-3 min-w-[180px]">
            <p className="text-xs text-gray-500 mb-2">Apply tag to selected files:</p>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {tags.map((tag) => (
                <button
                  key={tag.id}
                  onClick={() => handleBulkTag([tag.id])}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-sky-50 transition text-left"
                >
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
                  <span className="text-sm text-gray-700">{tag.name}</span>
                </button>
              ))}
              {tags.length === 0 && <p className="text-xs text-gray-600">No tags — create one first</p>}
            </div>
          </div>
        )}

        {/* Delete */}
        <button
          onClick={handleBulkDelete}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-coral-500/15 hover:bg-coral-600/30 text-coral-600 rounded-lg transition disabled:opacity-40"
        >
          <Trash2 className="w-3.5 h-3.5" /> Delete
        </button>

        {/* Clear */}
        <button
          onClick={clearSelection}
          className="p-1.5 text-ocean-200 hover:text-ocean-700 transition"
          title="Clear selection"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
