import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Cpu, MemoryStick, ArrowDown, ArrowUp, Battery, BatteryCharging, Gpu } from 'lucide-react';
import { SystemMetrics, VisibleStatsConfig } from '../types';

interface SystemDashboardProps {
  metrics: SystemMetrics;
  visibleStats?: VisibleStatsConfig;
  onToggleStat?: (key: keyof VisibleStatsConfig) => void;
  isGhost?: boolean;
}

const MiniSparkline: React.FC<{ data: number[]; max?: number; color: string }> = ({ data, max = 100, color }) => {
  if (data.length < 2) return null;
  const width = 40;
  const height = 14;
  const points = data.map((val, idx) => {
    const x = (idx / (data.length - 1)) * width;
    const y = height - (Math.min(max, Math.max(0, val)) / max) * (height - 3) - 1.5;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const pathD = `M ${points.join(' L ')}`;
  return (
    <svg width={width} height={height} className="overflow-visible flex-shrink-0 opacity-75">
      <path d={pathD} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

export const SystemDashboard: React.FC<SystemDashboardProps> = ({
  metrics,
  visibleStats,
  onToggleStat,
  isGhost = false,
}) => {
  const [cpuHistory, setCpuHistory] = useState<number[]>(() => [metrics.cpu_usage]);
  const [ramHistory, setRamHistory] = useState<number[]>(() => [metrics.ram_percentage]);
  const [gpuHistory, setGpuHistory] = useState<number[]>(() => [metrics.gpu_usage ?? 0]);

  useEffect(() => {
    setCpuHistory((prev) => [...prev.slice(-11), metrics.cpu_usage]);
    setRamHistory((prev) => [...prev.slice(-11), metrics.ram_percentage]);
    setGpuHistory((prev) => [...prev.slice(-11), metrics.gpu_usage ?? 0]);
  }, [metrics.cpu_usage, metrics.ram_percentage, metrics.gpu_usage]);

  const handleOpenTaskManager = () => {
    invoke('launch_task_manager').catch(() => {});
  };

  const getMetricColor = (val: number) => {
    if (val > 80) return 'text-rose-400 bg-rose-500/20';
    if (val > 50) return 'text-amber-400 bg-amber-500/20';
    return 'text-emerald-400 bg-emerald-500/20';
  };

  const getRamColor = (percent: number) => {
    if (percent > 85) return 'text-rose-400 bg-rose-500/20';
    if (percent > 65) return 'text-amber-400 bg-amber-500/20';
    return 'text-blue-400 bg-blue-500/20';
  };

  const gpuVal = metrics.gpu_usage ?? 0;

  const cardClass = isGhost
    ? 'bg-transparent border-transparent'
    : 'bg-neutral-900/80 border border-white/10';
  const interactiveCardClass = isGhost
    ? cardClass
    : `${cardClass} hover:border-cyan-500/40 hover:bg-neutral-800/90`;

  return (
    <div className="flex flex-col gap-2 w-full text-white pt-0.5">
      {/* Toggle Chips Bar */}
      {visibleStats && onToggleStat && (
        <div
          className={`flex items-center justify-between pb-1.5 px-0.5 select-none ${
            isGhost ? 'border-b border-transparent' : 'border-b border-white/10'
          }`}
        >
          <span className="text-[10px] text-neutral-400 uppercase tracking-wider font-medium">Island Metrics</span>
          <div className="flex items-center gap-1">
            {(['cpu', 'ram', 'gpu', 'battery', 'net'] as const).map((key) => {
              const labels: Record<string, string> = {
                cpu: 'CPU',
                ram: 'RAM',
                gpu: 'GPU',
                battery: 'Bat',
                net: 'Net',
              };
              const isActive = visibleStats[key];
              return (
                <button
                  key={key}
                  onClick={() => onToggleStat(key)}
                  className={`px-2 py-0.5 text-[10px] font-medium rounded-full transition-all border active:scale-95 cursor-pointer ${
                    isActive
                      ? isGhost
                        ? 'bg-transparent text-cyan-300 border-transparent'
                        : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30 shadow-sm'
                      : isGhost
                      ? 'bg-transparent text-neutral-500 border-transparent hover:text-neutral-300'
                      : 'bg-white/5 text-neutral-500 border-white/5 hover:text-neutral-300 hover:bg-white/10'
                  }`}
                  title={`Toggle ${labels[key]} in compact island`}
                >
                  {isActive ? `✓ ${labels[key]}` : labels[key]}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Grid of Metric Cards */}
      <div className="grid grid-cols-3 gap-2 w-full">
        {/* CPU Metric Card (Clickable -> Task Manager) */}
        <div
          onClick={handleOpenTaskManager}
          className={`flex items-center justify-between rounded-xl p-2 cursor-pointer active:scale-[0.98] transition-all group ${interactiveCardClass}`}
          title="Click to open Windows Task Manager"
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <div className={`p-1.5 rounded-lg ${getMetricColor(metrics.cpu_usage)} flex-shrink-0`}>
              <Cpu className="w-3.5 h-3.5" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[9px] text-neutral-400 uppercase tracking-wider font-medium group-hover:text-cyan-300 transition-colors">CPU</span>
              <span className="text-xs font-semibold text-white">
                {metrics.cpu_usage.toFixed(0)}%
              </span>
            </div>
          </div>
          <MiniSparkline data={cpuHistory} color={metrics.cpu_usage > 80 ? '#fb7185' : '#34d399'} />
        </div>

        {/* RAM Metric Card (Clickable -> Task Manager) */}
        <div
          onClick={handleOpenTaskManager}
          className={`flex items-center justify-between rounded-xl p-2 cursor-pointer active:scale-[0.98] transition-all group ${interactiveCardClass}`}
          title="Click to open Windows Task Manager"
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <div className={`p-1.5 rounded-lg ${getRamColor(metrics.ram_percentage)} flex-shrink-0`}>
              <MemoryStick className="w-3.5 h-3.5" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[9px] text-neutral-400 uppercase tracking-wider font-medium group-hover:text-cyan-300 transition-colors">RAM</span>
              <span className="text-xs font-semibold text-white">
                {metrics.ram_percentage.toFixed(0)}%
              </span>
            </div>
          </div>
          <MiniSparkline data={ramHistory} color={metrics.ram_percentage > 85 ? '#fb7185' : '#38bdf8'} />
        </div>

        {/* GPU Metric Card */}
        <div className={`flex items-center justify-between rounded-xl p-2 border ${cardClass}`}>
          <div className="flex items-center gap-1.5 min-w-0">
            <div className={`p-1.5 rounded-lg ${getMetricColor(gpuVal)} flex-shrink-0`}>
              <Gpu className="w-3.5 h-3.5" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[9px] text-neutral-400 uppercase tracking-wider font-medium">GPU</span>
              <span className="text-xs font-semibold text-white">
                {gpuVal.toFixed(0)}%
              </span>
            </div>
          </div>
          <MiniSparkline data={gpuHistory} color={gpuVal > 80 ? '#fb7185' : '#fbbf24'} />
        </div>

        {/* Network & Battery Status Card */}
        <div className={`flex items-center justify-between col-span-3 rounded-xl px-3 py-1.5 border text-xs text-neutral-300 ${cardClass}`}>
          <div className="flex items-center gap-1.5">
            <ArrowDown className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[11px] font-medium font-mono">
              {metrics.net_download_kbps > 1024
                ? `${(metrics.net_download_kbps / 1024).toFixed(1)} MB/s`
                : `${metrics.net_download_kbps.toFixed(0)} KB/s`}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <ArrowUp className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-[11px] font-medium font-mono">
              {metrics.net_upload_kbps > 1024
                ? `${(metrics.net_upload_kbps / 1024).toFixed(1)} MB/s`
                : `${metrics.net_upload_kbps.toFixed(0)} KB/s`}
            </span>
          </div>

          {/* Battery if available */}
          {metrics.battery_percentage !== undefined && metrics.battery_percentage !== null && (
            <div className="flex items-center gap-1 font-mono">
              {metrics.is_charging ? (
                <BatteryCharging className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
              ) : (
                <Battery className="w-3.5 h-3.5 text-neutral-400" />
              )}
              <span className="text-[11px] font-medium">{metrics.battery_percentage}%</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
