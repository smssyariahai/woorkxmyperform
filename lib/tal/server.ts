// lib/tal/server.ts — helper SERVER untuk API route TAL (sub-tahap a).
// Porting logika talService.ts backup (skor, rollover, deadline, template)
// ke Prisma + NextAuth. Semua query di route WAJIB memfilter organizationId
// dari sesi; user biasa dipaksa userId = dirinya sendiri (brief §5.1).

import type { AuthContext } from '@/lib/auth-helpers';
import { prisma } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import {
  calculatePlanDeadline,
  calculateReportDeadline,
  calculateTalReportScore,
  checkIsHoliday,
  checkIsTalMonthLocked,
  determinePlanScore,
  determineReportScore,
  formatDateKey,
  getSundayFromWeekNumber,
  getWeekDetails,
  getWeekNumberAndYear,
  isCutiDay,
  parseDateKey,
  parseScopeKey,
  scopeKeyFor,
} from './date';
import { dispatchTalNotification } from './notify';
import type {
  TalDeadlineSettings,
  TalHolidayItem,
  TalRoutineTemplate,
  TalScopeLockReport,
  TalStatus,
  TalTaskItem,
  TalTaskType,
} from './types';

export { dispatchTalNotification };

// ---------------------------------------------------------------------------
// RBAC dasar (§5.2/§5.3): admin TAL = super admin, OWNER, atau ADMIN.
// Jangan gating dengan role kustom ('Manager', 'HR', ...) — lihat brief §5.4.
// ---------------------------------------------------------------------------
export function isTalAdmin(ctx: AuthContext): boolean {
  return ctx.isSuperAdmin === true || ctx.role === 'OWNER' || ctx.role === 'ADMIN';
}

// ---------------------------------------------------------------------------
// Scope key kanonik WOORK — definisi di lib/tal/date.ts (pure, dipakai
// client + server). Di sini diekspor ulang untuk route API.
// ---------------------------------------------------------------------------
export { scopeKeyFor, parseScopeKey } from './date';

// ---------------------------------------------------------------------------
// Deadline settings (TalDeadlineSetting.settings Json). Default = fallback
// backup (talService.ts: getLocalDeadlineSettings / server.ts).
// ---------------------------------------------------------------------------
export const DEFAULT_DEADLINE_SETTINGS: TalDeadlineSettings = {
  planLockWeeklyDays: 2,
  planLockWeeklyTime: '23:59',
  planLockMonthlyDays: 3,
  planLockMonthlyTime: '23:59',
  reportDailyDays: 1,
  reportDailyTime: '23:59',
  reportWeeklyDays: 2,
  reportWeeklyTime: '23:59',
  reportMonthlyDays: 3,
  reportMonthlyTime: '23:59',
  systemLockMonthlyDays: 5,
  systemLockMonthlyTime: '16:00',
  systemLockEnabled: true,
};

export function normalizeDeadlineSettings(raw: unknown): TalDeadlineSettings {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const d = DEFAULT_DEADLINE_SETTINGS;
  const num = (k: string, fb: number) =>
    typeof r[k] === 'number' && Number.isFinite(r[k]) ? (r[k] as number) : fb;
  const str = (k: string, fb: string) =>
    typeof r[k] === 'string' && /^\d{2}:\d{2}$/.test(r[k] as string) ? (r[k] as string) : fb;
  return {
    planLockWeeklyDays: num('planLockWeeklyDays', d.planLockWeeklyDays),
    planLockWeeklyTime: str('planLockWeeklyTime', d.planLockWeeklyTime!),
    planLockMonthlyDays: num('planLockMonthlyDays', d.planLockMonthlyDays),
    planLockMonthlyTime: str('planLockMonthlyTime', d.planLockMonthlyTime!),
    reportDailyDays: num('reportDailyDays', d.reportDailyDays),
    reportDailyTime: str('reportDailyTime', d.reportDailyTime!),
    reportWeeklyDays: num('reportWeeklyDays', d.reportWeeklyDays),
    reportWeeklyTime: str('reportWeeklyTime', d.reportWeeklyTime!),
    reportMonthlyDays: num('reportMonthlyDays', d.reportMonthlyDays),
    reportMonthlyTime: str('reportMonthlyTime', d.reportMonthlyTime!),
    systemLockMonthlyDays: num('systemLockMonthlyDays', d.systemLockMonthlyDays!),
    systemLockMonthlyTime: str('systemLockMonthlyTime', d.systemLockMonthlyTime!),
    systemLockEnabled: typeof r.systemLockEnabled === 'boolean' ? r.systemLockEnabled : true,
    updatedBy: typeof r.updatedBy === 'string' ? r.updatedBy : undefined,
  };
}

export async function getDeadlineSettings(organizationId: string): Promise<TalDeadlineSettings> {
  const row = await prisma.talDeadlineSetting.findUnique({
    where: { organizationId },
    select: { settings: true },
  });
  return normalizeDeadlineSettings(row?.settings ?? {});
}

export async function getHolidaysForOrg(organizationId: string): Promise<TalHolidayItem[]> {
  const rows = await prisma.talHoliday.findMany({
    where: { organizationId },
    orderBy: { holidayDate: 'asc' },
  });
  return rows.map((h: any) => {
    const p = (h.payload ?? {}) as Record<string, unknown>;
    return {
      id: h.id as string,
      date: formatDateKey(new Date(h.holidayDate as Date)),
      title: (h.name as string) ?? '',
      description: typeof p.description === 'string' ? p.description : undefined,
      category: (p.category as TalHolidayItem['category']) ?? 'nasional',
      isRecurringYearly: p.isRecurringYearly === true,
      createdBy: typeof p.createdBy === 'string' ? p.createdBy : undefined,
    };
  });
}

export async function getCutiDatesForUser(
  organizationId: string,
  userId: string
): Promise<Array<{ date: string; reason?: string }>> {
  const rows = await prisma.talCuti.findMany({
    where: { organizationId, userId },
    select: { cutiDate: true, reason: true },
  });
  return rows.map((c: any) => ({
    date: formatDateKey(new Date(c.cutiDate as Date)),
    reason: (c.reason as string) ?? undefined,
  }));
}

// ---------------------------------------------------------------------------
// Pemetaan baris Prisma TalTask → TalTaskItem backup (date/time/order).
// ---------------------------------------------------------------------------
export function mapTalTask(row: any): TalTaskItem {
  const taskDate = row.taskDate ? formatDateKey(new Date(row.taskDate)) : undefined;
  const weekInfo =
    row.weekNumber && row.weekYear
      ? { weekNumber: row.weekNumber as number, weekYear: row.weekYear as number }
      : taskDate
        ? getWeekNumberAndYear(parseDateKey(taskDate))
        : { weekNumber: 0, weekYear: row.year ?? new Date().getFullYear() };
  return {
    id: row.id as string,
    type: row.type as TalTaskType,
    isAdditional: !!row.isAdditional,
    originalTaskId: row.originalTaskId ?? undefined,
    date: taskDate,
    time: row.taskTime ?? undefined,
    weekNumber: weekInfo.weekNumber,
    weekYear: weekInfo.weekYear,
    month: (row.month as number) ?? (taskDate ? parseDateKey(taskDate).getMonth() + 1 : 1),
    year: (row.year as number) ?? (taskDate ? parseDateKey(taskDate).getFullYear() : new Date().getFullYear()),
    title: row.title as string,
    description: row.description ?? undefined,
    parentId: row.parentId ?? undefined,
    parentTitle: row.parentTitle ?? undefined,
    category: (row.category as TalTaskItem['category']) ?? 'non_result',
    targetValue: row.targetValue ?? undefined,
    targetUnit: row.targetUnit ?? undefined,
    targetCustomUnit: row.targetCustomUnit ?? undefined,
    priority: (row.priority as TalTaskItem['priority']) ?? 'medium',
    assignedTo: Array.isArray(row.assignedTo) ? row.assignedTo : [],
    assignedUserEmails: Array.isArray(row.assignedUserEmails) ? row.assignedUserEmails : [],
    assignedUsers: Array.isArray(row.assignedUsers) ? row.assignedUsers : [],
    status: (row.status as TalStatus) ?? 'todo',
    notes: row.notes ?? undefined,
    attachments: Array.isArray(row.attachments) ? row.attachments : [],
    actualValue: row.actualValue ?? undefined,
    blockerCategory: row.blockerCategory ?? undefined,
    blockerDescription: row.blockerDescription ?? undefined,
    blockerReportedAt: row.blockerReportedAt
      ? new Date(row.blockerReportedAt).toISOString()
      : undefined,
    isRolledOver: !!row.isRolledOver,
    rolloverAction: row.rolloverAction ?? undefined,
    rolloverTargetDate: row.rolloverTargetDate
      ? formatDateKey(new Date(row.rolloverTargetDate))
      : undefined,
    rolloverTargetWeek: row.rolloverTargetWeek ?? undefined,
    rolloverTargetYear: row.rolloverTargetYear ?? undefined,
    rolloverTargetMonth: row.rolloverTargetMonth ?? undefined,
    cancelNotes: row.cancelNotes ?? undefined,
    enableReminder: !!row.enableReminder,
    reminderType: row.reminderType ?? undefined,
    reminderMinutesBefore: row.reminderMinutesBefore ?? undefined,
    reminderTime: row.reminderTime ?? undefined,
    reminderLastTriggeredAt: row.reminderLastTriggeredAt
      ? new Date(row.reminderLastTriggeredAt).toISOString()
      : undefined,
    order: row.orderNo ?? undefined,
    userId: row.userId as string,
    userEmail: row.userEmail ?? undefined,
    userName: row.userName ?? undefined,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

export function mapLockReport(row: any): TalScopeLockReport {
  const p = (row.payload ?? {}) as Record<string, any>;
  const params = parseScopeKey(row.scope as TalTaskType, row.scopeKey as string);
  return {
    id: row.id as string,
    scope: row.scope as TalTaskType,
    scopeKey: row.scopeKey as string,
    userId: row.userId as string,
    userEmail: p.userEmail,
    userName: p.userName,
    type: row.scope as TalTaskType,
    date: params.dateStr,
    weekNumber: params.weekNumber,
    weekYear: params.weekYear,
    month: params.month,
    year: params.year,
    infoTglTask: p.infoTglTask,
    isPlanLocked: !!row.isPlanLocked,
    planLockedAt: row.planLockedAt ? new Date(row.planLockedAt).toISOString() : undefined,
    lockedBy: p.lockedBy,
    lockNotes: p.lockNotes,
    taskCount: p.taskCount,
    planScore: p.planScore,
    planDeadlineAt: p.planDeadlineAt,
    progressScore: p.progressScore,
    isReported: !!row.isReported,
    reportedAt: row.reportedAt ? new Date(row.reportedAt).toISOString() : undefined,
    reportedBy: p.reportedBy,
    reportNotes: p.reportNotes,
    reportScore: p.reportScore,
    reportDeadlineAt: p.reportDeadlineAt,
    totalTaskCount: p.totalTaskCount,
    mainTaskCount: p.mainTaskCount,
    additionalTaskCount: p.additionalTaskCount,
    doneTaskCount: p.doneTaskCount,
    pendingTaskCount: p.pendingTaskCount,
    scorePercent: p.scorePercent,
    mainDoneCount: p.mainDoneCount,
    mainPendingCount: p.mainPendingCount,
    additionalDoneCount: p.additionalDoneCount,
    additionalPendingCount: p.additionalPendingCount,
    reportSummary: p.reportSummary,
    isCuti: p.isCuti,
    cutiReason: p.cutiReason,
  };
}

// ---------------------------------------------------------------------------
// Validasi input task (pola parseAnnouncementInput Gelombang 3).
// Mengembalikan { data } (siap Prisma) atau { error }.
// ---------------------------------------------------------------------------
const TASK_TYPES = ['daily', 'weekly', 'monthly'];
const TASK_STATUSES: TalStatus[] = ['todo', 'pending', 'on_progress', 'done'];
const TASK_PRIORITIES = ['low', 'medium', 'high'];
const TASK_CATEGORIES = ['result', 'non_result'];
const TARGET_UNITS = ['Rupiah', 'NOA', 'Unit', 'Custom'];

function toDateOrNull(v: unknown): Date | null {
  if (typeof v !== 'string') return null;
  const m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return null;
  // UTC tengah malam — kolom @db.Date Prisma; pola yang sama dipakai
  // route cuti/holidays sub-tahap (b). parseDateKey (lokal) hanya untuk
  // hitung minggu/tanggal di date.ts, bukan untuk tulis ke DB.
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return isNaN(d.getTime()) ? null : d;
}

/** Tanggal UTC tengah malam dari 'YYYY-MM-DD' (untuk kolom @db.Date). */
export function utcDateFromKey(dateStr: string): Date {
  const m = dateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return new Date(dateStr);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

function strArr(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string');
}

export function parseTaskInput(
  body: any,
  opts: { isCreate: boolean }
): { data?: Record<string, any>; error?: string } {
  const b = body ?? {};
  if (opts.isCreate) {
    if (!b.title || typeof b.title !== 'string' || !b.title.trim())
      return { error: 'Judul tugas wajib diisi.' };
    if (!TASK_TYPES.includes(b.type)) return { error: 'type harus daily, weekly, atau monthly.' };
  } else {
    if (b.type !== undefined && !TASK_TYPES.includes(b.type))
      return { error: 'type harus daily, weekly, atau monthly.' };
    if (b.title !== undefined && (typeof b.title !== 'string' || !b.title.trim()))
      return { error: 'Judul tugas tidak boleh kosong.' };
  }
  if (b.status !== undefined && !TASK_STATUSES.includes(b.status))
    return { error: 'status tidak dikenal.' };
  if (b.priority !== undefined && !TASK_PRIORITIES.includes(b.priority))
    return { error: 'priority harus low, medium, atau high.' };
  if (b.category !== undefined && !TASK_CATEGORIES.includes(b.category))
    return { error: 'category harus result atau non_result.' };
  if (b.targetUnit !== undefined && !TARGET_UNITS.includes(b.targetUnit))
    return { error: 'targetUnit harus Rupiah, NOA, Unit, atau Custom.' };
  if (b.status === 'pending' && !b.blockerCategory && opts.isCreate)
    return { error: 'Kategori blocker wajib diisi bila status pending.' };
  if (
    b.status === 'pending' &&
    b.blockerCategory !== undefined &&
    typeof b.blockerCategory === 'string' &&
    !b.blockerCategory.trim()
  )
    return { error: 'Kategori blocker wajib diisi bila status pending.' };

  const data: Record<string, any> = {};
  const set = (k: string, v: unknown) => {
    if (v !== undefined) data[k] = v;
  };
  set('type', b.type);
  set('title', typeof b.title === 'string' ? b.title.trim() : undefined);
  set('description', typeof b.description === 'string' ? b.description : undefined);
  set('isAdditional', typeof b.isAdditional === 'boolean' ? b.isAdditional : undefined);
  if (b.date !== undefined || b.taskDate !== undefined) {
    const d = toDateOrNull(b.date ?? b.taskDate);
    if ((b.date ?? b.taskDate) && !d) return { error: 'Format tanggal harus YYYY-MM-DD.' };
    data.taskDate = d;
  }
  set('taskTime', typeof b.time === 'string' ? b.time : typeof b.taskTime === 'string' ? b.taskTime : undefined);
  set('weekNumber', typeof b.weekNumber === 'number' ? b.weekNumber : undefined);
  set('weekYear', typeof b.weekYear === 'number' ? b.weekYear : undefined);
  set('month', typeof b.month === 'number' ? b.month : undefined);
  set('year', typeof b.year === 'number' ? b.year : undefined);
  set('parentId', typeof b.parentId === 'string' && b.parentId ? b.parentId : undefined);
  set('parentTitle', typeof b.parentTitle === 'string' ? b.parentTitle : undefined);
  set('category', b.category);
  set('targetValue', typeof b.targetValue === 'number' ? b.targetValue : undefined);
  set('targetUnit', b.targetUnit);
  set('targetCustomUnit', typeof b.targetCustomUnit === 'string' ? b.targetCustomUnit : undefined);
  set('priority', b.priority);
  if (b.assignedTo !== undefined) data.assignedTo = strArr(b.assignedTo);
  if (b.assignedUserEmails !== undefined) data.assignedUserEmails = strArr(b.assignedUserEmails);
  if (b.assignedUsers !== undefined)
    data.assignedUsers = Array.isArray(b.assignedUsers) ? b.assignedUsers : [];
  set('status', b.status);
  set('notes', typeof b.notes === 'string' ? b.notes : undefined);
  if (b.attachments !== undefined)
    data.attachments = Array.isArray(b.attachments) ? b.attachments : [];
  set('actualValue', typeof b.actualValue === 'number' ? b.actualValue : undefined);
  set('blockerCategory', typeof b.blockerCategory === 'string' ? b.blockerCategory : undefined);
  set('blockerDescription', typeof b.blockerDescription === 'string' ? b.blockerDescription : undefined);
  if (b.status === 'pending' && b.blockerCategory) data.blockerReportedAt = new Date();
  if (b.status !== undefined && b.status !== 'pending') {
    data.blockerCategory = null;
    data.blockerDescription = null;
    data.blockerReportedAt = null;
  }
  set('enableReminder', typeof b.enableReminder === 'boolean' ? b.enableReminder : undefined);
  set('reminderType', typeof b.reminderType === 'string' ? b.reminderType : undefined);
  set(
    'reminderMinutesBefore',
    typeof b.reminderMinutesBefore === 'number' ? b.reminderMinutesBefore : undefined
  );
  set('reminderTime', typeof b.reminderTime === 'string' ? b.reminderTime : undefined);
  set('orderNo', typeof b.orderNo === 'number' ? b.orderNo : typeof b.order === 'number' ? b.order : undefined);
  if (b.rolloverTargetDate !== undefined) {
    data.rolloverTargetDate = toDateOrNull(b.rolloverTargetDate);
  }

  // Turunkan koordinat periode dari tanggal bila belum diisi (pola backup:
  // daily selalu membawa weekNumber/weekYear/month/year).
  if (data.type === 'daily' && data.taskDate instanceof Date) {
    const wi = getWeekNumberAndYear(data.taskDate);
    if (data.weekNumber === undefined) data.weekNumber = wi.weekNumber;
    if (data.weekYear === undefined) data.weekYear = wi.weekYear;
    if (data.month === undefined) data.month = data.taskDate.getMonth() + 1;
    if (data.year === undefined) data.year = data.taskDate.getFullYear();
  }
  if (data.type === 'weekly' && data.weekNumber && data.weekYear) {
    const wd = getWeekDetails(getSundayFromWeekNumber(data.weekYear, data.weekNumber));
    if (data.month === undefined) data.month = wd.majorityMonth;
    if (data.year === undefined) data.year = data.weekYear;
  }
  if (data.type === 'monthly' && data.month && data.year) {
    if (data.weekNumber === undefined) data.weekNumber = null;
    if (data.weekYear === undefined) data.weekYear = data.year;
  }
  return { data };
}

/** Fragmen where Prisma untuk satu periode task. */
export function taskPeriodWhere(
  type: TalTaskType,
  p: { dateStr?: string; weekNumber?: number; weekYear?: number; month?: number; year?: number }
): Record<string, any> {
  if (type === 'daily') {
    if (p.dateStr) {
      const d = toDateOrNull(p.dateStr);
      return d ? { taskDate: d } : {};
    }
    return p.year ? { year: p.year } : {};
  }
  if (type === 'weekly') {
    const w: Record<string, any> = {};
    if (p.weekNumber !== undefined) w.weekNumber = p.weekNumber;
    if (p.weekYear !== undefined) w.weekYear = p.weekYear;
    else if (p.year !== undefined) w.weekYear = p.year;
    return w;
  }
  const w: Record<string, any> = {};
  if (p.month !== undefined) w.month = p.month;
  if (p.year !== undefined) w.year = p.year;
  return w;
}

// ---------------------------------------------------------------------------
// Kunci plan (§5.1): task harian mengikuti kunci plan mingguan (backup:
// "Untuk Task harian itu tidak ada Tombol Kunci Plan, jadi mengikuti
// Penguncian Plan dari Task Mingguan") + kunci harian itu sendiri.
// ---------------------------------------------------------------------------
export async function isScopePlanLocked(
  organizationId: string,
  userId: string,
  scope: TalTaskType,
  scopeKey: string
): Promise<boolean> {
  const row = await prisma.talLockReport.findFirst({
    where: { organizationId, userId, scope, scopeKey },
    select: { isPlanLocked: true },
  });
  return !!row?.isPlanLocked;
}

export async function isTaskPlanLocked(
  organizationId: string,
  userId: string,
  task: { type: string; taskDate?: Date | null; weekNumber?: number | null; weekYear?: number | null; month?: number | null; year?: number | null }
): Promise<boolean> {
  if (task.type === 'daily') {
    const dateStr = task.taskDate ? formatDateKey(new Date(task.taskDate)) : null;
    const wi =
      task.weekNumber && task.weekYear
        ? { weekNumber: task.weekNumber, weekYear: task.weekYear }
        : dateStr
          ? getWeekNumberAndYear(parseDateKey(dateStr))
          : null;
    const checks: Promise<boolean>[] = [];
    if (wi) checks.push(isScopePlanLocked(organizationId, userId, 'weekly', scopeKeyFor('weekly', wi)));
    if (dateStr) checks.push(isScopePlanLocked(organizationId, userId, 'daily', scopeKeyFor('daily', { dateStr })));
    const res = await Promise.all(checks);
    return res.some(Boolean);
  }
  if (task.type === 'weekly' && task.weekNumber && task.weekYear) {
    return isScopePlanLocked(
      organizationId,
      userId,
      'weekly',
      scopeKeyFor('weekly', { weekNumber: task.weekNumber, weekYear: task.weekYear })
    );
  }
  if (task.type === 'monthly' && task.month && task.year) {
    return isScopePlanLocked(
      organizationId,
      userId,
      'monthly',
      scopeKeyFor('monthly', { month: task.month, year: task.year })
    );
  }
  return false;
}

/** Kunci bulanan: override manual admin ATAU batas otomatis H+5 16:00. */
export async function isMonthLockedForUser(
  organizationId: string,
  userId: string,
  year: number,
  month: number
): Promise<boolean> {
  const settings = await getDeadlineSettings(organizationId);
  const holidays = await getHolidaysForOrg(organizationId);
  const records = await prisma.talMonthlyLock.findMany({
    where: { organizationId, userId },
    select: { year: true, month: true, isLocked: true, lockedAt: true, payload: true },
  });
  const mapped = records.map((r: any) => {
    const p = (r.payload ?? {}) as Record<string, any>;
    return {
      monthKey: `${r.year}-${String(r.month).padStart(2, '0')}`,
      year: r.year as number,
      month: r.month as number,
      isLocked: !!r.isLocked,
      manualOverride: p.manualOverride === true,
      lockedAt: r.lockedAt ? new Date(r.lockedAt).toISOString() : undefined,
      lockedBy: p.lockedBy,
      unlockedAt: p.unlockedAt,
      unlockedBy: p.unlockedBy,
      reason: p.reason,
      updatedAt: '',
    };
  });
  return checkIsTalMonthLocked(year, month, holidays, settings, mapped).isLocked;
}

// ---------------------------------------------------------------------------
// Ringkasan laporan satu scope (skor + target vs realisasi), porting
// calculateTalReportScore + reportSummary backup (TalReportModal).
// ---------------------------------------------------------------------------
export function buildReportSummary(type: TalTaskType, tasks: TalTaskItem[]) {
  const detail = calculateTalReportScore(type, tasks);
  const resultTasks = tasks.filter((t) => t.category === 'result');
  const targetTotal = resultTasks.reduce((a, t) => a + (t.targetValue ?? 0), 0);
  const actualTotal = resultTasks.reduce((a, t) => a + (t.actualValue ?? 0), 0);
  const achievementPercent =
    targetTotal > 0 ? Math.min(100, Math.round((actualTotal / targetTotal) * 100)) : 0;
  return {
    detail,
    reportSummary: {
      totalTasks: detail.totalTasks,
      mainTasks: detail.totalMain,
      additionalTasks: detail.totalAdditional,
      doneTasks: detail.totalDone,
      pendingTasks: detail.totalPending,
      mainDone: detail.mainDone,
      mainPending: detail.mainPending,
      additionalDone: detail.additionalDone,
      additionalPending: detail.additionalPending,
      scorePercent: detail.scorePercent,
      formula: detail.formulaText,
      onProgressTasks: tasks.filter((t) => t.status === 'on_progress').length,
      todoTasks: tasks.filter((t) => t.status === 'todo').length,
      targetTotal,
      actualTotal,
      achievementPercent,
      notes: '',
    },
  };
}

/** Deadline plan / report satu scope (butuh settings + libur + cuti user). */
export async function scopeDeadlines(
  organizationId: string,
  userId: string,
  scope: TalTaskType,
  params: { dateStr?: string; weekNumber?: number; weekYear?: number; month?: number; year?: number }
): Promise<{ planDeadlineAt: Date | null; reportDeadlineAt: Date | null; planScore: (at: Date) => number; reportScore: (at: Date, weeklyPlanScore?: number) => number }> {
  const settings = await getDeadlineSettings(organizationId);
  const holidays = await getHolidaysForOrg(organizationId);
  const cuti = await getCutiDatesForUser(organizationId, userId);
  const planDeadlineAt = calculatePlanDeadline(scope, params, settings, holidays, cuti);
  const reportDeadlineAt = calculateReportDeadline(scope, params, settings, holidays, cuti);
  return {
    planDeadlineAt,
    reportDeadlineAt,
    planScore: (at: Date) => determinePlanScore(at, planDeadlineAt),
    reportScore: (at: Date, weeklyPlanScore?: number) =>
      determineReportScore(at, reportDeadlineAt, { scope, weeklyPlanScore }),
  };
}

// ---------------------------------------------------------------------------
// Terapkan template rutinitas ke periode (porting
// applyTalRoutineTemplateToPeriod, talService.ts:3271 — versi server).
// Daily: dayOffset 1=Senin..6=Sabtu; lewati Minggu, libur, cuti.
// ---------------------------------------------------------------------------
export interface ApplyTemplateOptions {
  scopeType: TalTaskType;
  targetDateStr?: string;
  targetWeekNumber?: number;
  targetWeekYear?: number;
  targetMonth?: number;
  targetYear?: number;
  includeMonthly?: boolean;
  includeWeekly?: boolean;
  includeDaily?: boolean;
  dailyMappingMode?: 'current_day_only' | 'full_work_week';
}

export async function applyTemplateToPeriod(
  ctx: AuthContext,
  template: TalRoutineTemplate,
  opts: ApplyTemplateOptions
): Promise<{ created: TalTaskItem[]; skipped: string[] }> {
  const tpl = (template as any).template ?? template;
  const monthlyTasks: any[] = Array.isArray((tpl as any).monthlyTasks) ? (tpl as any).monthlyTasks : [];
  const weeklyTasks: any[] = Array.isArray((tpl as any).weeklyTasks) ? (tpl as any).weeklyTasks : [];
  const dailyTasks: any[] = Array.isArray((tpl as any).dailyTasks) ? (tpl as any).dailyTasks : [];
  const includeMonthly = opts.includeMonthly !== false;
  const includeWeekly = opts.includeWeekly !== false;
  const includeDaily = opts.includeDaily !== false;
  const dailyMappingMode = opts.dailyMappingMode ?? 'full_work_week';

  let refDate: Date;
  if (opts.targetDateStr) refDate = parseDateKey(opts.targetDateStr);
  else if (opts.targetWeekNumber && opts.targetWeekYear) {
    refDate = getSundayFromWeekNumber(opts.targetWeekYear, opts.targetWeekNumber);
    refDate.setDate(refDate.getDate() + 1); // Senin
  } else if (opts.targetMonth && opts.targetYear) refDate = new Date(opts.targetYear, opts.targetMonth - 1, 1);
  else refDate = new Date();

  const wi = getWeekNumberAndYear(refDate);
  const effectiveWeekNumber = opts.targetWeekNumber ?? wi.weekNumber;
  const effectiveWeekYear = opts.targetWeekYear ?? wi.weekYear;
  const effectiveMonth = opts.targetMonth ?? refDate.getMonth() + 1;
  const effectiveYear = opts.targetYear ?? refDate.getFullYear();
  const targetWeekSunday = getSundayFromWeekNumber(effectiveWeekYear, effectiveWeekNumber);
  const weekDetails = getWeekDetails(targetWeekSunday);

  const holidays = await getHolidaysForOrg(ctx.organizationId);
  const cuti = await getCutiDatesForUser(ctx.organizationId, ctx.userId);

  const created: TalTaskItem[] = [];
  const skipped: string[] = [];
  const monthlyIdMap: Record<string, string> = {};
  const weeklyIdMap: Record<string, string> = {};

  const base = {
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    userEmail: ctx.email,
    userName: ctx.name,
    assignedTo: [ctx.name || 'Diri Sendiri'],
    assignedUserEmails: [ctx.email.toLowerCase()],
    assignedUsers: [{ email: ctx.email.toLowerCase(), name: ctx.name || 'Diri Sendiri', id: ctx.userId }],
    status: 'todo',
  };

  if (includeMonthly) {
    for (const m of monthlyTasks) {
      const row = await prisma.talTask.create({
        data: {
          ...base,
          type: 'monthly',
          title: m.title,
          description: m.description ?? '',
          category: m.category ?? 'non_result',
          priority: m.priority ?? 'medium',
          targetValue: typeof m.targetValue === 'number' ? m.targetValue : null,
          targetUnit: m.targetUnit ?? null,
          targetCustomUnit: m.targetCustomUnit ?? null,
          weekNumber: effectiveWeekNumber,
          weekYear: effectiveWeekYear,
          month: effectiveMonth,
          year: effectiveYear,
        },
      });
      created.push(mapTalTask(row));
      if (m.id) monthlyIdMap[m.id] = row.id;
    }
  }

  if (includeWeekly) {
    for (const w of weeklyTasks) {
      const row = await prisma.talTask.create({
        data: {
          ...base,
          type: 'weekly',
          title: w.title,
          description: w.description ?? '',
          category: w.category ?? 'non_result',
          priority: w.priority ?? 'medium',
          targetValue: typeof w.targetValue === 'number' ? w.targetValue : null,
          targetUnit: w.targetUnit ?? null,
          targetCustomUnit: w.targetCustomUnit ?? null,
          parentId: w.parentMonthlyTaskTempId ? monthlyIdMap[w.parentMonthlyTaskTempId] ?? null : null,
          parentTitle:
            w.parentMonthlyTaskTempId && monthlyIdMap[w.parentMonthlyTaskTempId]
              ? monthlyTasks.find((m) => m.id === w.parentMonthlyTaskTempId)?.title ?? null
              : null,
          weekNumber: effectiveWeekNumber,
          weekYear: effectiveWeekYear,
          month: effectiveMonth,
          year: effectiveYear,
        },
      });
      created.push(mapTalTask(row));
      if (w.id) weeklyIdMap[w.id] = row.id;
    }
  }

  if (includeDaily) {
    for (const d of dailyTasks) {
      const dayOffset = typeof d.dayOffset === 'number' ? d.dayOffset : 1;
      const targetDay = weekDetails.days[dayOffset]; // days[0]=Minggu; offset 1=Senin..6=Sabtu
      if (!targetDay) {
        skipped.push(`${d.title} (hari ke-${dayOffset} di luar minggu)`);
        continue;
      }
      const dateStr = targetDay.dateStr;
      if (dailyMappingMode === 'current_day_only' && opts.targetDateStr && dateStr !== opts.targetDateStr) {
        continue;
      }
      const holiday = checkIsHoliday(dateStr, holidays);
      if (holiday.isHoliday) {
        skipped.push(`${d.title} — ${dateStr} libur (${holiday.holidayTitle})`);
        continue;
      }
      const cutiHit = isCutiDay(dateStr, cuti);
      if (cutiHit.isCuti) {
        skipped.push(`${d.title} — ${dateStr} cuti (${cutiHit.reason ?? 'Cuti'})`);
        continue;
      }
      const row = await prisma.talTask.create({
        data: {
          ...base,
          type: 'daily',
          title: d.title,
          description: d.description ?? '',
          category: d.category ?? 'non_result',
          priority: d.priority ?? 'medium',
          targetValue: typeof d.targetValue === 'number' ? d.targetValue : null,
          targetUnit: d.targetUnit ?? null,
          targetCustomUnit: d.targetCustomUnit ?? null,
          taskDate: utcDateFromKey(dateStr),
          taskTime: d.time ?? null,
          parentId: d.parentWeeklyTaskTempId ? weeklyIdMap[d.parentWeeklyTaskTempId] ?? null : null,
          parentTitle:
            d.parentWeeklyTaskTempId && weeklyIdMap[d.parentWeeklyTaskTempId]
              ? weeklyTasks.find((w) => w.id === d.parentWeeklyTaskTempId)?.title ?? null
              : null,
          enableReminder: d.enableReminder === true,
          reminderType: d.reminderType ?? null,
          reminderMinutesBefore: typeof d.reminderMinutesBefore === 'number' ? d.reminderMinutesBefore : null,
          reminderTime: d.reminderTime ?? null,
          weekNumber: effectiveWeekNumber,
          weekYear: effectiveWeekYear,
          month: Number(dateStr.slice(5, 7)),
          year: Number(dateStr.slice(0, 4)),
        },
      });
      created.push(mapTalTask(row));
    }
  }

  return { created, skipped };
}

// ---------------------------------------------------------------------------
// Salin task ke periode lain (porting copyTasksToPeriod — versi server).
// Menolak: tanggal merah/Minggu, tanggal cuti, periode yang sudah dilaporkan.
// Task hasil salinan berstatus todo; bila target sudah kunci plan → tambahan.
// ---------------------------------------------------------------------------
export async function copyTasksToTarget(
  ctx: AuthContext,
  tasks: TalTaskItem[],
  target: { targetType: TalTaskType; targetDate?: string; targetWeekNumber?: number; targetWeekYear?: number; targetMonth?: number; targetYear?: number }
): Promise<TalTaskItem[]> {
  let targetDate = target.targetDate;
  let targetWeekNumber = target.targetWeekNumber ?? 1;
  let targetWeekYear = target.targetWeekYear ?? new Date().getFullYear();
  let targetMonth = target.targetMonth ?? new Date().getMonth() + 1;
  let targetYear = target.targetYear ?? new Date().getFullYear();

  if (target.targetType === 'daily' && targetDate) {
    const d = parseDateKey(targetDate);
    const wi = getWeekNumberAndYear(d);
    targetWeekNumber = wi.weekNumber;
    targetWeekYear = wi.weekYear;
    targetMonth = d.getMonth() + 1;
    targetYear = d.getFullYear();
  } else if (target.targetType === 'weekly') {
    targetDate = undefined;
    targetYear = targetWeekYear;
  } else if (target.targetType === 'monthly') {
    targetDate = undefined;
    targetWeekNumber = 0;
    targetWeekYear = targetYear;
  }

  const holidays = await getHolidaysForOrg(ctx.organizationId);
  const cuti = await getCutiDatesForUser(ctx.organizationId, ctx.userId);

  let isTargetRealization = false;
  if (target.targetType === 'daily' && targetDate) {
    const d = parseDateKey(targetDate);
    if (d.getDay() === 0) throw new Error('Tidak diperbolehkan menyalin tugas ke hari Minggu (libur mingguan).');
    const hol = checkIsHoliday(targetDate, holidays);
    if (hol.isHoliday) throw new Error(`Tidak diperbolehkan menyalin tugas ke tanggal merah (${hol.holidayTitle}).`);
    const cutiHit = isCutiDay(targetDate, cuti);
    if (cutiHit.isCuti) throw new Error(`Tidak diperbolehkan menyalin tugas ke tanggal cuti (${cutiHit.reason ?? 'Cuti'}).`);
    const [weeklyState, dailyState, monthlyState] = await Promise.all([
      prisma.talLockReport.findFirst({ where: { organizationId: ctx.organizationId, userId: ctx.userId, scope: 'weekly', scopeKey: scopeKeyFor('weekly', { weekNumber: targetWeekNumber, weekYear: targetWeekYear }) } }),
      prisma.talLockReport.findFirst({ where: { organizationId: ctx.organizationId, userId: ctx.userId, scope: 'daily', scopeKey: scopeKeyFor('daily', { dateStr: targetDate }) } }),
      prisma.talLockReport.findFirst({ where: { organizationId: ctx.organizationId, userId: ctx.userId, scope: 'monthly', scopeKey: scopeKeyFor('monthly', { month: targetMonth, year: targetYear }) } }),
    ]);
    if (dailyState?.isReported || weeklyState?.isReported || monthlyState?.isReported)
      throw new Error('Tidak diperbolehkan menyalin tugas ke tanggal yang sudah dilakukan pelaporan.');
    isTargetRealization = !!weeklyState?.isPlanLocked || !!dailyState?.isPlanLocked;
  } else if (target.targetType === 'weekly') {
    const weeklyState = await prisma.talLockReport.findFirst({ where: { organizationId: ctx.organizationId, userId: ctx.userId, scope: 'weekly', scopeKey: scopeKeyFor('weekly', { weekNumber: targetWeekNumber, weekYear: targetWeekYear }) } });
    if (weeklyState?.isReported) throw new Error('Tidak diperbolehkan menyalin tugas ke minggu yang sudah dilakukan pelaporan.');
    isTargetRealization = !!weeklyState?.isPlanLocked;
  } else if (target.targetType === 'monthly') {
    const monthlyState = await prisma.talLockReport.findFirst({ where: { organizationId: ctx.organizationId, userId: ctx.userId, scope: 'monthly', scopeKey: scopeKeyFor('monthly', { month: targetMonth, year: targetYear }) } });
    if (monthlyState?.isReported) throw new Error('Tidak diperbolehkan menyalin tugas ke bulan yang sudah dilakukan pelaporan.');
    isTargetRealization = !!monthlyState?.isPlanLocked;
  }

  const existing = await prisma.talTask.findMany({
    where: {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      type: target.targetType,
      ...taskPeriodWhere(target.targetType, { dateStr: targetDate, weekNumber: targetWeekNumber, weekYear: targetWeekYear, month: targetMonth, year: targetYear }),
    },
    select: { isAdditional: true, orderNo: true },
  });
  let maxAdditional = 0;
  let maxMain = 0;
  for (const e of existing) {
    if (e.isAdditional) maxAdditional = Math.max(maxAdditional, e.orderNo ?? 0);
    else maxMain = Math.max(maxMain, e.orderNo ?? 0);
  }

  const created: TalTaskItem[] = [];
  for (const t of tasks) {
    const isAdditional = isTargetRealization ? true : !!t.isAdditional;
    const orderNo = isAdditional ? ++maxAdditional : ++maxMain;
    const row = await prisma.talTask.create({
      data: {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        userEmail: ctx.email,
        userName: ctx.name,
        type: target.targetType,
        isAdditional,
        orderNo,
        taskDate: targetDate ? utcDateFromKey(targetDate) : null,
        taskTime: target.targetType === 'daily' ? t.time ?? null : null,
        weekNumber: targetWeekNumber,
        weekYear: targetWeekYear,
        month: targetMonth,
        year: targetYear,
        title: t.title,
        description: t.description ?? '',
        parentId: t.parentId ?? null,
        parentTitle: t.parentTitle ?? null,
        category: t.category,
        targetValue: t.targetValue ?? null,
        targetUnit: t.targetUnit ?? null,
        targetCustomUnit: t.targetCustomUnit ?? null,
        priority: t.priority,
        assignedTo: t.assignedTo ?? [],
        assignedUserEmails: t.assignedUserEmails ?? [],
        assignedUsers: (t.assignedUsers ?? []) as unknown as Prisma.InputJsonValue,
        status: 'todo',
        notes: '',
        attachments: [],
        enableReminder: t.enableReminder ?? false,
        reminderType: t.reminderType ?? null,
        reminderMinutesBefore: t.reminderMinutesBefore ?? null,
        reminderTime: t.reminderTime ?? null,
      },
    });
    created.push(mapTalTask(row));
  }
  return created;
}

// ---------------------------------------------------------------------------
// Rollover saat laporan disubmit: buat task baru di periode target untuk
// tiap keputusan, tandai task asal isRolledOver. (Porting logika
// TalReportModal + setScopeReport backup.)
// ---------------------------------------------------------------------------
export interface RolloverDecision {
  taskId: string;
  action: 'rollover_tomorrow' | 'rollover_date' | 'cancelled';
  targetDate?: string;
  targetWeekNumber?: number;
  targetWeekYear?: number;
  targetMonth?: number;
  targetYear?: number;
  cancelNotes?: string;
}

export async function applyRolloverDecisions(
  ctx: AuthContext,
  scope: TalTaskType,
  scopeKey: string,
  decisions: RolloverDecision[]
): Promise<{ rolledOver: number; cancelled: number }> {
  let rolledOver = 0;
  let cancelled = 0;
  const params = parseScopeKey(scope, scopeKey);
  for (const d of decisions) {
    const task = await prisma.talTask.findFirst({
      where: { organizationId: ctx.organizationId, userId: ctx.userId, id: d.taskId },
    });
    if (!task) continue;
    if (d.action === 'cancelled') {
      await prisma.talTask.update({
        where: { id: task.id },
        data: { isRolledOver: true, rolloverAction: 'cancelled', cancelNotes: d.cancelNotes ?? '' },
      });
      cancelled++;
      continue;
    }
    let target: { targetType: TalTaskType; targetDate?: string; targetWeekNumber?: number; targetWeekYear?: number; targetMonth?: number; targetYear?: number };
    if (scope === 'daily') {
      let td = d.targetDate;
      if (d.action === 'rollover_tomorrow' && params.dateStr) {
        const cur = parseDateKey(params.dateStr);
        cur.setDate(cur.getDate() + 1);
        td = formatDateKey(cur);
      }
      target = { targetType: 'daily', targetDate: td };
    } else if (scope === 'weekly') {
      target = {
        targetType: 'weekly',
        targetWeekNumber: d.targetWeekNumber ?? (params.weekNumber ?? 1) + 1,
        targetWeekYear: d.targetWeekYear ?? params.weekYear,
      };
    } else {
      const m = (params.month ?? 1) + 1;
      target = {
        targetType: 'monthly',
        targetMonth: d.targetMonth ?? (m > 12 ? 1 : m),
        targetYear: d.targetYear ?? (m > 12 ? (params.year ?? new Date().getFullYear()) + 1 : params.year),
      };
    }
    const src = mapTalTask(task);
    try {
      const [copy] = await copyTasksToTarget(ctx, [src], target);
      await prisma.talTask.update({
        where: { id: task.id },
        data: {
          isRolledOver: true,
          rolloverAction: d.action,
          rolloverTargetDate: copy?.date ? utcDateFromKey(copy.date) : null,
          rolloverTargetWeek: copy?.weekNumber ?? null,
          rolloverTargetYear: copy?.weekYear ?? null,
          rolloverTargetMonth: copy?.month ?? null,
          originalTaskId: null,
        },
      });
      await prisma.talTask.update({
        where: { id: copy.id },
        data: { originalTaskId: task.id },
      });
      rolledOver++;
    } catch {
      // Target tidak valid (libur/cuti/sudah dilaporkan) — lewati, task asal
      // tetap belum selesai dan tercatat di laporan.
      continue;
    }
  }
  return { rolledOver, cancelled };
}
