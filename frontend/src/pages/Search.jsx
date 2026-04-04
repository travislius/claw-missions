import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { searchFiles } from '../api';
import FileGrid from '../components/FileGrid';
import FileList from '../components/FileList';
import Preview from '../components/Preview';
import { useStore } from '../store';
import { Search as SearchIcon } from 'lucide-react';

function highlightMatch(text, query) {
  if (!query) return text;
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  return parts.map((p, i) =>
    p.toLowerCase() === query.toLowerCase() ? (
      <mark key={i} className="bg-ocean-500/30 text-ocean-300 rounded px-0.5">{p}</mark>
    ) : p
  );
}

export default function SearchPage() {
  const [params] = useSearchParams();
  const query = params.get('q') || '';
  const { viewMode } = useStore();
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [previewFile, setPreviewFile] = useState(null);

  const doSearch = useCallback(async () => {
    if (!query.trim()) { setResults([]); return; }
    setLoading(true);
    try {
      const res = await searchFiles(query);
      setResults(Array.isArray(res.data) ? res.data : res.data.files || []);
    } catch { setResults([]); }
    finally { setLoading(false); }
  }, [query]);

  useEffect(() => { doSearch(); }, [doSearch]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <SearchIcon className="w-5 h-5 text-gray-500" />
        <h2 className="text-xl font-semibold text-gray-800">
          {query ? <>Results for "<span className="text-ocean-400">{query}</span>"</> : 'Search'}
        </h2>
        {!loading && query && (
          <span className="text-sm text-gray-500">{results.length} result{results.length !== 1 ? 's' : ''}</span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-ocean-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : results.length === 0 && query ? (
        <p className="text-gray-500 py-10 text-center">No files match "{query}"</p>
      ) : viewMode === 'grid' ? (
        <FileGrid files={results} onPreview={setPreviewFile} onRefresh={doSearch} />
      ) : (
        <FileList files={results} onPreview={setPreviewFile} onRefresh={doSearch} />
      )}

      {previewFile && (
        <Preview file={previewFile} onClose={() => setPreviewFile(null)} onRefresh={doSearch} />
      )}
    </div>
  );
}
