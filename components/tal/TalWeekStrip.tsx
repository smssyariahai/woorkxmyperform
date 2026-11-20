// components/tal/TalWeekStrip.tsx — porting src/components/tal/TalWeekStrip.tsx backup.
// Adaptasi WOORK: tipe + helper dari lib/tal/date.
'use client';

import React, { useRef, useEffect } from 'react';
import { getWeekNumberAndYear, type WeekDetails } from '@/lib/tal/date';

interface TalWeekStripProps {
  weeks: WeekDetails[];
  selectedWeekNumber: number;
  selectedWeekYear: number;
  onSelectWeek: (week: WeekDetails) => void;
  onPrevMonth?: () => void;
  onNextMonth?: () => void;
  taskCountsByWeek?: Record<string, number>;
}

export const TalWeekStrip: React.FC<TalWeekStripProps> = ({
  weeks,
  selectedWeekNumber,
  selectedWeekYear,
  onSelectWeek,
  onPrevMonth,
  onNextMonth,
  taskCountsByWeek = {}
}) => {
  const currentWeekInfo = getWeekNumberAndYear(new Date());
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const activeItemRef = useRef<HTMLButtonElement>(null);
  const hasAutoScrolledRef = useRef<boolean>(false);

  // Auto scroll to This Week / Selected Week HANYA ketika loading page awal saja
  useEffect(() => {
    if (!hasAutoScrolledRef.current && activeItemRef.current && scrollContainerRef.current) {
      // Tunggu layout siap lalu scroll ke posisi tengah sekali saja
      const timer = setTimeout(() => {
        if (activeItemRef.current && scrollContainerRef.current) {
          activeItemRef.current.scrollIntoView({
            behavior: 'smooth',
            inline: 'center',
            block: 'nearest'
          });
          hasAutoScrolledRef.current = true;
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [weeks]);

  // Mouse wheel vertical to horizontal scrolling
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (scrollContainerRef.current && e.deltaY !== 0) {
      scrollContainerRef.current.scrollLeft += e.deltaY;
    }
  };

  return (
    <div
      ref={scrollContainerRef}
      onWheel={handleWheel}
      className="bg-white rounded-xl border border-slate-200/80 p-2 shadow-xs overflow-x-auto no-scrollbar select-none touch-pan-x"
    >
      <div className="flex items-center gap-1.5 sm:gap-2 min-w-max">
        {weeks.map((w) => {
          const isSelected = w.weekNumber === selectedWeekNumber && w.weekYear === selectedWeekYear;
          const isThisWeek = w.weekNumber === currentWeekInfo.weekNumber && w.weekYear === currentWeekInfo.weekYear;
          const key = `${w.weekYear}-W${w.weekNumber}`;
          const count = taskCountsByWeek[key] || 0;

          return (
            <button
              key={key}
              ref={isSelected || (!selectedWeekNumber && isThisWeek) ? activeItemRef : null}
              type="button"
              onClick={() => onSelectWeek(w)}
              className={`relative flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
                isSelected
                  ? 'bg-slate-900 text-white shadow-sm ring-1 ring-slate-900'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-700'
              } ${
                isThisWeek
                  ? isSelected
                    ? 'border-2 border-white shadow-md ring-2 ring-slate-900 ring-offset-1'
                    : 'border-2 border-blue-500 bg-blue-50/40 text-blue-950 font-bold'
                  : ''
              }`}
            >
              <span>{w.shortLabel}</span>
              {count > 0 && (
                <span className={`w-1.5 h-1.5 rounded-full ${
                  isSelected ? 'bg-amber-400' : 'bg-indigo-500'
                }`} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default TalWeekStrip;
