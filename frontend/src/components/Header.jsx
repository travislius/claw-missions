import { useNavigate } from 'react-router-dom';
import { Crosshair, LogOut, Menu } from 'lucide-react';
import { useStore } from '../store';

export default function Header() {
  const { logout, toggleSidebar } = useStore();
  const navigate = useNavigate();

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
      <div className="flex items-center gap-2 shrink-0 cursor-pointer" onClick={() => navigate('/')}>
        <Crosshair className="w-6 h-6 text-ocean-500" />
        <span className="text-lg font-bold text-gray-800 hidden sm:block">Claw Missions</span>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Logout */}
      <button onClick={logout} className="p-2 rounded-lg text-gray-600 hover:text-coral-500 hover:bg-white/70 transition" title="Logout">
        <LogOut className="w-5 h-5" />
      </button>
    </header>
  );
}
