// components/tal/TalHeader.tsx — header halaman Tasks TAL: tab Harian /
// Mingguan / Bulanan + kontrol tanggal/pekan/tahun + pengalih tampilan
// card/tabel.
// Porting src/components/tal/TalHeader.tsx (backup MyPerform). Adaptasi:
// impor tipe dari lib/tal/types, impor bulan dari lib/tal/date, popup dari
// file se-direktori ini (tidak ada dependensi router/auth).
'use client';

import React, { useState } from 'react';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Table as TableIcon,
  CalendarDays
} from 'lucide-react';
import type { TalTaskType, TalViewMode } from '@/lib/tal/types';
import { INDONESIAN_MONTHS_SHORT } from '@/lib/tal/date';
import { TalCalendarPopup } from './TalCalendarPopup';
import { TalWeekPickerPopup } from './TalWeekPickerPopup';
import { TalYearPickerPopup } from './TalYearPickerPopup';

interface TalHeaderProps {
  activeTab: TalTaskType;
  onChangeTab: (tab: TalTaskType) => void;
  visibleTabs?: { daily?: boolean; weekly?: boolean; monthly?: boolean };

  // Daily props
  selectedDateStr: string;
  onSelectDate: (dateStr: string) => void;
  weekLabel: string; // e.g. "Sep 2026 - Week 37"
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onGoToday: () => void;

  // Weekly props
  selectedWeekYear: number;
  selectedWeekNumber: number;
  selectedMonth: number; // 1 - 12
  onSelectWeek: (year: number, weekNumber: number, dateStr: string) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onGoThisWeek: () => void;

  // Monthly props
  selectedYear: number;
  onSelectYear: (year: number) => void;
  onPrevYear: () => void;
  onNextYear: () => void;
  onGoThisMonth: () => void;

  // View mode
  viewMode: TalViewMode;
  onChangeViewMode: (mode: TalViewMode) => void;
}

export const TalHeader: React.FC<TalHeaderProps> = ({
  activeTab,
  onChangeTab,
  selectedDateStr,
  onSelectDate,
  weekLabel,
  onPrevWeek,
  onNextWeek,
  onGoToday,
  selectedWeekYear,
  selectedWeekNumber,
  selectedMonth,
  onSelectWeek,
  onPrevMonth,
  onNextMonth,
  onGoThisWeek,
  selectedYear,
  onSelectYear,
  onPrevYear,
  onNextYear,
  onGoThisMonth,
  viewMode,
  onChangeViewMode,
  visibleTabs = { daily: true, weekly: true, monthly: true }
}) => {
  const [showCalendarPopup, setShowCalendarPopup] = useState(false);
  const [showWeekPickerPopup, setShowWeekPickerPopup] = useState(false);
  const [showYearPickerPopup, setShowYearPickerPopup] = useState(false);

  // Determine number of visible tabs for grid styling
  const showDaily = visibleTabs.daily !== false;
  const showWeekly = visibleTabs.weekly !== false;
  const showMonthly = visibleTabs.monthly !== false;
  const visibleCount = (showDaily ? 1 : 0) + (showWeekly ? 1 : 0) + (showMonthly ? 1 : 0);

  return (
    <div className="bg-white rounded-xl border border-slate-200/80 p-2.5 sm:p-3 shadow-sm">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
        {/* Left: Tab Switcher (Harian, Mingguan, Bulanan) */}
        {visibleCount > 0 && (
          <div
            className="w-full md:w-auto grid items-center bg-slate-100 p-1 rounded-xl"
            style={{ gridTemplateColumns: `repeat(${visibleCount}, minmax(0, 1fr))` }}
          >
            {showDaily && (
              <button
                type="button"
                onClick={() => onChangeTab('daily')}
                className={`flex items-center justify-center py-1.5 px-2 sm:px-4 rounded-lg text-xs font-bold transition-all text-center cursor-pointer ${
                  activeTab === 'daily'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Harian
              </button>
            )}
            {showWeekly && (
              <button
                type="button"
                onClick={() => onChangeTab('weekly')}
                className={`flex items-center justify-center py-1.5 px-2 sm:px-4 rounded-lg text-xs font-bold transition-all text-center cursor-pointer ${
                  activeTab === 'weekly'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Mingguan
              </button>
            )}
            {showMonthly && (
              <button
                type="button"
                onClick={() => onChangeTab('monthly')}
                className={`flex items-center justify-center py-1.5 px-2 sm:px-4 rounded-lg text-xs font-bold transition-all text-center cursor-pointer ${
                  activeTab === 'monthly'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Bulanan
              </button>
            )}
          </div>
        )}

        {/* Right: Date/Week/Year Controls & View Switcher */}
        <div className="flex items-center justify-between md:justify-end gap-1.5 sm:gap-2 flex-wrap">
          {/* Daily Controls */}
          {activeTab === 'daily' && (
            <div className="flex items-center gap-1 sm:gap-1.5">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowCalendarPopup(!showCalendarPopup)}
                  className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 transition cursor-pointer"
                  title="Pilih Tanggal & Pekan"
                >
                  <Calendar size={14} className="text-blue-600 shrink-0" />
                  <span className="truncate">
                    {weekLabel.includes(' - ') ? (
                      <>
                        <span className="hidden sm:inline">{weekLabel.split(' - ')[0]} - </span>
                        <span>{weekLabel.split(' - ')[1]}</span>
                      </>
                    ) : (
                      weekLabel
                    )}
                  </span>
                </button>

                {showCalendarPopup && (
                  <TalCalendarPopup
                    currentDateStr={selectedDateStr}
                    onSelectDate={onSelectDate}
                    onClose={() => setShowCalendarPopup(false)}
                  />
                )}
              </div>

              <button
                type="button"
                onClick={onPrevWeek}
                className="p-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-600 hover:text-slate-900 transition"
                title="Minggu Sebelumnya"
              >
                <ChevronLeft size={15} />
              </button>

              <button
                type="button"
                onClick={onGoToday}
                className="px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 hover:text-blue-600 transition"
              >
                Today
              </button>

              <button
                type="button"
                onClick={onNextWeek}
                className="p-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-600 hover:text-slate-900 transition"
                title="Minggu Selanjutnya"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          )}

          {/* Weekly Controls */}
          {activeTab === 'weekly' && (
            <div className="flex items-center gap-1 sm:gap-1.5">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowWeekPickerPopup(!showWeekPickerPopup)}
                  className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 transition cursor-pointer"
                  title="Pilih Pekan"
                >
                  <CalendarDays size={14} className="text-indigo-600 shrink-0" />
                  <span>{INDONESIAN_MONTHS_SHORT[selectedMonth - 1]} {selectedWeekYear}</span>
                </button>

                {showWeekPickerPopup && (
                  <TalWeekPickerPopup
                    selectedYear={selectedWeekYear}
                    selectedWeekNumber={selectedWeekNumber}
                    onSelectWeek={onSelectWeek}
                    onClose={() => setShowWeekPickerPopup(false)}
                  />
                )}
              </div>

              <button
                type="button"
                onClick={onPrevMonth}
                className="p-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-600 hover:text-slate-900 transition"
                title="Bulan Sebelumnya"
              >
                <ChevronLeft size={15} />
              </button>

              <button
                type="button"
                onClick={onGoThisWeek}
                className="px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 hover:text-indigo-600 transition"
              >
                This Week
              </button>

              <button
                type="button"
                onClick={onNextMonth}
                className="p-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-600 hover:text-slate-900 transition"
                title="Bulan Selanjutnya"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          )}

          {/* Monthly Controls */}
          {activeTab === 'monthly' && (
            <div className="flex items-center gap-1 sm:gap-1.5">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowYearPickerPopup(!showYearPickerPopup)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 transition cursor-pointer"
                  title="Pilih Tahun"
                >
                  <Calendar size={14} className="text-cyan-600 shrink-0" />
                  <span>{selectedYear}</span>
                </button>

                {showYearPickerPopup && (
                  <TalYearPickerPopup
                    selectedYear={selectedYear}
                    onSelectYear={onSelectYear}
                    onClose={() => setShowYearPickerPopup(false)}
                  />
                )}
              </div>

              <button
                type="button"
                onClick={onPrevYear}
                className="p-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-600 hover:text-slate-900 transition"
                title="Tahun Sebelumnya"
              >
                <ChevronLeft size={15} />
              </button>

              <button
                type="button"
                onClick={onGoThisMonth}
                className="px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 hover:text-cyan-600 transition"
              >
                This Month
              </button>

              <button
                type="button"
                onClick={onNextYear}
                className="p-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-600 hover:text-slate-900 transition"
                title="Tahun Selanjutnya"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          )}

          {/* View Mode Switcher (Card vs Table) */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 ml-1">
            <button
              type="button"
              onClick={() => onChangeViewMode('card')}
              className={`p-1.5 rounded-md transition-all ${
                viewMode === 'card'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
              title="Tampilan Card"
            >
              <LayoutGrid size={15} />
            </button>
            <button
              type="button"
              onClick={() => onChangeViewMode('table')}
              className={`p-1.5 rounded-md transition-all ${
                viewMode === 'table'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
              title="Tampilan Tabel (Spreadsheet)"
            >
              <TableIcon size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
