// WOORK WORK CALENDAR — helper client-side (murni, tanpa import server).
// Dipakai semua komponen kalender: tipe event, fetch unwrap, util tanggal
// zona Asia/Jakarta (offset tetap UTC+7, tanpa DST), builder/parser RRULE.

import { EVENT_CATEGORIES, EVENT_VISIBILITIES } from './constants';
import type { CalendarView } from './constants';

export type { CalendarView };
export { EVENT_CATEGORIES, EVENT_VISIBILITIES };

// ---------------------------------------------------------------------------
// Tipe (cermin SerializedEvent backend)
// ---------------------------------------------------------------------------

export interface CalendarAttendee {
  userId: string;
  name: string | null;
  email: string | null;
  responseStatus: string;
  respondedAt: string | null;
}

export interface CalendarReminder {
  id: string;
  userId: string;
  minutesBefore: number;
  remindAt: string;
  deliveryStatus: string;
  sentAt: string | null;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description: string | null;
  category: string;
  categoryLabel: string;
  categoryColor: string;
  startAt: string;
  endAt: string;
  timezone: string;
  isAllDay: boolean;
  location: string | null;
  meetingLink: string | null;
  visibility: string;
  status: string;
  recurrenceRule: string | null;
  isRecurring: boolean;
  isRecurrenceInstance: boolean;
  recurrenceParentId: string | null;
  originalStartAt: string | null;
  sourceModule: string | null;
  sourceModuleLabel: string | null;
  sourceRecordId: string | null;
  sourceUrl: string | null;
  createdById: string;
  createdByName: string | null;
  createdByEmail: string | null;
  metadata: Record<string, unknown>;
  attendees: CalendarAttendee[];
  reminders?: CalendarReminder[];
  createdAt: string;
  updatedAt: string;
}

export interface EventsRangeResponse {
  events: CalendarEvent[];
  total: number;
  limit: number;
  offset: number;
  from: string;
  to: string;
}

export interface CalendarConflict {
  eventId: string;
  title: string;
  startAt: string;
  endAt: string;
  severity: 'hard' | 'info';
  isRecurrenceInstance?: boolean;
}

export interface CalendarPreferences {
  defaultView: CalendarView;
  timezone: string;
  firstDayOfWeek: number;
  workingHours: Record<string, unknown>;
  notificationPreferences: Record<string, unknown>;
  visibleCalendars: string[];
}

export interface HolidayItem {
  id: string;
  name: string;
  holidayDate: string; // YYYY-MM-DD
  category: string | null;
  description: string | null;
}

export interface OrgMember {
  id: string;
  name: string | null;
  email: string | null;
  roleName?: string | null;
  departmentName?: string | null;
  position?: string | null;
}

// ---------------------------------------------------------------------------
// Fetch (unwrap { success, data })
// ---------------------------------------------------------------------------

export async function apiJson<T>(input: string, init?: RequestInit): Promise<T> {
  const r = await fetch(input, init);
  const body = await r.json().catch(() => ({}));
  if (!r.ok || body.success === false) {
    throw new Error(body.message || `Gagal memuat data (${r.status}).`);
  }
  return (body.data ?? body) as T;
}

// ---------------------------------------------------------------------------
// Tanggal — zona Asia/Jakarta (UTC+7 tetap, tanpa DST)
// ---------------------------------------------------------------------------

export const TZ_OFFSET_MS = 7 * 3600 * 1000;
export const TZ_NAME = 'Asia/Jakarta';

export interface JakartaParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 0=Minggu .. 6=Sabtu
}

/** Pecah Date menjadi bagian-bagian waktu Jakarta. */
export function jakartaParts(d: Date): JakartaParts {
  const j = new Date(d.getTime() + TZ_OFFSET_MS);
  return {
    year: j.getUTCFullYear(),
    month: j.getUTCMonth() + 1,
    day: j.getUTCDate(),
    hour: j.getUTCHours(),
    minute: j.getUTCMinutes(),
    second: j.getUTCSeconds(),
    weekday: j.getUTCDay(),
  };
}

/** Instan UTC dari tengah malam Jakarta pada tanggal y-m-d. */
export function jakartaDayStart(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day) - TZ_OFFSET_MS);
}

/** Awal hari (Jakarta) dari sebuah Date. */
export function startOfJakartaDay(d: Date): Date {
  const p = jakartaParts(d);
  return jakartaDayStart(p.year, p.month, p.day);
}

/** Akhir hari (Jakarta) dari sebuah Date (23:59:59.999). */
export function endOfJakartaDay(d: Date): Date {
  return new Date(startOfJakartaDay(d).getTime() + 24 * 3600 * 1000 - 1);
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 24 * 3600 * 1000);
}

export function addMonths(d: Date, n: number): Date {
  const p = jakartaParts(d);
  const total = (p.year * 12 + (p.month - 1)) + n;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  const day = Math.min(p.day, daysInMonth(year, month));
  return jakartaDayStart(year, month, day);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function isSameJakartaDay(a: Date, b: Date): boolean {
  const pa = jakartaParts(a);
  const pb = jakartaParts(b);
  return pa.year === pb.year && pa.month === pb.month && pa.day === pb.day;
}

/** Menit sejak tengah malam Jakarta (0..1439). */
export function minutesSinceMidnightJakarta(d: Date): number {
  const p = jakartaParts(d);
  return p.hour * 60 + p.minute;
}

/** Awal minggu (Jakarta) — firstDay 0=Minggu, 1=Senin. */
export function startOfJakartaWeek(d: Date, firstDay: number): Date {
  const p = jakartaParts(d);
  const start = startOfJakartaDay(d);
  const diff = (p.weekday - firstDay + 7) % 7;
  return addDays(start, -diff);
}

const MONTHS_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];
const DAYS_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const DAYS_SHORT_ID = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

export function monthName(month: number): string {
  return MONTHS_ID[month - 1] ?? '';
}
export function dayName(weekday: number): string {
  return DAYS_ID[weekday] ?? '';
}
export function dayShortName(weekday: number): string {
  return DAYS_SHORT_ID[weekday] ?? '';
}

/** "08.30" */
export function formatTimeId(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  const p = jakartaParts(date);
  return `${String(p.hour).padStart(2, '0')}.${String(p.minute).padStart(2, '0')}`;
}

/** "13.01.45" — jam WIB dengan detik. */
export function formatTimeSecondsId(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  const p = jakartaParts(date);
  return `${String(p.hour).padStart(2, '0')}.${String(p.minute).padStart(2, '0')}.${String(p.second).padStart(2, '0')}`;
}

/** "Senin, 21 November 2026" */
export function formatDateLongId(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  const p = jakartaParts(date);
  return `${DAYS_ID[p.weekday]}, ${p.day} ${MONTHS_ID[p.month - 1]} ${p.year}`;
}

/** "21 Nov 2026" */
export function formatDateShortId(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  const p = jakartaParts(date);
  return `${p.day} ${MONTHS_ID[p.month - 1].slice(0, 3)} ${p.year}`;
}

/** "November 2026" */
export function formatMonthYearId(d: Date): string {
  const p = jakartaParts(d);
  return `${MONTHS_ID[p.month - 1]} ${p.year}`;
}

/** "YYYY-MM-DD" (tanggal Jakarta). */
export function toJakartaDateKey(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  const p = jakartaParts(date);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** "YYYY-MM-DD" -> Date tengah malam Jakarta. */
export function dateKeyToJakartaDate(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return jakartaDayStart(y, m, d);
}

/** Durasi "1 jam 30 mnt" / "45 mnt" / "2 hari". */
export function formatDuration(startAt: string, endAt: string, isAllDay: boolean): string {
  const s = new Date(startAt).getTime();
  const e = new Date(endAt).getTime();
  const mins = Math.max(0, Math.round((e - s) / 60000));
  if (isAllDay) {
    const days = Math.max(1, Math.round(mins / 1440));
    return days === 1 ? 'Sepanjang hari' : `${days} hari`;
  }
  if (mins < 60) return `${mins} mnt`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} jam` : `${h} jam ${m} mnt`;
}

/** Rentang baca API untuk tiap tampilan. */
export function rangeForView(view: CalendarView, current: Date, firstDay: number): { from: Date; to: Date } {
  if (view === 'day') {
    return { from: startOfJakartaDay(current), to: endOfJakartaDay(current) };
  }
  if (view === 'week') {
    const from = startOfJakartaWeek(current, firstDay);
    return { from, to: new Date(from.getTime() + 7 * 24 * 3600 * 1000 - 1) };
  }
  if (view === 'month') {
    const p = jakartaParts(current);
    const first = jakartaDayStart(p.year, p.month, 1);
    const gridStart = addDays(first, -((jakartaParts(first).weekday - firstDay + 7) % 7));
    // 6 minggu grid
    return { from: gridStart, to: new Date(gridStart.getTime() + 42 * 24 * 3600 * 1000 - 1) };
  }
  if (view === 'year') {
    const p = jakartaParts(current);
    return { from: jakartaDayStart(p.year, 1, 1), to: jakartaDayStart(p.year, 12, 31) };
  }
  if (view === 'timeline') {
    const from = startOfJakartaDay(current);
    return { from, to: new Date(from.getTime() + 14 * 24 * 3600 * 1000 - 1) };
  }
  // agenda: dimuat per jendela oleh CalendarClient (bukan di sini)
  const from = startOfJakartaDay(current);
  return { from, to: new Date(from.getTime() + 14 * 24 * 3600 * 1000 - 1) };
}

/** Label periode aktif di header. */
export function periodLabel(view: CalendarView, current: Date, firstDay: number): string {
  const p = jakartaParts(current);
  if (view === 'day') return formatDateLongId(current);
  if (view === 'week') {
    const from = startOfJakartaWeek(current, firstDay);
    const to = addDays(from, 6);
    const pf = jakartaParts(from);
    const pt = jakartaParts(to);
    if (pf.month === pt.month) return `${pf.day}–${pt.day} ${MONTHS_ID[pf.month - 1]} ${pf.year}`;
    return `${pf.day} ${MONTHS_ID[pf.month - 1]} – ${pt.day} ${MONTHS_ID[pt.month - 1]} ${pt.year}`;
  }
  if (view === 'month') return formatMonthYearId(current);
  if (view === 'year') return String(p.year);
  if (view === 'timeline') return `${formatDateShortId(current)} – ${formatDateShortId(addDays(current, 13))}`;
  return formatDateShortId(current);
}

/** Geser tanggal aktif sesuai tampilan. */
export function shiftCurrent(view: CalendarView, current: Date, dir: 1 | -1): Date {
  if (view === 'day') return addDays(current, dir);
  if (view === 'week') return addDays(current, 7 * dir);
  if (view === 'month') return addMonths(current, dir);
  if (view === 'year') return addMonths(current, 12 * dir);
  if (view === 'timeline' || view === 'agenda') return addDays(current, 14 * dir);
  return addDays(current, dir);
}

// ---------------------------------------------------------------------------
// RRULE (string "RRULE:FREQ=...") — bangun & urai untuk form
// ---------------------------------------------------------------------------

export interface RecurrenceFormValue {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  interval: number;
  byweekday: string[]; // MO..SU
  bymonthday: number[];
  endMode: 'never' | 'until' | 'count';
  until: string; // YYYY-MM-DD
  count: number;
}

export const WEEKDAYS_RRULE = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const;

export function buildRRuleString(v: RecurrenceFormValue): string {
  const parts = [`FREQ=${v.freq}`, `INTERVAL=${Math.max(1, v.interval || 1)}`];
  if (v.freq === 'WEEKLY' && v.byweekday.length) parts.push(`BYDAY=${v.byweekday.join(',')}`);
  if ((v.freq === 'MONTHLY' || v.freq === 'YEARLY') && v.bymonthday.length) {
    parts.push(`BYMONTHDAY=${v.bymonthday.join(',')}`);
  }
  if (v.endMode === 'until' && v.until) {
    const untilDate = new Date(`${v.until}T23:59:59+07:00`);
    parts.push(`UNTIL=${untilDate.toISOString()}`);
  }
  if (v.endMode === 'count' && v.count >= 1) parts.push(`COUNT=${Math.floor(v.count)}`);
  return `RRULE:${parts.join(';')}`;
}

/** Urai string RRULE tersimpan kembali ke nilai form. null bila tidak valid. */
export function parseRRuleString(rule: string | null | undefined): RecurrenceFormValue | null {
  if (!rule) return null;
  const line = rule.split('\n').map((l) => l.trim()).find((l) => l.startsWith('RRULE:'))
    ?? rule.split('\n').map((l) => l.trim()).find((l) => l.startsWith('FREQ='));
  if (!line) return null;
  const body = line.startsWith('RRULE:') ? line.slice(6) : line;
  const kv: Record<string, string> = {};
  for (const part of body.split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0) kv[part.slice(0, eq).trim().toUpperCase()] = part.slice(eq + 1).trim();
  }
  const freq = kv.FREQ as RecurrenceFormValue['freq'];
  if (!['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(freq)) return null;
  let endMode: RecurrenceFormValue['endMode'] = 'never';
  let until = '';
  let count = 10;
  if (kv.UNTIL) {
    const d = new Date(kv.UNTIL);
    if (!Number.isNaN(d.getTime())) {
      endMode = 'until';
      until = toJakartaDateKey(d);
    }
  } else if (kv.COUNT) {
    const c = parseInt(kv.COUNT, 10);
    if (c >= 1) {
      endMode = 'count';
      count = c;
    }
  }
  return {
    freq,
    interval: kv.INTERVAL ? Math.max(1, parseInt(kv.INTERVAL, 10) || 1) : 1,
    byweekday: kv.BYDAY ? kv.BYDAY.split(',').map((d) => d.trim().toUpperCase()).filter((d) => (WEEKDAYS_RRULE as readonly string[]).includes(d)) : [],
    bymonthday: kv.BYMONTHDAY ? kv.BYMONTHDAY.split(',').map((d) => parseInt(d, 10)).filter((d) => d >= 1 && d <= 31) : [],
    endMode,
    until,
    count,
  };
}

export function recurrenceSummary(rule: string | null | undefined): string {
  const v = parseRRuleString(rule);
  if (!v) return '';
  const freqLabel: Record<string, string> = { DAILY: 'Harian', WEEKLY: 'Mingguan', MONTHLY: 'Bulanan', YEARLY: 'Tahunan' };
  let s = freqLabel[v.freq] ?? v.freq;
  if (v.interval > 1) s += ` tiap ${v.interval}`;
  if (v.freq === 'WEEKLY' && v.byweekday.length) {
    const names: Record<string, string> = { MO: 'Sen', TU: 'Sel', WE: 'Rab', TH: 'Kam', FR: 'Fr', SA: 'Sab', SU: 'Min' };
    s += ` (${v.byweekday.map((d) => names[d] ?? d).join(', ')})`;
  }
  if (v.endMode === 'until' && v.until) s += ` sampai ${formatDateShortId(dateKeyToJakartaDate(v.until))}`;
  if (v.endMode === 'count') s += ` (${v.count}x)`;
  return s;
}

// ---------------------------------------------------------------------------
// Pilihan reminder & visibilitas
// ---------------------------------------------------------------------------

export const REMINDER_OPTIONS = [
  { minutes: 0, label: 'Saat event dimulai' },
  { minutes: 5, label: '5 menit sebelumnya' },
  { minutes: 10, label: '10 menit sebelumnya' },
  { minutes: 15, label: '15 menit sebelumnya' },
  { minutes: 30, label: '30 menit sebelumnya' },
  { minutes: 60, label: '1 jam sebelumnya' },
  { minutes: 1440, label: '1 hari sebelumnya' },
] as const;

export const VISIBILITY_LABELS: Record<string, string> = {
  PRIVATE: 'Pribadi — hanya saya & peserta',
  TEAM: 'Tim',
  DEPARTMENT: 'Departemen',
  COMPANY: 'Perusahaan — semua anggota',
  CUSTOM: 'Kustom — peserta tertentu',
};

export const CALENDAR_SCOPES = [
  { key: 'my', label: 'My Calendar' },
  { key: 'team', label: 'Team Calendar' },
  { key: 'company', label: 'Company Calendar' },
  { key: 'shared', label: 'Shared Calendars' },
] as const;

export type CalendarScopeKey = (typeof CALENDAR_SCOPES)[number]['key'];

/** Scope kalender mana saja yang dimiliki sebuah event (untuk filter sidebar). */
export function eventScopes(ev: CalendarEvent, myUserId: string | null): CalendarScopeKey[] {
  const scopes: CalendarScopeKey[] = [];
  if (myUserId && ev.createdById === myUserId) scopes.push('my');
  if (ev.visibility === 'TEAM' || ev.visibility === 'DEPARTMENT') scopes.push('team');
  if (ev.visibility === 'COMPANY') scopes.push('company');
  if (myUserId && ev.attendees.some((a) => a.userId === myUserId) && ev.createdById !== myUserId) {
    scopes.push('shared');
  }
  return scopes;
}
