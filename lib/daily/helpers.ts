// WOORK DAILY WORKSPACE — helper server bersama (tanggal, tugas, serialisasi).
// Workspace HANYA agregasi + navigasi: tidak ada penyimpanan tugas/kalender
// baru di sini. Semua data dibaca dari modul sumber (TAL, Calendar, Meeting,
// Invoice, Announcement, Notification, TalCuti).

import { prisma } from '../db';
import { getViewerDepartmentId } from '../calendar/visibility';

export const DEFAULT_TZ = 'Asia/Jakarta';

/** Timezone pengguna (dari preferensi kalender) atau fallback Asia/Jakarta. */
export async function getUserTimezone(
  organizationId: string,
  userId: string
): Promise<string> {
  try {
    const pref = await prisma.calendarUserPreference.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
      select: { timezone: true },
    });
    return pref?.timezone?.trim() || DEFAULT_TZ;
  } catch {
    return DEFAULT_TZ;
  }
}

/** Offset zona waktu (ms, timur dari UTC) pada suatu instant. */
export function getTzOffsetMs(tz: string, date: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUTC = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') % 24,
    get('minute'),
    get('second')
  );
  return asUTC - Math.floor(date.getTime() / 1000) * 1000;
}

/** Kunci tanggal YYYY-MM-DD dari sebuah instant dalam zona waktu. */
export function dateKeyInTz(date: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Jam (0–23) dari sebuah instant dalam zona waktu — untuk greeting. */
export function hourInTz(date: Date, tz: string): number {
  return Number(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, hour: '2-digit' }).format(date)
  ) % 24;
}

/** Batas [start, end) UTC untuk satu hari kalender dalam zona waktu. */
export function dayBounds(key: string, tz: string): { start: Date; end: Date } {
  const [y, m, d] = key.split('-').map(Number);
  const utcMidnight = Date.UTC(y, m - 1, d);
  const offset = getTzOffsetMs(tz, new Date(utcMidnight));
  const start = new Date(utcMidnight - offset);
  return { start, end: new Date(start.getTime() + 24 * 3600 * 1000) };
}

/** Tambah hari ke kunci tanggal YYYY-MM-DD. */
export function addDaysToKey(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

/** Selisih hari (b - a) antara dua kunci tanggal. */
export function diffDays(aKey: string, bKey: string): number {
  const [ya, ma, da] = aKey.split('-').map(Number);
  const [yb, mb, db] = bKey.split('-').map(Number);
  return Math.round(
    (Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / (24 * 3600 * 1000)
  );
}

/** Kunci tanggal dari kolom @db.Date Prisma (disimpan sebagai tanggal murni). */
export function dbDateKey(v: Date | string | null | undefined): string | null {
  if (!v) return null;
  return new Date(v).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Pemetaan TalTask (status & prioritas) — sesuai kontrak yang diberikan.
// ---------------------------------------------------------------------------

export const TASK_STATUS_MAP: Record<string, string> = {
  todo: 'To Do',
  on_progress: 'In Progress',
  pending: 'Waiting',
  done: 'Completed',
};

export const TASK_PRIORITY_MAP: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

export type TaskStatusKey = 'todo' | 'pending' | 'on_progress' | 'done';

export function isTaskBlocked(row: { blockerCategory?: string | null; blockerDescription?: string | null }): boolean {
  return !!(row.blockerCategory || row.blockerDescription);
}

/** "Urgent" = prioritas high + (jatuh tempo hari ini atau sudah lewat). */
export function taskPriorityLabel(row: {
  priority?: string | null;
  taskDate?: Date | string | null;
  status?: string | null;
}, todayKey: string): string {
  const p = (row.priority ?? 'medium') as string;
  if (p === 'high' && row.status !== 'done') {
    const k = dbDateKey(row.taskDate as Date);
    if (k && k <= todayKey) return 'Urgent';
  }
  return TASK_PRIORITY_MAP[p] ?? 'Medium';
}

export function taskSeverity(row: {
  taskDate?: Date | string | null;
  status?: string | null;
}, todayKey: string): 'normal' | 'approaching' | 'critical' | 'overdue' {
  const k = dbDateKey(row.taskDate as Date);
  if (!k) return 'normal';
  if (row.status === 'done') return 'normal';
  const left = diffDays(todayKey, k);
  if (left < 0) return 'overdue';
  if (left <= 1) return 'critical';
  if (left <= 3) return 'approaching';
  return 'normal';
}

export interface SerializedTask {
  id: string;
  title: string;
  description: string | null;
  type: string;
  category: string;
  priority: string;
  priorityLabel: string;
  status: string;
  statusLabel: string;
  taskDate: string | null;
  taskTime: string | null;
  parentTitle: string | null;
  projectLabel: string;
  isBlocked: boolean;
  blockerCategory: string | null;
  blockerDescription: string | null;
  isOverdue: boolean;
  daysLeft: number | null;
  severity: 'normal' | 'approaching' | 'critical' | 'overdue';
  userId: string;
  userName: string | null;
  sourceUrl: string;
}

export function serializeTask(row: any, todayKey: string): SerializedTask {
  const taskDate = dbDateKey(row.taskDate);
  const isOverdue = !!taskDate && taskDate < todayKey && row.status !== 'done';
  const daysLeft = taskDate ? diffDays(todayKey, taskDate) : null;
  return {
    id: row.id as string,
    title: row.title as string,
    description: row.description ?? null,
    type: row.type as string,
    category: row.category as string,
    priority: (row.priority as string) ?? 'medium',
    priorityLabel: taskPriorityLabel(row, todayKey),
    status: row.status as string,
    statusLabel: TASK_STATUS_MAP[row.status as string] ?? row.status,
    taskDate,
    taskTime: row.taskTime ?? null,
    parentTitle: row.parentTitle ?? null,
    // TIDAK ada model Project — tampilkan judul tugas induk atau "—".
    projectLabel: row.parentTitle ?? '—',
    isBlocked: isTaskBlocked(row),
    blockerCategory: row.blockerCategory ?? null,
    blockerDescription: row.blockerDescription ?? null,
    isOverdue,
    daysLeft,
    severity: taskSeverity(row, todayKey),
    userId: row.userId as string,
    userName: row.userName ?? null,
    sourceUrl: '/tal/tasks',
  };
}

/** departmentId viewer (dari Membership) — dipakai tim & visibilitas. */
export async function getMyDepartmentId(
  organizationId: string,
  userId: string
): Promise<string | null> {
  return getViewerDepartmentId(userId, organizationId);
}
