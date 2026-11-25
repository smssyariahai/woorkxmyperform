// CalendarClient — komponen utama Work Calendar: header, sidebar, 6 tampilan,
// modal detail/form/pengaturan, pencarian, filter, sinkronisasi.

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import {
  ChevronLeft, ChevronRight, Plus, Search, SlidersHorizontal, RefreshCw,
  Settings, CalendarDays, X, Menu, Clock, Filter,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  apiJson,
  EVENT_CATEGORIES,
  CALENDAR_SCOPES,
  rangeForView,
  periodLabel,
  shiftCurrent,
  startOfJakartaDay,
  addDays,
  toJakartaDateKey,
  dateKeyToJakartaDate,
  formatDateShortId,
  formatTimeId,
  eventScopes,
  type CalendarEvent,
  type CalendarPreferences,
  type CalendarView,
  type HolidayItem,
} from '@/lib/calendar/client';
import { MiniCalendar } from './MiniCalendar';
import { EventFormModal } from './EventFormModal';
import { EventDetailModal } from './EventDetailModal';
import { CalendarSettingsModal } from './CalendarSettingsModal';
import { DayView, WeekView, MonthView, YearView, AgendaView, TimelineView } from './views';

const VIEW_LABELS: Array<{ key: CalendarView; label: string }> = [
  { key: 'day', label: 'Harian' },
  { key: 'week', label: 'Mingguan' },
  { key: 'month', label: 'Bulanan' },
  { key: 'agenda', label: 'Agenda' },
  { key: 'year', label: 'Tahunan' },
  { key: 'timeline', label: 'Timeline' },
];

const CATEGORIES_STORAGE_KEY = 'woork.calendar.hiddenCategories';

interface CalendarClientProps {
  canCreate: boolean;
  canManage: boolean;
}

export function CalendarClient({ canCreate, canManage }: CalendarClientProps) {
  const { data: session } = useSession();
  const myUserId = (session?.user as any)?.id ?? null;

  const [current, setCurrent] = useState(() => new Date());
  const [view, setView] = useState<CalendarView>('month');
  const [firstDay, setFirstDay] = useState(1);
  const [prefs, setPrefs] = useState<CalendarPreferences | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [holidays, setHolidays] = useState<Map<string, string>>(new Map());
  const [upcoming, setUpcoming] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [visibleScopes, setVisibleScopes] = useState<string[]>(['my', 'team', 'company', 'shared']);
  const [hiddenCategories, setHiddenCategories] = useState<Set<string>>(new Set());
  const [sourceFilter, setSourceFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CalendarEvent[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [detailEvent, setDetailEvent] = useState<CalendarEvent | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formEvent, setFormEvent] = useState<CalendarEvent | null>(null);
  const [formInitial, setFormInitial] = useState<{ startAt: Date; endAt: Date; isAllDay: boolean } | null>(null);
  const [dayAgendaDate, setDayAgendaDate] = useState<Date | null>(null);
  const [agendaDays, setAgendaDays] = useState(14);
  const [agendaLoadingMore, setAgendaLoadingMore] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Kategori yang disembunyikan (preferensi tampilan per-browser).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CATEGORIES_STORAGE_KEY);
      if (raw) setHiddenCategories(new Set(JSON.parse(raw) as string[]));
    } catch { /* abaikan */ }
  }, []);

  const toggleCategory = useCallback((key: string) => {
    setHiddenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      try { localStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify([...next])); } catch { /* abaikan */ }
      return next;
    });
  }, []);

  const toggleScope = useCallback((key: string) => {
    setVisibleScopes((prev) => {
      const next = prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key];
      // Simpan ke preferensi server (visibleCalendars).
      void apiJson('/api/calendar/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visibleCalendars: next }),
      }).catch(() => { /* simpan diam-diam; gagal tidak mengganggu */ });
      return next;
    });
  }, []);

  // Muat preferensi + upcoming (sekali).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const p = await apiJson<CalendarPreferences>('/api/calendar/preferences');
        if (cancelled) return;
        setPrefs(p);
        setView(p.defaultView ?? 'month');
        setFirstDay(p.firstDayOfWeek === 0 ? 0 : 1);
        if (Array.isArray(p.visibleCalendars) && p.visibleCalendars.length > 0) {
          setVisibleScopes(p.visibleCalendars);
        }
      } catch {
        if (!cancelled) setPrefs({ defaultView: 'month', timezone: 'Asia/Jakarta', firstDayOfWeek: 1, workingHours: {}, notificationPreferences: {}, visibleCalendars: ['my', 'team', 'company', 'shared'] });
      }
      try {
        const up = await apiJson<{ events: CalendarEvent[] }>('/api/calendar/upcoming');
        if (!cancelled) setUpcoming(up.events ?? []);
      } catch { /* upcoming opsional */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // Muat event + libur untuk rentang tampilan aktif.
  const loadRange = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const range = view === 'agenda'
        ? { from: startOfJakartaDay(current), to: new Date(startOfJakartaDay(current).getTime() + agendaDays * 24 * 3600 * 1000 - 1) }
        : rangeForView(view, current, firstDay);
      const qs = new URLSearchParams({
        from: range.from.toISOString(),
        to: range.to.toISOString(),
        limit: '500',
      });
      if (sourceFilter) qs.set('sourceModule', sourceFilter);
      if (statusFilter) qs.set('status', statusFilter);
      const [evRes, holRes] = await Promise.all([
        apiJson<{ events: CalendarEvent[] }>(`/api/calendar/events?${qs.toString()}`),
        apiJson<{ holidays: HolidayItem[] }>(`/api/calendar/holidays?from=${range.from.toISOString()}&to=${range.to.toISOString()}`).then((r) => r.holidays ?? []).catch(() => [] as HolidayItem[]),
      ]);
      setEvents(evRes.events ?? []);
      const hm = new Map<string, string>();
      for (const h of holRes) hm.set(h.holidayDate, h.name);
      setHolidays(hm);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat kalender.');
    } finally {
      setLoading(false);
    }
  }, [view, current, firstDay, agendaDays, sourceFilter, statusFilter]);

  useEffect(() => {
    // Agenda: muat diam-diam (tanpa spinner penuh) agar "Muat lebih"
    // tidak mengganti daftar yang sudah tampil dengan layar loading.
    void loadRange(view === 'agenda');
  }, [loadRange, view]);

  // Pencarian (debounce).
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults([]);
      setSearchOpen(false);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await apiJson<{ events: CalendarEvent[] }>(`/api/calendar/search?q=${encodeURIComponent(q)}`);
        setSearchResults(res.events ?? []);
        setSearchOpen(true);
      } catch {
        setSearchResults([]);
      }
    }, 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [searchQuery]);

  const visibleEvents = useMemo(() => {
    return events.filter((ev) => {
      if (hiddenCategories.has(ev.category)) return false;
      const scopes = eventScopes(ev, myUserId);
      if (scopes.length === 0) return true;
      return scopes.some((s) => visibleScopes.includes(s));
    });
  }, [events, hiddenCategories, visibleScopes, myUserId]);

  const eventDays = useMemo(() => {
    const set = new Set<string>();
    for (const ev of visibleEvents) {
      if (ev.status === 'CANCELLED') continue;
      const s = startOfJakartaDay(new Date(ev.startAt));
      const e = new Date(ev.endAt);
      for (let d = s; d < e; d = addDays(d, 1)) {
        set.add(toJakartaDateKey(d));
        if (d > addDays(s, 370)) break;
      }
    }
    return set;
  }, [visibleEvents]);

  const openDetail = useCallback(async (ev: CalendarEvent) => {
    setDetailEvent(ev);
    try {
      const parentId = ev.id.split('@')[0];
      const full = await apiJson<CalendarEvent>(`/api/calendar/events/${encodeURIComponent(parentId)}`);
      setDetailEvent({
        ...full,
        startAt: ev.startAt,
        endAt: ev.endAt,
        isRecurrenceInstance: ev.isRecurrenceInstance,
        recurrenceParentId: ev.recurrenceParentId,
        originalStartAt: ev.originalStartAt,
        id: ev.id,
      });
    } catch { /* pakai versi list */ }
  }, []);

  const openCreate = useCallback((startAt?: Date, endAt?: Date, isAllDay = false) => {
    const start = startAt ?? new Date();
    const end = endAt ?? new Date(start.getTime() + 3600 * 1000);
    setFormEvent(null);
    setFormInitial({ startAt: start, endAt: end, isAllDay });
    setFormOpen(true);
  }, []);

  const openEdit = useCallback((ev: CalendarEvent) => {
    setDetailEvent(null);
    setFormEvent(ev);
    setFormInitial(null);
    setFormOpen(true);
  }, []);

  const handleSlotClick = useCallback((startAt: Date, endAt: Date, isAllDay: boolean) => {
    if (!canCreate) {
      toast.error('Anda tidak punya izin membuat event.');
      return;
    }
    openCreate(startAt, endAt, isAllDay);
  }, [canCreate, openCreate]);

  const handleDayClick = useCallback((d: Date) => {
    setDayAgendaDate(d);
  }, []);

  const doSync = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await apiJson<{ summary: { created: number; updated: number; cancelled: number; deleted: number; failed: number; skipped: number } }>('/api/calendar/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const s = res.summary;
      toast.success(`Sinkronisasi selesai: ${s.created} baru, ${s.updated} diperbarui, ${s.cancelled} dibatalkan${s.failed > 0 ? `, ${s.failed} gagal` : ''}.`);
      await loadRange(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal sinkronisasi.');
    } finally {
      setSyncing(false);
    }
  }, [loadRange]);

  const goToday = useCallback(() => setCurrent(new Date()), []);
  const goPrev = useCallback(() => setCurrent((c) => shiftCurrent(view, c, -1)), [view]);
  const goNext = useCallback(() => setCurrent((c) => shiftCurrent(view, c, 1)), [view]);

  const changeView = useCallback((v: CalendarView) => {
    setView(v);
    if (v === 'agenda') setAgendaDays(14);
  }, []);

  const dayAgendaEvents = useMemo(() => {
    if (!dayAgendaDate) return [];
    const key = toJakartaDateKey(dayAgendaDate);
    return visibleEvents
      .filter((ev) => {
        if (ev.status === 'CANCELLED') return false;
        const s = startOfJakartaDay(new Date(ev.startAt));
        const e = new Date(ev.endAt);
        const d = startOfJakartaDay(dayAgendaDate);
        return s <= d && e > d;
      })
      .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  }, [dayAgendaDate, visibleEvents]);

  const viewProps = {
    events: visibleEvents,
    holidays,
    onEventClick: openDetail,
    onSlotClick: handleSlotClick,
    onDayClick: handleDayClick,
    current,
    firstDay,
  };

  const sidebar = (
    <div className="space-y-3">
      <MiniCalendar
        current={current}
        onSelect={(d) => { setCurrent(d); setSidebarOpen(false); }}
        eventDays={eventDays}
        holidays={holidays}
        firstDay={firstDay}
      />

      <div className="rounded-btn border border-line bg-white p-3 dark:bg-slate-900">
        <p className="mb-2 text-[12px] font-bold uppercase tracking-wide text-muted">Kalender Saya</p>
        <div className="space-y-1.5">
          {CALENDAR_SCOPES.map((s) => {
            const active = visibleScopes.includes(s.key);
            return (
              <label key={s.key} className="flex cursor-pointer items-center gap-2 text-[13px] text-ink/85">
                <input
                  type="checkbox" checked={active}
                  onChange={() => toggleScope(s.key)}
                  className="h-4 w-4 accent-brand-600"
                />
                {s.label}
              </label>
            );
          })}
        </div>
      </div>

      <div className="rounded-btn border border-line bg-white p-3 dark:bg-slate-900">
        <p className="mb-2 text-[12px] font-bold uppercase tracking-wide text-muted">Kategori</p>
        <div className="space-y-1.5">
          {EVENT_CATEGORIES.map((c) => {
            const hidden = hiddenCategories.has(c.key);
            return (
              <label key={c.key} className="flex cursor-pointer items-center gap-2 text-[13px] text-ink/85">
                <input
                  type="checkbox" checked={!hidden}
                  onChange={() => toggleCategory(c.key)}
                  className="h-4 w-4 accent-brand-600"
                />
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
                <span className={cn(hidden && 'text-muted line-through')}>{c.label}</span>
              </label>
            );
          })}
        </div>
      </div>

      <div className="rounded-btn border border-line bg-white p-3 dark:bg-slate-900">
        <p className="mb-2 text-[12px] font-bold uppercase tracking-wide text-muted">Upcoming Events</p>
        {upcoming.length === 0 ? (
          <p className="text-[12px] text-muted">Tidak ada event dalam 30 hari ke depan.</p>
        ) : (
          <ul className="space-y-2">
            {upcoming.slice(0, 10).map((ev) => (
              <li key={ev.id}>
                <button type="button" onClick={() => void openDetail(ev)} className="flex w-full items-start gap-2 rounded-btn px-1 py-1 text-left transition-colors hover:bg-slate-100 dark:hover:bg-slate-800">
                  <span className="mt-1 h-6 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: ev.categoryColor }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-ink">{ev.title}</span>
                    <span className="block text-[11px] text-muted">
                      {formatDateShortId(ev.startAt)}{ev.isAllDay ? '' : ` · ${formatTimeId(ev.startAt)}`}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="mb-3 flex flex-wrap items-start gap-2">
        <button
          type="button"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          aria-label="Tampilkan/sembunyikan sidebar"
          className="rounded-btn border border-line bg-white p-2 text-ink/80 lg:hidden dark:bg-slate-900"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 text-xl font-bold text-ink">
            <CalendarDays className="h-6 w-6 text-brand-600" /> Work Calendar
          </h1>
          <p className="mt-0.5 text-[13px] text-muted">Kelola seluruh jadwal, agenda, meeting, dan aktivitas pekerjaan dalam satu tempat.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canManage && (
            <button
              type="button" onClick={() => void doSync()} disabled={syncing}
              className="inline-flex items-center gap-1.5 rounded-btn border border-line bg-white px-3 py-2 text-[13px] font-semibold text-ink/80 transition-colors hover:bg-slate-100 disabled:opacity-60 dark:bg-slate-900 dark:hover:bg-slate-800"
              title="Sinkronkan event dari Meeting, TAL, Invoice, Pengumuman, dan hari libur"
            >
              <RefreshCw className={cn('h-4 w-4', syncing && 'animate-spin')} /> {syncing ? 'Menyinkron...' : 'Sinkronkan'}
            </button>
          )}
          <button
            type="button" onClick={() => setSettingsOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-btn border border-line bg-white px-3 py-2 text-[13px] font-semibold text-ink/80 transition-colors hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800"
            title="Pengaturan kalender"
          >
            <Settings className="h-4 w-4" /> <span className="hidden sm:inline">Pengaturan</span>
          </button>
          {canCreate && (
            <button
              type="button" onClick={() => openCreate()}
              className="inline-flex items-center gap-1.5 rounded-btn bg-brand-600 px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-brand-700"
            >
              <Plus className="h-4 w-4" /> Buat Event
            </button>
          )}
        </div>
      </div>

      {/* Toolbar: navigasi + tampilan + cari + filter */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <button type="button" onClick={goToday} className="rounded-btn border border-line bg-white px-3 py-2 text-[13px] font-semibold text-ink/80 transition-colors hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800">
            Hari Ini
          </button>
          <button type="button" onClick={goPrev} aria-label="Periode sebelumnya" className="rounded-btn border border-line bg-white p-2 text-ink/80 transition-colors hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button type="button" onClick={goNext} aria-label="Periode berikutnya" className="rounded-btn border border-line bg-white p-2 text-ink/80 transition-colors hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800">
            <ChevronRight className="h-4 w-4" />
          </button>
          <span className="ml-1 text-[15px] font-bold text-ink">{periodLabel(view, current, firstDay)}</span>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-btn border border-line bg-white dark:bg-slate-900">
            {VIEW_LABELS.map((v) => (
              <button
                key={v.key} type="button"
                onClick={() => changeView(v.key)}
                className={cn(
                  'px-2.5 py-2 text-[12px] font-semibold transition-colors sm:px-3',
                  view === v.key ? 'bg-brand-600 text-white' : 'text-ink/70 hover:bg-slate-100 dark:hover:bg-slate-800'
                )}
              >
                {v.label}
              </button>
            ))}
          </div>

          <div className="relative">
            <div className="flex items-center gap-1.5 rounded-btn border border-line bg-white px-2.5 py-2 dark:bg-slate-900">
              <Search className="h-4 w-4 shrink-0 text-muted" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => { if (searchResults.length > 0) setSearchOpen(true); }}
                placeholder="Cari event..."
                className="w-32 bg-transparent text-[13px] text-ink outline-none placeholder:text-muted sm:w-44"
              />
              {searchQuery && (
                <button type="button" onClick={() => { setSearchQuery(''); setSearchResults([]); setSearchOpen(false); }} aria-label="Bersihkan pencarian" className="text-muted hover:text-ink">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            {searchOpen && searchResults.length > 0 && (
              <div className="absolute right-0 z-40 mt-1 max-h-72 w-72 overflow-y-auto rounded-btn border border-line bg-white shadow-lg dark:bg-slate-900">
                {searchResults.map((ev) => (
                  <button
                    key={ev.id} type="button"
                    onClick={() => { setSearchOpen(false); setSearchQuery(''); void openDetail(ev); }}
                    className="flex w-full items-start gap-2 border-b border-line/60 px-3 py-2 text-left last:border-b-0 hover:bg-slate-50 dark:hover:bg-slate-800/60"
                  >
                    <span className="mt-1 h-6 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: ev.categoryColor }} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-ink">{ev.title}</span>
                      <span className="block text-[11px] text-muted">{formatDateShortId(ev.startAt)} · {ev.categoryLabel}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
            {searchOpen && searchQuery.trim().length >= 2 && searchResults.length === 0 && (
              <div className="absolute right-0 z-40 mt-1 w-72 rounded-btn border border-line bg-white px-3 py-2 text-[13px] text-muted shadow-lg dark:bg-slate-900">
                Tidak ada event yang cocok.
              </div>
            )}
          </div>

          <div className="relative">
            <button
              type="button" onClick={() => setFilterOpen(!filterOpen)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-btn border px-3 py-2 text-[13px] font-semibold transition-colors',
                sourceFilter || statusFilter
                  ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-100'
                  : 'border-line bg-white text-ink/80 hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800'
              )}
            >
              <SlidersHorizontal className="h-4 w-4" /> Filter
              {(sourceFilter || statusFilter) && <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-bold text-white">1</span>}
            </button>
            {filterOpen && (
              <div className="absolute right-0 z-40 mt-1 w-64 rounded-btn border border-line bg-white p-3 shadow-lg dark:bg-slate-900">
                <p className="mb-2 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide text-muted">
                  <Filter className="h-3.5 w-3.5" /> Filter Event
                </p>
                <label htmlFor="cal-filter-source" className="mb-1 block text-[12px] font-semibold text-ink/80">Modul sumber</label>
                <select
                  id="cal-filter-source" value={sourceFilter}
                  onChange={(e) => setSourceFilter(e.target.value)}
                  className="mb-3 w-full rounded-btn border border-line bg-white px-2.5 py-2 text-[13px] text-ink outline-none dark:bg-slate-900"
                >
                  <option value="">Semua sumber</option>
                  <option value="meeting">WOORK MEET</option>
                  <option value="tal_task">TAL — Tugas</option>
                  <option value="tal_cuti">TAL — Cuti</option>
                  <option value="invoice">Tagihan</option>
                  <option value="announcement">Pengumuman</option>
                  <option value="holiday">TAL — Hari Libur</option>
                  <option value="manual">Event manual</option>
                </select>
                <label htmlFor="cal-filter-status" className="mb-1 block text-[12px] font-semibold text-ink/80">Status</label>
                <select
                  id="cal-filter-status" value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="mb-3 w-full rounded-btn border border-line bg-white px-2.5 py-2 text-[13px] text-ink outline-none dark:bg-slate-900"
                >
                  <option value="">Semua status</option>
                  <option value="SCHEDULED">Terjadwal</option>
                  <option value="COMPLETED">Selesai</option>
                  <option value="CANCELLED">Dibatalkan</option>
                </select>
                <button
                  type="button"
                  onClick={() => { setSourceFilter(''); setStatusFilter(''); setFilterOpen(false); }}
                  className="w-full rounded-btn border border-line px-3 py-2 text-[13px] font-semibold text-ink/80 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Bersihkan filter
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Isi: sidebar + area kalender */}
      <div className="flex min-h-0 flex-1 gap-3">
        <aside className={cn(
          'w-[248px] shrink-0 overflow-y-auto',
          sidebarOpen ? 'fixed inset-y-0 left-0 z-40 w-[280px] overflow-y-auto bg-canvas p-3 shadow-xl lg:static lg:z-auto lg:w-[248px] lg:bg-transparent lg:p-0 lg:shadow-none' : 'hidden lg:block'
        )}>
          {sidebarOpen && (
            <button type="button" onClick={() => setSidebarOpen(false)} className="mb-2 inline-flex items-center gap-1 rounded-btn border border-line bg-white px-2.5 py-1.5 text-[12px] font-semibold text-ink/80 lg:hidden dark:bg-slate-900">
              <X className="h-4 w-4" /> Tutup
            </button>
          )}
          {sidebar}
        </aside>

        <main className="min-w-0 flex-1 overflow-hidden rounded-btn border border-line bg-white dark:bg-slate-900">
          {error ? (
            <div className="flex h-full flex-col items-center justify-center p-8 text-center">
              <p className="text-[14px] font-semibold text-danger">{error}</p>
              <button type="button" onClick={() => void loadRange()} className="mt-3 rounded-btn border border-line px-4 py-2 text-[13px] font-semibold text-ink/80 hover:bg-slate-100 dark:hover:bg-slate-800">
                Coba lagi
              </button>
            </div>
          ) : loading ? (
            <div className="flex h-full flex-col items-center justify-center p-8 text-center">
              <Clock className="mb-2 h-8 w-8 animate-pulse text-muted" />
              <p className="text-[14px] text-muted">Memuat kalender...</p>
            </div>
          ) : view === 'day' ? (
            <DayView {...viewProps} />
          ) : view === 'week' ? (
            <WeekView {...viewProps} />
          ) : view === 'month' ? (
            <MonthView {...viewProps} />
          ) : view === 'year' ? (
            <YearView
              events={visibleEvents}
              holidays={holidays}
              onDayClick={(d) => { setCurrent(d); setView('day'); }}
              current={current}
              firstDay={firstDay}
              onSelectMonth={(d) => { setCurrent(d); setView('month'); }}
            />
          ) : view === 'agenda' ? (
            <AgendaView
              events={visibleEvents}
              holidays={holidays}
              onEventClick={openDetail}
              hasMore={agendaDays < 90}
              loadingMore={agendaLoadingMore}
              onLoadMore={() => {
                setAgendaLoadingMore(true);
                setAgendaDays((d) => d + 14);
                setTimeout(() => setAgendaLoadingMore(false), 500);
              }}
            />
          ) : (
            <TimelineView
              events={visibleEvents}
              holidays={holidays}
              onEventClick={openDetail}
              current={current}
              onDayClick={(d) => { setCurrent(d); setView('day'); }}
            />
          )}
        </main>
      </div>

      {/* Modal agenda satu hari (dari klik tanggal di Month View) */}
      {dayAgendaDate && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={() => setDayAgendaDate(null)}>
          <div
            className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl dark:bg-slate-900 sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Agenda hari ini"
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[16px] font-bold text-ink">{formatDateShortId(dayAgendaDate)}</h2>
                {holidays.get(toJakartaDateKey(dayAgendaDate)) && (
                  <p className="text-[12px] font-semibold text-danger">{holidays.get(toJakartaDateKey(dayAgendaDate))}</p>
                )}
              </div>
              <button type="button" onClick={() => setDayAgendaDate(null)} aria-label="Tutup" className="rounded-btn p-1.5 text-muted hover:bg-slate-100 hover:text-ink dark:hover:bg-slate-800">
                <X className="h-5 w-5" />
              </button>
            </div>
            {dayAgendaEvents.length === 0 ? (
              <p className="text-[13px] text-muted">Tidak ada agenda pada hari ini.</p>
            ) : (
              <ul className="space-y-1.5">
                {dayAgendaEvents.map((ev) => (
                  <li key={ev.id}>
                    <button
                      type="button"
                      onClick={() => { setDayAgendaDate(null); void openDetail(ev); }}
                      className="flex w-full items-start gap-2.5 rounded-btn border border-line px-3 py-2.5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
                    >
                      <span className="mt-1 h-8 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: ev.categoryColor }} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-semibold text-ink">{ev.title}</span>
                        <span className="block text-[12px] text-muted">
                          {ev.isAllDay ? 'Sepanjang hari' : `${formatTimeId(ev.startAt)} – ${formatTimeId(ev.endAt)}`}
                          {ev.location ? ` · ${ev.location}` : ''}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {canCreate && (
              <button
                type="button"
                onClick={() => {
                  const d = dayAgendaDate;
                  setDayAgendaDate(null);
                  openCreate(startOfJakartaDay(d), new Date(startOfJakartaDay(d).getTime() + 3600 * 1000), false);
                }}
                className="mt-4 inline-flex items-center gap-1.5 rounded-btn bg-brand-600 px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-brand-700"
              >
                <Plus className="h-4 w-4" /> Buat event di hari ini
              </button>
            )}
          </div>
        </div>
      )}

      <EventFormModal
        open={formOpen}
        onClose={() => { setFormOpen(false); setFormEvent(null); setFormInitial(null); }}
        onSaved={() => { void loadRange(true); }}
        initial={formInitial}
        event={formEvent}
        existingEvents={events}
        myUserId={myUserId}
      />
      <EventDetailModal
        open={detailEvent !== null}
        event={detailEvent}
        onClose={() => setDetailEvent(null)}
        onEdit={openEdit}
        onDeleted={() => { void loadRange(true); }}
        onDuplicated={() => { void loadRange(true); }}
        onRsvpDone={() => { if (detailEvent) void openDetail(detailEvent); void loadRange(true); }}
        canEdit={canCreate}
        canDelete={canCreate || canManage}
        myUserId={myUserId}
      />
      <CalendarSettingsModal
        open={settingsOpen}
        preferences={prefs}
        onClose={() => setSettingsOpen(false)}
        onSaved={(p) => {
          setPrefs(p);
          setView(p.defaultView);
          setFirstDay(p.firstDayOfWeek === 0 ? 0 : 1);
          if (Array.isArray(p.visibleCalendars) && p.visibleCalendars.length > 0) setVisibleScopes(p.visibleCalendars);
        }}
      />
    </div>
  );
}
