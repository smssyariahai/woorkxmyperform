// components/tal/TalYearPickerPopup.tsx — popup grid 12 tahun (dipakai
// TalHeader tab Bulanan).
// Porting src/components/tal/TalYearPickerPopup.tsx (backup MyPerform) apa
// adanya. Catatan Tailwind: backdrop-blur-xs backup dipetakan ke
// backdrop-blur-sm (token WOORK).
'use client';

import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

interface TalYearPickerPopupProps {
  selectedYear: number;
  onSelectYear: (year: number) => void;
  onClose: () => void;
}

export const TalYearPickerPopup: React.FC<TalYearPickerPopupProps> = ({
  selectedYear,
  onSelectYear,
  onClose
}) => {
  // Base decade (12-year range)
  const baseDecadeYear = Math.floor(selectedYear / 12) * 12;
  const [startYear, setStartYear] = useState(baseDecadeYear > 0 ? baseDecadeYear : 2024);
  const endYear = startYear + 11;
  const years = Array.from({ length: 12 }, (_, i) => startYear + i);

  const handlePrev = () => setStartYear(prev => prev - 12);
  const handleNext = () => setStartYear(prev => prev + 12);

  return (
    <>
      {/* Click outside backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 md:bg-transparent backdrop-blur-sm md:backdrop-blur-none"
        onClick={onClose}
      />

      {/* Popup / Dropdown Container */}
      <div
        className="fixed inset-x-3 top-1/2 -translate-y-1/2 md:absolute md:inset-auto md:top-full md:right-0 md:left-auto md:translate-y-1.5 z-50 flex justify-center md:block"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-white rounded-2xl shadow-2xl md:shadow-xl border border-slate-200 w-full max-w-[340px] md:w-[380px] md:max-w-[400px] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handlePrev}
              className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-600 transition cursor-pointer"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="text-sm font-bold text-slate-800 px-2 min-w-[120px] text-center">
              {startYear} - {endYear}
            </span>
            <button
              type="button"
              onClick={handleNext}
              className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-600 transition cursor-pointer"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg transition cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* 12-Year Grid */}
        <div className="p-3.5 sm:p-4">
          <div className="grid grid-cols-3 gap-2.5">
            {years.map((yr) => {
              const isSelected = yr === selectedYear;
              return (
                <button
                  key={yr}
                  type="button"
                  onClick={() => {
                    onSelectYear(yr);
                    onClose();
                  }}
                  className={`py-3.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'bg-slate-50 hover:bg-blue-50 hover:text-blue-600 text-slate-700'
                  }`}
                >
                  {yr}
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-4 py-2.5 bg-slate-50 border-t border-slate-100 text-xs">
          <button
            type="button"
            onClick={onClose}
            className="font-semibold text-slate-600 hover:text-slate-800"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
    </>
  );
};
