import { useEffect, useState, useCallback, useRef } from 'react';
import { LayoutGrid, List, Search, Sparkles, Upload as UploadIcon } from 'lucide-react';
import { useStore } from '../store';
import { getFiles, getTags, getStats, searchFiles, smartSearchFiles } from '../api';
import FileGrid from '../components/FileGrid';
import FileList from '../components/FileList';
import Upload from '../components/Upload';
import Preview from '../components/Preview';
import TagBar from '../components/TagBar';
import BulkBar from '../components/BulkBar';

const SORT_OPTIONS = [
  { value: 'created_at:desc', label: 'Newest first' },
  { value: 'created_at:asc', label: 'Oldest first' },
  { value: 'name:asc', label: 'Name A–Z' },
  { value: 'name:desc', label: 'Name Z–A' },
  { value: 'size:desc', label: 'Largest first' },
  { value: 'size:asc', label: 'Smallest first' },
];

const PAGE_SIZE = 30;

export default function Browse() {
  const {
    files, setFiles, loading, setLoading,
    viewMode, setViewMode, setTags, selectedTag,
    searchQuery, setSearchQuery, setStats,
  } = useStore();

  const [sort, setSort] = useState('created_at:desc');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [previewFile, setPreviewFile] = useState(null);
  const [showUpload, setShowUpload] = useState(false);
  const [localSearch, setLocalSearch] = useState(searchQuery);
  const [smartSearchUsed, setSmartSearchUsed] = useState(false);
  const searchDebounce = useRef(null);

  // Debounced search — updates store after 300ms of typing
  useEffect(() => {
    clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => {
      setSearchQuery(localSearch.trim());
    }, 300);
    return () => clearTimeout(searchDebounce.current);
  }, [localSearch, setSearchQuery]);

  // Clear search when leaving the page
  useEffect(() => {
    return () => setSearchQuery('');
  }, [setSearchQuery]);

  // Expose upload toggle to header via window (simple bridge)
  useEffect(() => {
    window.__clawOpenUpload = () => setShowUpload(true);
    return () => { delete window.__clawOpenUpload; };
  }, []);

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    try {
      const [sortBy, sortDir] = sort.split(':');
      const params = {
        page,
        per_page: PAGE_SIZE,
        sort_by: sortBy,
        sort_dir: sortDir,
      };
      if (selectedTag) params.tag_id = selectedTag;

      let res;
      if (searchQuery.trim()) {
        try {
          res = await smartSearchFiles(searchQuery);
          setSmartSearchUsed(res.headers['x-smart-search-used'] === 'true');
        } catch {
          res = await searchFiles(searchQuery);
          setSmartSearchUsed(false);
        }
      } else {
        res = await getFiles(params);
        setSmartSearchUsed(false);
      }

      const data = res.data;
      if (Array.isArray(data)) {
        setFiles(data);
        setTotalPages(1);
      } else {
        setFiles(data.files || data.items || []);
        setTotalPages(data.total_pages || Math.ceil((data.total || 0) / PAGE_SIZE) || 1);
      }
    } catch (err) {
      console.error('Failed to load files', err);
      setSmartSearchUsed(false);
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [sort, page, selectedTag, searchQuery, setFiles, setLoading]);

  // Reset page on filter change
  useEffect(() => { setPage(1); }, [selectedTag, searchQuery, sort]);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  const refreshTags = useCallback(() => {
    getTags().then((r) => setTags(r.data?.tags || r.data || [])).catch(() => {});
  }, [setTags]);

  // Load tags + stats on mount
  useEffect(() => {
    refreshTags();
    getStats().then((r) => setStats(r.data)).catch(() => {});
  }, [refreshTags, setStats]);

  const handleUploadComplete = () => {
    setShowUpload(false);
    fetchFiles();
    getStats().then((r) => setStats(r.data)).catch(() => {});
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className="flex items-center flex-wrap gap-2 text-xl font-semibold text-gray-800">
          {searchQuery ? `Search: "${searchQuery}"` : selectedTag ? `Tag filter` : 'Documents'}
          {searchQuery && smartSearchUsed && (
            <span className="inline-flex items-center rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-ocean-600">
              AI
            </span>
          )}
        </h2>
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ocean-400" />
              <input
                type="text"
                placeholder="Search files..."
                value={localSearch}
                onChange={(e) => setLocalSearch(e.target.value)}
                className="bg-sky-50 border border-ocean-200 rounded-lg pl-9 pr-3 py-1.5 text-sm text-gray-700 placeholder-ocean-400 focus:outline-none focus:border-ocean-500 transition w-48 sm:w-64"
              />
              {localSearch && (
                <button
                  onClick={() => { setLocalSearch(''); setSearchQuery(''); setSmartSearchUsed(false); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
                >✕</button>
              )}
            </div>
            <span className="inline-flex items-center gap-1 rounded-lg border border-ocean-200 bg-sky-50 px-2.5 py-1.5 text-xs font-medium text-ocean-600">
              <Sparkles className="w-3.5 h-3.5" />
              AI
            </span>
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="bg-sky-50 border border-ocean-200 text-sm text-gray-700 rounded-lg px-3 py-1.5 focus:outline-none focus:border-ocean-500"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button
            onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
            className="p-2 rounded-lg text-gray-600 hover:text-ocean-700 hover:bg-sky-50 transition"
            title={viewMode === 'grid' ? 'List view' : 'Grid view'}
          >
            {viewMode === 'grid' ? <List className="w-4 h-4" /> : <LayoutGrid className="w-4 h-4" />}
          </button>
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-1.5 bg-ocean-600 hover:bg-ocean-500 text-white text-sm font-medium px-3 py-2 rounded-lg transition"
          >
            <UploadIcon className="w-4 h-4" />
            <span>Upload</span>
          </button>
        </div>
      </div>

      {/* Tag bar */}
      <TagBar onRefreshTags={refreshTags} />

      {/* Bulk operations bar */}
      <BulkBar onRefresh={fetchFiles} />

      {/* Upload modal */}
      {showUpload && (
        <Upload onClose={() => setShowUpload(false)} onComplete={handleUploadComplete} />
      )}

      {/* File display */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-ocean-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : files.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <p className="text-lg mb-2">No files yet</p>
          <button
            onClick={() => setShowUpload(true)}
            className="text-ocean-400 hover:text-ocean-300 text-sm transition"
          >
            Upload your first file
          </button>
        </div>
      ) : viewMode === 'grid' ? (
        <FileGrid files={files} onPreview={setPreviewFile} onRefresh={fetchFiles} />
      ) : (
        <FileList files={files} onPreview={setPreviewFile} onRefresh={fetchFiles} />
      )}

      {/* Pagination */}
      {totalPages > 1 && !searchQuery && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="px-3 py-1.5 text-sm rounded-lg bg-sky-50 text-gray-600 hover:text-ocean-700 disabled:opacity-30 disabled:cursor-not-allowed transition"
          >
            ← Prev
          </button>
          <span className="text-sm text-gray-500">
            {page} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1.5 text-sm rounded-lg bg-sky-50 text-gray-600 hover:text-ocean-700 disabled:opacity-30 disabled:cursor-not-allowed transition"
          >
            Next →
          </button>
        </div>
      )}

      {/* Preview modal */}
      {previewFile && (
        <Preview file={previewFile} onClose={() => setPreviewFile(null)} onRefresh={fetchFiles} />
      )}
    </div>
  );
}
