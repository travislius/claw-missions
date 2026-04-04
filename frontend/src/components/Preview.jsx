import { useState } from 'react';
import { X, Download, Trash2, Tag, Plus, Check } from 'lucide-react';
import { downloadFile, deleteFile, assignTags, removeTag, getThumb } from '../api';
import { useStore } from '../store';

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDate(d) {
  return new Date(d).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function TagPicker({ file, onUpdate }) {
  const { tags } = useStore();
  const [open, setOpen] = useState(false);
  const fileTagIds = new Set((file.tags || []).map((t) => t.id));

  const toggle = async (tagId) => {
    try {
      if (fileTagIds.has(tagId)) {
        await removeTag(file.id, tagId);
      } else {
        await assignTags(file.id, [tagId]);
      }
      onUpdate();
    } catch (err) {
      console.error('Tag toggle failed', err);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-ocean-400 transition"
      >
        <Plus className="w-3 h-3" /> Add tag
      </button>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      {tags.map((tag) => (
        <button
          key={tag.id}
          onClick={() => toggle(tag.id)}
          className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium transition ${
            fileTagIds.has(tag.id) ? 'ring-1' : 'opacity-50 hover:opacity-100'
          }`}
          style={{
            backgroundColor: tag.color + '22',
            color: tag.color,
            ringColor: fileTagIds.has(tag.id) ? tag.color : undefined,
          }}
        >
          {fileTagIds.has(tag.id) && <Check className="w-2.5 h-2.5" />}
          {tag.name}
        </button>
      ))}
      <button onClick={() => setOpen(false)} className="text-xs text-gray-600 hover:text-gray-600 ml-1">Done</button>
    </div>
  );
}

export default function Preview({ file, onClose, onRefresh }) {
  const [imgErr, setImgErr] = useState(false);
  const [currentFile, setCurrentFile] = useState(file);

  const isImage = currentFile.mime_type?.startsWith('image/');
  const isPdf = currentFile.mime_type === 'application/pdf';
  const isVideo = currentFile.mime_type?.startsWith('video/');
  const isAudio = currentFile.mime_type?.startsWith('audio/');

  const handleDownload = async () => {
    const res = await downloadFile(currentFile.id);
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url; a.download = currentFile.name; a.click();
    URL.revokeObjectURL(url);
  };

  const handleDelete = async () => {
    if (!confirm(`Delete "${currentFile.name}"?`)) return;
    await deleteFile(currentFile.id);
    onClose();
    onRefresh?.();
  };

  const handleTagUpdate = () => {
    // Refresh the file data
    onRefresh?.();
    // We'd need to refetch file details — for now just refresh parent
  };

  return (
    <div className="fixed inset-0 bg-ocean-900/20 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white border border-ocean-200 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-ocean-100 shrink-0">
          <h3 className="text-lg font-semibold text-gray-800 truncate pr-4">{currentFile.name}</h3>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={handleDownload} className="p-2 rounded-lg text-gray-600 hover:text-ocean-700 hover:bg-sky-50 transition" title="Download">
              <Download className="w-5 h-5" />
            </button>
            <button onClick={handleDelete} className="p-2 rounded-lg text-gray-600 hover:text-coral-500 hover:bg-sky-50 transition" title="Delete">
              <Trash2 className="w-5 h-5" />
            </button>
            <button onClick={onClose} className="p-2 rounded-lg text-gray-600 hover:text-ocean-700 hover:bg-sky-50 transition">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Preview content */}
        <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-sky-50/70 min-h-[200px]">
          {isImage && !imgErr ? (
            <img src={`/api/files/${currentFile.id}/download?token=${localStorage.getItem('clawmissions_token')}`} alt={currentFile.name} className="max-w-full max-h-[60vh] object-contain rounded-lg" onError={() => setImgErr(true)} />
          ) : isPdf ? (
            <iframe src={`/api/files/${currentFile.id}/download?token=${localStorage.getItem('clawmissions_token')}`} className="w-full h-[60vh] rounded-lg" title={currentFile.name} />
          ) : isVideo ? (
            <video src={`/api/files/${currentFile.id}/download?token=${localStorage.getItem('clawmissions_token')}`} controls className="max-w-full max-h-[60vh] rounded-lg" />
          ) : isAudio ? (
            <audio src={`/api/files/${currentFile.id}/download?token=${localStorage.getItem('clawmissions_token')}`} controls className="w-full max-w-md" />
          ) : (
            <div className="text-center text-gray-500 py-10">
              <p className="text-lg mb-2">No preview available</p>
              <button onClick={handleDownload} className="text-ocean-400 hover:text-ocean-300 text-sm">Download file</button>
            </div>
          )}
        </div>

        {/* File info + tags */}
        <div className="p-4 border-t border-ocean-100 shrink-0 space-y-3">
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-600">
            <span>Size: <span className="text-gray-700">{formatBytes(currentFile.size)}</span></span>
            <span>Type: <span className="text-gray-700">{currentFile.mime_type || 'Unknown'}</span></span>
            <span>Uploaded: <span className="text-gray-700">{formatDate(currentFile.created_at)}</span></span>
          </div>

          {/* Tags section */}
          <div className="flex items-start gap-2">
            <Tag className="w-3.5 h-3.5 text-gray-500 mt-1 shrink-0" />
            <div className="flex flex-wrap gap-1.5 items-center">
              {currentFile.tags?.map((t) => (
                <span key={t.id} className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: t.color + '22', color: t.color }}>
                  {t.name}
                </span>
              ))}
              <TagPicker file={currentFile} onUpdate={handleTagUpdate} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
