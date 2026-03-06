import { useState, useEffect, useCallback } from 'react';
import {
  Cpu, MemoryStick, HardDrive, Wifi, Clock, Activity,
  RefreshCw, Zap
} from 'lucide-react';
import api from '../api';

const REFRESH_MS = 3000;

function pct(val) {
  const n = Number(val);
  return isNaN(n) ? 0 : Math.min(100, Math.max(0, n));
}

function Bar({ value, color = 'ocean' }) {
  const colorMap = {
    ocean: 'bg-ocean-500',
    green: 'bg-green-500',
    yellow: 'bg-yellow-500',
    red: 'bg-red-500',
    purple: 'bg-purple-500',
    blue: 'bg-blue-500',
  };
  const barColor = value > 85 ? colorMap.red : value > 60 ? colorMap.yellow : colorMap[color];
  return (
    <div className="w-full bg-gray-700 rounded-full h-2">
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
    green: 'text-green-400 border-green-500/30',
    purple: 'text-purple-400 border-purple-500/30',
    blue: 'text-blue-400 border-blue-500/30',
    yellow: 'text-yellow-400 border-yellow-500/30',
  };
  return (
    <div className={`bg-gray-900 border ${accentMap[accent]} rounded-xl p-5`}>
      <div className="flex items-center gap-2 mb-4">
        <Icon className={`w-5 h-5 ${accentMap[accent].split(' ')[0]}`} />
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function StatRow({ label, value, sub }) {
  return (
    <div className="flex items-baseline justify-between mb-1">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-sm font-mono text-white">{value}{sub && <span className="text-xs text-gray-500 ml-1">{sub}</span>}</span>
    </div>
  );
}

export default function Resources() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await api.get('/system/resources');
      setData(res.data);
      setLastUpdated(new Date());
      setError(null);
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to fetch system data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, REFRESH_MS);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" />
        Loading system info…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64 text-red-400">
        <Activity className="w-5 h-5 mr-2" />
        {error}
      </div>
    );
  }

  if (!data) return null;

  const { cpu, memory, disks, network, system } = data;

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Zap className="w-5 h-5 text-red-400" />
            Machine Resources
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Auto-refreshes every {REFRESH_MS / 1000}s
            {lastUpdated && ` · Last: ${lastUpdated.toLocaleTimeString()}`}
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <Clock className="w-4 h-4" />
          <span>Up {system?.uptime_human ?? '...'}</span>
          <span className="text-gray-700">·</span>
          <span>{system?.process_count ?? '...'} processes</span>
        </div>
      </div>

      {/* Top row — CPU + RAM */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* CPU */}
        <Card icon={Cpu} title="CPU" accent="ocean">
          <div className="mb-4">
            <div className="flex justify-between mb-1">
              <span className="text-xs text-gray-500">Overall usage</span>
              <span className="text-2xl font-bold text-white">{cpu.percent.toFixed(1)}%</span>
            </div>
            <Bar value={cpu.percent} />
          </div>

          <StatRow label="Physical cores" value={cpu.count_physical} />
          <StatRow label="Logical cores" value={cpu.count_logical} />
          {cpu.freq_mhz && (
            <StatRow label="Frequency" value={`${cpu.freq_mhz} MHz`} sub={cpu.freq_max_mhz ? `/ ${cpu.freq_max_mhz} max` : ''} />
          )}
          {cpu.load_avg?.length > 0 && (
            <StatRow label="Load avg (1/5/15m)" value={cpu.load_avg.map(v => v.toFixed(2)).join(' / ')} />
          )}

          {/* Per-core bars */}
          {cpu.per_core?.length > 0 && (
            <div className="mt-4">
              <p className="text-xs text-gray-500 mb-2">Per-core usage</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                {cpu.per_core.map((v, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-xs text-gray-600 w-8">C{i}</span>
                    <div className="flex-1">
                      <Bar value={v} />
                    </div>
                    <span className="text-xs font-mono text-gray-400 w-8 text-right">{v.toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* Memory */}
        <Card icon={MemoryStick} title="Memory" accent="purple">
          <div className="mb-4">
            <div className="flex justify-between mb-1">
              <span className="text-xs text-gray-500">RAM usage</span>
              <span className="text-2xl font-bold text-white">{memory.percent.toFixed(1)}%</span>
            </div>
            <Bar value={memory.percent} color="purple" />
          </div>

          <StatRow label="Used" value={memory.used.human} />
          <StatRow label="Available" value={memory.available.human} />
          <StatRow label="Total" value={memory.total.human} />

          {memory.swap_total?.bytes > 0 && (
            <>
              <div className="border-t border-gray-800 my-3" />
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

      {/* Disk */}
      <Card icon={HardDrive} title="Disk" accent="green">
        <div className="space-y-4">
          {disks.map((disk, i) => (
            <div key={i}>
              <div className="flex items-center justify-between mb-1">
                <div>
                  <span className="text-sm text-white font-mono">{disk.mountpoint}</span>
                  <span className="text-xs text-gray-600 ml-2">({disk.fstype}) {disk.device}</span>
                </div>
                <span className="text-sm font-bold text-white">{disk.percent.toFixed(1)}%</span>
              </div>
              <Bar value={disk.percent} color="green" />
              <div className="flex justify-between mt-1 text-xs text-gray-500">
                <span>{disk.used.human} used</span>
                <span>{disk.free.human} free · {disk.total.human} total</span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Network */}
      <Card icon={Wifi} title="Network (cumulative since boot)" accent="blue">
        <div className="grid grid-cols-2 gap-6">
          <div>
            <p className="text-xs text-gray-500 mb-2">Received</p>
            <p className="text-2xl font-bold text-blue-400">{network.bytes_recv.human}</p>
            <p className="text-xs text-gray-500 mt-1">{network.packets_recv.toLocaleString()} packets</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-2">Sent</p>
            <p className="text-2xl font-bold text-green-400">{network.bytes_sent.human}</p>
            <p className="text-xs text-gray-500 mt-1">{network.packets_sent.toLocaleString()} packets</p>
          </div>
        </div>
        {network.active_interfaces?.length > 0 && (
          <div className="mt-4 pt-3 border-t border-gray-800">
            <p className="text-xs text-gray-500">Active interfaces: {network.active_interfaces.join(', ')}</p>
          </div>
        )}
      </Card>
    </div>
  );
}
