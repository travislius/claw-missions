import { create } from 'zustand';

export const useStore = create((set, get) => ({
  // Auth
  token: localStorage.getItem('clawmissions_token') || null,
  isAuthenticated: !!localStorage.getItem('clawmissions_token'),
  setToken: (token) => {
    if (token) {
      localStorage.setItem('clawmissions_token', token);
    } else {
      localStorage.removeItem('clawmissions_token');
    }
    set({ token, isAuthenticated: !!token });
  },
  logout: () => {
    localStorage.removeItem('clawmissions_token');
    set({ token: null, isAuthenticated: false });
  },

  // Files
  files: [],
  setFiles: (files) => set({ files }),
  loading: false,
  setLoading: (loading) => set({ loading }),

  // Tags
  tags: [],
  setTags: (tags) => set({ tags }),
  selectedTag: null,
  setSelectedTag: (selectedTag) => set({ selectedTag }),

  // Selection (bulk operations)
  selectedFiles: new Set(),
  toggleFileSelection: (id) => set((s) => {
    const next = new Set(s.selectedFiles);
    if (next.has(id)) next.delete(id); else next.add(id);
    return { selectedFiles: next };
  }),
  selectAllFiles: () => set((s) => ({
    selectedFiles: new Set(s.files.map((f) => f.id)),
  })),
  clearSelection: () => set({ selectedFiles: new Set() }),

  // View
  viewMode: localStorage.getItem('clawmissions_view') || 'grid',
  setViewMode: (viewMode) => {
    localStorage.setItem('clawmissions_view', viewMode);
    set({ viewMode });
  },

  // Search
  searchQuery: '',
  setSearchQuery: (searchQuery) => set({ searchQuery }),

  // Stats
  stats: null,
  setStats: (stats) => set({ stats }),

  // Theme (dark/light)
  theme: localStorage.getItem('clawmissions_theme') || 'dark',
  setTheme: (theme) => {
    localStorage.setItem('clawmissions_theme', theme);
    document.documentElement.classList.toggle('dark', theme === 'dark');
    set({ theme });
  },
  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark';
    get().setTheme(next);
  },

  // Mobile sidebar
  sidebarOpen: false,
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
}));
