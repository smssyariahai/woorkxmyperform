// components/tal/dashboard/TalDashboardAlertBanners.tsx — banner countdown
// deadline (laporan harian, kunci rencana pekan/bulan) + banner libur terdekat.
// Porting src/components/tal/dashboard/TalDashboardAlertBanners.tsx (backup
// MyPerform) apa adanya; hanya impor tipe yang diarahkan ke lib/tal/types.
// Catatan Tailwind: shadow-2xs/backdrop-blur-xs backup dipetakan ke
// shadow-sm/backdrop-blur-sm (token WOORK; kelas backup tidak terdefinisi).
'use client';

import React, { useState, useEffect } from 'react';
import { Clock, Lock, PartyPopper, ChevronRight, X, AlertCircle } from 'lucide-react';
import type { TalHolidayItem } from '@/lib/tal/types';

export interface TalAlertBannerItem {
  id: string;
  scope: 'daily' | 'weekly' | 'monthly';
  type: 'plan' | 'report';
  label: string;
  targetTime: Date;
  isPassed: boolean;
  actionText?: string;
  onAction?: () => void;
}

interface TalDashboardAlertBannersProps {
  alerts?: TalAlertBannerItem[];
  planDeadlineInfo?: {
    label: string;
    targetTime: Date;
    isPassed: boolean;
  } | null;
  reportDeadlineInfo?: {
    label: string;
    targetTime: Date;
    isPassed: boolean;
  } | null;
  upcomingHolidays?: TalHolidayItem[];
  onActionClick?: (type: 'plan' | 'report', scope?: 'daily' | 'weekly' | 'monthly') => void;
}

export const TalDashboardAlertBanners: React.FC<TalDashboardAlertBannersProps> = ({
  alerts,
  planDeadlineInfo,
  reportDeadlineInfo,
  upcomingHolidays = [],
  onActionClick
}) => {
  const [now, setNow] = useState(new Date());
  const [dismissHoliday, setDismissHoliday] = useState(false);

  // Update timer every minute
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const formatCountdown = (target: Date) => {
    const diff = target.getTime() - now.getTime();
    if (diff <= 0) {
      const pastHours = Math.floor(Math.abs(diff) / (1000 * 60 * 60));
      const pastMinutes = Math.floor((Math.abs(diff) % (1000 * 60 * 60)) / (1000 * 60));
      if (pastHours > 24) {
        const pastDays = Math.floor(pastHours / 24);
        return `Batas terlewat ${pastDays} hari lalu`;
      }
      if (pastHours > 0) {
        return `Batas terlewat ${pastHours}j ${pastMinutes}m lalu`;
      }
      return 'Batas Waktu Telah Tiba';
    }

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 24) {
      const days = Math.floor(hours / 24);
      const remHours = hours % 24;
      return `${days} hari ${remHours} jam lagi`;
    }
    return `${hours} jam ${minutes} menit lagi`;
  };

  // Find nearest upcoming holiday (within next 7 days or today)
  const todayStr = now.toISOString().slice(0, 10);
  const activeHoliday = upcomingHolidays.find(h => {
    return h.date >= todayStr;
  });

  // Combine alerts: use alerts array if provided, or fallback to legacy props
  const activeAlerts: TalAlertBannerItem[] = alerts ?? [
    ...(planDeadlineInfo ? [{
      id: 'legacy_plan',
      scope: 'weekly' as const,
      type: 'plan' as const,
      label: planDeadlineInfo.label,
      targetTime: planDeadlineInfo.targetTime,
      isPassed: planDeadlineInfo.isPassed,
      actionText: 'Kunci',
      onAction: () => onActionClick && onActionClick('plan', 'weekly')
    }] : []),
    ...(reportDeadlineInfo ? [{
      id: 'legacy_report',
      scope: 'daily' as const,
      type: 'report' as const,
      label: reportDeadlineInfo.label,
      targetTime: reportDeadlineInfo.targetTime,
      isPassed: reportDeadlineInfo.isPassed,
      actionText: 'Lapor',
      onAction: () => onActionClick && onActionClick('report', 'daily')
    }] : [])
  ];

  const hasAlerts = activeAlerts.length > 0 || (activeHoliday && !dismissHoliday);
  if (!hasAlerts) return null;

  const getGridColsClass = () => {
    if (activeAlerts.length === 1) return 'grid-cols-1';
    if (activeAlerts.length === 2) return 'grid-cols-1 sm:grid-cols-2';
    return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';
  };

  return (
    <div className="space-y-2.5">
      {/* 1. Holiday Banner if today or upcoming */}
      {activeHoliday && !dismissHoliday && (
        <div className="bg-amber-500/10 border border-amber-300/80 rounded-xl px-3.5 py-2 text-xs flex items-center justify-between gap-2 shadow-sm">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-6 h-6 rounded-lg bg-amber-500 text-white flex items-center justify-center shrink-0">
              <PartyPopper size={13} />
            </div>
            <div className="min-w-0">
              <span className="font-bold text-amber-900 truncate block">
                {activeHoliday.date === todayStr ? 'Hari Ini Hari Libur / Cuti Bersama: ' : 'Libur Terdekat: '}
                <strong className="text-amber-800 font-semibold">{activeHoliday.title}</strong>
              </span>
              <span className="text-[11px] text-amber-700 font-medium">
                Tanggal {activeHoliday.date} • {activeHoliday.category === 'cuti_bersama' ? 'Cuti Bersama' : 'Libur Nasional'} (Deadline otomatis digeser ke hari kerja berikutnya)
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setDismissHoliday(true)}
            className="text-amber-600 hover:text-amber-800 p-1 rounded-lg shrink-0 cursor-pointer"
            title="Tutup banner libur"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* 2. Deadlines Row (Plan Lock & Reporting) */}
      {activeAlerts.length > 0 && (
        <div className={`grid ${getGridColsClass()} gap-2`}>
          {activeAlerts.map(alert => {
            const isPlan = alert.type === 'plan';
            const isPassed = alert.isPassed || (alert.targetTime.getTime() < now.getTime());

            // Themes based on type & scope
            const themeClasses = isPlan
              ? 'bg-gradient-to-r from-indigo-950 via-slate-900 to-indigo-900 border-indigo-500/30'
              : alert.scope === 'monthly'
              ? 'bg-gradient-to-r from-purple-950 via-slate-900 to-slate-900 border-purple-500/30'
              : alert.scope === 'weekly'
              ? 'bg-gradient-to-r from-sky-950 via-slate-900 to-slate-900 border-sky-500/30'
              : 'bg-gradient-to-r from-blue-950 via-slate-900 to-blue-900 border-blue-500/30';

            const iconBg = isPlan
              ? 'bg-indigo-500/30 text-indigo-300 border-indigo-400/30'
              : alert.scope === 'monthly'
              ? 'bg-purple-500/30 text-purple-300 border-purple-400/30'
              : alert.scope === 'weekly'
              ? 'bg-sky-500/30 text-sky-300 border-sky-400/30'
              : 'bg-blue-500/30 text-blue-300 border-blue-400/30';

            const btnBg = isPlan
              ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
              : alert.scope === 'monthly'
              ? 'bg-purple-600 hover:bg-purple-500 text-white'
              : alert.scope === 'weekly'
              ? 'bg-sky-600 hover:bg-sky-500 text-white'
              : 'bg-blue-600 hover:bg-blue-500 text-white';

            return (
              <div
                key={alert.id}
                className={`text-white rounded-xl px-3.5 py-2 shadow-sm border flex items-center justify-between gap-2 transition-all ${themeClasses}`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border ${iconBg}`}>
                    {isPlan ? <Lock size={13} /> : <Clock size={13} />}
                  </div>
                  <div className="min-w-0">
                    <span className="text-[11px] font-bold text-slate-200 block truncate">
                      {alert.label}
                    </span>
                    <span className={`text-xs font-extrabold flex items-center gap-1 ${isPassed ? 'text-amber-300' : 'text-white'}`}>
                      {isPassed ? (
                        <AlertCircle size={11} className="text-amber-400 shrink-0" />
                      ) : (
                        <Clock size={11} className="text-amber-400 shrink-0" />
                      )}
                      <span>{formatCountdown(alert.targetTime)}</span>
                    </span>
                  </div>
                </div>

                {alert.onAction && (
                  <button
                    type="button"
                    onClick={alert.onAction}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition flex items-center gap-0.5 shrink-0 cursor-pointer shadow-sm active:scale-95 ${btnBg}`}
                  >
                    <span>{alert.actionText || (isPlan ? 'Kunci' : 'Lapor')}</span>
                    <ChevronRight size={12} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
