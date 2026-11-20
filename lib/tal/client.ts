// lib/tal/client.ts — helper client TAL (pola lib/emas/client.ts).
// Halaman memanggil helper ini, bukan fetch mentah. Respons API dibungkus
// { success, data } (apiOk / apiErr dari lib/utils).

import type {
  TalDeadlineSettings,
  TalHolidayItem,
  TalRoutineTemplate,
  TalScopeLockReport,
  TalStatus,
  TalTaskItem,
  TalTaskType,
  TalUserNotificationSettings,
} from './types';
import { normalizeTalPrefs, type TalUserNotificationSettings as TalPrefs } from './preferences';
import { getSundayFromWeekNumber, getWeekDetails } from './date';

export type {
  TalTaskItem,
  TalRoutineTemplate,
  TalScopeLockReport,
  TalHolidayItem,
  TalDeadlineSettings,
  TalUserNotificationSettings,
};

async function apiJson(path: string, init: RequestInit = {}) {
  const res = await fetch(path, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.message || `Permintaan ${path} gagal (${res.status})`);
  }
  return body.data ?? body;
}

function qs(params: Record<string, string | number | undefined>): string {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') s.set(k, String(v));
  }
  const out = s.toString();
  return out ? `?${out}` : '';
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------
export interface FetchTasksParams {
  type: TalTaskType;
  date?: string;
  weekNumber?: number;
  weekYear?: number;
  month?: number;
  year?: number;
  status?: TalStatus | 'all';
  priority?: string;
  search?: string;
}

export async function fetchTalTasks(params: FetchTasksParams): Promise<TalTaskItem[]> {
  const data = await apiJson(
    `/api/tal/tasks${qs({
      type: params.type,
      date: params.date,
      weekNumber: params.weekNumber,
      weekYear: params.weekYear,
      month: params.month,
      year: params.year,
      status: params.status === 'all' ? undefined : params.status,
      priority: params.priority === 'all' ? undefined : params.priority,
      search: params.search,
    })}`
  );
  return (data.tasks ?? []) as TalTaskItem[];
}

export async function createTalTask(
  task: Partial<TalTaskItem> & { type: TalTaskType; title: string }
): Promise<TalTaskItem> {
  const data = await apiJson('/api/tal/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(task),
  });
  return data.task as TalTaskItem;
}

export async function updateTalTask(id: string, updates: Partial<TalTaskItem>): Promise<TalTaskItem> {
  const data = await apiJson(`/api/tal/tasks/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  return data.task as TalTaskItem;
}

export async function deleteTalTask(id: string): Promise<void> {
  await apiJson(`/api/tal/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function batchDeleteTasks(ids: string[]): Promise<void> {
  await apiJson('/api/tal/tasks/batch-delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
}

export async function batchUpdateTaskStatus(ids: string[], status: TalStatus): Promise<void> {
  await apiJson('/api/tal/tasks/batch-status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids, status }),
  });
}

export async function reorderTalTasks(ordered: { id: string; order: number }[]): Promise<void> {
  await apiJson('/api/tal/tasks/reorder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ordered }),
  });
}

export async function copyTalTasks(
  ids: string[],
  target: {
    targetType: TalTaskType;
    targetDate?: string;
    targetWeekNumber?: number;
    targetWeekYear?: number;
    targetMonth?: number;
    targetYear?: number;
  }
): Promise<TalTaskItem[]> {
  const data = await apiJson('/api/tal/tasks/copy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids, target }),
  });
  return (data.tasks ?? []) as TalTaskItem[];
}

// ---------------------------------------------------------------------------
// Locks / laporan scope
// Catatan: GET /api/tal/locks dibuat sub-tahap (b) dan mengembalikan baris
// mentah { locks: [...] } (bukan bentuk TalScopeLockReport) — pemetaan ke
// bentuk backup dilakukan di sini (mapRawLock), agar halaman (a) tetap
// memakai tipe yang sama dengan backup.
// ---------------------------------------------------------------------------
function mapRawLock(r: any): TalScopeLockReport {
  const p = (r.payload ?? {}) as Record<string, any>;
  return {
    id: r.id as string,
    scope: r.scope as TalTaskType,
    scopeKey: r.scopeKey as string,
    userId: r.userId as string,
    userEmail: p.userEmail,
    userName: p.userName,
    type: r.scope as TalTaskType,
    date: /^\d{4}-\d{2}-\d{2}$/.test(r.scopeKey) ? r.scopeKey : undefined,
    weekNumber: p.weekNumber,
    weekYear: p.weekYear,
    month: p.month,
    year: p.year,
    infoTglTask: p.infoTglTask,
    isPlanLocked: !!r.isPlanLocked,
    planLockedAt: r.planLockedAt ?? undefined,
    lockedBy: p.lockedBy,
    lockNotes: p.lockNotes,
    taskCount: p.taskCount,
    planScore: p.planScore,
    planDeadlineAt: p.planDeadlineAt,
    progressScore: p.progressScore,
    isReported: !!r.isReported,
    reportedAt: r.reportedAt ?? undefined,
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

export async function fetchScopeState(
  scope: TalTaskType,
  scopeKey: string
): Promise<TalScopeLockReport | null> {
  const data = await apiJson(`/api/tal/locks${qs({ scope, scopeKey })}`);
  const rows = (data.locks ?? []) as any[];
  return rows.length ? mapRawLock(rows[0]) : null;
}

export async function fetchMyLocks(params?: {
  scope?: TalTaskType;
  year?: number;
  month?: number;
}): Promise<TalScopeLockReport[]> {
  const data = await apiJson(`/api/tal/locks${qs({ scope: params?.scope })}`);
  let locks = ((data.locks ?? []) as any[]).map(mapRawLock);
  if (params?.year && params?.month) {
    const prefix = `${params.year}-${String(params.month).padStart(2, '0')}`;
    locks = locks.filter((l) => {
      if (l.scope === 'daily') return l.scopeKey.startsWith(prefix);
      if (l.scope === 'monthly') return l.scopeKey === prefix;
      if (l.scope === 'weekly') {
        const m = l.scopeKey.match(/(\d{4})-W(\d{1,2})/);
        if (!m) return false;
        const wd = getWeekDetails(getSundayFromWeekNumber(Number(m[1]), Number(m[2])));
        return wd.majorityMonth === params.month && Number(m[1]) === params.year;
      }
      return true;
    });
  }
  return locks;
}

export async function lockPlan(
  scope: TalTaskType,
  scopeKey: string,
  notes?: string
): Promise<TalScopeLockReport> {
  const data = await apiJson('/api/tal/locks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scope, scopeKey, action: 'lock-plan', notes }),
  });
  return data.lock as TalScopeLockReport;
}

export interface RolloverDecisionInput {
  taskId: string;
  action: 'rollover_tomorrow' | 'rollover_date' | 'cancelled';
  targetDate?: string;
  targetWeekNumber?: number;
  targetWeekYear?: number;
  targetMonth?: number;
  targetYear?: number;
  cancelNotes?: string;
}

export async function submitReport(
  scope: TalTaskType,
  scopeKey: string,
  opts: { notes?: string; rolloverDecisions?: RolloverDecisionInput[] }
): Promise<TalScopeLockReport> {
  const data = await apiJson('/api/tal/locks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      scope,
      scopeKey,
      action: 'report',
      notes: opts.notes,
      rolloverDecisions: opts.rolloverDecisions ?? [],
    }),
  });
  return data.lock as TalScopeLockReport;
}

// ---------------------------------------------------------------------------
// Cuti & libur
// ---------------------------------------------------------------------------
export interface TalCutiItem {
  id: string;
  date: string;
  reason?: string;
}

export async function fetchTalCuti(params?: {
  date?: string;
  month?: number;
  year?: number;
}): Promise<TalCutiItem[]> {
  // GET /api/tal/cuti (sub-tahap b) hanya mendukung ?date= — saring
  // bulan/tahun di client.
  const data = await apiJson(`/api/tal/cuti${qs({ date: params?.date })}`);
  let list = (data.cuti ?? []) as TalCutiItem[];
  if (params?.year && params?.month) {
    const prefix = `${params.year}-${String(params.month).padStart(2, '0')}`;
    list = list.filter((c) => c.date.startsWith(prefix));
  }
  return list;
}

export async function setTalCuti(date: string, reason?: string): Promise<TalCutiItem> {
  const data = await apiJson('/api/tal/cuti', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date, reason }),
  });
  return data.cuti as TalCutiItem;
}

export async function deleteTalCuti(date: string): Promise<void> {
  await apiJson(`/api/tal/cuti${qs({ date })}`, { method: 'DELETE' });
}

export async function fetchTalHolidays(): Promise<TalHolidayItem[]> {
  const data = await apiJson('/api/tal/holidays');
  return (data.holidays ?? []) as TalHolidayItem[];
}

export async function saveTalHoliday(h: {
  date: string;
  title: string;
  category?: string;
  description?: string;
  isRecurringYearly?: boolean;
}): Promise<TalHolidayItem> {
  const data = await apiJson('/api/tal/holidays', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(h),
  });
  return data.holiday as TalHolidayItem;
}

export async function deleteTalHoliday(id: string): Promise<void> {
  // DELETE /api/tal/holidays memakai query ?id= (sub-tahap b).
  await apiJson(`/api/tal/holidays${qs({ id })}`, { method: 'DELETE' });
}

export async function resetDefaultHolidays(): Promise<TalHolidayItem[]> {
  // Reset = POST /api/tal/holidays { reset: true } (sub-tahap b).
  const data = await apiJson('/api/tal/holidays', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reset: true }),
  });
  return (data.holidays ?? []) as TalHolidayItem[];
}

// ---------------------------------------------------------------------------
// Deadline settings, kewajiban, kunci bulanan
// ---------------------------------------------------------------------------
export async function fetchTalDeadlineSettings(): Promise<TalDeadlineSettings> {
  const data = await apiJson('/api/tal/deadline-settings');
  return data.settings as TalDeadlineSettings;
}

export interface TalObligationItem {
  userId: string;
  userEmail?: string;
  userName?: string;
  daily: boolean;
  weekly: boolean;
  monthly: boolean;
}

export async function fetchMyObligation(): Promise<TalObligationItem> {
  const data = await apiJson('/api/tal/obligations?mine=1');
  return data.obligation as TalObligationItem;
}

export interface TalMonthLockItem {
  monthKey: string;
  year: number;
  month: number;
  isLocked: boolean;
  manualOverride: boolean;
  reason?: string;
  lockedBy?: string;
  lockedAt?: string;
}

export async function fetchMyMonthLocks(year?: number): Promise<TalMonthLockItem[]> {
  // GET /api/tal/locks/monthly (sub-tahap b): { locks: [{ monthKey, year,
  // month, isLocked, lockedAt, payload: { manualOverride, reason, lockedBy } }] }
  const data = await apiJson('/api/tal/locks/monthly');
  let list = ((data.locks ?? []) as any[]).map((r) => ({
    monthKey: r.monthKey as string,
    year: r.year as number,
    month: r.month as number,
    isLocked: !!r.isLocked,
    manualOverride: (r.payload ?? {}).manualOverride === true,
    reason: (r.payload ?? {}).reason,
    lockedBy: (r.payload ?? {}).lockedBy,
    lockedAt: r.lockedAt ?? undefined,
  })) as TalMonthLockItem[];
  if (year) list = list.filter((l) => l.year === year);
  return list;
}

// ---------------------------------------------------------------------------
// Template rutinitas
// ---------------------------------------------------------------------------
export async function fetchTalRoutineTemplates(): Promise<TalRoutineTemplate[]> {
  const data = await apiJson('/api/tal/routine-templates');
  return (data.templates ?? []) as TalRoutineTemplate[];
}

export async function saveTalRoutineTemplate(
  template: Partial<TalRoutineTemplate> & { name: string }
): Promise<TalRoutineTemplate> {
  const data = await apiJson('/api/tal/routine-templates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(template),
  });
  return data.template as TalRoutineTemplate;
}

export async function deleteTalRoutineTemplate(id: string): Promise<void> {
  await apiJson(`/api/tal/routine-templates/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function applyTalRoutineTemplate(
  templateId: string,
  opts: {
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
): Promise<{ created: TalTaskItem[]; skipped: string[]; count: number }> {
  const data = await apiJson('/api/tal/routine-templates/apply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ templateId, ...opts }),
  });
  return {
    created: (data.created ?? []) as TalTaskItem[],
    skipped: (data.skipped ?? []) as string[],
    count: data.count ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Rekap pribadi
// ---------------------------------------------------------------------------
export interface TalRekapMonth {
  year: number;
  month: number;
  totals: { total: number; done: number; percent: number };
  byType: Record<string, { total: number; done: number; percent: number }>;
  byCategory: Record<string, { total: number; done: number }>;
  targetTotal: number;
  actualTotal: number;
  achievementPercent: number;
  weekly: Array<{ weekNumber: number; weekYear: number; total: number; done: number; percent: number; planScore: number | null; reportScore: number | null; isReported: boolean }>;
  daily: Array<{ date: string; total: number; done: number; percent: number; isReported: boolean }>;
  locks: TalScopeLockReport[];
  tasks: TalTaskItem[];
}

export async function fetchTalRekap(year: number, month: number): Promise<TalRekapMonth> {
  const data = await apiJson(`/api/tal/rekap${qs({ year, month })}`);
  return data.rekap as TalRekapMonth;
}

// ---------------------------------------------------------------------------
// Preferensi notifikasi TAL + notifikasi
// ---------------------------------------------------------------------------
export async function fetchTalPreferences(): Promise<TalPrefs> {
  const data = await apiJson('/api/tal/preferences');
  return normalizeTalPrefs(data.prefs ?? {});
}

export async function saveTalPreferences(prefs: TalPrefs): Promise<TalPrefs> {
  const data = await apiJson('/api/tal/preferences', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefs }),
  });
  return normalizeTalPrefs(data.prefs ?? {});
}

export async function sendTalTestNotification(): Promise<boolean> {
  const data = await apiJson('/api/tal/preferences/test', { method: 'POST' });
  return !!data.sent;
}

export async function markNotificationRead(id: string): Promise<void> {
  await apiJson(`/api/notifications/${encodeURIComponent(id)}`, { method: 'PATCH' });
}
