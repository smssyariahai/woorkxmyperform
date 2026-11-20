// components/tal/dashboard/TalDashboardPerformanceChart.tsx — tren nilai
// capaian TAL mingguan + panel capaian bulanan.
// Porting src/components/tal/dashboard/TalDashboardPerformanceChart.tsx
// (backup MyPerform) apa adanya; impor bulan dari lib/tal/date. Impor Info
// yang tak terpakai di backup dibuang.
import React from 'react';
import { TrendingUp, Calendar } from 'lucide-react';
import { INDONESIAN_MONTHS, INDONESIAN_MONTHS_SHORT } from '@/lib/tal/date';

export interface WeekPerformanceItem {
  weekLabel: string; // e.g., "W-36", "W-37"
  score: number; // e.g. 95, 100, 110
  isCurrent?: boolean;
}

interface TalDashboardPerformanceChartProps {
  weeklyTrends: WeekPerformanceItem[];
  monthlyScore: number; // e.g. 102
  monthlyTarget?: number; // default 100
  monthName: string;
  selectedMonth: number; // 1 to 12
  onMonthChange: (month: number) => void;
  isStructural?: boolean;
  scoreBreakdown?: {
    nilaiTaskBulanan: number;
    avgNilaiTalMingguan: number;
  };
}

export const TalDashboardPerformanceChart: React.FC<TalDashboardPerformanceChartProps> = ({
  weeklyTrends,
  monthlyScore,
  monthlyTarget = 100,
  monthName,
  selectedMonth,
  onMonthChange,
  isStructural = false,
  scoreBreakdown
}) => {
  // Find maximum score for chart scaling (at least 120 so 100 is visible)
  const maxScore = Math.max(120, ...weeklyTrends.map(w => w.score), monthlyScore);

  const getBarColor = (score: number) => {
    if (score >= 100) return 'bg-emerald-500';
    if (score >= 80) return 'bg-blue-500';
    if (score >= 60) return 'bg-amber-400';
    if (score > 0) return 'bg-rose-400';
    return 'bg-slate-200';
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200/90 p-3.5 sm:p-4 shadow-sm space-y-3.5">
      {/* Header with Title, Month Filter Dropdown, and Legend */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100">
            <TrendingUp size={15} />
          </div>
          <span className="text-xs sm:text-sm font-bold text-slate-800 truncate">
            Tren Nilai Capaian TAL
          </span>
        </div>

        {/* Month Selector */}
        <div className="flex items-center gap-2">
          {/* Dropdown Filter Bulan: Jan s.d. Des (Responsive: 3 chars on mobile, Full name on tablet/desktop) */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 shadow-sm">
            <Calendar size={13} className="text-slate-500 shrink-0" />

            {/* Mobile (3 Karakter: Jan, Feb, Mar, ...) */}
            <select
              value={selectedMonth}
              onChange={(e) => onMonthChange(Number(e.target.value))}
              aria-label="Filter Bulan Capaian TAL (Singkat)"
              className="block sm:hidden text-xs font-bold text-slate-700 bg-transparent focus:outline-none cursor-pointer"
            >
              {INDONESIAN_MONTHS_SHORT.map((sName, idx) => (
                <option key={idx + 1} value={idx + 1}>
                  {sName}
                </option>
              ))}
            </select>

            {/* Tablet & Laptop/Desktop (Full Nama Bulan: Januari, Februari, ...) */}
            <select
              value={selectedMonth}
              onChange={(e) => onMonthChange(Number(e.target.value))}
              aria-label="Filter Bulan Capaian TAL (Lengkap)"
              className="hidden sm:block text-xs font-bold text-slate-700 bg-transparent focus:outline-none cursor-pointer"
            >
              {INDONESIAN_MONTHS.map((mName, idx) => (
                <option key={idx + 1} value={idx + 1}>
                  {mName}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Main Grid: Weekly Bars (Left) + Monthly Dial/Bar (Right) */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-1">
        {/* Weekly Trend Bar Chart (7 cols on sm) */}
        <div className="sm:col-span-7 flex flex-col justify-between">
          <div className="flex items-end justify-between gap-2 h-32 px-2 pb-1 border-b border-slate-100 relative">
            {/* Target 100% Dashed Line - Positioned with label on the far left so it NEVER overlaps with any bar */}
            <div
              className="absolute left-0 right-0 border-t border-dashed border-slate-300 pointer-events-none z-0"
              style={{ bottom: `${(100 / maxScore) * 80}px` }}
            >
              <span className="absolute -top-3.5 left-0 text-[9px] font-bold text-slate-400 bg-white/95 px-1 py-0.5 rounded shadow-sm border border-slate-100">
                Target 100%
              </span>
            </div>

            {/* Weekly Bars */}
            {weeklyTrends.map((item, idx) => {
              const barHeightPx = item.score > 0
                ? Math.min(80, Math.max(6, (item.score / maxScore) * 80))
                : 4;
              return (
                <div key={idx} className="flex-1 h-full flex flex-col items-center justify-end gap-1.5 z-10 group">
                  <span className="text-[10px] font-bold text-slate-700 opacity-90 group-hover:opacity-100 group-hover:scale-110 transition shrink-0">
                    {item.score}%
                  </span>
                  <div className="w-full max-w-[28px] bg-slate-100/90 rounded-t-md h-20 flex items-end justify-center overflow-hidden border-t border-x border-slate-200/50">
                    <div
                      className={`w-full rounded-t-md transition-all duration-300 ${getBarColor(item.score)} ${
                        item.isCurrent ? 'ring-2 ring-indigo-500 ring-offset-1 ring-offset-white' : ''
                      }`}
                      style={{ height: `${barHeightPx}px` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Week Labels */}
          <div className="flex justify-between gap-2 px-2 pt-1.5 text-[10px] font-semibold text-slate-500">
            {weeklyTrends.map((item, idx) => (
              <span
                key={idx}
                className={`flex-1 text-center truncate ${item.isCurrent ? 'text-indigo-600 font-bold bg-indigo-50/80 rounded px-0.5' : ''}`}
              >
                {item.weekLabel}
              </span>
            ))}
          </div>
        </div>

        {/* Monthly Score Highlight Card (5 cols on sm) */}
        <div className="sm:col-span-5 bg-gradient-to-br from-slate-50 to-slate-100/70 rounded-xl border border-slate-200/90 p-3 flex flex-col justify-between text-center relative shadow-sm">
          <div>
            <div className="flex items-center justify-center gap-1">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Capaian {monthName}
              </span>
            </div>

            <div className="mt-1 flex items-baseline justify-center gap-1">
              <span className={`text-2xl sm:text-3xl font-black ${
                monthlyScore >= 100 ? 'text-emerald-600' : monthlyScore >= 80 ? 'text-blue-600' : monthlyScore > 0 ? 'text-amber-600' : 'text-slate-500'
              }`}>
                {monthlyScore}%
              </span>
            </div>

            <span className="text-[10px] text-slate-400 block mt-0.5">
              Target Bulanan: {monthlyTarget}%
            </span>

            {/* Score Formula Breakdown */}
            {scoreBreakdown && (
              <div className="mt-1.5 pt-1.5 border-t border-slate-200/80 text-[10px] text-slate-500 text-left px-1 space-y-0.5">
                {isStructural ? (
                  <>
                    <div className="flex justify-between items-center text-[9.5px]">
                      <span>Task Bulanan (20%):</span>
                      <span className="font-semibold text-slate-700">{scoreBreakdown.nilaiTaskBulanan}%</span>
                    </div>
                    <div className="flex justify-between items-center text-[9.5px]">
                      <span>Avg Mingguan (80%):</span>
                      <span className="font-semibold text-slate-700">{scoreBreakdown.avgNilaiTalMingguan}%</span>
                    </div>
                  </>
                ) : (
                  <div className="flex justify-between items-center text-[9.5px]">
                    <span>Avg Mingguan:</span>
                    <span className="font-semibold text-slate-700">{scoreBreakdown.avgNilaiTalMingguan}%</span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="mt-2">
            <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${getBarColor(monthlyScore)}`}
                style={{ width: `${Math.min(100, Math.max(0, (monthlyScore / monthlyTarget) * 100))}%` }}
              />
            </div>
            <span className="text-[9px] text-slate-600 font-semibold block mt-1">
              {monthlyScore >= monthlyTarget
                ? '✅ Target Tercapai'
                : monthlyScore > 0
                  ? `Sisa ${Math.max(0, monthlyTarget - monthlyScore)}% menuju target`
                  : 'Belum ada capaian'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
