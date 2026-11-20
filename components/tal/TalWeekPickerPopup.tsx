// components/tal/TalWeekPickerPopup.tsx — popup pemilih pekan: matriks
// bulan x pekan + grid 12 tahun (dipakai TalHeader tab Mingguan).
// Porting src/components/tal/TalWeekPickerPopup.tsx (backup MyPerform) apa
// adanya; helper tanggal dari lib/tal/date. Catatan Tailwind:
// backdrop-blur-xs backup dipetakan ke backdrop-blur-sm (token WOORK).
'use client';

import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import {
  getTotalWeeksInYear,
  getSundayFromWeekNumber,
  formatDateKey,
  getWeekNumberAndYear,
  getYearlyMonthWeeksGrouping,
  type WeekDetails
} from '@/lib/tal/date';

interface TalWeekPickerPopupProps {
  selectedYear: number;
  selectedWeekNumber: number;
  onSelectWeek: (year: number, weekNumber: number, targetSundayDateStr: string) => void;
  onClose: () => void;
}

export const TalWeekPickerPopup: React.FC<TalWeekPickerPopupProps> = ({
  selectedYear,
  selectedWeekNumber,
  onSelectWeek,
  onClose
}) => {
  const [year, setYear] = useState(selectedYear);
  const [isYearPickerView, setIsYearPickerView] = useState(false);

  const today = new Date();
  const currentWeekInfo = getWeekNumberAndYear(today);
  const currentMonthNum = today.getMonth() + 1;
  const currentYearNum = today.getFullYear();

  // Year range for 12-year grid (e.g., 2021 - 2032)
  const baseDecadeYear = Math.floor(year / 12) * 12;
  const startDecade = baseDecadeYear > 0 ? baseDecadeYear : 2021;
  const endDecade = startDecade + 11;
  const decadeYears = Array.from({ length: 12 }, (_, i) => startDecade + i);

  const totalWeeks = getTotalWeeksInYear(year);
  const monthGroupings = getYearlyMonthWeeksGrouping(year);

  const handleSelectWeekNumber = (wNum: number) => {
    const sundayDate = getSundayFromWeekNumber(year, wNum);
    const dateStr = formatDateKey(sundayDate);
    onSelectWeek(year, wNum, dateStr);
    onClose();
  };

  const handleSelectMonth = (weeks: WeekDetails[]) => {
    if (weeks && weeks.length > 0) {
      // Pick first week of this month or the matching selected week if already in this month
      const matchWeek = weeks.find(w => w.weekNumber === selectedWeekNumber && w.weekYear === year);
      const targetWeek = matchWeek || weeks[0];
      onSelectWeek(year, targetWeek.weekNumber, targetWeek.startDateStr);
      onClose();
    }
  };

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
        <div className="bg-white rounded-2xl shadow-2xl md:shadow-xl border border-slate-200 w-full max-w-md md:w-[620px] md:max-w-[640px] overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[85vh]">
          {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/80 shrink-0">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                if (isYearPickerView) {
                  setYear(prev => prev - 12);
                } else {
                  setYear(prev => prev - 1);
                }
              }}
              className="p-1 rounded-lg hover:bg-slate-200 text-slate-600 transition cursor-pointer"
              title="Tahun Sebelumnya"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              onClick={() => setIsYearPickerView(!isYearPickerView)}
              className="text-sm font-bold text-slate-800 hover:text-blue-600 transition px-2.5 py-1 rounded-lg hover:bg-slate-200/70 cursor-pointer"
              title="Ganti Tahun"
            >
              {isYearPickerView ? `${startDecade} - ${endDecade}` : year}
            </button>
            <button
              type="button"
              onClick={() => {
                if (isYearPickerView) {
                  setYear(prev => prev + 12);
                } else {
                  setYear(prev => prev + 1);
                }
              }}
              className="p-1 rounded-lg hover:bg-slate-200 text-slate-600 transition cursor-pointer"
              title="Tahun Selanjutnya"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 rounded-lg transition cursor-pointer"
            title="Tutup"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body: Year Grid vs Month-Week Matrix */}
        <div className="p-3 sm:p-4 overflow-y-auto flex-1">
          {isYearPickerView ? (
            /* Year selection grid */
            <div className="grid grid-cols-3 gap-2.5 py-2">
              {decadeYears.map((yr) => (
                <button
                  key={yr}
                  type="button"
                  onClick={() => {
                    setYear(yr);
                    setIsYearPickerView(false);
                  }}
                  className={`py-3 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    yr === year
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700'
                  } ${yr === currentYearNum ? 'ring-2 ring-blue-500' : ''}`}
                >
                  {yr}
                </button>
              ))}
            </div>
          ) : (
            /* Month + Weeks Matrix Table */
            <div className="space-y-1 divide-y divide-slate-100">
              {/* Header row labels */}
              <div className="flex items-center gap-2 pb-2 px-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                <div className="w-12 sm:w-14 text-center">Bulan</div>
                <div className="flex-1">Week di Bulan Ini</div>
              </div>

              {/* 12 Months Rows */}
              {monthGroupings.map((group) => {
                const isThisMonth = group.monthNumber === currentMonthNum && year === currentYearNum;
                const hasSelectedWeek = group.weeks.some(
                  w => w.weekNumber === selectedWeekNumber && year === selectedYear
                );

                return (
                  <div
                    key={group.monthNumber}
                    className={`flex items-center gap-2 py-1.5 px-1 sm:px-2 rounded-xl transition-colors ${
                      hasSelectedWeek ? 'bg-slate-50/80' : 'hover:bg-slate-50/50'
                    }`}
                  >
                    {/* Kolom 1: Tombol Bulan (3 karakter: Jan, Feb, Mar, dst) */}
                    <div className="w-12 sm:w-14 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleSelectMonth(group.weeks)}
                        className={`w-full text-center px-1.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          hasSelectedWeek
                            ? 'text-slate-900 font-extrabold bg-slate-200/60'
                            : 'text-slate-700 hover:text-blue-600 hover:bg-blue-50/80'
                        } ${isThisMonth ? 'ring-2 ring-blue-500' : ''}`}
                        title={`Pilih ${group.monthName} (Pekan pertama)`}
                      >
                        {group.monthShort}
                      </button>
                    </div>

                    {/* Kolom 2 dst: Tombol-tombol Week di bulan ini */}
                    <div className="flex-1 flex items-center gap-1.5 sm:gap-2 flex-wrap">
                      {group.weeks.map((w) => {
                        const isSelected = year === selectedYear && w.weekNumber === selectedWeekNumber;
                        const isThisWeek = year === currentWeekInfo.weekYear && w.weekNumber === currentWeekInfo.weekNumber;

                        return (
                          <button
                            key={w.weekNumber}
                            type="button"
                            onClick={() => handleSelectWeekNumber(w.weekNumber)}
                            className={`min-w-[44px] sm:min-w-[48px] px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                              isSelected
                                ? 'bg-slate-900 text-white font-bold shadow-sm'
                                : 'bg-slate-100/90 hover:bg-blue-50 hover:text-blue-600 text-slate-700'
                            } ${isThisWeek ? 'ring-2 ring-blue-500' : ''}`}
                            title={`${w.label} (${w.startDateStr} s.d. ${w.endDateStr})`}
                          >
                            W{w.weekNumber}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-t border-slate-100 text-xs shrink-0">
          <span className="text-[11px] text-slate-500">
            Total: {totalWeeks} Minggu ({year})
          </span>
          <button
            type="button"
            onClick={onClose}
            className="font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
    </>
  );
};
