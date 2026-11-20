// components/tal/TalCalendarPopup.tsx — popup kalender bulanan dengan kolom
// nomor pekan (dipakai TalHeader & TalDatePicker).
// Porting src/components/tal/TalCalendarPopup.tsx (backup MyPerform) apa
// adanya; helper tanggal dari lib/tal/date. Catatan Tailwind:
// backdrop-blur-xs backup dipetakan ke backdrop-blur-sm (token WOORK).
'use client';

import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import {
  INDONESIAN_MONTHS,
  getWeekNumberAndYear,
  formatDateKey,
  parseDateKey,
  getStartOfWeek
} from '@/lib/tal/date';

interface TalCalendarPopupProps {
  currentDateStr: string; // YYYY-MM-DD
  onSelectDate: (dateStr: string) => void;
  onClose: () => void;
  align?: 'left' | 'right';
}

export const TalCalendarPopup: React.FC<TalCalendarPopupProps> = ({
  currentDateStr,
  onSelectDate,
  onClose,
  align = 'left'
}) => {
  const selectedDate = parseDateKey(currentDateStr);
  const [viewYear, setViewYear] = useState(selectedDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(selectedDate.getMonth()); // 0 - 11

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(prev => prev - 1);
    } else {
      setViewMonth(prev => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(prev => prev + 1);
    } else {
      setViewMonth(prev => prev + 1);
    }
  };

  // Build weeks and days for viewMonth & viewYear
  // Start from Sunday of the first week that touches this month
  const firstDayOfMonth = new Date(viewYear, viewMonth, 1);
  const lastDayOfMonth = new Date(viewYear, viewMonth + 1, 0);

  const startSunday = getStartOfWeek(firstDayOfMonth);

  // Create matrix of weeks
  const calendarRows: {
    weekNumber: number;
    days: {
      date: Date;
      dateStr: string;
      dayNumber: number;
      isCurrentMonth: boolean;
      isSelected: boolean;
      isToday: boolean;
      isSunday: boolean;
    }[];
  }[] = [];

  const todayStr = formatDateKey(new Date());
  let currentPointer = new Date(startSunday);

  while (currentPointer <= lastDayOfMonth || currentPointer.getDay() !== 0) {
    const weekStart = new Date(currentPointer);
    const { weekNumber } = getWeekNumberAndYear(weekStart);
    const daysInThisWeek = [];

    for (let i = 0; i < 7; i++) {
      const d = new Date(currentPointer);
      const dStr = formatDateKey(d);
      daysInThisWeek.push({
        date: d,
        dateStr: dStr,
        dayNumber: d.getDate(),
        isCurrentMonth: d.getMonth() === viewMonth,
        isSelected: dStr === currentDateStr,
        isToday: dStr === todayStr,
        isSunday: i === 0
      });
      currentPointer.setDate(currentPointer.getDate() + 1);
    }

    calendarRows.push({
      weekNumber,
      days: daysInThisWeek
    });

    if (calendarRows.length >= 6 && currentPointer > lastDayOfMonth) {
      break;
    }
  }

  return (
    <>
      {/* Click outside backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 md:bg-transparent backdrop-blur-sm md:backdrop-blur-none"
        onClick={onClose}
      />

      {/* Popup / Dropdown Container */}
      <div
        className={`fixed inset-x-3 top-1/2 -translate-y-1/2 md:absolute md:inset-auto md:top-full ${
          align === 'right' ? 'md:right-0 md:left-auto' : 'md:left-0 md:right-auto'
        } md:translate-y-1.5 z-50 flex justify-center md:block`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-white rounded-2xl shadow-2xl md:shadow-xl border border-slate-200 w-full max-w-[360px] md:w-[410px] md:max-w-[420px] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-600 transition cursor-pointer"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="text-sm font-bold text-slate-800 px-2 min-w-[130px] text-center">
              {INDONESIAN_MONTHS[viewMonth]} {viewYear}
            </span>
            <button
              type="button"
              onClick={handleNextMonth}
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

        {/* Table / Grid */}
        <div className="p-3.5 sm:p-4">
          {/* Day Names Header */}
          <div className="grid grid-cols-8 text-center text-xs font-bold pb-2.5 border-b border-slate-100">
            <div className="text-blue-600 font-bold text-[11px]">W#</div>
            <div className="text-rose-500">Su</div>
            <div className="text-slate-600">Mo</div>
            <div className="text-slate-600">Tu</div>
            <div className="text-slate-600">We</div>
            <div className="text-slate-600">Th</div>
            <div className="text-slate-600">Fr</div>
            <div className="text-slate-600">Sa</div>
          </div>

          {/* Calendar Rows */}
          <div className="space-y-1.5 mt-2">
            {calendarRows.map((row, rIdx) => (
              <div key={rIdx} className="grid grid-cols-8 items-center text-center">
                {/* Week Number Column matching Image 2 */}
                <div className="h-8 md:h-9 flex items-center justify-center text-[11px] font-bold text-blue-600 bg-blue-50/80 rounded-lg my-0.5">
                  {row.weekNumber}
                </div>

                {/* 7 Days of the week */}
                {row.days.map((day) => {
                  return (
                    <button
                      key={day.dateStr}
                      type="button"
                      onClick={() => {
                        onSelectDate(day.dateStr);
                        onClose();
                      }}
                      className={`h-8 w-8 md:h-9 md:w-9 mx-auto flex items-center justify-center text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                        day.isSelected
                          ? 'bg-slate-900 text-white font-bold shadow-sm'
                          : day.isToday
                          ? 'border-2 border-blue-500 text-blue-600 font-bold hover:bg-blue-50'
                          : !day.isCurrentMonth
                          ? 'text-slate-300 hover:bg-slate-100'
                          : day.isSunday
                          ? 'text-rose-600 hover:bg-rose-50'
                          : 'text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {day.dayNumber}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Footer Quick Action */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-t border-slate-100 text-xs">
          <button
            type="button"
            onClick={() => {
              onSelectDate(todayStr);
              onClose();
            }}
            className="font-bold text-blue-600 hover:text-blue-800 transition"
          >
            Hari Ini ({todayStr})
          </button>
          <button
            type="button"
            onClick={onClose}
            className="font-semibold text-slate-500 hover:text-slate-700"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
    </>
  );
};
