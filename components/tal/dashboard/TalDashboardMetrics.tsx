// components/tal/dashboard/TalDashboardMetrics.tsx — kartu metrik Hari Ini /
// Minggu Ini / Bulan Ini di hub TAL.
// Porting src/components/tal/dashboard/TalDashboardMetrics.tsx (backup
// MyPerform). Adaptasi: useNavigate (react-router-dom) -> useRouter
// (next/navigation); onSelectScope tetap didukung, fallback-nya router.push
// ke /tal/tasks?type=<scope>.
'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, CalendarDays, CheckCircle2, Clock, AlertCircle, ChevronRight } from 'lucide-react';

export interface ScopeMetricData {
  total: number;
  done: number;
  pending: number;
  reportStatus: 'reported' | 'late' | 'not_reported';
  reportStatusLabel: string;
  isPlanLocked?: boolean;
}

interface TalDashboardMetricsProps {
  daily: ScopeMetricData;
  weekly: ScopeMetricData;
  monthly: ScopeMetricData;
  showDaily?: boolean;
  showWeekly?: boolean;
  showMonthly?: boolean;
  onSelectScope?: (scope: 'daily' | 'weekly' | 'monthly') => void;
}

export const TalDashboardMetrics: React.FC<TalDashboardMetricsProps> = ({
  daily,
  weekly,
  monthly,
  showDaily = true,
  showWeekly = true,
  showMonthly = true,
  onSelectScope
}) => {
  const router = useRouter();

  const activeCardsCount = [showDaily, showWeekly, showMonthly].filter(Boolean).length;

  const handleScopeClick = (scope: 'daily' | 'weekly' | 'monthly') => {
    if (onSelectScope) {
      onSelectScope(scope);
    } else {
      router.push(`/tal/tasks?type=${scope}`);
    }
  };

  const renderStatusBadge = (status: 'reported' | 'late' | 'not_reported', label: string) => {
    switch (status) {
      case 'reported':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-300/50">
            <CheckCircle2 size={11} className="text-emerald-600" />
            <span>{label || 'Sudah Laporkan'}</span>
          </span>
        );
      case 'late':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-300/50">
            <AlertCircle size={11} className="text-rose-600" />
            <span>{label || 'Terlambat Laporkan'}</span>
          </span>
        );
      case 'not_reported':
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300/50">
            <Clock size={11} className="text-amber-600" />
            <span>{label || 'Belum Laporkan'}</span>
          </span>
        );
    }
  };

  const getPercentage = (done: number, total: number) => {
    if (total === 0) return 0;
    return Math.round((done / total) * 100);
  };

  return (
    <div className={`grid grid-cols-1 ${activeCardsCount === 3 ? 'sm:grid-cols-3' : activeCardsCount === 2 ? 'sm:grid-cols-2' : ''} gap-2.5 sm:gap-3`}>
      {/* 1. Hari Ini (Clickable -> Tab Harian) */}
      {showDaily && (
        <div
          role="button"
          tabIndex={0}
          onClick={() => handleScopeClick('daily')}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleScopeClick('daily'); }}
          title="Klik untuk membuka Tasks Tab Harian"
          className="bg-white rounded-xl border border-slate-200/90 p-3 shadow-sm hover:border-blue-400 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 cursor-pointer group select-none"
        >
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <div className="w-6 h-6 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 group-hover:bg-blue-100 transition-colors">
                <Clock size={13} />
              </div>
              <div className="flex items-center gap-1 min-w-0">
                <span className="text-xs font-bold text-slate-800 group-hover:text-blue-700 transition-colors truncate">
                  Hari Ini
                </span>
                <ChevronRight size={12} className="text-slate-300 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all" />
              </div>
            </div>
            {renderStatusBadge(daily.reportStatus, daily.reportStatusLabel)}
          </div>

          <div className="flex items-baseline justify-between gap-2">
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-black text-slate-900 leading-none">{daily.done}</span>
              <span className="text-xs font-medium text-slate-400">/ {daily.total} Task</span>
            </div>
            <span className="text-[11px] font-bold text-blue-600">
              {getPercentage(daily.done, daily.total)}%
            </span>
          </div>

          <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden mt-2 mb-2">
            <div
              className="bg-blue-600 h-full rounded-full transition-all duration-300"
              style={{ width: `${getPercentage(daily.done, daily.total)}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] font-medium text-slate-500 pt-1 border-t border-slate-100">
            <span>Done: <strong className="text-emerald-600">{daily.done}</strong></span>
            <span>Pending: <strong className="text-amber-600">{daily.pending}</strong></span>
          </div>
        </div>
      )}

      {/* 2. Minggu Ini (Clickable -> Tab Mingguan) */}
      {showWeekly && (
        <div
          role="button"
          tabIndex={0}
          onClick={() => handleScopeClick('weekly')}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleScopeClick('weekly'); }}
          title="Klik untuk membuka Tasks Tab Mingguan"
          className="bg-white rounded-xl border border-slate-200/90 p-3 shadow-sm hover:border-indigo-400 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 cursor-pointer group select-none"
        >
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <div className="w-6 h-6 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 group-hover:bg-indigo-100 transition-colors">
                <Calendar size={13} />
              </div>
              <div className="flex items-center gap-1 min-w-0">
                <span className="text-xs font-bold text-slate-800 group-hover:text-indigo-700 transition-colors truncate">
                  Minggu Ini
                </span>
                <ChevronRight size={12} className="text-slate-300 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition-all" />
              </div>
            </div>
            {renderStatusBadge(weekly.reportStatus, weekly.reportStatusLabel)}
          </div>

          <div className="flex items-baseline justify-between gap-2">
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-black text-slate-900 leading-none">{weekly.done}</span>
              <span className="text-xs font-medium text-slate-400">/ {weekly.total} Task</span>
            </div>
            <span className="text-[11px] font-bold text-indigo-600">
              {getPercentage(weekly.done, weekly.total)}%
            </span>
          </div>

          <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden mt-2 mb-2">
            <div
              className="bg-indigo-600 h-full rounded-full transition-all duration-300"
              style={{ width: `${getPercentage(weekly.done, weekly.total)}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] font-medium text-slate-500 pt-1 border-t border-slate-100">
            <span>Done: <strong className="text-emerald-600">{weekly.done}</strong></span>
            <span>Pending: <strong className="text-amber-600">{weekly.pending}</strong></span>
          </div>
        </div>
      )}

      {/* 3. Bulan Ini (Clickable -> Tab Bulanan) */}
      {showMonthly && (
        <div
          role="button"
          tabIndex={0}
          onClick={() => handleScopeClick('monthly')}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleScopeClick('monthly'); }}
          title="Klik untuk membuka Tasks Tab Bulanan"
          className="bg-white rounded-xl border border-slate-200/90 p-3 shadow-sm hover:border-cyan-400 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 cursor-pointer group select-none"
        >
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <div className="w-6 h-6 rounded-lg bg-cyan-50 text-cyan-600 flex items-center justify-center shrink-0 group-hover:bg-cyan-100 transition-colors">
                <CalendarDays size={13} />
              </div>
              <div className="flex items-center gap-1 min-w-0">
                <span className="text-xs font-bold text-slate-800 group-hover:text-cyan-700 transition-colors truncate">
                  Bulan Ini
                </span>
                <ChevronRight size={12} className="text-slate-300 group-hover:text-cyan-600 group-hover:translate-x-0.5 transition-all" />
              </div>
            </div>
            {renderStatusBadge(monthly.reportStatus, monthly.reportStatusLabel)}
          </div>

          <div className="flex items-baseline justify-between gap-2">
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-black text-slate-900 leading-none">{monthly.done}</span>
              <span className="text-xs font-medium text-slate-400">/ {monthly.total} Task</span>
            </div>
            <span className="text-[11px] font-bold text-cyan-600">
              {getPercentage(monthly.done, monthly.total)}%
            </span>
          </div>

          <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden mt-2 mb-2">
            <div
              className="bg-cyan-600 h-full rounded-full transition-all duration-300"
              style={{ width: `${getPercentage(monthly.done, monthly.total)}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] font-medium text-slate-500 pt-1 border-t border-slate-100">
            <span>Done: <strong className="text-emerald-600">{monthly.done}</strong></span>
            <span>Pending: <strong className="text-amber-600">{monthly.pending}</strong></span>
          </div>
        </div>
      )}
    </div>
  );
};
