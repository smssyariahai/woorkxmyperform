// components/tal/TalDatePicker.tsx — pemilih tanggal (tombol + popup
// kalender).
// Porting src/components/tal/TalDatePicker.tsx (backup MyPerform) apa adanya;
// helper tanggal dari lib/tal/date.
'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronDown } from 'lucide-react';
import { TalCalendarPopup } from './TalCalendarPopup';
import { parseDateKey, INDONESIAN_MONTHS_SHORT, INDONESIAN_DAYS_SHORT } from '@/lib/tal/date';

interface TalDatePickerProps {
  label: string;
  value: string; // YYYY-MM-DD
  onChange: (dateStr: string) => void;
  className?: string;
}

export const TalDatePicker: React.FC<TalDatePickerProps> = ({
  label,
  value,
  onChange,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Format date display (e.g., "19/09/2026" on mobile, "Sab, 19 Sep 2026" on desktop)
  const getFormattedLabel = (dateStr: string) => {
    if (!dateStr) return { short: '-', full: '-' };
    try {
      const d = parseDateKey(dateStr);
      const dayName = INDONESIAN_DAYS_SHORT[d.getDay()] || '';
      const dateNum = String(d.getDate()).padStart(2, '0');
      const monthNum = String(d.getMonth() + 1).padStart(2, '0');
      const monthName = INDONESIAN_MONTHS_SHORT[d.getMonth()] || '';
      const yearNum = d.getFullYear();
      return {
        short: `${dateNum}/${monthNum}/${yearNum}`,
        full: `${dayName}, ${d.getDate()} ${monthName} ${yearNum}`,
      };
    } catch {
      return { short: dateStr, full: dateStr };
    }
  };

  // Close on outside click for desktop mode
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        // If clicking outside container and not inside any fixed popover
        const target = e.target as HTMLElement;
        if (!target.closest('.tal-calendar-popup-container')) {
          setIsOpen(false);
        }
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

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
          className="flex items-center justify-between gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 shadow-sm transition cursor-pointer w-full sm:w-auto min-w-0 sm:min-w-[145px]"
        >
          <div className="flex items-center gap-1.5 truncate">
            <Calendar size={13} className="text-blue-600 shrink-0" />
            <span className="sm:hidden font-mono text-[11px] font-bold">
              {getFormattedLabel(value).short}
            </span>
            <span className="hidden sm:inline truncate">
              {getFormattedLabel(value).full}
            </span>
          </div>
          <ChevronDown size={13} className={`text-slate-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {isOpen && (
        <div className="tal-calendar-popup-container">
          <TalCalendarPopup
            currentDateStr={value}
            onSelectDate={(newDateStr) => {
              onChange(newDateStr);
              setIsOpen(false);
            }}
            onClose={() => setIsOpen(false)}
          />
        </div>
      )}
    </div>
  );
};
