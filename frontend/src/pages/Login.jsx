import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, User, Crosshair } from 'lucide-react';
import { login } from '../api';
import { useStore } from '../store';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const setToken = useStore((s) => s.setToken);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await login(username, password);
      setToken(res.data.access_token);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4 py-10">
      <div className="relative w-full max-w-sm">

        {/* Logo */}
        <div className="rounded-2xl border border-ocean-200 bg-white/80 p-8 shadow-xl backdrop-blur-lg">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-sky-50 border border-ocean-200 mb-4 shadow-sm">
              <Crosshair className="w-8 h-8 text-ocean-500" />
            </div>
            <h1 className="text-2xl font-bold text-gray-800">Claw Missions</h1>
            <p className="text-gray-600 text-sm mt-1">Mission control for your digital life</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ocean-400" />
              <input
                type="text"
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-sky-50 border border-ocean-200 rounded-lg pl-10 pr-4 py-3 text-gray-800 placeholder-ocean-300 focus:outline-none focus:border-ocean-400 focus:ring-1 focus:ring-ocean-300 transition"
                autoFocus
              />
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ocean-400" />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-sky-50 border border-ocean-200 rounded-lg pl-10 pr-4 py-3 text-gray-800 placeholder-ocean-300 focus:outline-none focus:border-ocean-400 focus:ring-1 focus:ring-ocean-300 transition"
              />
            </div>

            {error && (
              <p className="text-coral-600 text-sm text-center">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-ocean-500 hover:bg-ocean-600 disabled:opacity-50 text-white font-medium py-3 rounded-lg transition"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
