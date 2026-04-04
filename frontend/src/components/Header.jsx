import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Crosshair, LogOut, Menu } from 'lucide-react';
import { useStore } from '../store';
import { searchFiles } from '../api';

export default function Header() {
  const { searchQuery, setSearchQuery, logout, toggleSidebar } = useStore();
  const [localQuery, setLocalQuery] = useState(searchQuery);
  const [suggestions, setSuggestions] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceRef = useRef(null);
  const dropdownRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!localQuery.trim()) { setSuggestions([]); setShowDropdown(false); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await searchFiles(localQuery);
        const items = Array.isArray(res.data) ? res.data : res.data.files || [];
        setSuggestions(items.slice(0, 6));
        setShowDropdown(true);
      } catch { setSuggestions([]); }
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [localQuery]);

  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setShowDropdown(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    setShowDropdown(false);
    if (localQuery.trim()) {
      setSearchQuery(localQuery.trim());
      navigate(`/search?q=${encodeURIComponent(localQuery.trim())}`);
    } else {
      setSearchQuery('');
      navigate('/');
    }
  };

  return (
    <header
      className="border-b border-ocean-200 flex items-center px-3 sm:px-4 gap-2 sm:gap-4 shrink-0 bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: "url('/icons/sea/header-bg.png')", paddingTop: 'max(0.75rem, env(safe-area-inset-top))', paddingBottom: '0.75rem', minHeight: '3.5rem' }}
    >
      {/* Hamburger (mobile) */}
      <button onClick={toggleSidebar} className="p-2 rounded-lg text-gray-600 hover:text-ocean-700 hover:bg-white/70 transition md:hidden">
        <Menu className="w-5 h-5" />
      </button>

      {/* Logo */}
      <div className="flex items-center gap-2 shrink-0 cursor-pointer" onClick={() => { setSearchQuery(''); setLocalQuery(''); navigate('/'); }}>
        <Crosshair className="w-6 h-6 text-ocean-500" />
        <span className="text-lg font-bold text-gray-800 hidden sm:block">Claw Missions</span>
      </div>

      {/* Search */}
      <form onSubmit={handleSubmit} className="flex-1 max-w-xl relative" ref={dropdownRef}>
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ocean-400" />
        <input
          type="text"
          placeholder="Search files..."
          value={localQuery}
          onChange={(e) => setLocalQuery(e.target.value)}
          onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
          className="w-full bg-white/70 border border-ocean-200 rounded-lg pl-10 pr-4 py-2 text-sm text-gray-800 placeholder-ocean-400 focus:outline-none focus:border-ocean-400 transition"
        />
        {showDropdown && suggestions.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white/95 border border-ocean-200 rounded-lg shadow-xl overflow-hidden z-50 backdrop-blur">
            {suggestions.map((file) => (
              <button key={file.id} type="button" onClick={() => { setShowDropdown(false); setLocalQuery(''); setSearchQuery(''); navigate('/'); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-sky-50 transition">
                <span className="text-sm text-gray-800 truncate flex-1">{file.name}</span>
                <span className="text-xs text-gray-500 shrink-0">{file.mime_type?.split('/')[1] || ''}</span>
              </button>
            ))}
            <button type="submit" className="w-full px-4 py-2 text-xs text-ocean-600 hover:bg-sky-50 transition border-t border-ocean-100">
              View all results for "{localQuery}"
            </button>
          </div>
        )}
      </form>

      {/* Logout only */}
      <button onClick={logout} className="p-2 rounded-lg text-gray-600 hover:text-coral-500 hover:bg-white/70 transition" title="Logout">
        <LogOut className="w-5 h-5" />
      </button>
    </header>
  );
}
