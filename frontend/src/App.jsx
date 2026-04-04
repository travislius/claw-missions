import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useCallback, useEffect } from 'react';
import { useStore } from './store';
import { getTags } from './api';
import Login from './pages/Login';
import Home from './pages/Home';
import Browse from './pages/Browse';
import SearchPage from './pages/Search';
import CalendarPage from './pages/Calendar';
import Team from './pages/Team';
import Projects from './pages/Projects';
import Notes from './pages/Notes';
import Skills from './pages/Skills';
import Memory from './pages/Memory';
import Sessions from './pages/Sessions';
import Tasks from './pages/Tasks';
import Agents from './pages/Agents';
import Monitor from './pages/Monitor';
import Header from './components/Header';
import Sidebar from './components/Sidebar';

function ProtectedRoute() {
  const isAuthenticated = useStore((s) => s.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Outlet />;
}

function AppLayout() {
  const setTags = useStore((s) => s.setTags);
  const { sidebarOpen, setSidebarOpen } = useStore();
  const refreshTags = useCallback(() => {
    getTags().then((r) => setTags(r.data?.tags || r.data || [])).catch(() => {});
  }, [setTags]);

  useEffect(() => { refreshTags(); }, [refreshTags]);

  useEffect(() => {
    document.documentElement.classList.remove('dark');
  }, []);

  return (
    <div className="h-screen flex flex-col bg-transparent text-gray-800 ocean-bubbles">
      <Header />
      <div className="flex flex-1 overflow-hidden relative">
        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-ocean-900/20 backdrop-blur-sm z-30 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        <Sidebar onRefreshTags={refreshTags} />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default function App() {
  const isAuthenticated = useStore((s) => s.isAuthenticated);

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={isAuthenticated ? <Navigate to="/" replace /> : <Login />}
        />
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Home />} />
            <Route path="/files" element={<Browse />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/memory" element={<Memory />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/team" element={<Team />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/notes" element={<Notes />} />
            <Route path="/notes/:categorySlug/:noteId" element={<Notes />} />
            <Route path="/skills" element={<Skills />} />
            <Route path="/sessions" element={<Sessions />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/agents" element={<Agents />} />
            <Route path="/monitor" element={<Monitor />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
