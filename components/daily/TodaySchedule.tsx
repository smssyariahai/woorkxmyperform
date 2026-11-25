// Jadwal Hari Ini — timeline agenda dari Work Calendar + Meeting.
// Garis "sekarang" ditandai pada item yang sedang berlangsung.
'use client';

import Link from 'next/link';
import { ChevronLeft, ChevronRight, Clock, MapPin, Plus, Video, CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatTimeId, formatDateLongId, toJakartaDateKey, addDays } from '@/lib/calendar/client';
import type { ScheduleItem } from './types';

const STATUS_LABEL: Record<string, string> = {
  now: 'Sekarang',
  upcoming: 'Akan Datang',
  completed: 'Selesai',
  cancelled: 'Dibatalkan',
};

export function TodaySchedule({
  items,
  date,
  loading,
  onDateChange,
}: {
  items: ScheduleItem[];
  date: Date;
  loading: boolean;
  onDateChange: (d: Date) => void;
}) {
  const dateKey = toJakartaDateKey(date);
  const isToday = dateKey === toJakartaDateKey(new Date());
  return (
    <section className="rounded-btn border border-line bg-white p-4 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-ink">Jadwal Hari Ini</h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onDateChange(addDays(date, -1))}
            aria-label="Hari sebelumnya"
            className="rounded-btn p-1.5 text-muted hover:bg-slate-100 hover:text-ink dark:hover:bg-slate-800"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[170px] text-center text-[13px] font-medium text-ink">
            {formatDateLongId(date)}
            {!isToday && (
              <button
                type="button"
                onClick={() => onDateChange(new Date())}
                className="ml-2 text-[12px] font-semibold text-brand hover:underline"
              >
                Hari ini
              </button>
            )}
          </span>
          <button
            type="button"
            onClick={() => onDateChange(addDays(date, 1))}
            aria-label="Hari berikutnya"
            className="rounded-btn p-1.5 text-muted hover:bg-slate-100 hover:text-ink dark:hover:bg-slate-800"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="mt-4 space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-btn bg-slate-100 dark:bg-slate-800" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="mt-4 rounded-btn bg-slate-50 px-4 py-6 text-center text-[13px] text-muted dark:bg-slate-800/60">
          Anda tidak memiliki agenda terjadwal hari ini.
        </p>
      ) : (
        <ol className="relative mt-4 space-y-3 border-l-2 border-line pl-4">
          {items.map((it) => (
            <li key={it.id} className="relative">
              <span
                className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white dark:border-slate-900"
                style={{ backgroundColor: it.categoryColor }}
              />
              <div
                className={cn(
                  'rounded-btn border p-3',
                  it.timeStatus === 'now'
                    ? 'border-brand bg-brand-50/60 dark:bg-brand-900/20'
                    : 'border-line bg-white dark:bg-slate-900',
                  it.timeStatus === 'cancelled' && 'opacity-60'
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-ink">{it.title}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-muted">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {it.isAllDay
                          ? 'Sepanjang hari'
                          : `${formatTimeId(it.startAt)} – ${formatTimeId(it.endAt)}`}
                      </span>
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
                        style={{ backgroundColor: `${it.categoryColor}1a`, color: it.categoryColor }}
                      >
                        {it.categoryLabel}
                      </span>
                      {it.sourceModuleLabel && (
                        <span className="text-[11px]">{it.sourceModuleLabel}</span>
                      )}
                    </p>
                    {(it.location || it.attendeeNames.length > 0) && (
                      <p className="mt-1 text-[12px] text-muted">
                        {it.location && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5" /> {it.location}
                          </span>
                        )}
                        {it.attendeeNames.length > 0 && (
                          <span className="ml-2">Peserta: {it.attendeeNames.slice(0, 3).join(', ')}{it.attendeeNames.length > 3 ? ` +${it.attendeeNames.length - 3}` : ''}</span>
                        )}
                      </p>
                    )}
                  </div>
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                      it.timeStatus === 'now' && 'bg-brand text-white',
                      it.timeStatus === 'upcoming' && 'bg-slate-100 text-ink dark:bg-slate-800',
                      it.timeStatus === 'completed' && 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
                      it.timeStatus === 'cancelled' && 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                    )}
                  >
                    {STATUS_LABEL[it.timeStatus] ?? it.timeStatus}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {it.joinActive && it.meetingLink && (
                    <a
                      href={it.meetingLink}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-btn bg-brand px-2.5 py-1 text-[12px] font-semibold text-white hover:opacity-90"
                    >
                      <Video className="h-3.5 w-3.5" /> Gabung
                    </a>
                  )}
                  {it.sourceUrl && (
                    <Link
                      href={it.sourceUrl}
                      className="inline-flex items-center gap-1 rounded-btn border border-line px-2.5 py-1 text-[12px] font-medium text-ink hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      Buka
                    </Link>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href="/kalender"
          className="inline-flex items-center gap-1.5 rounded-btn border border-line px-3 py-1.5 text-[13px] font-medium text-ink hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          <CalendarDays className="h-4 w-4" /> Lihat Kalender
        </Link>
        <Link
          href="/kalender"
          className="inline-flex items-center gap-1.5 rounded-btn bg-brand px-3 py-1.5 text-[13px] font-semibold text-white hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Buat Event
        </Link>
      </div>
    </section>
  );
}
