// components/tal/YearPicker.tsx — pemilih tahun (grid 12 tahun).
// Porting src/components/tal/YearPicker.tsx (backup MyPerform) apa adanya.
// Catatan Tailwind: backdrop-blur-2xs & scale-102 backup dipetakan ke
// backdrop-blur-sm & scale-105 (token WOORK).
'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-react';

interface YearPickerProps {
  label: string;
  value: number; // e.g. 2026
  onChange: (year: number) => void;
  className?: string;
}

export const YearPicker: React.FC<YearPickerProps> = ({
  label,
  value,
  onChange,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [yearWindowStart, setYearWindowStart] = useState(() => {
    return Math.floor(value / 12) * 12;
  });

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setYearWindowStart(Math.floor(value / 12) * 12);
  }, [value]);

  useEffect(() => {
    if (isOpen) {
      setYearWindowStart(Math.floor(value / 12) * 12);
    }
  }, [isOpen, value]);

  // Handle outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleSelectYear = (selectedY: number) => {
    onChange(selectedY);
    setIsOpen(false);
  };

  const handlePrevYearWindow = () => setYearWindowStart(prev => prev - 12);
  const handleNextYearWindow = () => setYearWindowStart(prev => prev + 12);

  const yearGridList: number[] = [];
  for (let i = 0; i < 12; i++) {
    yearGridList.push(yearWindowStart + i);
  }
  const yearWindowEnd = yearWindowStart + 11;

  return (
    <div className={`relative text-left ${className}`} ref={containerRef}>
      <div className="flex flex-col gap-0.5 w-full">
        {label && (
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            {label}
          </span>
        )}
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center justify-between gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 shadow-sm transition cursor-pointer w-full sm:w-auto min-w-0 sm:min-w-[120px]"
        >
          <div className="flex items-center gap-1.5 truncate">
            <Calendar size={13} className="text-blue-600 shrink-0" />
            <span className="font-semibold text-slate-800 text-xs">
              {value}
            </span>
          </div>
          <ChevronDown size={13} className={`text-slate-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {isOpen && (
        <>
          {/* Mobile backdrop */}
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 sm:hidden"
            onClick={() => setIsOpen(false)}
          />

          {/* Pop-up Dialog */}
          <div className="
            fixed sm:absolute
            top-1/2 sm:top-full
            left-1/2 sm:left-0
            -translate-x-1/2 sm:translate-x-0
            -translate-y-1/2 sm:translate-y-1.5
            w-[280px]
            bg-white
            rounded-2xl
            shadow-xl
            border border-slate-200/90
            p-3.5
            z-50
            animate-in fade-in zoom-in-95 duration-150
          ">
            {/* Header / Navigation */}
            <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-800">
                Pilih Tahun
              </span>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 sm:hidden"
              >
                <X size={15} />
              </button>
            </div>

            {/* Year Window Navigation */}
            <div className="flex items-center justify-between mb-3 bg-slate-50 border border-slate-200/80 p-1.5 rounded-xl">
              <button
                type="button"
                onClick={handlePrevYearWindow}
                className="p-1 rounded-lg text-slate-600 hover:bg-white hover:shadow-sm transition active:scale-95"
                title="12 Tahun Sebelumnya"
              >
                <ChevronLeft size={15} />
              </button>
              <span className="text-xs font-bold text-slate-800 tracking-wide">
                {yearWindowStart} – {yearWindowEnd}
              </span>
              <button
                type="button"
                onClick={handleNextYearWindow}
                className="p-1 rounded-lg text-slate-600 hover:bg-white hover:shadow-sm transition active:scale-95"
                title="12 Tahun Berikutnya"
              >
                <ChevronRight size={15} />
              </button>
            </div>

            {/* Year Grid: 3 columns x 4 rows */}
            <div className="grid grid-cols-3 gap-1.5">
              {yearGridList.map((y) => {
                const isSelected = y === value;
                const isCurrentCalendarYear = y === new Date().getFullYear();

                return (
                  <button
                    key={y}
                    type="button"
                    onClick={() => handleSelectYear(y)}
                    className={`
                      py-2 px-1 rounded-xl text-xs font-bold transition-all text-center
                      ${isSelected
                        ? 'bg-blue-600 text-white shadow-sm scale-105'
                        : isCurrentCalendarYear
                        ? 'bg-blue-50 text-blue-700 border border-blue-200/80 hover:bg-blue-100'
                        : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200/60'
                      }
                    `}
                  >
                    {y}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
