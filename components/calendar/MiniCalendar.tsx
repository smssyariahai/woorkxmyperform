// Mini Calendar — kalender kecil 1 bulan untuk sidebar kalender.
// Klik tanggal -> pindah tanggal aktif. Titik menandai hari yang punya event.

'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  jakartaParts,
  jakartaDayStart,
  daysInMonth,
  addDays,
  addMonths,
  toJakartaDateKey,
  isSameJakartaDay,
  monthName,
  dayShortName,
} from '@/lib/calendar/client';

interface MiniCalendarProps {
  current: Date;
  onSelect: (d: Date) => void;
  /** Set tanggal (YYYY-MM-DD) yang punya event, untuk titik penanda. */
  eventDays?: Set<string>;
  holidays?: Map<string, string>; // dateKey -> nama libur
  firstDay?: number; // 0=Minggu, 1=Senin
}

export function MiniCalendar({ current, onSelect, eventDays, holidays, firstDay = 1 }: MiniCalendarProps) {
  const [viewMonth, setViewMonth] = useState(() => {
    const p = jakartaParts(current);
    return jakartaDayStart(p.year, p.month, 1);
  });

  const cells = useMemo(() => {
    const p = jakartaParts(viewMonth);
    const first = jakartaDayStart(p.year, p.month, 1);
    const offset = (jakartaParts(first).weekday - firstDay + 7) % 7;
    const start = addDays(first, -offset);
    const out: Date[] = [];
    for (let i = 0; i < 42; i++) out.push(addDays(start, i));
    return out;
  }, [viewMonth, firstDay]);

  const todayKey = toJakartaDateKey(new Date());
  const currentKey = toJakartaDateKey(current);
  const viewP = jakartaParts(viewMonth);
  const weekdays = [0, 1, 2, 3, 4, 5, 6].map((i) => (firstDay + i) % 7);

  return (
    <div className="rounded-btn border border-line bg-white p-3 dark:bg-slate-900">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[13px] font-semibold text-ink">
          {monthName(viewP.month)} {viewP.year}
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setViewMonth(addMonths(viewMonth, -1))}
            aria-label="Bulan sebelumnya"
            className="rounded-btn p-1 text-muted transition-colors hover:bg-slate-100 hover:text-ink dark:hover:bg-slate-800"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setViewMonth(addMonths(viewMonth, 1))}
            aria-label="Bulan berikutnya"
            className="rounded-btn p-1 text-muted transition-colors hover:bg-slate-100 hover:text-ink dark:hover:bg-slate-800"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {weekdays.map((w) => (
          <span key={w} className="pb-1 text-[10px] font-bold uppercase tracking-wide text-muted">
            {dayShortName(w)}
          </span>
        ))}
        {cells.map((d) => {
          const p = jakartaParts(d);
          const key = toJakartaDateKey(d);
          const inMonth = p.month === viewP.month;
          const isToday = key === todayKey;
          const isSelected = key === currentKey;
          const hasEvent = eventDays?.has(key);
          const isHoliday = holidays?.has(key);
          return (
            <button
              key={key}
              type="button"
              onClick={() => {
                onSelect(d);
                setViewMonth(jakartaDayStart(p.year, p.month, 1));
              }}
              title={isHoliday ? holidays?.get(key) ?? 'Hari libur' : undefined}
              className={cn(
                'relative flex h-7 w-full flex-col items-center justify-center rounded-md text-[11px] transition-colors',
                !inMonth && 'text-muted/40',
                inMonth && !isSelected && 'text-ink/85 hover:bg-slate-100 dark:hover:bg-slate-800',
                isSelected && 'bg-brand-600 font-bold text-white hover:bg-brand-600',
                isToday && !isSelected && 'font-bold text-brand-700 dark:text-brand-100',
                isHoliday && !isSelected && 'text-danger'
              )}
            >
              {p.day}
              {hasEvent && (
                <span
                  className={cn(
                    'absolute bottom-0.5 h-1 w-1 rounded-full',
                    isSelected ? 'bg-white' : 'bg-brand-500'
                  )}
                />
              )}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-muted">
        Hari ini: {new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' })}
      </p>
    </div>
  );
}
