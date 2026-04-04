import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Globe,
  Clock,
  RefreshCw,
  CheckCircle2,
  XCircle,
  ExternalLink,
} from 'lucide-react';
import api from '../api';

function formatTimestamp(timestamp) {
  if (!timestamp) return '—';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
}

function latencyColor(ms) {
  if (ms == null) return 'text-gray-500';
  if (ms < 500) return 'text-seafoam-500';
  if (ms <= 1000) return 'text-sand-500';
  return 'text-coral-500';
}

function StatusDot({ ok }) {
  return ok ? (
    <span className="flex items-center gap-1.5">
      <span className="w-2 h-2 rounded-full bg-green-400" />
      <span className="text-seafoam-500 text-sm font-medium">Up</span>
    </span>
  ) : (
    <span className="flex items-center gap-1.5">
      <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
      <span className="text-coral-500 text-sm font-medium">Down</span>
    </span>
  );
}

export default function Monitor() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const fetchHealth = useCallback(async ({ silent = false } = {}) => {
    if (silent) setRefreshing(true);
    else setLoading(true);

    try {
      const response = await api.get('/system/health-check');
      setData(response.data);
      setError('');
    } catch (err) {
      console.error('Failed to fetch system health:', err);
      setError(err.response?.data?.detail || err.message || 'Unable to load health check data.');
    } finally {
      if (silent) setRefreshing(false);
      else setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const id = window.setInterval(() => fetchHealth({ silent: true }), 30000);
    return () => window.clearInterval(id);
  }, [fetchHealth]);

  const sites = data?.sites || [];
  const degradedCount = useMemo(() => sites.filter((s) => !s.ok).length, [sites]);
  const allOk = Boolean(data?.all_ok) && degradedCount === 0 && !error;

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" />
        Checking system health…
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${allOk ? 'bg-seafoam-100' : 'bg-coral-500/15'}`}>
            {allOk ? <ShieldCheck className="w-5 h-5 text-seafoam-500" /> : <ShieldAlert className="w-5 h-5 text-coral-500" />}
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-800">
              {allOk ? 'All Systems Operational' : `${degradedCount} site${degradedCount === 1 ? '' : 's'} degraded`}
            </h1>
            <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-2">
              <Clock className="w-3 h-3" />
              Last checked {formatTimestamp(data?.checked_at)}
              <span className="text-gray-700">·</span>
              Auto-refreshes every 30s
            </p>
          </div>
        </div>

        <button
          onClick={() => fetchHealth({ silent: true })}
          disabled={refreshing}
          className="p-2 text-gray-500 hover:text-ocean-700 hover:bg-sky-50 rounded-lg transition disabled:opacity-40"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-coral-200 bg-coral-500/10 px-4 py-3 text-sm text-coral-600">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-ocean-100 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-ocean-100">
              <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Site</th>
              <th className="text-center text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Status</th>
              <th className="text-center text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">HTTP</th>
              <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Latency</th>
            </tr>
          </thead>
          <tbody>
            {sites.map((site, i) => (
              <tr key={site.id || site.url} className={`${i < sites.length - 1 ? 'border-b border-ocean-100' : ''} hover:bg-sky-50/60 transition`}>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <Globe className="w-4 h-4 text-gray-600 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{site.name}</p>
                      <a
                        href={site.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-gray-500 hover:text-gray-700 transition flex items-center gap-1"
                      >
                        {site.url.replace('https://', '')}
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    </div>
                  </div>
                  {site.error && (
                    <p className="mt-1 ml-7 text-xs text-coral-500 truncate max-w-xs" title={site.error}>
                      ⚠ {site.error}
                    </p>
                  )}
                </td>
                <td className="px-4 py-4 text-center">
                  <StatusDot ok={site.ok} />
                </td>
                <td className="px-4 py-4 text-center">
                  <span className={`text-sm font-mono ${site.ok ? 'text-gray-700' : 'text-coral-500 font-semibold'}`}>
                    {site.status || '—'}
                  </span>
                </td>
                <td className="px-5 py-4 text-right">
                  <span className={`text-sm font-mono ${latencyColor(site.latency_ms)}`}>
                    {site.latency_ms != null ? `${site.latency_ms}ms` : '—'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {!sites.length && (
          <div className="px-5 py-10 text-center text-gray-500 text-sm">
            No health check results available.
          </div>
        )}
      </div>
    </div>
  );
}
