import { File, Image, FileText, Film, Music, Archive, Code, MoreVertical, Trash2, Download, Check } from 'lucide-react';
import { useState } from 'react';
import { getThumb, downloadFile, deleteFile } from '../api';
import { useStore } from '../store';

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDate(d) {
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function mimeIcon(mime) {
  if (!mime) return <File className="w-10 h-10" />;
  if (mime.startsWith('image/')) return <Image className="w-10 h-10" />;
  if (mime.startsWith('video/')) return <Film className="w-10 h-10" />;
  if (mime.startsWith('audio/')) return <Music className="w-10 h-10" />;
  if (mime === 'application/pdf') return <FileText className="w-10 h-10" />;
  if (mime.includes('zip') || mime.includes('tar') || mime.includes('rar')) return <Archive className="w-10 h-10" />;
  if (mime.includes('json') || mime.includes('javascript') || mime.includes('xml') || mime.includes('html')) return <Code className="w-10 h-10" />;
  return <File className="w-10 h-10" />;
}

function FileCard({ file, onPreview, onRefresh, selected, onToggleSelect }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [imgError, setImgError] = useState(false);
  const hasThumb = file.thumbnail_path || file.mime_type?.startsWith('image/');

  const handleDownload = async (e) => {
    e.stopPropagation();
    setMenuOpen(false);
    try {
      const res = await downloadFile(file.id);
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download failed', err);
    }
  };

  const handleDelete = async (e) => {
    e.stopPropagation();
    setMenuOpen(false);
    if (!confirm(`Delete "${file.name}"?`)) return;
    try {
      await deleteFile(file.id);
      onRefresh?.();
    } catch (err) {
      console.error('Delete failed', err);
    }
  };

  return (
    <div
      onClick={() => onPreview(file)}
      className="group relative bg-white border border-ocean-100 rounded-xl overflow-hidden cursor-pointer hover:border-ocean-200 hover:shadow-lg hover:shadow-ocean-500/5 transition-all duration-200"
    >
      {/* Selection checkbox */}
      <div
        onClick={(e) => { e.stopPropagation(); onToggleSelect?.(file.id); }}
        className={`absolute top-2 left-2 z-10 w-6 h-6 rounded-md border-2 flex items-center justify-center transition cursor-pointer ${
          selected ? 'bg-ocean-500 border-ocean-500' : 'border-ocean-200 bg-white/80 opacity-0 group-hover:opacity-100'
        }`}
      >
        {selected && <Check className="w-3.5 h-3.5 text-gray-800" />}
      </div>

      {/* Thumbnail area */}
      <div className="aspect-square bg-sky-50 flex items-center justify-center overflow-hidden bg-sky-50/80">
        {hasThumb && !imgError ? (
          <img
            src={getThumb(file.id)}
            alt={file.name}
            className="w-full h-full object-contain bg-white"
            onError={() => setImgError(true)}
            loading="lazy"
          />
        ) : (
          <div className="text-gray-600">{mimeIcon(file.mime_type)}</div>
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <p className="text-sm text-gray-800 font-medium truncate" title={file.name}>
          {file.name}
        </p>
        <div className="flex items-center justify-between mt-1">
          <span className="text-xs text-gray-500">{formatBytes(file.size)}</span>
          <span className="text-xs text-gray-600">{formatDate(file.created_at)}</span>
        </div>
        {/* Tag chips */}
        {file.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {file.tags.slice(0, 3).map((tag) => (
              <span
                key={tag.id}
                className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                style={{ backgroundColor: tag.color + '22', color: tag.color }}
              >
                {tag.name}
              </span>
            ))}
            {file.tags.length > 3 && (
              <span className="text-[10px] text-gray-500">+{file.tags.length - 3}</span>
            )}
          </div>
        )}
      </div>

      {/* Context menu */}
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition">
        <button
          onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
          className="p-1.5 rounded-lg bg-white/90 backdrop-blur text-gray-600 hover:text-ocean-700 transition"
        >
          <MoreVertical className="w-4 h-4" />
        </button>
        {menuOpen && (
          <div className="absolute right-0 mt-1 w-36 bg-sky-50 border border-ocean-200 rounded-lg shadow-xl py-1 z-10">
            <button
              onClick={handleDownload}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-sky-50 transition"
            >
              <Download className="w-3.5 h-3.5" /> Download
            </button>
            <button
              onClick={handleDelete}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-coral-500 hover:bg-sky-50 transition"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function FileGrid({ files, onPreview, onRefresh }) {
  const { selectedFiles, toggleFileSelection } = useStore();

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
      {files.map((file) => (
        <FileCard
          key={file.id}
          file={file}
          onPreview={onPreview}
          onRefresh={onRefresh}
          selected={selectedFiles.has(file.id)}
          onToggleSelect={toggleFileSelection}
        />
      ))}
    </div>
  );
}
