// WOORK ATTENDANCE — mesin perhitungan (terlambat / pulang awal / jam kerja / lembur).
// Murni (tanpa akses DB) agar mudah dites dan dipakai ulang bot WhatsApp nanti.
// Jam shift disimpan "HH:MM"; tanggal kerja kunci YYYY-MM-DD (Asia/Jakarta).

import { dayBounds } from '../daily/helpers';

export const DEFAULT_TZ = 'Asia/Jakarta';

/** Validasi + parse "HH:MM" (24 jam). null bila tidak valid. */
export function parseHHMM(v: string | null | undefined): { h: number; m: number } | null {
  if (typeof v !== 'string') return null;
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(v.trim());
  if (!m) return null;
  return { h: Number(m[1]), m: Number(m[2]) };
}

export function hhmmToMinutes(v: string): number | null {
  const p = parseHHMM(v);
  if (!p) return null;
  return p.h * 60 + p.m;
}

export function minutesToHHMM(min: number): string {
  const total = ((Math.round(min) % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** Instant UTC untuk kunci tanggal + jam "HH:MM" dalam zona waktu. */
export function dateTimeInTz(dateKey: string, hhmm: string, tz: string = DEFAULT_TZ): Date {
  const mins = hhmmToMinutes(hhmm) ?? 0;
  const { start } = dayBounds(dateKey, tz);
  return new Date(start.getTime() + mins * 60 * 1000);
}

export interface ShiftLike {
  startTime: string;
  endTime: string;
  isNightShift: boolean;
  breakMinutes: number;
  graceLateMinutes: number;
}

export interface ShiftWindow {
  startAt: Date;
  endAt: Date;
  isNight: boolean;
  /** Menit jadwal (end - start - break). */
  scheduledMinutes: number;
}

/**
 * Jendela kerja shift pada tanggal kerja tertentu.
 * Shift malam (endTime < startTime): endAt jatuh keesokan harinya.
 */
export function shiftWindowForDate(
  dateKey: string,
  shift: ShiftLike,
  tz: string = DEFAULT_TZ
): ShiftWindow {
  const startAt = dateTimeInTz(dateKey, shift.startTime, tz);
  let endAt = dateTimeInTz(dateKey, shift.endTime, tz);
  const isNight = shift.isNightShift || endAt.getTime() <= startAt.getTime();
  if (endAt.getTime() <= startAt.getTime()) {
    endAt = new Date(endAt.getTime() + 24 * 60 * 60 * 1000);
  }
  const scheduledMinutes = Math.max(
    0,
    Math.round((endAt.getTime() - startAt.getTime()) / 60000) - (shift.breakMinutes ?? 0)
  );
  return { startAt, endAt, isNight, scheduledMinutes };
}

export type AttendanceStatus = 'PRESENT' | 'LATE' | 'EARLY_LEAVE' | 'INCOMPLETE';

export interface CalcResult {
  lateMinutes: number;
  earlyMinutes: number;
  workMinutes: number;
  overtimeMinutes: number;
  scheduledMinutes: number;
  status: AttendanceStatus;
}

function diffMin(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 60000);
}

/**
 * Hitung keterlambatan, pulang awal, jam kerja, lembur, dan status dari
 * jendela shift yang sudah dihitung pemanggil (service) — pemanggil yang
 * menentukan tanggal kerja yang benar, termasuk shift malam yang mulai
 * sehari sebelum check-in.
 * - late = max(0, checkIn − shiftStart − grace)
 * - early = max(0, shiftEnd − checkOut) bila pulang sebelum shift berakhir
 * - work = (checkOut − checkIn) − break
 * - overtime = max(kelebihan jam kerja dari jadwal, lembur yang disetujui)
 * - status: LATE bila terlambat; EARLY_LEAVE bila pulang awal (dan tidak
 *   terlambat); PRESENT bila tepat waktu; INCOMPLETE bila belum check out.
 */
export function calculateWithWindow(input: {
  checkInAt: Date | null;
  checkOutAt: Date | null;
  /** Jendela shift; null = tidak ada jadwal (kerja lepas / hari libur). */
  window: ShiftWindow | null;
  graceLateMinutes: number;
  breakMinutes: number;
  /** Menit lembur yang disetujui (overlap jam kerja aktual dengan jendela lembur). */
  approvedOvertimeMinutes?: number;
}): CalcResult {
  const { checkInAt, checkOutAt, window, graceLateMinutes, breakMinutes } = input;
  if (!checkInAt) {
    return { lateMinutes: 0, earlyMinutes: 0, workMinutes: 0, overtimeMinutes: 0, scheduledMinutes: 0, status: 'INCOMPLETE' };
  }
  const scheduledMinutes = window ? window.scheduledMinutes : 0;
  const lateMinutes = window ? Math.max(0, diffMin(checkInAt, window.startAt) - graceLateMinutes) : 0;
  const earlyMinutes = window && checkOutAt ? Math.max(0, diffMin(window.endAt, checkOutAt)) : 0;
  const workMinutes = checkOutAt
    ? Math.max(0, diffMin(checkOutAt, checkInAt) - (window ? breakMinutes : 0))
    : 0;
  const computedOvertime = window ? Math.max(0, workMinutes - scheduledMinutes) : 0;
  const overtimeMinutes = Math.max(computedOvertime, input.approvedOvertimeMinutes ?? 0);
  let status: AttendanceStatus = 'INCOMPLETE';
  if (checkOutAt) {
    if (lateMinutes > 0) status = 'LATE';
    else if (earlyMinutes > 0) status = 'EARLY_LEAVE';
    else status = 'PRESENT';
  }
  return { lateMinutes, earlyMinutes, workMinutes, overtimeMinutes, scheduledMinutes, status };
}

/**
 * Jalan pintas: hitung dari shift + tanggal kerja (bukan shift malam
 * lintas hari — untuk itu pakai calculateWithWindow dengan jendela yang
 * sudah dihitung dari tanggal shift mulai).
 */
export function calculateAttendance(input: {
  checkInAt: Date | null;
  checkOutAt: Date | null;
  workDateKey: string;
  shift: ShiftLike | null;
  graceLateMinutes: number;
  approvedOvertimeMinutes?: number;
  tz?: string;
}): CalcResult {
  const tz = input.tz ?? DEFAULT_TZ;
  const window = input.shift ? shiftWindowForDate(input.workDateKey, input.shift, tz) : null;
  return calculateWithWindow({
    checkInAt: input.checkInAt,
    checkOutAt: input.checkOutAt,
    window,
    graceLateMinutes: input.shift ? input.shift.graceLateMinutes : input.graceLateMinutes,
    breakMinutes: input.shift ? input.shift.breakMinutes : 0,
    approvedOvertimeMinutes: input.approvedOvertimeMinutes,
  });
}
