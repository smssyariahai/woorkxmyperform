// Tampilan kalender (6 mode): Day, Week, Month, Year, Agenda, Timeline.
// Semua murni presentasi — data dimuat CalendarClient, event diklik lewat
// callback. Posisi waktu dihitung dalam zona Asia/Jakarta.

'use client';

import { useMemo } from 'react';
import { ChevronRight, MapPin, Link2, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  jakartaParts,
  jakartaDayStart,
  daysInMonth,
  addDays,
  addMonths,
  toJakartaDateKey,
  dateKeyToJakartaDate,
  isSameJakartaDay,
  minutesSinceMidnightJakarta,
  startOfJakartaDay,
  startOfJakartaWeek,
  monthName,
  dayName,
  dayShortName,
  formatTimeId,
  formatDateShortId,
  type CalendarEvent,
} from '@/lib/calendar/client';

export interface ViewCommonProps {
  events: CalendarEvent[];
  holidays: Map<string, string>;
  onEventClick: (ev: CalendarEvent) => void;
  onSlotClick: (startAt: Date, endAt: Date, isAllDay: boolean) => void;
  onDayClick: (d: Date) => void;
  current: Date;
  firstDay: number;
}

const HOUR_H = 56; // px per jam

/** Layout event berwaktu dalam satu hari: kolom berdampingan bila tumpang tindih. */
export interface LaidOutEvent {
  ev: CalendarEvent;
  top: number;
  height: number;
  leftPct: number;
  widthPct: number;
  /** Potongan yang tampil di hari ini (untuk event lintas hari). */
  clipStart: Date;
  clipEnd: Date;
}

export function layoutDayEvents(events: CalendarEvent[], day: Date): LaidOutEvent[] {
  const dayStart = startOfJakartaDay(day);
  const dayEnd = new Date(dayStart.getTime() + 24 * 3600 * 1000);
  const timed = events
    .filter((ev) => !ev.isAllDay && ev.status !== 'CANCELLED')
    .map((ev) => {
      const s = new Date(ev.startAt);
      const e = new Date(ev.endAt);
      const clipStart = s < dayStart ? dayStart : s;
      const clipEnd = e > dayEnd ? dayEnd : e;
      return { ev, clipStart, clipEnd };
    })
    .filter((x) => x.clipEnd > dayStart && x.clipStart < dayEnd)
    .sort((a, b) => a.clipStart.getTime() - b.clipStart.getTime() || a.clipEnd.getTime() - b.clipEnd.getTime());

  // Tetapkan kolom secara greedy.
  const columns: Array<{ end: number; items: typeof timed }> = [];
  const placed = timed.map((item) => {
    let col = columns.findIndex((c) => c.end <= item.clipStart.getTime());
    if (col === -1) {
      columns.push({ end: 0, items: [] });
      col = columns.length - 1;
    }
    columns[col].end = item.clipEnd.getTime();
    columns[col].items.push(item);
    return { item, col };
  });

  // Lebar = 1 / jumlah kolom dalam cluster yang tumpang tindih.
  const clusterOf = new Map<typeof timed[number], number>();
  for (const p of placed) {
    // cluster = semua kolom yang tumpang tindih dengan event ini
    const overlapping = new Set<number>();
    for (const q of placed) {
      if (q.item.clipStart.getTime() < p.item.clipEnd.getTime() && q.item.clipEnd.getTime() > p.item.clipStart.getTime()) {
        overlapping.add(q.col);
      }
    }
    const maxCol = Math.max(...overlapping);
    const width = 100 / (maxCol + 1);
    clusterOf.set(p.item, width);
  }

  return placed.map(({ item, col }) => {
    const widthPct = clusterOf.get(item) ?? 100;
    const top = (minutesSinceMidnightJakarta(item.clipStart) / 60) * HOUR_H;
    const height = Math.max(
      22,
      ((item.clipEnd.getTime() - item.clipStart.getTime()) / 3600000) * HOUR_H
    );
    return {
      ev: item.ev,
      top,
      height,
      leftPct: col * widthPct,
      widthPct,
      clipStart: item.clipStart,
      clipEnd: item.clipEnd,
    };
  });
}

function EventChip({ ev, onClick, style }: { ev: CalendarEvent; onClick: () => void; style?: React.CSSProperties }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={`${ev.title} — ${ev.isAllDay ? 'Sepanjang hari' : `${formatTimeId(ev.startAt)}–${formatTimeId(ev.endAt)}`}`}
      className={cn(
        'block w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium leading-tight text-white transition-opacity hover:opacity-85',
        ev.status === 'CANCELLED' && 'line-through opacity-60'
      )}
      style={{ backgroundColor: ev.categoryColor, ...style }}
    >
      {!ev.isAllDay && <span className="mr-1 opacity-80">{formatTimeId(ev.startAt)}</span>}
      {ev.title}
    </button>
  );
}

function NowLine({ day }: { day: Date }) {
  const now = new Date();
  if (!isSameJakartaDay(now, day)) return null;
  const top = (minutesSinceMidnightJakarta(now) / 60) * HOUR_H;
  return (
    <div className="pointer-events-none absolute inset-x-0 z-20" style={{ top }}>
      <div className="relative h-0 border-t-2 border-danger">
        <span className="absolute -left-1 -top-[7px] h-3 w-3 rounded-full bg-danger" />
      </div>
    </div>
  );
}

/** Strip event sepanjang hari / lintas hari di atas grid jam. */
function AllDayStrip({ events, day, onEventClick, onSlotClick }: { events: CalendarEvent[]; day: Date; onEventClick: (ev: CalendarEvent) => void; onSlotClick: () => void }) {
  const dayStart = startOfJakartaDay(day);
  const dayEnd = new Date(dayStart.getTime() + 24 * 3600 * 1000);
  const allDay = events.filter((ev) => {
    if (ev.status === 'CANCELLED') return false;
    const s = new Date(ev.startAt);
    const e = new Date(ev.endAt);
    return ev.isAllDay ? (s < dayEnd && e > dayStart) : (e.getTime() - s.getTime() > 24 * 3600 * 1000 && s < dayEnd && e > dayStart);
  });
  return (
    <div className="border-b border-line px-1 py-1" onClick={onSlotClick}>
      <p className="px-1 pb-1 text-[10px] font-bold uppercase tracking-wide text-muted">Sepanjang hari</p>
      {allDay.length === 0 ? (
        <p className="px-1 pb-1 text-[11px] text-muted/60">—</p>
      ) : (
        <div className="space-y-0.5">
          {allDay.map((ev) => (
            <EventChip key={ev.id} ev={ev} onClick={() => onEventClick(ev)} />
          ))}
        </div>
      )}
    </div>
  );
}

function HourGrid({ children, onSlotClick, day }: { children: React.ReactNode; onSlotClick: (hour: number) => void; day: Date }) {
  return (
    <div className="relative">
      {Array.from({ length: 24 }, (_, h) => (
        <div
          key={h}
          className="flex border-b border-line/60"
          style={{ height: HOUR_H }}
          onClick={() => onSlotClick(h)}
        >
          <div className="w-12 shrink-0 -translate-y-2 pr-1 text-right text-[10px] text-muted">
            {String(h).padStart(2, '0')}.00
          </div>
          <div className="flex-1" />
        </div>
      ))}
      <div className="pointer-events-none absolute inset-y-0 left-12 right-0">{children}</div>
      <NowLine day={day} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Day View
// ---------------------------------------------------------------------------

export function DayView({ events, holidays, onEventClick, onSlotClick, current }: ViewCommonProps) {
  const laidOut = useMemo(() => layoutDayEvents(events, current), [events, current]);
  const dayKey = toJakartaDateKey(current);
  const holidayName = holidays.get(dayKey);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-line px-3 py-2">
        <p className="text-[15px] font-bold text-ink">{dayName(jakartaParts(current).weekday)}, {formatDateShortId(current)}</p>
        {holidayName && <p className="text-[12px] font-semibold text-danger">{holidayName}</p>}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <AllDayStrip
          events={events}
          day={current}
          onEventClick={onEventClick}
          onSlotClick={() => onSlotClick(startOfJakartaDay(current), new Date(startOfJakartaDay(current).getTime() + 24 * 3600 * 1000), true)}
        />
        <HourGrid
          day={current}
          onSlotClick={(hour) => {
            const start = new Date(startOfJakartaDay(current).getTime() + hour * 3600 * 1000);
            onSlotClick(start, new Date(start.getTime() + 3600 * 1000), false);
          }}
        >
          {laidOut.map((l) => (
            <button
              key={l.ev.id}
              type="button"
              onClick={(e) => { e.stopPropagation(); onEventClick(l.ev); }}
              className={cn(
                'absolute overflow-hidden rounded border-l-4 px-1.5 py-1 text-left text-[11px] font-medium leading-tight text-white shadow-sm transition-opacity hover:opacity-90',
                l.ev.status === 'CANCELLED' && 'line-through opacity-60'
              )}
              style={{
                top: l.top,
                height: l.height,
                left: `${l.leftPct}%`,
                width: `calc(${l.widthPct}% - 2px)`,
                backgroundColor: l.ev.categoryColor,
                borderColor: l.ev.categoryColor,
              }}
              title={`${l.ev.title} — ${formatTimeId(l.clipStart)}–${formatTimeId(l.clipEnd)}`}
            >
              <span className="block truncate font-semibold">{l.ev.title}</span>
              <span className="block opacity-85">{formatTimeId(l.clipStart)} – {formatTimeId(l.clipEnd)}</span>
              {l.ev.location && <span className="block truncate opacity-80">{l.ev.location}</span>}
            </button>
          ))}
        </HourGrid>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Week View
// ---------------------------------------------------------------------------

export function WeekView({ events, holidays, onEventClick, onSlotClick, onDayClick, current, firstDay }: ViewCommonProps) {
  const weekStart = startOfJakartaWeek(current, firstDay);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="grid grid-cols-7 border-b border-line">
        <div className="border-r border-line px-1 py-2 text-center text-[10px] font-bold uppercase text-muted">Jam</div>
        {days.map((d) => {
          const p = jakartaParts(d);
          const isToday = isSameJakartaDay(d, new Date());
          return (
            <button
              key={toJakartaDateKey(d)}
              type="button"
              onClick={() => onDayClick(d)}
              className={cn('border-r border-line px-1 py-2 text-center transition-colors last:border-r-0 hover:bg-slate-50 dark:hover:bg-slate-800/50', isToday && 'bg-brand-50 dark:bg-brand-900/30')}
            >
              <span className="block text-[10px] font-bold uppercase text-muted">{dayShortName(p.weekday)}</span>
              <span className={cn('mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full text-[13px] font-bold', isToday ? 'bg-brand-600 text-white' : 'text-ink')}>
                {p.day}
              </span>
              {holidays.get(toJakartaDateKey(d)) && (
                <span className="block truncate text-[10px] font-semibold text-danger">{holidays.get(toJakartaDateKey(d))}</span>
              )}
            </button>
          );
        })}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid grid-cols-7">
          <div className="border-r border-line">
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="flex items-start justify-end border-b border-line/60 pr-1 text-[10px] text-muted" style={{ height: HOUR_H }}>
                {String(h).padStart(2, '0')}.00
              </div>
            ))}
          </div>
          {days.map((d) => {
            const laidOut = layoutDayEvents(events, d);
            return (
              <div key={toJakartaDateKey(d)} className="relative border-r border-line last:border-r-0">
                {Array.from({ length: 24 }, (_, h) => (
                  <div
                    key={h}
                    className="border-b border-line/60"
                    style={{ height: HOUR_H }}
                    onClick={() => {
                      const start = new Date(startOfJakartaDay(d).getTime() + h * 3600 * 1000);
                      onSlotClick(start, new Date(start.getTime() + 3600 * 1000), false);
                    }}
                  />
                ))}
                {laidOut.map((l) => (
                  <button
                    key={l.ev.id}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onEventClick(l.ev); }}
                    className={cn(
                      'absolute overflow-hidden rounded px-1 py-0.5 text-left text-[10px] font-medium leading-tight text-white transition-opacity hover:opacity-90',
                      l.ev.status === 'CANCELLED' && 'line-through opacity-60'
                    )}
                    style={{
                      top: l.top,
                      height: Math.max(18, l.height),
                      left: `${l.leftPct}%`,
                      width: `calc(${l.widthPct}% - 2px)`,
                      backgroundColor: l.ev.categoryColor,
                    }}
                    title={`${l.ev.title} — ${formatTimeId(l.clipStart)}–${formatTimeId(l.clipEnd)}`}
                  >
                    <span className="block truncate">{l.ev.title}</span>
                  </button>
                ))}
                <NowLine day={d} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Month View
// ---------------------------------------------------------------------------

export function MonthView({ events, holidays, onEventClick, onDayClick, current, firstDay }: ViewCommonProps) {
  const cells = useMemo(() => {
    const p = jakartaParts(current);
    const first = jakartaDayStart(p.year, p.month, 1);
    const offset = (jakartaParts(first).weekday - firstDay + 7) % 7;
    const start = addDays(first, -offset);
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [current, firstDay]);

  const p = jakartaParts(current);
  const weekdays = [0, 1, 2, 3, 4, 5, 6].map((i) => (firstDay + i) % 7);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      if (ev.status === 'CANCELLED') continue;
      const s = startOfJakartaDay(new Date(ev.startAt));
      const e = new Date(ev.endAt);
      for (let d = s; d < e; d = addDays(d, 1)) {
        const key = toJakartaDateKey(d);
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(ev);
        if (d > addDays(s, 370)) break; // pengaman
      }
    }
    for (const list of map.values()) list.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
    return map;
  }, [events]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="grid grid-cols-7 border-b border-line bg-canvas dark:bg-slate-800/40">
        {weekdays.map((w) => (
          <div key={w} className="px-2 py-2 text-center text-[11px] font-bold uppercase tracking-wide text-muted">
            {dayName(w)}
          </div>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6">
        {cells.map((d) => {
          const dp = jakartaParts(d);
          const key = toJakartaDateKey(d);
          const inMonth = dp.month === p.month;
          const isToday = key === toJakartaDateKey(new Date());
          const dayEvents = eventsByDay.get(key) ?? [];
          const shown = dayEvents.slice(0, 3);
          const more = dayEvents.length - shown.length;
          const holidayName = holidays.get(key);
          return (
            <button
              key={key}
              type="button"
              onClick={() => onDayClick(d)}
              className={cn(
                'flex flex-col overflow-hidden border-b border-r border-line/70 p-1 text-left align-top transition-colors hover:bg-brand-50/50 dark:hover:bg-slate-800/40',
                !inMonth && 'bg-slate-50/60 dark:bg-slate-800/20',
                isToday && 'bg-brand-50 dark:bg-brand-900/20'
              )}
            >
              <span className={cn(
                'mb-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-semibold',
                isToday ? 'bg-brand-600 text-white' : inMonth ? 'text-ink' : 'text-muted/50'
              )}>
                {dp.day}
              </span>
              {holidayName && (
                <span className="mb-0.5 truncate rounded bg-danger/10 px-1 py-px text-[10px] font-bold text-danger">{holidayName}</span>
              )}
              <span className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden">
                {shown.map((ev) => (
                  <span
                    key={ev.id}
                    onClick={(e) => { e.stopPropagation(); onEventClick(ev); }}
                    className="block cursor-pointer truncate rounded px-1 py-px text-[10px] font-medium text-white transition-opacity hover:opacity-85"
                    style={{ backgroundColor: ev.categoryColor }}
                    title={ev.title}
                  >
                    {!ev.isAllDay && `${formatTimeId(ev.startAt)} `}{ev.title}
                  </span>
                ))}
                {more > 0 && (
                  <span className="px-1 text-[10px] font-semibold text-brand-600 dark:text-brand-400">+{more} lagi</span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Year View
// ---------------------------------------------------------------------------

export function YearView({ events, holidays, onDayClick, current, firstDay, onSelectMonth }: { events: CalendarEvent[]; holidays: Map<string, string>; onDayClick: (d: Date) => void; current: Date; firstDay: number; onSelectMonth: (d: Date) => void }) {
  const year = jakartaParts(current).year;
  const eventDays = useMemo(() => {
    const set = new Set<string>();
    for (const ev of events) {
      if (ev.status === 'CANCELLED') continue;
      const s = startOfJakartaDay(new Date(ev.startAt));
      const e = new Date(ev.endAt);
      for (let d = s; d < e; d = addDays(d, 1)) {
        set.add(toJakartaDateKey(d));
        if (d > addDays(s, 370)) break;
      }
    }
    return set;
  }, [events]);

  return (
    <div className="h-full overflow-y-auto p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 12 }, (_, m) => {
          const month = m + 1;
          const first = jakartaDayStart(year, month, 1);
          const offset = (jakartaParts(first).weekday - firstDay + 7) % 7;
          const start = addDays(first, -offset);
          const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
          // Hanya tampilkan minggu yang menyentuh bulan ini (4–6 minggu).
          const shownWeeks = cells.slice(0, Math.max(28, Math.ceil((offset + daysInMonth(year, month)) / 7) * 7));
          return (
            <div key={month} className="rounded-btn border border-line bg-white p-2.5 dark:bg-slate-900">
              <button
                type="button"
                onClick={() => onSelectMonth(jakartaDayStart(year, month, 1))}
                className="mb-1.5 flex w-full items-center justify-between rounded px-1 py-0.5 text-left text-[13px] font-bold text-ink transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                {monthName(month)} {year}
                <ChevronRight className="h-4 w-4 text-muted" />
              </button>
              <div className="grid grid-cols-7 gap-px text-center">
                {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                  <span key={i} className="pb-0.5 text-[9px] font-bold uppercase text-muted">
                    {dayShortName((firstDay + i) % 7)}
                  </span>
                ))}
                {shownWeeks.map((d) => {
                  const dp = jakartaParts(d);
                  const key = toJakartaDateKey(d);
                  const inMonth = dp.month === month;
                  const hasEvent = eventDays.has(key);
                  const isHoliday = holidays.has(key);
                  const isToday = key === toJakartaDateKey(new Date());
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => onDayClick(d)}
                      title={isHoliday ? holidays.get(key) : undefined}
                      className={cn(
                        'relative flex h-6 items-center justify-center rounded text-[11px] transition-colors',
                        !inMonth && 'text-muted/30',
                        inMonth && 'text-ink/80 hover:bg-slate-100 dark:hover:bg-slate-800',
                        isToday && 'font-bold text-brand-700 dark:text-brand-100',
                        isHoliday && inMonth && 'text-danger'
                      )}
                    >
                      {dp.day}
                      {hasEvent && inMonth && (
                        <span className="absolute bottom-0 h-1 w-1 rounded-full bg-brand-500" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Agenda View
// ---------------------------------------------------------------------------

export function AgendaView({ events, holidays, onEventClick, onLoadMore, hasMore, loadingMore }: {
  events: CalendarEvent[];
  holidays: Map<string, string>;
  onEventClick: (ev: CalendarEvent) => void;
  onLoadMore: () => void;
  hasMore: boolean;
  loadingMore: boolean;
}) {
  const groups = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      if (ev.status === 'CANCELLED') continue;
      const key = toJakartaDateKey(ev.startAt);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ev);
    }
    const out = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    for (const [, list] of out) list.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
    return out;
  }, [events]);

  // Sisipkan hari libur sebagai baris tersendiri (ditampilkan di header tiap tanggal).

  if (groups.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center">
        <Clock className="mb-2 h-8 w-8 text-muted" />
        <p className="text-[14px] font-semibold text-ink">Tidak ada agenda pada rentang ini.</p>
        <p className="mt-1 text-[13px] text-muted">Buat event baru atau muat rentang tanggal lain.</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-3 sm:p-4">
      <div className="mx-auto max-w-3xl space-y-5">
        {groups.map(([key, list]) => {
          const d = dateKeyToJakartaDate(key);
          const isToday = key === toJakartaDateKey(new Date());
          const holidayName = holidays.get(key);
          return (
            <section key={key}>
              <div className="mb-2 flex items-baseline gap-2 border-b border-line pb-1.5">
                <h3 className={cn('text-[14px] font-bold', isToday ? 'text-brand-700 dark:text-brand-100' : 'text-ink')}>
                  {dayName(jakartaParts(d).weekday)}, {formatDateShortId(d)}
                  {isToday && <span className="ml-2 rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-bold text-white">Hari ini</span>}
                </h3>
                {holidayName && <span className="text-[12px] font-semibold text-danger">{holidayName}</span>}
              </div>
              <ul className="space-y-1.5">
                {list.map((ev) => (
                  <li key={ev.id}>
                    <button
                      type="button"
                      onClick={() => onEventClick(ev)}
                      className="flex w-full items-start gap-3 rounded-btn border border-line bg-white px-3 py-2.5 text-left transition-colors hover:border-brand-300 hover:bg-brand-50/40 dark:bg-slate-900 dark:hover:bg-slate-800/60"
                    >
                      <span className="mt-1 h-8 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: ev.categoryColor }} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-semibold text-ink">{ev.title}</span>
                        <span className="mt-0.5 block text-[12px] text-muted">
                          {ev.isAllDay ? 'Sepanjang hari' : `${formatTimeId(ev.startAt)} – ${formatTimeId(ev.endAt)}`}
                          {ev.location ? ` · ${ev.location}` : ''}
                          {ev.sourceModuleLabel ? ` · ${ev.sourceModuleLabel}` : ''}
                        </span>
                      </span>
                      <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold text-white" style={{ backgroundColor: ev.categoryColor }}>
                        {ev.categoryLabel}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
        {hasMore && (
          <div className="pt-2 text-center">
            <button
              type="button"
              onClick={onLoadMore}
              disabled={loadingMore}
              className="rounded-btn border border-line px-4 py-2 text-[13px] font-semibold text-ink/80 transition-colors hover:bg-slate-100 disabled:opacity-60 dark:hover:bg-slate-800"
            >
              {loadingMore ? 'Memuat...' : 'Muat 14 hari berikutnya'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Timeline View
// ---------------------------------------------------------------------------

export function TimelineView({ events, holidays, onEventClick, current, onDayClick }: {
  events: CalendarEvent[];
  holidays: Map<string, string>;
  onEventClick: (ev: CalendarEvent) => void;
  current: Date;
  onDayClick: (d: Date) => void;
}) {
  const days = useMemo(() => {
    const start = startOfJakartaDay(current);
    return Array.from({ length: 14 }, (_, i) => addDays(start, i));
  }, [current]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      if (ev.status === 'CANCELLED') continue;
      const s = startOfJakartaDay(new Date(ev.startAt));
      const e = new Date(ev.endAt);
      for (let d = s; d < e; d = addDays(d, 1)) {
        const key = toJakartaDateKey(d);
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(ev);
        if (d > addDays(s, 370)) break;
      }
    }
    return map;
  }, [events]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="overflow-x-auto border-b border-line bg-canvas px-3 py-2 dark:bg-slate-800/40">
        <div className="flex min-w-[720px] items-center gap-0 text-[10px] font-bold uppercase text-muted">
          <span className="w-28 shrink-0">Hari</span>
          {[0, 6, 12, 18, 24].map((h, i, arr) => (
            <span key={h} className={cn('shrink-0', i < arr.length - 1 ? 'flex-1' : '')}>
              {String(h).padStart(2, '0')}.00
            </span>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="min-w-[720px]">
          {days.map((d) => {
            const key = toJakartaDateKey(d);
            const p = jakartaParts(d);
            const isToday = key === toJakartaDateKey(new Date());
            const dayEvents = (eventsByDay.get(key) ?? []).sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
            const holidayName = holidays.get(key);
            return (
              <div key={key} className={cn('flex items-stretch border-b border-line/70', isToday && 'bg-brand-50/60 dark:bg-brand-900/10')}>
                <button
                  type="button"
                  onClick={() => onDayClick(d)}
                  className="w-28 shrink-0 px-3 py-2 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
                >
                  <span className={cn('block text-[12px] font-bold', isToday ? 'text-brand-700 dark:text-brand-100' : 'text-ink')}>
                    {dayShortName(p.weekday)}, {p.day} {monthName(p.month).slice(0, 3)}
                  </span>
                  {holidayName ? (
                    <span className="block truncate text-[11px] font-semibold text-danger">{holidayName}</span>
                  ) : (
                    <span className="block text-[11px] text-muted">{dayEvents.length} event</span>
                  )}
                </button>
                <div className="relative min-h-[44px] flex-1 py-1.5">
                  {dayEvents.length === 0 && (
                    <span className="absolute inset-y-0 left-2 flex items-center text-[11px] text-muted/50">—</span>
                  )}
                  {dayEvents.map((ev) => {
                    const dayStart = startOfJakartaDay(d);
                    const dayEnd = new Date(dayStart.getTime() + 24 * 3600 * 1000);
                    const s = new Date(ev.startAt);
                    const e = new Date(ev.endAt);
                    const clipStart = s < dayStart ? dayStart : s;
                    const clipEnd = e > dayEnd ? dayEnd : e;
                    const leftPct = ((clipStart.getTime() - dayStart.getTime()) / 86400000) * 100;
                    const widthPct = Math.max(2, ((clipEnd.getTime() - clipStart.getTime()) / 86400000) * 100);
                    return (
                      <button
                        key={ev.id}
                        type="button"
                        onClick={() => onEventClick(ev)}
                        title={`${ev.title} — ${ev.isAllDay ? 'Sepanjang hari' : `${formatTimeId(ev.startAt)}–${formatTimeId(ev.endAt)}`}`}
                        className="absolute top-1.5 flex h-8 items-center gap-1 overflow-hidden rounded px-2 text-left text-[11px] font-semibold text-white transition-opacity hover:opacity-90"
                        style={{ left: `${leftPct}%`, width: `calc(${widthPct}% - 2px)`, backgroundColor: ev.categoryColor }}
                      >
                        <span className="truncate">{ev.title}</span>
                        {!ev.isAllDay && <span className="shrink-0 opacity-80">{formatTimeId(clipStart)}</span>}
                      </button>
                    );
                  })}
                </div>
                <div className="flex w-8 shrink-0 items-center justify-center">
                  {dayEvents.some((ev) => ev.meetingLink) && <Link2 className="h-3.5 w-3.5 text-muted" />}
                  {dayEvents.some((ev) => ev.location) && <MapPin className="h-3.5 w-3.5 text-muted" />}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
