import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, LayoutGrid, List, Upload, Crosshair, LogOut, Menu, Sun, Moon } from 'lucide-react';
import { useStore } from '../store';
import { searchFiles } from '../api';

export default function Header({ onUploadClick }) {
  const { viewMode, setViewMode, searchQuery, setSearchQuery, logout, theme, toggleTheme, toggleSidebar } = useStore();
  const [localQuery, setLocalQuery] = useState(searchQuery);
  const [suggestions, setSuggestions] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceRef = useRef(null);
  const dropdownRef = useRef(null);
  const navigate = useNavigate();

  // Debounced search suggestions
  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!localQuery.trim()) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await searchFiles(localQuery);
        const items = Array.isArray(res.data) ? res.data : res.data.files || [];
        setSuggestions(items.slice(0, 6));
        setShowDropdown(true);
      } catch {
        setSuggestions([]);
      }
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [localQuery]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
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

  const handleSelect = (file) => {
    setShowDropdown(false);
    setLocalQuery('');
    setSearchQuery('');
    // Navigate to browse with the file highlighted — for now just go to browse
    navigate('/');
  };

  return (
    <header className="h-14 sm:h-16 bg-gray-900 dark:bg-gray-900 bg-white border-b border-gray-800 dark:border-gray-800 border-gray-200 flex items-center px-3 sm:px-4 gap-2 sm:gap-4 shrink-0 transition-colors">
      {/* Hamburger (mobile) */}
      <button
        onClick={toggleSidebar}
        className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition md:hidden"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Logo */}
      <div className="flex items-center gap-2 shrink-0 cursor-pointer" onClick={() => { setSearchQuery(''); setLocalQuery(''); navigate('/'); }}>
        <Crosshair className="w-6 h-6 text-yellow-400" />
        <span className="text-lg font-bold text-white hidden sm:block">Claw Missions</span>
      </div>

      {/* Search */}
      <form onSubmit={handleSubmit} className="flex-1 max-w-xl relative" ref={dropdownRef}>
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input
          type="text"
          placeholder="Search files..."
          value={localQuery}
          onChange={(e) => setLocalQuery(e.target.value)}
          onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-10 pr-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-ocean-500 transition"
        />
        {/* Dropdown */}
        {showDropdown && suggestions.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl overflow-hidden z-50">
            {suggestions.map((file) => (
              <button
                key={file.id}
                type="button"
                onClick={() => handleSelect(file)}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-700 transition"
              >
                <span className="text-sm text-white truncate flex-1">{file.name}</span>
                <span className="text-xs text-gray-500 shrink-0">{file.mime_type?.split('/')[1] || ''}</span>
              </button>
            ))}
            <button
              type="submit"
              className="w-full px-4 py-2 text-xs text-ocean-400 hover:bg-gray-700 transition border-t border-gray-700"
            >
              View all results for "{localQuery}"
            </button>
          </div>
        )}
      </form>

      {/* Actions */}
      <div className="flex items-center gap-1 sm:gap-2 shrink-0">
        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition"
          title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
        >
          {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>

        <button
          onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
          className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition hidden sm:block"
          title={viewMode === 'grid' ? 'List view' : 'Grid view'}
        >
          {viewMode === 'grid' ? <List className="w-5 h-5" /> : <LayoutGrid className="w-5 h-5" />}
        </button>

        <button
          onClick={onUploadClick}
          className="flex items-center gap-2 bg-ocean-600 hover:bg-ocean-500 text-white text-sm font-medium px-3 sm:px-4 py-2 rounded-lg transition touch-manipulation"
        >
          <Upload className="w-4 h-4" />
          <span className="hidden sm:inline">Upload</span>
        </button>

        <button
          onClick={logout}
          className="p-2 rounded-lg text-gray-400 hover:text-red-400 hover:bg-gray-800 transition"
          title="Logout"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
}
