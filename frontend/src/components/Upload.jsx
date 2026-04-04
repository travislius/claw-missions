import { useState, useRef, useCallback } from 'react';
import { X, Upload as UploadIcon, CheckCircle, AlertCircle } from 'lucide-react';
import { uploadFiles } from '../api';

export default function Upload({ onClose, onComplete }) {
  const [files, setFiles] = useState([]); // { file, progress, status, error }
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  const addFiles = useCallback((fileList) => {
    const newFiles = Array.from(fileList).map((f) => ({
      file: f,
      progress: 0,
      status: 'pending', // pending | uploading | done | error
      error: null,
    }));
    setFiles((prev) => [...prev, ...newFiles]);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const handleUpload = async () => {
    const pending = files.filter((f) => f.status === 'pending');
    if (!pending.length) return;

    for (let i = 0; i < pending.length; i++) {
      const entry = pending[i];
      const idx = files.indexOf(entry);

      setFiles((prev) => prev.map((f, j) => j === idx ? { ...f, status: 'uploading' } : f));

      const formData = new FormData();
      formData.append('file', entry.file);

      try {
        await uploadFiles(formData, (e) => {
          const pct = Math.round((e.loaded / e.total) * 100);
          setFiles((prev) => prev.map((f, j) => j === idx ? { ...f, progress: pct } : f));
        });
        setFiles((prev) => prev.map((f, j) => j === idx ? { ...f, status: 'done', progress: 100 } : f));
      } catch (err) {
        setFiles((prev) => prev.map((f, j) => j === idx ? { ...f, status: 'error', error: err.response?.data?.detail || 'Upload failed' } : f));
      }
    }

    onComplete?.();
  };

  const allDone = files.length > 0 && files.every((f) => f.status === 'done' || f.status === 'error');
  const hasFiles = files.length > 0;

  return (
    <div className="fixed inset-0 bg-ocean-900/20 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white border border-ocean-200 rounded-2xl w-full max-w-lg shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-ocean-100">
          <h3 className="text-lg font-semibold text-gray-800">Upload Files</h3>
          <button onClick={onClose} className="p-1 text-gray-500 hover:text-ocean-700 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
              dragging
                ? 'border-ocean-400 bg-ocean-400/10'
                : 'border-ocean-200 hover:border-ocean-400'
            }`}
          >
            <UploadIcon className={`w-10 h-10 mx-auto mb-3 ${dragging ? 'text-ocean-400' : 'text-gray-600'}`} />
            <p className="text-sm text-gray-600">
              Drag & drop files here, or <span className="text-ocean-400">browse</span>
            </p>
            <input
              ref={inputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => { if (e.target.files.length) addFiles(e.target.files); e.target.value = ''; }}
            />
          </div>

          {/* File list with progress */}
          {hasFiles && (
            <div className="max-h-60 overflow-y-auto space-y-2">
              {files.map((entry, i) => (
                <div key={i} className="flex items-center gap-3 bg-sky-50/80 rounded-lg px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 truncate">{entry.file.name}</p>
                    {entry.status === 'uploading' && (
                      <div className="mt-1 h-1.5 bg-ocean-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-ocean-500 rounded-full transition-all duration-300"
                          style={{ width: `${entry.progress}%` }}
                        />
                      </div>
                    )}
                    {entry.status === 'error' && (
                      <p className="text-xs text-coral-500 mt-0.5">{entry.error}</p>
                    )}
                  </div>
                  <div className="shrink-0">
                    {entry.status === 'done' && <CheckCircle className="w-5 h-5 text-seafoam-500" />}
                    {entry.status === 'error' && <AlertCircle className="w-5 h-5 text-coral-500" />}
                    {entry.status === 'uploading' && (
                      <span className="text-xs text-ocean-400">{entry.progress}%</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-ocean-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-ocean-700 transition">
            {allDone ? 'Close' : 'Cancel'}
          </button>
          {!allDone && (
            <button
              onClick={handleUpload}
              disabled={!hasFiles || files.some((f) => f.status === 'uploading')}
              className="px-5 py-2 text-sm font-medium bg-ocean-600 hover:bg-ocean-500 text-white rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              Upload {files.filter((f) => f.status === 'pending').length || ''} file{files.filter((f) => f.status === 'pending').length !== 1 ? 's' : ''}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
