import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  Clock,
  Cpu,
  HardDrive,
  MemoryStick,
  RefreshCw,
  Wifi,
  Zap,
} from 'lucide-react';
import api from '../api';

const REFRESH_MS = 3000;

function pct(val) {
  const n = Number(val);
  return Number.isNaN(n) ? 0 : Math.min(100, Math.max(0, n));
}

function Bar({ value, color = 'ocean' }) {
  const colorMap = {
    ocean: 'bg-ocean-500',
    green: 'bg-green-500',
    yellow: 'bg-yellow-500',
    amber: 'bg-amber-500',
    red: 'bg-coral-500',
    purple: 'bg-purple-500',
    blue: 'bg-blue-500',
    zinc: 'bg-zinc-400',
  };
  const barColor = value > 85 ? colorMap.red : value > 60 ? colorMap.yellow : (colorMap[color] || colorMap.ocean);

  return (
    <div className="w-full bg-ocean-100 rounded-full h-2">
      <div
        className={`${barColor} h-2 rounded-full transition-all duration-500`}
        style={{ width: `${pct(value)}%` }}
      />
    </div>
  );
}

function Card({ icon: Icon, title, children, accent = 'ocean' }) {
  const accentMap = {
    ocean: 'text-ocean-400 border-ocean-500/30',
    green: 'text-seafoam-500 border-green-500/30',
    purple: 'text-purple-400 border-purple-500/30',
    blue: 'text-blue-400 border-blue-500/30',
    yellow: 'text-sand-500 border-yellow-500/30',
    amber: 'text-amber-400 border-amber-500/30',
    zinc: 'text-zinc-300 border-zinc-500/30',
  };
  const accentClasses = accentMap[accent] || accentMap.ocean;

  return (
    <div className={`bg-white border ${accentClasses} rounded-xl p-5`}>
      <div className="flex items-center gap-2 mb-4">
        <Icon className={`w-5 h-5 ${accentClasses.split(' ')[0]}`} />
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function StatRow({ label, value, sub }) {
  return (
    <div className="flex items-baseline justify-between mb-1">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-sm font-mono text-gray-800">
        {value}
        {sub && <span className="text-xs text-gray-500 ml-1">{sub}</span>}
      </span>
    </div>
  );
}

export default function ResourcePanel({ endpoint, accent = 'ocean' }) {
  const [data, setData] = useState(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchData = useCallback(async (isBackground = false) => {
    if (!isBackground) setInitialLoading(true);
    else setRefreshing(true);

    try {
      const res = await api.get(endpoint);
      setData(res.data);
      setLastUpdated(new Date());
      setError(null);
    } catch (e) {
      if (!isBackground) {
        setError(e.response?.data?.detail || 'Failed to fetch system data');
        setData(null);
      }
    } finally {
      setInitialLoading(false);
      setRefreshing(false);
    }
  }, [endpoint]);

  useEffect(() => {
    setData(null);
    setError(null);
    setInitialLoading(true);
    fetchData(false);
    const interval = setInterval(() => fetchData(true), REFRESH_MS);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" />
        Loading system info...
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex items-center justify-center h-64 text-coral-500">
        <Activity className="w-5 h-5 mr-2" />
        {error}
      </div>
    );
  }

  if (!data) return null;

  const { cpu, memory, disks, network, gpu } = data;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <Clock className="w-4 h-4" />
          <span>Auto-refreshes every {REFRESH_MS / 1000}s</span>
          {lastUpdated && <span>Last: {lastUpdated.toLocaleTimeString()}</span>}
        </div>
        <button
          onClick={() => fetchData(false)}
          className="p-2 text-gray-500 hover:text-ocean-700 hover:bg-sky-50 rounded-lg transition"
          aria-label="Refresh device stats"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? `animate-spin ${CardAccentIconClass(accent)}` : ''}`} />
        </button>
      </div>

      <div className="flex items-center gap-3 text-xs text-gray-500">
        <Clock className="w-4 h-4" />
        <span>Up {data.system?.uptime_human ?? '...'}</span>
        <span className="text-gray-700">/</span>
        <span>{data.system?.process_count ?? '...'} processes</span>
        {gpu?.name && (
          <>
            <span className="text-gray-700">/</span>
            <span className="text-yellow-500">
              GPU: {gpu.name}
              {gpu.vram_gb ? ` (${gpu.vram_gb} GB)` : ''}
            </span>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Card icon={Cpu} title="CPU" accent={accent}>
          <div className="mb-4">
            <div className="flex justify-between mb-1">
              <span className="text-xs text-gray-500">Overall usage</span>
              <span className="text-2xl font-bold text-gray-800">{cpu.percent.toFixed(1)}%</span>
            </div>
            <Bar value={cpu.percent} color={accent} />
          </div>

          <StatRow label="Physical cores" value={cpu.count_physical} />
          <StatRow label="Logical cores" value={cpu.count_logical} />
          {cpu.freq_mhz && (
            <StatRow label="Frequency" value={`${cpu.freq_mhz} MHz`} sub={cpu.freq_max_mhz ? `/ ${cpu.freq_max_mhz} max` : ''} />
          )}
          {cpu.load_avg?.length > 0 && (
            <StatRow label="Load avg (1/5/15m)" value={cpu.load_avg.map((v) => v.toFixed(2)).join(' / ')} />
          )}

          {cpu.per_core?.length > 0 && (
            <div className="mt-4">
              <p className="text-xs text-gray-500 mb-2">Per-core usage</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                {cpu.per_core.map((v, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-xs text-gray-600 w-8">C{i}</span>
                    <div className="flex-1">
                      <Bar value={v} color={accent} />
                    </div>
                    <span className="text-xs font-mono text-gray-600 w-8 text-right">{v.toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card icon={MemoryStick} title="Memory" accent="purple">
          <div className="mb-4">
            <div className="flex justify-between mb-1">
              <span className="text-xs text-gray-500">RAM usage</span>
              <span className="text-2xl font-bold text-gray-800">{memory.percent.toFixed(1)}%</span>
            </div>
            <Bar value={memory.percent} color="purple" />
          </div>

          <StatRow label="Used" value={memory.used.human} />
          <StatRow label="Available" value={memory.available.human} />
          <StatRow label="Total" value={memory.total.human} />

          {memory.swap_total?.bytes > 0 && (
            <>
              <div className="border-t border-ocean-100 my-3" />
              <p className="text-xs text-gray-500 mb-2">Swap</p>
              <div className="mb-2">
                <Bar value={memory.swap_percent} color="purple" />
              </div>
              <StatRow label="Swap used" value={memory.swap_used.human} sub={`/ ${memory.swap_total.human}`} />
              <StatRow label="Swap %" value={`${memory.swap_percent.toFixed(1)}%`} />
            </>
          )}
        </Card>
      </div>

      <Card icon={HardDrive} title="Disk" accent="green">
        <div className="space-y-4">
          {disks.map((disk, i) => (
            <div key={i}>
              <div className="flex items-center justify-between mb-1">
                <div>
                  <span className="text-sm text-gray-800 font-mono">{disk.mountpoint}</span>
                  <span className="text-xs text-gray-600 ml-2">({disk.fstype}) {disk.device}</span>
                </div>
                <span className="text-sm font-bold text-gray-800">{disk.percent.toFixed(1)}%</span>
              </div>
              <Bar value={disk.percent} color="green" />
              <div className="flex justify-between mt-1 text-xs text-gray-500">
                <span>{disk.used.human} used</span>
                <span>{disk.free.human} free / {disk.total.human} total</span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card icon={Wifi} title="Network" accent="blue">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
          <div className="bg-sky-50/90 rounded-lg px-4 py-3">
            <p className="text-xs text-gray-500 mb-1">↓ Download</p>
            <p className="text-2xl font-bold text-blue-400 font-mono">
              {network.download_speed?.human ?? '—'}
              <span className="text-sm font-normal text-gray-500">/s</span>
            </p>
          </div>
          <div className="bg-sky-50/90 rounded-lg px-4 py-3">
            <p className="text-xs text-gray-500 mb-1">↑ Upload</p>
            <p className="text-2xl font-bold text-seafoam-500 font-mono">
              {network.upload_speed?.human ?? '—'}
              <span className="text-sm font-normal text-gray-500">/s</span>
            </p>
          </div>
        </div>

        <div className="border-t border-ocean-100 pt-3">
          <p className="text-xs text-gray-600 uppercase tracking-wider mb-2">Since boot</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500">Total received</p>
              <p className="text-sm font-mono text-gray-700">{network.bytes_recv.human}</p>
              <p className="text-xs text-gray-600">{network.packets_recv.toLocaleString()} packets</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Total sent</p>
              <p className="text-sm font-mono text-gray-700">{network.bytes_sent.human}</p>
              <p className="text-xs text-gray-600">{network.packets_sent.toLocaleString()} packets</p>
            </div>
          </div>
        </div>

        {network.active_interfaces?.length > 0 && (
          <div className="mt-3 pt-3 border-t border-ocean-100">
            <p className="text-xs text-gray-500">Interfaces: {network.active_interfaces.join(', ')}</p>
          </div>
        )}
      </Card>

      {gpu && (
        <Card icon={Zap} title="GPU" accent="yellow">
          <div className="flex items-start justify-between mb-4 gap-3">
            <div>
              <p className="text-sm font-semibold text-gray-800">{gpu.name}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {gpu.vram_gb ? `${gpu.vram_gb} GB unified VRAM` : 'GPU detected'}
              </p>
            </div>
            {gpu.usage_pct != null ? (
              <span className="text-xs bg-seafoam-100 text-seafoam-700 px-2 py-1 rounded-full">Vulkan active</span>
            ) : (
              <span className="text-xs bg-sand-100 text-sand-500 px-2 py-1 rounded-full">Idle</span>
            )}
          </div>

          {gpu.usage_pct != null && (
            <div className="mb-4">
              <div className="flex justify-between mb-1">
                <span className="text-xs text-gray-500">GPU usage</span>
                <span className="text-xl font-bold text-gray-800">{gpu.usage_pct.toFixed(1)}%</span>
              </div>
              <Bar value={gpu.usage_pct} color="yellow" />
            </div>
          )}

          {gpu.vram_used_gb != null && gpu.vram_gb != null && (
            <div className="mb-4">
              <div className="flex justify-between mb-1">
                <span className="text-xs text-gray-500">VRAM used</span>
                <span className="text-sm font-bold text-gray-800">{gpu.vram_used_gb} / {gpu.vram_gb} GB</span>
              </div>
              <Bar value={(gpu.vram_used_gb / gpu.vram_gb) * 100} color="yellow" />
            </div>
          )}

          {gpu.temp_c != null && <StatRow label="Temperature" value={`${gpu.temp_c}°C`} />}
          {gpu.power_w != null && <StatRow label="Power draw" value={`${gpu.power_w} W`} />}

          {gpu.driver_note && (
            <p className="text-xs text-gray-600 mt-3 pt-3 border-t border-ocean-100 italic">{gpu.driver_note}</p>
          )}

          {gpu.ollama_models?.length > 0 && (
            <div className="mt-3 pt-3 border-t border-ocean-100">
              <p className="text-xs text-gray-500 mb-2">Model loaded</p>
              {gpu.ollama_models.map((m, i) => (
                <div key={i} className="flex justify-between text-xs">
                  <span className="text-gray-700 font-mono">{m.name}</span>
                  <span className="text-gray-500">{m.size_gb} GB</span>
                </div>
              ))}
            </div>
          )}

          {gpu.ollama_models?.length === 0 && (
            <p className="text-xs text-gray-600 mt-3">No model loaded / <span className="text-gray-500">llama-server may be offline</span></p>
          )}
        </Card>
      )}
    </div>
  );
}

function CardAccentIconClass(accent) {
  const iconMap = {
    ocean: 'text-ocean-400',
    green: 'text-seafoam-500',
    purple: 'text-purple-400',
    blue: 'text-blue-400',
    yellow: 'text-sand-500',
    amber: 'text-amber-400',
    zinc: 'text-zinc-300',
  };

  return iconMap[accent] || iconMap.ocean;
}
