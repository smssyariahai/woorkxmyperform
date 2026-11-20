// components/tal/MonthYearPicker.tsx — pemilih bulan+tahun (grid bulan,
// lalu grid 12 tahun).
// Porting src/components/tal/MonthYearPicker.tsx (backup MyPerform) apa
// adanya; nama bulan singkat dari lib/tal/date. Catatan Tailwind:
// backdrop-blur-xs backup dipetakan ke backdrop-blur-sm (token WOORK).
'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { INDONESIAN_MONTHS_SHORT } from '@/lib/tal/date';

export interface MonthYearPickerValue {
  year: number;
  month: number; // 1 - 12
}

interface MonthYearPickerProps {
  label: string;
  value: MonthYearPickerValue;
  onChange: (val: MonthYearPickerValue) => void;
  className?: string;
}

export const MonthYearPicker: React.FC<MonthYearPickerProps> = ({
  label,
  value,
  onChange,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [tempYear, setTempYear] = useState(value.year);

  // View mode inside pop-up: 'month' (default) or 'year' (when clicking year in header)
  const [viewMode, setViewMode] = useState<'month' | 'year'>('month');

  // For the Year Selection Grid (12 years page window, e.g. 2016 - 2027)
  const [yearWindowStart, setYearWindowStart] = useState(() => {
    return Math.floor(value.year / 12) * 12;
  });

  const containerRef = useRef<HTMLDivElement>(null);

  // Sync tempYear when value changes
  useEffect(() => {
    setTempYear(value.year);
    setYearWindowStart(Math.floor(value.year / 12) * 12);
  }, [value.year]);

  // Reset view mode when opening
  useEffect(() => {
    if (isOpen) {
      setViewMode('month');
      setTempYear(value.year);
      setYearWindowStart(Math.floor(value.year / 12) * 12);
    }
  }, [isOpen, value.year]);

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

  // Month select handler
  const handleSelectMonth = (monthIndex: number) => {
    onChange({
      year: tempYear,
      month: monthIndex + 1,
    });
    setIsOpen(false);
  };

  // Year select handler from year grid
  const handleSelectYear = (selectedY: number) => {
    setTempYear(selectedY);
    setViewMode('month');
  };

  // Prev / Next year navigation in Month View
  const handlePrevYear = () => setTempYear(prev => prev - 1);
  const handleNextYear = () => setTempYear(prev => prev + 1);

  // Prev / Next 12-year window navigation in Year View
  const handlePrevYearWindow = () => setYearWindowStart(prev => prev - 12);
  const handleNextYearWindow = () => setYearWindowStart(prev => prev + 12);

  // Generate 12 years list for year view grid (3 columns x 4 rows)
  const yearGridList: number[] = [];
  for (let i = 0; i < 12; i++) {
    yearGridList.push(yearWindowStart + i);
  }
  const yearWindowEnd = yearWindowStart + 11;

  const currentMonthShort = INDONESIAN_MONTHS_SHORT[value.month - 1] || `${value.month}`;

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
          className="flex items-center justify-between gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 shadow-sm transition cursor-pointer w-full sm:w-auto min-w-0 sm:min-w-[130px]"
        >
          <div className="flex items-center gap-1.5 truncate">
            <Calendar size={13} className="text-blue-600 shrink-0" />
            <span className="truncate">
              {currentMonthShort} {value.year}
            </span>
          </div>
          <ChevronDown size={13} className={`text-slate-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Pop-up Box */}
      {isOpen && (
        <>
          {/* Backdrop for mobile modal overlay */}
          <div
            className="fixed inset-0 bg-black/40 sm:hidden z-40 backdrop-blur-sm animate-in fade-in duration-150"
            onClick={() => setIsOpen(false)}
          />

          <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 max-w-xs mx-auto sm:max-w-none sm:mx-0 sm:translate-y-0 sm:inset-auto sm:absolute sm:left-0 sm:mt-1.5 sm:w-72 bg-white rounded-2xl shadow-2xl sm:shadow-xl border border-slate-200/90 z-50 p-3.5 space-y-3 animate-in fade-in zoom-in-95 duration-150">
          {viewMode === 'month' ? (
            /* ========================================================= */
            /* MODE 1: MONTH VIEW (HEADER: < [Tahun] > x , BODY: 3 KOLOM BULAN) */
            /* ========================================================= */
            <>
              {/* Header: Panah Kiri, Tombol Tahun, Panah Kanan, Tombol Close (X) */}
              <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                <button
                  type="button"
                  onClick={handlePrevYear}
                  title="Tahun Sebelumnya"
                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition cursor-pointer"
                >
                  <ChevronLeft size={16} />
                </button>

                {/* Tombol Tahun di tengah: jika ditekan membuka Popup Pilihan Tahun */}
                <button
                  type="button"
                  onClick={() => setViewMode('year')}
                  className="px-3 py-1 rounded-lg hover:bg-blue-50 text-slate-900 hover:text-blue-700 font-extrabold text-sm tracking-tight transition cursor-pointer flex items-center gap-1"
                >
                  <span>{tempYear}</span>
                  <ChevronDown size={13} className="text-slate-400" />
                </button>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={handleNextYear}
                    title="Tahun Berikutnya"
                    className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition cursor-pointer"
                  >
                    <ChevronRight size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    title="Tutup"
                    className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition cursor-pointer"
                  >
                    <X size={15} />
                  </button>
                </div>
              </div>

              {/* Grid 3 Kolom Bulan (Singkatan 3 Karakter: Jan, Feb, Mar, ...) */}
              <div className="grid grid-cols-3 gap-2 pt-1">
                {INDONESIAN_MONTHS_SHORT.map((mShort, idx) => {
                  const monthNum = idx + 1;
                  const isSelected = value.year === tempYear && value.month === monthNum;
                  return (
                    <button
                      key={mShort}
                      type="button"
                      onClick={() => handleSelectMonth(idx)}
                      className={`py-2.5 px-2 rounded-xl text-xs font-bold text-center transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-blue-600 text-white shadow-sm font-black'
                          : 'bg-slate-50/80 hover:bg-blue-50 hover:text-blue-700 text-slate-700 border border-slate-100'
                      }`}
                    >
                      {mShort}
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            /* ========================================================= */
            /* MODE 2: YEAR VIEW (HEADER: < [2016 - 2027] > x , BODY: 3 KOLOM TAHUN) */
            /* ========================================================= */
            <>
              {/* Header Rentang Tahun */}
              <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                <button
                  type="button"
                  onClick={handlePrevYearWindow}
                  title="12 Tahun Sebelumnya"
                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition cursor-pointer"
                >
                  <ChevronLeft size={16} />
                </button>

                <div className="font-extrabold text-sm text-slate-900 tracking-tight">
                  {yearWindowStart} - {yearWindowEnd}
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={handleNextYearWindow}
                    title="12 Tahun Berikutnya"
                    className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition cursor-pointer"
                  >
                    <ChevronRight size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('month')}
                    title="Tutup Pilihan Tahun"
                    className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition cursor-pointer"
                  >
                    <X size={15} />
                  </button>
                </div>
              </div>

              {/* Grid 3 Kolom Tahun (12 Tahun) */}
              <div className="grid grid-cols-3 gap-2 pt-1">
                {yearGridList.map((yr) => {
                  const isCurrentSelectedYear = tempYear === yr;
                  return (
                    <button
                      key={yr}
                      type="button"
                      onClick={() => handleSelectYear(yr)}
                      className={`py-2.5 px-2 rounded-xl text-xs font-bold text-center transition-all cursor-pointer ${
                        isCurrentSelectedYear
                          ? 'bg-slate-900 text-white shadow-sm font-black'
                          : 'bg-slate-50/80 hover:bg-slate-200 text-slate-700 border border-slate-100'
                      }`}
                    >
                      {yr}
                    </button>
                  );
                })}
              </div>

              {/* Footer Tutup */}
              <div className="pt-1 text-right">
                <button
                  type="button"
                  onClick={() => setViewMode('month')}
                  className="text-[11px] font-bold text-slate-500 hover:text-slate-800 transition cursor-pointer"
                >
                  Kembali ke Bulan
                </button>
              </div>
            </>
          )}
        </div>
        </>
      )}
    </div>
  );
};
