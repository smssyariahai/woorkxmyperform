// components/tal/dashboard/TalDashboardMiniCalendar.tsx — kalender mini
// bulanan dengan kolom Week (W45..W49) dan indikator status harian.
// Porting src/components/tal/dashboard/TalDashboardMiniCalendar.tsx (backup
// MyPerform). Adaptasi: impor tanggal dari lib/tal/date; HeatmapDayData
// diimpor sebagai tipe saja dari lib/tal/gamification (aman, terhapus saat
// compile).
'use client';

import React, { useState, useMemo } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import type { TalHolidayItem } from '@/lib/tal/types';
import type { HeatmapDayData } from '@/lib/tal/gamification';
import {
  INDONESIAN_MONTHS,
  INDONESIAN_DAYS_SHORT,
  formatDateKey,
  getWeekNumberAndYear
} from '@/lib/tal/date';

export interface DayStatusMap {
  [dateKey: string]: {
    isReported: boolean;
    isLate?: boolean;
    hasTasks?: boolean;
  };
}

interface TalDashboardMiniCalendarProps {
  holidays: TalHolidayItem[];
  heatmapData?: HeatmapDayData[];
  dayStatusMap?: DayStatusMap;
  onSelectDate?: (dateKey: string) => void;
  onSelectWeek?: (weekNumber: number, weekYear: number, sundayDateKey: string) => void;
}

interface CalendarWeekRow {
  weekNumber: number;
  weekYear: number;
  isCurrentWeek: boolean;
  sundayDateKey: string;
  days: (number | null)[];
}

export const TalDashboardMiniCalendar: React.FC<TalDashboardMiniCalendarProps> = ({
  holidays,
  heatmapData,
  dayStatusMap,
  onSelectDate,
  onSelectWeek
}) => {
  const today = new Date();
  const todayStr = formatDateKey(today);

  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth()); // 0-indexed

  // Map heatmap data by date key for O(1) fast lookup
  const heatmapMap = useMemo(() => {
    const map = new Map<string, HeatmapDayData>();
    if (heatmapData && heatmapData.length > 0) {
      heatmapData.forEach(item => {
        map.set(item.date, item);
      });
    }
    return map;
  }, [heatmapData]);

  // Holiday map
  const holidayMap = useMemo(() => {
    const map = new Map<string, string>();
    holidays.forEach(h => {
      map.set(h.date, h.title);
    });
    return map;
  }, [holidays]);

  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(prev => prev - 1);
    } else {
      setCurrentMonth(prev => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(prev => prev + 1);
    } else {
      setCurrentMonth(prev => prev + 1);
    }
  };

  // Build calendar matrix grouped by weeks
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay(); // 0 = Sunday
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

  const calendarWeeks: CalendarWeekRow[] = [];
  let currentDay = 1;
  let currentSunday = new Date(currentYear, currentMonth, 1 - firstDayOfMonth);

  while (currentDay <= daysInMonth) {
    const rowDays: (number | null)[] = [];
    let hasTodayInWeek = false;

    for (let i = 0; i < 7; i++) {
      if (calendarWeeks.length === 0 && i < firstDayOfMonth) {
        rowDays.push(null);
      } else if (currentDay > daysInMonth) {
        rowDays.push(null);
      } else {
        const mStr = String(currentMonth + 1).padStart(2, '0');
        const dStr = String(currentDay).padStart(2, '0');
        const dateKey = `${currentYear}-${mStr}-${dStr}`;
        if (dateKey === todayStr) {
          hasTodayInWeek = true;
        }
        rowDays.push(currentDay);
        currentDay++;
      }
    }

    const { weekNumber, weekYear } = getWeekNumberAndYear(currentSunday);
    const sundayKey = formatDateKey(currentSunday);

    calendarWeeks.push({
      weekNumber,
      weekYear,
      isCurrentWeek: hasTodayInWeek,
      sundayDateKey: sundayKey,
      days: rowDays
    });

    // Advance Sunday by 7 days for the next week
    currentSunday = new Date(currentSunday);
    currentSunday.setDate(currentSunday.getDate() + 7);
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200/90 p-3.5 shadow-sm space-y-3">
      {/* Header Month Nav */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <CalendarIcon size={14} />
          </div>
          <span className="text-xs font-bold text-slate-800 truncate">
            {INDONESIAN_MONTHS[currentMonth]} {currentYear}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handlePrevMonth}
            className="w-6 h-6 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500 hover:text-slate-800 transition cursor-pointer"
          >
            <ChevronLeft size={13} />
          </button>
          <button
            type="button"
            onClick={() => {
              setCurrentYear(today.getFullYear());
              setCurrentMonth(today.getMonth());
            }}
            className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 px-1.5 py-0.5 rounded hover:bg-indigo-50 transition cursor-pointer"
          >
            Bulan Ini
          </button>
          <button
            type="button"
            onClick={handleNextMonth}
            className="w-6 h-6 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500 hover:text-slate-800 transition cursor-pointer"
          >
            <ChevronRight size={13} />
          </button>
        </div>
      </div>

      {/* Days & Weeks Grid */}
      <div className="space-y-1 text-center">
        {/* Day name headers with Week column */}
        <div className="grid grid-cols-8 gap-1 items-center pb-0.5">
          <div
            className="text-[9px] sm:text-[10px] font-bold py-0.5 text-indigo-600 select-none tracking-tight"
            title="Kolom Week (W39, W40, dst) - Klik pekan untuk membuka Tasks Mingguan"
          >
            Week
          </div>
          {INDONESIAN_DAYS_SHORT.map((name, idx) => (
            <div
              key={name}
              className={`text-[10px] font-bold py-0.5 ${idx === 0 ? 'text-rose-500' : 'text-slate-400'}`}
            >
              {name}
            </div>
          ))}
        </div>

        {/* Calendar Rows by Week */}
        {calendarWeeks.map((week, wIdx) => (
          <div key={`week-${week.weekYear}-${week.weekNumber}-${wIdx}`} className="grid grid-cols-8 gap-1 items-center">
            {/* Week Badge (e.g. W39, W40, dst) */}
            <button
              type="button"
              onClick={() => {
                if (onSelectWeek) {
                  onSelectWeek(week.weekNumber, week.weekYear, week.sundayDateKey);
                } else if (onSelectDate) {
                  onSelectDate(week.sundayDateKey);
                }
              }}
              title={`Minggu ke-${week.weekNumber} Tahun ${week.weekYear}`}
              className={`h-7 rounded-lg text-[10px] font-bold flex items-center justify-center transition cursor-pointer select-none tracking-tight ${
                week.isCurrentWeek
                  ? 'bg-indigo-50 text-indigo-700 border border-indigo-200/90 shadow-sm hover:bg-indigo-100'
                  : 'bg-slate-100/70 text-slate-500 hover:bg-slate-200/80 hover:text-slate-800'
              }`}
            >
              W{week.weekNumber}
            </button>

            {/* 7 Days cells */}
            {week.days.map((day, dIdx) => {
              if (!day) {
                return <div key={`empty-${wIdx}-${dIdx}`} className="h-7" />;
              }

              const mStr = String(currentMonth + 1).padStart(2, '0');
              const dStr = String(day).padStart(2, '0');
              const dateKey = `${currentYear}-${mStr}-${dStr}`;

              const isToday = dateKey === todayStr;
              const isSunday = dIdx === 0;
              const holidayName = holidayMap.get(dateKey);

              const dayData = heatmapMap.get(dateKey);
              const isHoliday = dayData ? (dayData.isHoliday || dayData.status === 'holiday') : (isSunday || !!holidayName);
              const isPast = dateKey < todayStr;

              // Color calculation strictly aligned with 365 Konsistensi Heatmap
              let cellStyle = 'bg-white text-slate-700 hover:bg-slate-50';
              let indicatorColor = '';
              let tooltip = holidayName || (isSunday ? 'Hari Minggu' : dateKey);

              if (isHoliday) {
                cellStyle = 'bg-rose-50/50 text-rose-600 hover:bg-rose-100/60 font-semibold';
                tooltip = dayData?.tooltipText || holidayName || (isSunday ? 'Hari Minggu (Libur)' : 'Hari Libur / Cuti');
              } else if (dayData) {
                tooltip = dayData.tooltipText || dateKey;
                if (dayData.status === 'on_time') {
                  indicatorColor = 'bg-emerald-500';
                } else if (dayData.status === 'late') {
                  indicatorColor = 'bg-rose-500';
                } else if (dayData.status === 'empty') {
                  // If has tasks in progress or past workday with plan but uncompleted report
                  if (dayData.taskCount > 0 || (isPast && dayData.hasPlan && !dayData.hasReport)) {
                    indicatorColor = 'bg-amber-400';
                  }
                }
              } else {
                // Graceful fallback to dayStatusMap if heatmap not loaded
                const status = dayStatusMap?.[dateKey];
                if (status?.isReported) {
                  indicatorColor = 'bg-emerald-500';
                  tooltip = 'Sudah Dilaporkan';
                } else if (status?.isLate) {
                  indicatorColor = 'bg-rose-500';
                  tooltip = 'Terlambat';
                } else if (status?.hasTasks) {
                  indicatorColor = 'bg-amber-400';
                  tooltip = 'Belum Dilaporkan';
                }
              }

              if (isToday) {
                cellStyle += ' ring-2 ring-blue-500 font-black';
              }

              return (
                <button
                  key={dateKey}
                  type="button"
                  onClick={() => onSelectDate && onSelectDate(dateKey)}
                  title={tooltip}
                  className={`h-7 rounded-lg text-xs relative flex flex-col items-center justify-center transition cursor-pointer ${cellStyle}`}
                >
                  <span className="leading-none">{day}</span>
                  {indicatorColor && (
                    <span className={`w-1.5 h-1.5 rounded-full ${indicatorColor} mt-0.5`} />
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1.5 border-t border-slate-100 flex-wrap gap-1">
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
          <span>Sudah Lapor</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
          <span>Belum Lapor</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
          <span>Terlambat</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-300"></span>
          <span>Libur</span>
        </span>
      </div>
    </div>
  );
};
