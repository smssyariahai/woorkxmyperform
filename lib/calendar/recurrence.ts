// WOORK WORK CALENDAR — recurrence (rrule.js).
//
// Prinsip: instance berulang TIDAK disimpan ke DB. Yang disimpan hanya
// RRULE di CalendarEvent.recurrenceRule; ekspansi dilakukan saat baca
// (GET range / upcoming / search) dan saat cek konflik.
//
// PENTING (bug rrule yang harus dihindari): `RRule.fromString` pada string
// tanpa DTSTART memakai "sekarang" sebagai dtstart dan MENURUNKAN
// byweekday/byhour/byminute/bysecond dari waktu itu. Bila options hasil
// parse itu di-spread lalu dtstart diganti, weekday & jam turunan itu
// tetap menempel dan occurrence jatuh di hari/jam yang salah. Karena itu
// string RRULE di sini TIDAK PERNAH di-parse lewat fromString — melainkan
// diurai key=value-nya secara eksplisit (hanya kunci yang tertulis di
// string yang dipakai), lalu RRule dibangun dengan dtstart = event.startAt.

import { RRule, Frequency } from 'rrule';
import { MAX_OCCURRENCES } from './constants';

export type RecurrenceFreq = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

export interface RecurrenceInput {
  freq: RecurrenceFreq;
  interval?: number;
  /** ['MO','TU','WE','TH','FR','SA','SU'] — untuk WEEKLY (dan MONTHLY). */
  byweekday?: string[];
  /** [1..31] — untuk MONTHLY/YEARLY. */
  bymonthday?: number[];
  until?: Date | string;
  count?: number;
  /** Tanggal mulai rangkaian (default: sekarang). */
  dtstart?: Date | string;
}

const FREQ_MAP: Record<RecurrenceFreq, Frequency> = {
  DAILY: RRule.DAILY,
  WEEKLY: RRule.WEEKLY,
  MONTHLY: RRule.MONTHLY,
  YEARLY: RRule.YEARLY,
};

const FREQ_BY_NAME: Record<string, Frequency> = {
  DAILY: RRule.DAILY,
  WEEKLY: RRule.WEEKLY,
  MONTHLY: RRule.MONTHLY,
  YEARLY: RRule.YEARLY,
};

const WEEKDAY_MAP: Record<string, any> = {
  MO: RRule.MO,
  TU: RRule.TU,
  WE: RRule.WE,
  TH: RRule.TH,
  FR: RRule.FR,
  SA: RRule.SA,
  SU: RRule.SU,
};

/** Bangun string RRULE dari input form. Mengembalikan "RRULE:FREQ=..." (tanpa DTSTART). */
export function buildRRule(input: RecurrenceInput): string {
  const freq = FREQ_MAP[input.freq];
  if (!freq) throw new Error(`Frekuensi recurrence tidak valid: ${input.freq}`);
  const interval = input.interval && input.interval >= 1 ? Math.floor(input.interval) : 1;
  const byweekday = (input.byweekday ?? [])
    .map((d) => WEEKDAY_MAP[String(d).toUpperCase()])
    .filter(Boolean);
  const bymonthday = (input.bymonthday ?? [])
    .map((d) => Math.floor(d))
    .filter((d) => d >= 1 && d <= 31);
  const until = input.until ? new Date(input.until) : undefined;
  if (until && Number.isNaN(until.getTime())) throw new Error('until tidak valid.');
  const count = input.count && input.count >= 1 ? Math.floor(input.count) : undefined;
  const dtstart = input.dtstart ? new Date(input.dtstart) : undefined;
  const rule = new RRule({
    freq,
    interval,
    ...(byweekday.length ? { byweekday } : {}),
    ...(bymonthday.length ? { bymonthday } : {}),
    ...(until ? { until } : {}),
    ...(count ? { count } : {}),
    ...(dtstart ? { dtstart } : {}),
  });
  // toString() menghasilkan "DTSTART:...\nRRULE:..." — simpan hanya baris RRULE.
  const line = rule
    .toString()
    .split('\n')
    .find((l) => l.startsWith('RRULE:'));
  return line ?? `RRULE:${rule.toString()}`;
}

export interface ParsedRRuleParts {
  freq: Frequency;
  interval: number;
  byweekday?: any[];
  bymonthday?: number[];
  bysetpos?: number[];
  bymonth?: number[];
  until?: Date;
  count?: number;
  wkst?: number;
}

/**
 * Urai string RRULE menjadi bagian-bagiannya — HANYA kunci yang tertulis
 * di string. null bila tidak ada FREQ yang valid.
 */
export function parseRRuleParts(rule: string | null | undefined): ParsedRRuleParts | null {
  if (!rule || typeof rule !== 'string') return null;
  let body = rule.trim();
  // Boleh "RRULE:FREQ=..." atau "FREQ=..." (dan boleh ada baris DTSTART).
  const lines = body.split('\n').map((l) => l.trim());
  const rruleLine = lines.find((l) => l.startsWith('RRULE:')) ?? lines.find((l) => l.startsWith('FREQ='));
  if (!rruleLine) return null;
  body = rruleLine.startsWith('RRULE:') ? rruleLine.slice('RRULE:'.length) : rruleLine;
  const kv: Record<string, string> = {};
  for (const part of body.split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0) kv[part.slice(0, eq).trim().toUpperCase()] = part.slice(eq + 1).trim();
  }
  const freq = FREQ_BY_NAME[(kv.FREQ ?? '').toUpperCase()];
  if (freq === undefined) return null;
  const out: ParsedRRuleParts = {
    freq,
    interval: kv.INTERVAL ? Math.max(1, parseInt(kv.INTERVAL, 10) || 1) : 1,
  };
  if (kv.BYDAY) {
    const days = kv.BYDAY.split(',')
      .map((d) => WEEKDAY_MAP[d.trim().toUpperCase()])
      .filter(Boolean);
    if (days.length) out.byweekday = days;
  }
  if (kv.BYMONTHDAY) {
    const days = kv.BYMONTHDAY.split(',')
      .map((d) => parseInt(d, 10))
      .filter((d) => d >= 1 && d <= 31);
    if (days.length) out.bymonthday = days;
  }
  if (kv.BYSETPOS) {
    const pos = kv.BYSETPOS.split(',')
      .map((d) => parseInt(d, 10))
      .filter((d) => !Number.isNaN(d));
    if (pos.length) out.bysetpos = pos;
  }
  if (kv.BYMONTH) {
    const months = kv.BYMONTH.split(',')
      .map((d) => parseInt(d, 10))
      .filter((d) => d >= 1 && d <= 12);
    if (months.length) out.bymonth = months;
  }
  if (kv.UNTIL) {
    const u = parseUntil(kv.UNTIL);
    if (u) out.until = u;
  }
  if (kv.COUNT) {
    const c = parseInt(kv.COUNT, 10);
    if (c >= 1) out.count = c;
  }
  if (kv.WKST) {
    const w = WEEKDAY_MAP[kv.WKST.toUpperCase()];
    if (w) out.wkst = w.weekday;
  }
  return out;
}

/** UNTIL bisa "20261231T235959Z" atau ISO 8601. */
function parseUntil(v: string): Date | null {
  const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/);
  if (m) {
    const d = new Date(
      Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])
    );
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Bangun RRule dari bagian eksplisit + dtstart (event.startAt). */
export function rruleFromParts(parts: ParsedRRuleParts, dtstart: Date): RRule {
  return new RRule({
    freq: parts.freq,
    interval: parts.interval,
    dtstart,
    ...(parts.byweekday ? { byweekday: parts.byweekday } : {}),
    ...(parts.bymonthday ? { bymonthday: parts.bymonthday } : {}),
    ...(parts.bysetpos ? { bysetpos: parts.bysetpos } : {}),
    ...(parts.bymonth ? { bymonth: parts.bymonth } : {}),
    ...(parts.until ? { until: parts.until } : {}),
    ...(parts.count ? { count: parts.count } : {}),
    ...(parts.wkst !== undefined ? { wkst: parts.wkst } : {}),
  });
}

/** Parse string RRULE tersimpan menjadi RRule (dtstart = epoch, hanya untuk validasi). null bila tidak valid. */
export function parseRRule(rule: string | null | undefined): RRule | null {
  const parts = parseRRuleParts(rule);
  if (!parts) return null;
  try {
    return rruleFromParts(parts, new Date(0));
  } catch {
    return null;
  }
}

export function isRecurring(event: { recurrenceRule?: string | null }): boolean {
  return !!event.recurrenceRule && parseRRuleParts(event.recurrenceRule) !== null;
}

export interface Occurrence {
  startAt: Date;
  endAt: Date;
  /** start occurrence asli (sama dengan startAt; dipakai mencocokkan exception). */
  originalStartAt: Date;
}

/**
 * Ekspansi occurrence event berulang dalam range [rangeStart, rangeEnd]
 * (inklusif). Dibatasi MAX_OCCURRENCES agar tidak meledak bila RRULE
 * tanpa until/count. `excludeStarts` = timestamp occurrence yang sudah
 * punya exception (edit/batal satu instance) — occurrence itu dilewati.
 */
export function expandRecurrence(
  event: { startAt: Date; endAt: Date; recurrenceRule: string | null },
  rangeStart: Date,
  rangeEnd: Date,
  excludeStarts?: Set<number>
): Occurrence[] {
  const parts = parseRRuleParts(event.recurrenceRule);
  if (!parts) return [];
  const rule = rruleFromParts(parts, event.startAt);
  const durationMs = Math.max(0, event.endAt.getTime() - event.startAt.getTime());
  const starts = rule.between(rangeStart, rangeEnd, true).slice(0, MAX_OCCURRENCES);
  const out: Occurrence[] = [];
  for (const s of starts) {
    if (excludeStarts?.has(s.getTime())) continue;
    out.push({
      startAt: s,
      endAt: new Date(s.getTime() + durationMs),
      originalStartAt: s,
    });
  }
  return out;
}

function toRRuleLine(rule: RRule): string {
  const line = rule
    .toString()
    .split('\n')
    .find((l) => l.startsWith('RRULE:'));
  return line ?? `RRULE:${rule.toString()}`;
}

/**
 * Bangun ulang RRULE untuk rangkaian baru hasil split "following".
 * - UNTIL dipertahankan (batas tanggal tetap berlaku untuk rangkaian baru).
 * - COUNT diganti dengan sisa hitungan (bila diberikan): rangkaian baru
 *   hanya mengulang sebanyak occurrence yang tersisa dari rangkaian lama.
 *   Tanpa newCount, COUNT dihapus (rangkaian baru tak berbatas hitungan).
 */
export function rebuildRRuleForFollowing(
  ruleStr: string,
  dtstart: Date,
  newCount?: number
): string {
  const parts = parseRRuleParts(ruleStr);
  if (!parts) throw new Error('RRULE tidak valid.');
  const { count: _c, ...rest } = parts;
  return toRRuleLine(
    rruleFromParts(
      { ...rest, ...(newCount !== undefined ? { count: newCount } : {}) },
      dtstart
    )
  );
}

/**
 * Potong RRULE: rangkaian berakhir pada `until` (inklusif). Dipakai
 * scope "following" saat menghapus/mengubah mulai satu instance — semua
 * occurrence sebelum instance dipertahankan, occurrence pada/after
 * instance tidak lagi dihasilkan.
 */
export function truncateRRule(ruleStr: string, dtstart: Date, until: Date): string {
  const parts = parseRRuleParts(ruleStr);
  if (!parts) throw new Error('RRULE tidak valid.');
  const { count: _c, ...rest } = parts;
  return toRRuleLine(rruleFromParts({ ...rest, until }, dtstart));
}
