'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Flame } from 'lucide-react';
import { HeatmapDayData } from '@/lib/tal/gamification';

interface TalHeatmapStreakProps {
  heatmapData: HeatmapDayData[];
  currentStreak: number;
  bestStreak: number;
  seasonYear: number;
  onYearChange?: (year: number) => void;
}

const CELL_SIZE = 12; // px (width and height of each day square)
const GAP_SIZE = 3; // px (gap between rows and columns)
const COL_WIDTH = CELL_SIZE + GAP_SIZE; // 15px per week column
const DAY_LABELS_WIDTH = 26; // px (width reserved for Sunday, Tuesday, Thursday, Saturday labels)

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

export const TalHeatmapStreak: React.FC<TalHeatmapStreakProps> = ({
  heatmapData,
  currentStreak,
  bestStreak,
  seasonYear,
  onYearChange
}) => {
  const [hoveredDay, setHoveredDay] = useState<HeatmapDayData | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Split into 7-day weeks with proper weekday padding and precise month label positions
  const { weeks, monthLabels, currentWeekColIdx } = useMemo(() => {
    const weeksList: (HeatmapDayData | null)[][] = [];
    const monthPositions: { label: string; weekIndex: number }[] = [];

    if (!heatmapData || heatmapData.length === 0) {
      return { weeks: weeksList, monthLabels: monthPositions, currentWeekColIdx: -1 };
    }

    let currentWeek: (HeatmapDayData | null)[] = [];
    let lastMonth = -1;
    let foundCurrentCol = -1;

    // 1. Pad the beginning of the first week according to dayOfWeek of the first day (0 = Sunday, 6 = Saturday)
    const firstDay = heatmapData[0];
    const startPad = firstDay ? firstDay.dayOfWeek : 0;
    for (let i = 0; i < startPad; i++) {
      currentWeek.push(null);
    }

    // 2. Iterate through each day of the year
    heatmapData.forEach((day) => {
      const monthIndex = parseInt(day.date.split('-')[1], 10) - 1;

      // When encountering the first day of a new month, record the week index
      if (monthIndex !== lastMonth) {
        monthPositions.push({
          label: MONTH_NAMES[monthIndex] || '',
          weekIndex: weeksList.length
        });
        lastMonth = monthIndex;
      }

      // Check if this day is today
      const todayStr = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10); // tanggal WIB
      if (day.date === todayStr && foundCurrentCol === -1) {
        foundCurrentCol = weeksList.length;
      }

      currentWeek.push(day);

      if (currentWeek.length === 7) {
        weeksList.push(currentWeek);
        currentWeek = [];
      }
    });

    // 3. Pad the end of the last week so every column has exactly 7 rows
    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) {
        currentWeek.push(null);
      }
      weeksList.push(currentWeek);
    }

    return { 
      weeks: weeksList, 
      monthLabels: monthPositions, 
      currentWeekColIdx: foundCurrentCol 
    };
  }, [heatmapData]);

  // Scroll into view near the current week on initial mount
  useEffect(() => {
    if (currentWeekColIdx > 10 && scrollContainerRef.current) {
      const targetScroll = Math.max(0, (currentWeekColIdx - 8) * COL_WIDTH);
      scrollContainerRef.current.scrollTo({ left: targetScroll, behavior: 'smooth' });
    }
  }, [currentWeekColIdx]);

  const getCellColor = (status: HeatmapDayData['status']) => {
    switch (status) {
      case 'on_time':
        return 'bg-emerald-500 hover:bg-emerald-600 border border-emerald-600/30';
      case 'late':
        return 'bg-orange-500 hover:bg-orange-600 border border-orange-600/30';
      case 'holiday':
        return 'bg-slate-100 border border-slate-200/60';
      case 'future':
        return 'bg-slate-50 border border-slate-200/40 opacity-50';
      case 'empty':
      default:
        return 'bg-slate-200 border border-slate-300/60';
    }
  };

  const totalGridWidth = DAY_LABELS_WIDTH + GAP_SIZE + weeks.length * COL_WIDTH;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3.5 sm:p-4 space-y-3">
      {/* Top Header: Streak Counter & Year Selector */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2">
          {/* Daily Streak Badge */}
          <div className="flex items-center gap-1.5 px-3 py-1 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-lg shadow-sm">
            <Flame size={16} className="animate-pulse shrink-0" />
            <span className="text-xs font-bold tracking-tight">
              Streak: <span className="text-sm">{currentStreak}</span> Hari Kerja
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-1 text-[11px] font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
            <span>Rekor Terbaik:</span>
            <span className="text-slate-800 font-bold">{bestStreak} hari</span>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-2 text-[10px] sm:text-[11px] text-slate-600">
          {onYearChange && (
            <label className="flex items-center gap-1 font-semibold">
              <span className="text-slate-500">Musim</span>
              <select
                value={seasonYear}
                onChange={(e) => onYearChange(Number(e.target.value))}
                className="rounded-md border border-slate-200 bg-white px-1.5 py-1 text-[11px] font-bold text-slate-700 outline-none focus:border-amber-400"
                title="Pilih tahun musim heatmap"
              >
                {[seasonYear - 1, seasonYear, seasonYear + 1].map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
          )}
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-[2px] bg-slate-200 inline-block"></span>
            <span>Libur/Kosong</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-[2px] bg-orange-500 inline-block"></span>
            <span>Telat</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-[2px] bg-emerald-500 inline-block"></span>
            <span>Tepat Waktu</span>
          </span>
        </div>
      </div>

      {/* Heatmap Grid (365 Days) */}
      <div 
        ref={scrollContainerRef}
        className="w-full overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-slate-200"
      >
        <div style={{ minWidth: `${Math.max(totalGridWidth, 820)}px` }}>
          {/* Month headers: exactly aligned above each month's starting week */}
          <div className="flex items-center mb-1" style={{ gap: `${GAP_SIZE}px` }}>
            {/* Spacer matching Day Labels */}
            <div className="shrink-0 select-none" style={{ width: `${DAY_LABELS_WIDTH}px` }} />

            {/* Relative track spanning all week columns */}
            <div 
              className="relative h-4 shrink-0" 
              style={{ width: `${weeks.length * COL_WIDTH}px` }}
            >
              {monthLabels.map((m, i) => (
                <span
                  key={`${m.label}-${i}`}
                  className="absolute text-[9px] sm:text-[10px] font-semibold text-slate-500 select-none tracking-tight hover:text-slate-800 transition-colors"
                  style={{ left: `${m.weekIndex * COL_WIDTH}px` }}
                >
                  {m.label}
                </span>
              ))}
            </div>
          </div>

          {/* Days Grid */}
          <div className="flex" style={{ gap: `${GAP_SIZE}px` }}>
            {/* Day of week labels: 7 rows with alternating visible labels */}
            <div 
              className="flex flex-col text-[8px] text-slate-400 font-semibold justify-between select-none pr-1 shrink-0 text-right"
              style={{ width: `${DAY_LABELS_WIDTH}px`, gap: `${GAP_SIZE}px` }}
            >
              <span style={{ height: `${CELL_SIZE}px`, lineHeight: `${CELL_SIZE}px` }}>Min</span>
              <span style={{ height: `${CELL_SIZE}px`, lineHeight: `${CELL_SIZE}px` }} className="invisible select-none">-</span>
              <span style={{ height: `${CELL_SIZE}px`, lineHeight: `${CELL_SIZE}px` }}>Sel</span>
              <span style={{ height: `${CELL_SIZE}px`, lineHeight: `${CELL_SIZE}px` }} className="invisible select-none">-</span>
              <span style={{ height: `${CELL_SIZE}px`, lineHeight: `${CELL_SIZE}px` }}>Kam</span>
              <span style={{ height: `${CELL_SIZE}px`, lineHeight: `${CELL_SIZE}px` }} className="invisible select-none">-</span>
              <span style={{ height: `${CELL_SIZE}px`, lineHeight: `${CELL_SIZE}px` }}>Sab</span>
            </div>

            {/* Weeks Columns */}
            {weeks.map((week, wIdx) => (
              <div 
                key={wIdx} 
                className="flex flex-col shrink-0" 
                style={{ width: `${CELL_SIZE}px`, gap: `${GAP_SIZE}px` }}
              >
                {week.map((day, dIdx) => (
                  day ? (
                    <div
                      key={dIdx}
                      onMouseEnter={() => setHoveredDay(day)}
                      onMouseLeave={() => setHoveredDay(null)}
                      className={`rounded-[2px] cursor-pointer transition-transform hover:scale-125 ${getCellColor(day.status)}`}
                      style={{ width: `${CELL_SIZE}px`, height: `${CELL_SIZE}px` }}
                      title={`${day.date}: ${day.tooltipText}`}
                    />
                  ) : (
                    <div
                      key={dIdx}
                      className="rounded-[2px] opacity-0 pointer-events-none"
                      style={{ width: `${CELL_SIZE}px`, height: `${CELL_SIZE}px` }}
                    />
                  )
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Interactive Tooltip Bar below heatmap */}
      <div className="text-[11px] text-slate-500 flex items-center justify-between min-h-[18px]">
        {hoveredDay ? (
          <span className="text-slate-800 font-medium">
            📅 <span className="font-bold">{hoveredDay.date}</span> — {hoveredDay.tooltipText}
          </span>
        ) : (
          <span className="text-slate-400 italic text-[10px]">
            Arahkan kursor ke kotak untuk melihat catatan kedisiplinan harian
          </span>
        )}
        <span className="text-[10px] text-slate-400">Musim {seasonYear}</span>
      </div>
    </div>
  );
};
