import { File, Image, FileText, Film, Music, Archive, Code, Download, Trash2, Check } from 'lucide-react';
import { downloadFile, deleteFile, getThumb } from '../api';
import { useState } from 'react';
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

function SmallIcon({ mime }) {
  const cls = 'w-5 h-5';
  if (!mime) return <File className={cls} />;
  if (mime.startsWith('image/')) return <Image className={cls} />;
  if (mime.startsWith('video/')) return <Film className={cls} />;
  if (mime.startsWith('audio/')) return <Music className={cls} />;
  if (mime === 'application/pdf') return <FileText className={cls} />;
  if (mime.includes('zip') || mime.includes('tar')) return <Archive className={cls} />;
  if (mime.includes('json') || mime.includes('javascript')) return <Code className={cls} />;
  return <File className={cls} />;
}

function FileRow({ file, onPreview, onRefresh, selected, onToggleSelect }) {
  const [imgErr, setImgErr] = useState(false);
  const hasThumb = file.thumbnail_path || file.mime_type?.startsWith('image/');

  const handleDownload = async (e) => {
    e.stopPropagation();
    const res = await downloadFile(file.id);
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url; a.download = file.name; a.click();
    URL.revokeObjectURL(url);
  };

  const handleDelete = async (e) => {
    e.stopPropagation();
    if (!confirm(`Delete "${file.name}"?`)) return;
    await deleteFile(file.id);
    onRefresh?.();
  };

  return (
    <tr
      onClick={() => onPreview(file)}
      className={`group border-b border-ocean-100 hover:bg-sky-50/70 cursor-pointer transition ${selected ? 'bg-ocean-600/10' : ''}`}
    >
      <td className="py-3 px-4 w-10">
        <div
          onClick={(e) => { e.stopPropagation(); onToggleSelect?.(file.id); }}
          className={`w-5 h-5 rounded border-2 flex items-center justify-center cursor-pointer transition ${
            selected ? 'bg-ocean-500 border-ocean-500' : 'border-ocean-200 hover:border-ocean-400'
          }`}
        >
          {selected && <Check className="w-3 h-3 text-gray-800" />}
        </div>
      </td>
      <td className="py-3 px-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-sky-50 flex items-center justify-center shrink-0 overflow-hidden">
          {hasThumb && !imgErr ? (
            <img src={getThumb(file.id)} className="w-full h-full object-cover" onError={() => setImgErr(true)} loading="lazy" />
          ) : (
            <span className="text-gray-500"><SmallIcon mime={file.mime_type} /></span>
          )}
        </div>
        <span className="text-sm text-gray-800 truncate max-w-xs">{file.name}</span>
        {file.tags?.length > 0 && (
          <div className="hidden lg:flex gap-1 ml-2">
            {file.tags.slice(0, 2).map((t) => (
              <span key={t.id} className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: t.color + '22', color: t.color }}>
                {t.name}
              </span>
            ))}
          </div>
        )}
      </td>
      <td className="py-3 px-4 text-sm text-gray-600 hidden sm:table-cell">{formatBytes(file.size)}</td>
      <td className="py-3 px-4 text-sm text-gray-500 hidden md:table-cell">{formatDate(file.created_at)}</td>
      <td className="py-3 px-4">
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
          <button onClick={handleDownload} className="p-1.5 rounded-lg text-gray-500 hover:text-ocean-700 hover:bg-sky-50 transition">
            <Download className="w-4 h-4" />
          </button>
          <button onClick={handleDelete} className="p-1.5 rounded-lg text-gray-500 hover:text-coral-500 hover:bg-sky-50 transition">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}

export default function FileList({ files, onPreview, onRefresh }) {
  const { selectedFiles, toggleFileSelection } = useStore();

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-ocean-100">
            <th className="py-2 px-4 w-10"></th>
            <th className="py-2 px-4">Name</th>
            <th className="py-2 px-4 hidden sm:table-cell">Size</th>
            <th className="py-2 px-4 hidden md:table-cell">Date</th>
            <th className="py-2 px-4 w-24"></th>
          </tr>
        </thead>
        <tbody>
          {files.map((file) => (
            <FileRow
              key={file.id}
              file={file}
              onPreview={onPreview}
              onRefresh={onRefresh}
              selected={selectedFiles.has(file.id)}
              onToggleSelect={toggleFileSelection}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
