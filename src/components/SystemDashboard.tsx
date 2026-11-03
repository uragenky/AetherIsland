import React from 'react';
import { Cpu, HardDrive, ArrowDown, ArrowUp, Battery, BatteryCharging } from 'lucide-react';
import { SystemMetrics } from '../types';

interface SystemDashboardProps {
  metrics: SystemMetrics;
}

export const SystemDashboard: React.FC<SystemDashboardProps> = ({ metrics }) => {
  const ramUsedGB = (metrics.ram_used_bytes / (1024 * 1024 * 1024)).toFixed(1);
  const ramTotalGB = (metrics.ram_total_bytes / (1024 * 1024 * 1024)).toFixed(1);

  const getCpuColor = (usage: number) => {
    if (usage > 80) return 'text-rose-400 bg-rose-500/20';
    if (usage > 50) return 'text-amber-400 bg-amber-500/20';
    return 'text-emerald-400 bg-emerald-500/20';
  };

  const getRamColor = (percent: number) => {
    if (percent > 85) return 'text-rose-400 bg-rose-500/20';
    if (percent > 65) return 'text-amber-400 bg-amber-500/20';
    return 'text-blue-400 bg-blue-500/20';
  };

  return (
    <div className="grid grid-cols-2 gap-2 w-full text-white pt-1">
      {/* CPU Metric Card */}
      <div className="flex items-center gap-2.5 bg-neutral-900/80 rounded-xl p-2 border border-white/5">
        <div className={`p-1.5 rounded-lg ${getCpuColor(metrics.cpu_usage)}`}>
          <Cpu className="w-4 h-4" />
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] text-neutral-400 uppercase tracking-wider font-medium">CPU</span>
          <span className="text-xs font-semibold text-white">
            {metrics.cpu_usage.toFixed(0)}%
          </span>
        </div>
      </div>

      {/* RAM Metric Card */}
      <div className="flex items-center gap-2.5 bg-neutral-900/80 rounded-xl p-2 border border-white/5">
        <div className={`p-1.5 rounded-lg ${getRamColor(metrics.ram_percentage)}`}>
          <HardDrive className="w-4 h-4" />
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] text-neutral-400 uppercase tracking-wider font-medium">Memory</span>
          <span className="text-xs font-semibold text-white">
            {ramUsedGB}/{ramTotalGB} GB ({metrics.ram_percentage.toFixed(0)}%)
          </span>
        </div>
      </div>

      {/* Network Speeds Card */}
      <div className="flex items-center justify-between col-span-2 bg-neutral-900/80 rounded-xl px-3 py-1.5 border border-white/5 text-xs text-neutral-300">
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
  );
};
