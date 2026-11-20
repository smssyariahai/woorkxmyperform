// components/tal/TalMonthStrip.tsx — porting src/components/tal/TalMonthStrip.tsx backup.
// Adaptasi WOORK: INDONESIAN_MONTHS dari lib/tal/date.
'use client';

import React, { useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { INDONESIAN_MONTHS } from '@/lib/tal/date';

interface TalMonthStripProps {
  selectedMonth: number; // 1 - 12
  selectedYear?: number;
  onSelectMonth: (month: number) => void;
  onPrevYear?: () => void;
  onNextYear?: () => void;
  taskCountsByMonth?: Record<number, number>;
}

export const TalMonthStrip: React.FC<TalMonthStripProps> = ({
  selectedMonth,
  selectedYear,
  onSelectMonth,
  onPrevYear,
  onNextYear,
  taskCountsByMonth = {}
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const activeItemRef = useRef<HTMLButtonElement>(null);
  const hasAutoScrolledRef = useRef<boolean>(false);
  const today = new Date();
  const currentMonth = today.getMonth() + 1;
  const currentYear = today.getFullYear();

  // Auto scroll to Selected Month / This Month HANYA ketika loading awal page saja
  useEffect(() => {
    if (!hasAutoScrolledRef.current && activeItemRef.current && scrollContainerRef.current) {
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
  }, []);

  // Mouse wheel horizontal scrolling
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (scrollContainerRef.current && e.deltaY !== 0) {
      scrollContainerRef.current.scrollLeft += e.deltaY;
    }
  };

  const handleScrollLeft = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: -200, behavior: 'smooth' });
    }
  };

  const handleScrollRight = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: 200, behavior: 'smooth' });
    }
  };

  return (
    <div
      className="bg-white rounded-xl border border-slate-200/80 p-2 shadow-xs flex items-center gap-1 select-none"
    >
      <button
        type="button"
        onClick={handleScrollLeft}
        className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition shrink-0 hidden sm:block cursor-pointer"
        title="Geser Kiri"
      >
        <ChevronLeft size={16} />
      </button>

      <div
        ref={scrollContainerRef}
        onWheel={handleWheel}
        className="flex-1 overflow-x-auto flex items-center gap-1.5 sm:gap-2 no-scrollbar py-0.5 touch-pan-x"
      >
        {INDONESIAN_MONTHS.map((monthName, idx) => {
          const monthNum = idx + 1;
          const isSelected = monthNum === selectedMonth;
          const isThisMonth = monthNum === currentMonth && (!selectedYear || selectedYear === currentYear);
          const count = taskCountsByMonth[monthNum] || 0;

          return (
            <button
              key={monthNum}
              ref={isSelected ? activeItemRef : null}
              type="button"
              onClick={() => onSelectMonth(monthNum)}
              className={`relative flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer shrink-0 ${
                isSelected
                  ? 'bg-slate-900 text-white shadow-sm ring-1 ring-slate-900'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-700'
              } ${
                isThisMonth
                  ? isSelected
                    ? 'border-2 border-white shadow-md ring-2 ring-slate-900 ring-offset-1'
                    : 'border-2 border-blue-500 bg-blue-50/40 text-blue-950 font-bold'
                  : ''
              }`}
            >
              <span>{monthName}</span>
              {count > 0 && (
                <span className={`w-1.5 h-1.5 rounded-full ${
                  isSelected ? 'bg-amber-400' : 'bg-cyan-500'
                }`} />
              )}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={handleScrollRight}
        className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition shrink-0 hidden sm:block cursor-pointer"
        title="Geser Kanan"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
};

export default TalMonthStrip;
