import React from 'react';
import { Cpu, MemoryStick, ArrowDown, ArrowUp, Battery, BatteryCharging, Gpu } from 'lucide-react';
import { SystemMetrics, VisibleStatsConfig } from '../types';

interface SystemDashboardProps {
  metrics: SystemMetrics;
  visibleStats?: VisibleStatsConfig;
  onToggleStat?: (key: keyof VisibleStatsConfig) => void;
}

export const SystemDashboard: React.FC<SystemDashboardProps> = ({
  metrics,
  visibleStats,
  onToggleStat,
}) => {
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

  return (
    <div className="flex flex-col gap-2 w-full text-white pt-0.5">
      {/* Toggle Chips Bar */}
      {visibleStats && onToggleStat && (
        <div className="flex items-center justify-between pb-1.5 border-b border-white/10 px-0.5 select-none">
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
                      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30 shadow-sm'
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
      {/* CPU Metric Card */}
      <div className="flex items-center gap-2 bg-neutral-900/80 rounded-xl p-2 border border-white/10">
        <div className={`p-1.5 rounded-lg ${getMetricColor(metrics.cpu_usage)}`}>
          <Cpu className="w-3.5 h-3.5" />
        </div>
        <div className="flex flex-col">
          <span className="text-[9px] text-neutral-400 uppercase tracking-wider font-medium">CPU</span>
          <span className="text-xs font-semibold text-white">
            {metrics.cpu_usage.toFixed(0)}%
          </span>
        </div>
      </div>

      {/* RAM Metric Card */}
      <div className="flex items-center gap-2 bg-neutral-900/80 rounded-xl p-2 border border-white/10">
        <div className={`p-1.5 rounded-lg ${getRamColor(metrics.ram_percentage)}`}>
          <MemoryStick className="w-3.5 h-3.5" />
        </div>
        <div className="flex flex-col">
          <span className="text-[9px] text-neutral-400 uppercase tracking-wider font-medium">RAM</span>
          <span className="text-xs font-semibold text-white">
            {metrics.ram_percentage.toFixed(0)}%
          </span>
        </div>
      </div>

      {/* GPU Metric Card */}
      <div className="flex items-center gap-2 bg-neutral-900/80 rounded-xl p-2 border border-white/10">
        <div className={`p-1.5 rounded-lg ${getMetricColor(gpuVal)}`}>
          <Gpu className="w-3.5 h-3.5" />
        </div>
        <div className="flex flex-col">
          <span className="text-[9px] text-neutral-400 uppercase tracking-wider font-medium">GPU</span>
          <span className="text-xs font-semibold text-white">
            {gpuVal.toFixed(0)}%
          </span>
        </div>
      </div>

      {/* Network Speeds Card */}
      <div className="flex items-center justify-between col-span-3 bg-neutral-900/80 rounded-xl px-3 py-1.5 border border-white/10 text-xs text-neutral-300">
        <div className="flex items-center gap-1.5">
          <ArrowDown className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-[11px] font-medium">
            {metrics.net_download_kbps > 1024
              ? `${(metrics.net_download_kbps / 1024).toFixed(1)} MB/s`
              : `${metrics.net_download_kbps.toFixed(0)} KB/s`}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <ArrowUp className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-[11px] font-medium">
            {metrics.net_upload_kbps > 1024
              ? `${(metrics.net_upload_kbps / 1024).toFixed(1)} MB/s`
              : `${metrics.net_upload_kbps.toFixed(0)} KB/s`}
          </span>
        </div>

        {/* Battery if available */}
        {metrics.battery_percentage !== undefined && metrics.battery_percentage !== null && (
          <div className="flex items-center gap-1">
            {metrics.is_charging ? (
              <BatteryCharging className="w-3.5 h-3.5 text-amber-400" />
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
