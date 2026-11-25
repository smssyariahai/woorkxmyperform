// WOORK ATTENDANCE — helper jadwal: resolusi jadwal/shift, hari kerja, libur, cuti.
// Cuti/izin dibaca dari TalCuti, hari libur dari TalHoliday — TIDAK diduplikasi.

import { prisma } from '../db';
import { addDaysToKey, dateKeyInTz, dbDateKey } from '../daily/helpers';
import { getViewerDepartmentId } from '../calendar/visibility';
import { DEFAULT_TZ, shiftWindowForDate, type ShiftLike, type ShiftWindow } from './calc';

export interface NormalizedSchedule {
  id: string;
  name: string;
  userId: string | null;
  departmentId: string | null;
  daysOfWeek: Record<string, string | null>;
  isDefault: boolean;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
}

export interface ResolvedSchedule {
  schedule: NormalizedSchedule;
  /** 'personal' | 'department' | 'default' */
  source: 'personal' | 'department' | 'default';
}

export interface ResolvedShift {
  schedule: NormalizedSchedule | null;
  scheduleSource: ResolvedSchedule['source'] | null;
  shift: (ShiftLike & { id: string; name: string; color: string | null }) | null;
  shiftId: string | null;
  /** Jendela shift pada tanggal kerja (null bila tidak ada shift hari itu). */
  window: ShiftWindow | null;
  /** Tanggal kerja yang dipakai jendela (bisa kemarin untuk shift malam). */
  workDateKey: string;
}

function parseDaysOfWeek(raw: unknown): Record<string, string | null> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    out[k] = typeof v === 'string' && v ? v : null;
  }
  return out;
}

function inEffectiveRange(dateKey: string, from: Date | null, to: Date | null): boolean {
  if (from && dateKey < dbDateKey(from)!) return false;
  if (to && dateKey > dbDateKey(to)!) return false;
  return true;
}

/** Semua jadwal aktif organisasi, sekali jalan (dipakai ulang per hari/user). */
export async function loadActiveSchedules(organizationId: string): Promise<NormalizedSchedule[]> {
  const rows = await prisma.workSchedule.findMany({
    where: { organizationId, isActive: true },
    select: { id: true, name: true, userId: true, departmentId: true, daysOfWeek: true, isDefault: true, effectiveFrom: true, effectiveTo: true },
  });
  return rows.map((s) => ({
    id: s.id,
    name: s.name,
    userId: s.userId,
    departmentId: s.departmentId,
    daysOfWeek: parseDaysOfWeek(s.daysOfWeek),
    isDefault: s.isDefault,
    effectiveFrom: s.effectiveFrom,
    effectiveTo: s.effectiveTo,
  }));
}

/**
 * Pilih jadwal dari daftar yang sudah dimuat. Urutan:
 * jadwal personal (userId) → jadwal departemen → template default org.
 * Jadwal di luar effectiveFrom/effectiveTo dilewati.
 */
export function pickSchedule(
  schedules: NormalizedSchedule[],
  userId: string,
  departmentId: string | null,
  dateKey: string
): ResolvedSchedule | null {
  const usable = schedules.filter((s) => inEffectiveRange(dateKey, s.effectiveFrom, s.effectiveTo));
  const personal = usable.find((s) => s.userId === userId);
  if (personal) return { schedule: personal, source: 'personal' };
  if (departmentId) {
    const dept = usable.find((s) => s.departmentId === departmentId && !s.userId);
    if (dept) return { schedule: dept, source: 'department' };
  }
  const def = usable.find((s) => s.isDefault && !s.userId && !s.departmentId);
  if (def) return { schedule: def, source: 'default' };
  return null;
}

/** Resolusi jadwal untuk satu tanggal (memuat jadwal + departemen sendiri). */
export async function resolveSchedule(
  organizationId: string,
  userId: string,
  dateKey: string
): Promise<ResolvedSchedule | null> {
  const schedules = await loadActiveSchedules(organizationId);
  const departmentId = await getViewerDepartmentId(userId, organizationId);
  return pickSchedule(schedules, userId, departmentId, dateKey);
}

/** ShiftId yang berlaku pada satu hari menurut jadwal (null = libur). */
export function getShiftIdForDay(schedule: NormalizedSchedule, dateKey: string): string | null {
  const dow = new Date(`${dateKey}T00:00:00Z`).getUTCDay(); // 0 = Minggu
  return schedule.daysOfWeek[String(dow)] ?? null;
}

async function loadShift(
  organizationId: string,
  shiftId: string
): Promise<(ShiftLike & { id: string; name: string; color: string | null }) | null> {
  const s = await prisma.shift.findFirst({
    where: { id: shiftId, organizationId, isActive: true },
    select: { id: true, name: true, startTime: true, endTime: true, isNightShift: true, breakMinutes: true, graceLateMinutes: true, color: true },
  });
  return s ?? null;
}

/**
 * Resolusi shift untuk satu tanggal kerja.
 * Mengembalikan shift + jendela pada tanggal itu (null bila libur / tanpa jadwal).
 */
export async function resolveShiftForDate(
  organizationId: string,
  userId: string,
  dateKey: string,
  tz: string = DEFAULT_TZ
): Promise<ResolvedShift> {
  const resolved = await resolveSchedule(organizationId, userId, dateKey);
  if (!resolved) {
    return { schedule: null, scheduleSource: null, shift: null, shiftId: null, window: null, workDateKey: dateKey };
  }
  const shiftId = getShiftIdForDay(resolved.schedule, dateKey);
  if (!shiftId) {
    return { schedule: resolved.schedule, scheduleSource: resolved.source, shift: null, shiftId: null, window: null, workDateKey: dateKey };
  }
  const shift = await loadShift(organizationId, shiftId);
  if (!shift) {
    return { schedule: resolved.schedule, scheduleSource: resolved.source, shift: null, shiftId, window: null, workDateKey: dateKey };
  }
  return {
    schedule: resolved.schedule,
    scheduleSource: resolved.source,
    shift,
    shiftId,
    window: shiftWindowForDate(dateKey, shift, tz),
    workDateKey: dateKey,
  };
}

/**
 * Resolusi shift untuk momen check-in. Menangani shift malam yang mulai
 * kemarin: bila sekarang masih di dalam jendela shift malam kemarin, maka
 * tanggal kerjanya adalah kemarin (bukan hari ini).
 */
export async function resolveShiftForCheckIn(
  organizationId: string,
  userId: string,
  now: Date,
  tz: string = DEFAULT_TZ
): Promise<ResolvedShift> {
  const todayKey = dateKeyInTz(now, tz);
  const yesterdayKey = addDaysToKey(todayKey, -1);
  const y = await resolveShiftForDate(organizationId, userId, yesterdayKey, tz);
  if (y.shift && y.window && y.window.isNight && now >= y.window.startAt && now < y.window.endAt) {
    return y; // masih dalam shift malam kemarin
  }
  return resolveShiftForDate(organizationId, userId, todayKey, tz);
}

/** Apakah tanggal itu hari libur (TalHoliday) di organisasi ini. */
export async function isHoliday(
  organizationId: string,
  dateKey: string
): Promise<{ isHoliday: boolean; name: string | null }> {
  const row = await prisma.talHoliday.findFirst({
    where: { organizationId, holidayDate: new Date(`${dateKey}T00:00:00Z`) },
    select: { name: true },
  });
  return { isHoliday: !!row, name: row?.name ?? null };
}

/** Apakah pengguna sedang cuti pada tanggal itu (TalCuti). Alasan TIDAK dibaca. */
export async function isOnLeave(
  organizationId: string,
  userId: string,
  dateKey: string
): Promise<boolean> {
  const row = await prisma.talCuti.findFirst({
    where: { organizationId, userId, cutiDate: new Date(`${dateKey}T00:00:00Z`) },
    select: { id: true },
  });
  return !!row;
}

/** Hari-hari cuti pengguna dalam rentang (tanpa alasan). */
export async function leaveDatesInRange(
  organizationId: string,
  userId: string,
  fromKey: string,
  toKey: string
): Promise<Set<string>> {
  const rows = await prisma.talCuti.findMany({
    where: {
      organizationId,
      userId,
      cutiDate: { gte: new Date(`${fromKey}T00:00:00Z`), lte: new Date(`${toKey}T00:00:00Z`) },
    },
    select: { cutiDate: true },
  });
  return new Set(rows.map((r) => dbDateKey(r.cutiDate)!));
}

/** Hari-hari libur organisasi dalam rentang. */
export async function holidayDatesInRange(
  organizationId: string,
  fromKey: string,
  toKey: string
): Promise<Map<string, string | null>> {
  const rows = await prisma.talHoliday.findMany({
    where: {
      organizationId,
      holidayDate: { gte: new Date(`${fromKey}T00:00:00Z`), lte: new Date(`${toKey}T00:00:00Z`) },
    },
    select: { holidayDate: true, name: true },
  });
  return new Map(rows.map((r) => [dbDateKey(r.holidayDate)!, r.name ?? null]));
}

export interface WorkdayInfo {
  dateKey: string;
  isWorkDay: boolean;
  shiftId: string | null;
  isHoliday: boolean;
  isOnLeave: boolean;
}

/**
 * Peta hari kerja satu pengguna dalam rentang. Jadwal + departemen dimuat
 * sekali, lalu tiap hari hanya dihitung dari peta (murah untuk 7–30 hari).
 */
export async function getWorkdaysInRange(
  organizationId: string,
  userId: string,
  fromKey: string,
  toKey: string
): Promise<WorkdayInfo[]> {
  const setting = await prisma.attendanceSetting.findUnique({ where: { organizationId } });
  const workDays: number[] = Array.isArray(setting?.workDays)
    ? (setting!.workDays as number[])
    : [1, 2, 3, 4, 5];
  const holidays = await holidayDatesInRange(organizationId, fromKey, toKey);
  const leaves = await leaveDatesInRange(organizationId, userId, fromKey, toKey);
  const schedules = await loadActiveSchedules(organizationId);
  const departmentId = await getViewerDepartmentId(userId, organizationId);

  const out: WorkdayInfo[] = [];
  let cur = fromKey;
  while (cur <= toKey) {
    const holiday = holidays.has(cur);
    const onLeave = leaves.has(cur);
    let isWorkDay = false;
    let shiftId: string | null = null;
    if (!holiday && !onLeave) {
      const resolved = pickSchedule(schedules, userId, departmentId, cur);
      if (resolved) {
        shiftId = getShiftIdForDay(resolved.schedule, cur);
        isWorkDay = !!shiftId;
      } else {
        const dow = new Date(`${cur}T00:00:00Z`).getUTCDay();
        isWorkDay = workDays.includes(dow);
      }
    }
    out.push({ dateKey: cur, isWorkDay, shiftId, isHoliday: holiday, isOnLeave: onLeave });
    cur = addDaysToKey(cur, 1);
  }
  return out;
}
