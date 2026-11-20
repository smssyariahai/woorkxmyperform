// Helper RBAC + laporan tim TAL — sub-tahap (b) Gelombang 4.
// Porting dari backup src/server/server.ts:562-760 (talTeamVisible,
// talTeamCanManage, talTeamTaskOfUser, talTeamBuildReport) dan
// src/utils/talDateUtils.ts:calculateTalReportScore.
//
// CATATAN:
// - Helper tanggal minimal ditulis di sini karena lib/tal/date.ts
//   (milik sub-tahap a) belum ada saat file ini dibuat. Bila koordinator
//   sudah menggabungkan lib/tal/date.ts, fungsi tanggal di bawah boleh
//   diganti impor dari sana — API-nya disamakan namanya.
// - Gating mengikuti brief WAVE04_FOUNDATION.md §5: HR/admin = isSuperAdmin
//   ATAU role OWNER ATAU role ADMIN. TIDAK memakai HR_VIEW/HR_MANAGE.
// - Semua query WAJIB memfilter organizationId dari sesi.

import { prisma } from '@/lib/db';
import type { AuthContext } from '@/lib/auth-helpers';

// ---------------------------------------------------------------------------
// Tanggal minimal (WIB) — porting talDateUtils (hanya yang dipakai tim/HR)
// ---------------------------------------------------------------------------

export const TAL_MONTHS_SHORT_ID = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
];

export const TAL_MONTHS_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

export const TAL_DAYS_SHORT_ID = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

const pad2 = (n: number) => String(n).padStart(2, '0');

export function talDateStr(y: number, m: number, d: number) {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

/** Bagian tanggal WIB (Asia/Jakarta) dari sebuah Date. */
export function talWibParts(d: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: get('year'), m: get('month'), day: get('day') };
}

/** "YYYY-MM-DD" dari Date (kolom @db.Date dibaca sebagai UTC midnight). */
export function talDateKey(d: Date | string | null | undefined): string {
  if (!d) return '';
  const dt = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return '';
  return talDateStr(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/** Nomor minggu ISO (Senin = awal minggu) + tahun ISO. */
export function talIsoWeekOf(y: number, m: number, day: number) {
  const d = new Date(Date.UTC(y, m - 1, day));
  const dow = (d.getUTCDay() + 6) % 7;
  const thu = new Date(d);
  thu.setUTCDate(d.getUTCDate() - dow + 3);
  const start = new Date(Date.UTC(thu.getUTCFullYear(), 0, 1));
  return {
    week: Math.ceil(((thu.getTime() - start.getTime()) / 86400000 + 1) / 7),
    year: thu.getUTCFullYear(),
  };
}

// ---------------------------------------------------------------------------
// Gate HR / admin (§5.2) dan pengatur tim (§5.3)
// ---------------------------------------------------------------------------

/** Boleh melihat SEMUA TAL organisasi: isSuperAdmin ATAU OWNER ATAU ADMIN. */
export function talIsHrAdmin(ctx: AuthContext): boolean {
  return ctx.isSuperAdmin === true || ctx.role === 'OWNER' || ctx.role === 'ADMIN';
}

/** Boleh MENGATUR tim (atasan + grant kustom): sama dengan gate admin §5.3. */
export async function talTeamCanManage(ctx: AuthContext): Promise<boolean> {
  return talIsHrAdmin(ctx);
}

// ---------------------------------------------------------------------------
// Anggota organisasi (sumber: Membership aktif + User + UserEmployment)
// ---------------------------------------------------------------------------

export interface TalOrgUser {
  id: string;
  email: string;
  nama: string;
  role: string;
  isActive: boolean;
  divisi: string;
  posisi: string;
  jobLevel: string;
  cabang: string;
  managerId: string;
}

export async function talLoadOrgUsers(organizationId: string): Promise<TalOrgUser[]> {
  const memberships = await prisma.membership.findMany({
    where: { organizationId },
    include: {
      user: { select: { id: true, name: true, email: true, status: true } },
      employment: {
        select: { position: true, jobLevel: true, branch: true, managerId: true },
      },
      department: { select: { name: true } },
    },
    orderBy: { user: { name: 'asc' } },
  });
  return memberships.map((m) => ({
    id: m.user.id,
    email: (m.user.email || '').toLowerCase(),
    nama: m.user.name || m.user.email || '',
    role: '',
    isActive: m.status === 'ACTIVE' && m.user.status === 'ACTIVE',
    divisi: m.department?.name || '',
    posisi: m.employment?.position || m.jobTitle || '',
    jobLevel: m.employment?.jobLevel || '',
    cabang: m.employment?.branch || '',
    managerId: m.employment?.managerId || '',
  }));
}

// ---------------------------------------------------------------------------
// Himpunan terlihat (§5.5): diri sendiri + BFS bawahan + grant kustom
// ---------------------------------------------------------------------------

export type TalVisibleVia = 'self' | 'hierarchy' | 'custom';

/**
 * Mengembalikan Map userId -> 'self' | 'hierarchy' | 'custom'.
 * BFS mengikuti UserEmployment.managerId ke bawah; siklus aman (seen-set).
 */
export async function talTeamVisible(
  organizationId: string,
  meId: string,
): Promise<Map<string, TalVisibleVia>> {
  const users = await talLoadOrgUsers(organizationId);
  const reports = new Map<string, string[]>();
  for (const u of users) {
    if (u.managerId && users.some((x) => x.id === u.managerId)) {
      if (!reports.has(u.managerId)) reports.set(u.managerId, []);
      reports.get(u.managerId)!.push(u.id);
    }
  }
  const visible = new Map<string, TalVisibleVia>();
  visible.set(meId, 'self');
  const queue = [meId];
  const seen = new Set([meId]);
  while (queue.length) {
    const cur = queue.shift()!;
    for (const rep of reports.get(cur) || []) {
      if (!seen.has(rep)) {
        seen.add(rep);
        visible.set(rep, 'hierarchy');
        queue.push(rep);
      }
    }
  }
  const grants = await prisma.talTeamVisibility.findMany({
    where: { organizationId, viewerId: meId },
    select: { targetId: true },
  });
  for (const g of grants) {
    if (!visible.has(g.targetId)) visible.set(g.targetId, 'custom');
  }
  return visible;
}

export interface TalTeamMember extends TalOrgUser {
  isSelf: boolean;
  via: TalVisibleVia;
  todayTotal: number;
  todayFinish: number;
}

/** Daftar anggota tim yang terlihat + ringkasan TAL hari ini (WIB). */
export async function talTeamMembers(
  ctx: AuthContext,
): Promise<{ members: TalTeamMember[]; canManage: boolean }> {
  const visible = await talTeamVisible(ctx.organizationId, ctx.userId);
  const users = await talLoadOrgUsers(ctx.organizationId);
  const byId = new Map(users.map((u) => [u.id, u]));
  const { y, m, day } = talWibParts(new Date());
  const todayStr = talDateStr(y, m, day);
  const tasks = await prisma.talTask.findMany({
    where: { organizationId: ctx.organizationId },
    select: {
      id: true, userId: true, userEmail: true, status: true,
      taskDate: true, assignedUserEmails: true, assignedUsers: true,
    },
  });
  const members: TalTeamMember[] = [...visible.entries()]
    .map(([id, via]) => ({ user: byId.get(id), via }))
    .filter((x): x is { user: TalOrgUser; via: TalVisibleVia } => !!x.user && (x.user.isActive || x.user.id === ctx.userId))
    .map(({ user: u, via }) => {
      const mine = tasks.filter((t) => talTeamTaskOfUser(t, u));
      const todayMine = mine.filter((t) => talDateKey(t.taskDate) === todayStr);
      return {
        ...u,
        isSelf: u.id === ctx.userId,
        via,
        todayTotal: todayMine.length,
        todayFinish: todayMine.filter((t) => t.status === 'done').length,
      };
    })
    .sort((a, b) => Number(b.isSelf) - Number(a.isSelf) || a.nama.localeCompare(b.nama));
  return { members, canManage: await talTeamCanManage(ctx) };
}

/** true bila viewer boleh MELIHAT TAL target (self / hierarki / grant / HR-admin). */
export async function canViewTalOf(
  ctx: AuthContext,
  targetUserId: string,
): Promise<boolean> {
  if (targetUserId === ctx.userId) return true;
  if (talIsHrAdmin(ctx)) return true;
  const visible = await talTeamVisible(ctx.organizationId, ctx.userId);
  return visible.has(targetUserId);
}

// ---------------------------------------------------------------------------
// Tugas milik / ditugaskan ke user (porting talTeamTaskOfUser, server.ts:598)
// ---------------------------------------------------------------------------

export function talTeamTaskOfUser(
  t: { userId?: string | null; userEmail?: string | null; assignedUserEmails?: unknown; assignedUsers?: unknown },
  u: { id: string; email: string },
): boolean {
  if (String(t.userId || '') === u.id) return true;
  if (String(t.userEmail || '').toLowerCase() === u.email.toLowerCase()) return true;
  const emails = Array.isArray(t.assignedUserEmails)
    ? (t.assignedUserEmails as unknown[]).map((e) => String(e).toLowerCase())
    : [];
  if (emails.includes(u.email.toLowerCase())) return true;
  const ass = Array.isArray(t.assignedUsers) ? (t.assignedUsers as any[]) : [];
  return ass.some(
    (a) => String(a?.id || '') === u.id || String(a?.email || '').toLowerCase() === u.email.toLowerCase(),
  );
}

// ---------------------------------------------------------------------------
// Skor laporan (porting calculateTalReportScore, talDateUtils.ts:358)
// ---------------------------------------------------------------------------

export interface TalScoreDetail {
  scorePercent: number;
  totalMain: number;
  totalAdditional: number;
  mainDone: number;
  mainPending: number;
  additionalDone: number;
  additionalPending: number;
  totalDone: number;
  totalPending: number;
  totalTasks: number;
  formulaText: string;
  formulaCalculation: string;
}

export function talReportScore(
  type: 'daily' | 'weekly' | 'monthly',
  tasks: { isAdditional: boolean; status: string }[],
): TalScoreDetail {
  const mainTasks = tasks.filter((t) => !t.isAdditional);
  const additionalTasks = tasks.filter((t) => !!t.isAdditional);
  const mainDone = mainTasks.filter((t) => t.status === 'done').length;
  const mainPending = mainTasks.filter((t) => t.status !== 'done').length;
  const additionalDone = additionalTasks.filter((t) => t.status === 'done').length;
  const additionalPending = additionalTasks.filter((t) => t.status !== 'done').length;
  const totalMain = mainTasks.length;
  const totalAdditional = additionalTasks.length;
  const totalDone = tasks.filter((t) => t.status === 'done').length;
  const totalPending = tasks.filter((t) => t.status !== 'done').length;
  const totalTasks = tasks.length;

  let scorePercent = 0;
  let formulaText = '';
  let formulaCalculation = '';

  if (type === 'daily') {
    if (totalMain > 0) {
      const raw = Math.round(((mainDone + additionalDone) / totalMain) * 100);
      scorePercent = Math.min(100, Math.max(0, raw));
      formulaText = '=(Task Utama Done + Task Tambahan Done) / Total Task Utama (Maks. 100%)';
      formulaCalculation =
        raw > 100
          ? `= (${mainDone} + ${additionalDone}) / ${totalMain} = ${raw}% → 100% (Maks. 100%)`
          : `= (${mainDone} + ${additionalDone}) / ${totalMain} = ${scorePercent}%`;
    } else if (totalTasks > 0) {
      const raw = Math.round((totalDone / totalTasks) * 100);
      scorePercent = Math.min(100, Math.max(0, raw));
      formulaText = '=Total Task Done / Total Task (Maks. 100%)';
      formulaCalculation =
        raw > 100 ? `= ${totalDone} / ${totalTasks} = ${raw}% → 100%` : `= ${totalDone} / ${totalTasks} = ${scorePercent}%`;
    } else {
      scorePercent = 0;
      formulaText = 'Tidak ada tugas utama';
      formulaCalculation = '0%';
    }
  } else {
    const effectiveTotalMain = totalMain > 0 ? totalMain : totalTasks;
    const effectiveDone = totalMain > 0 ? mainDone : totalDone;
    if (effectiveTotalMain > 0) {
      const raw = Math.round((effectiveDone / effectiveTotalMain) * 100);
      scorePercent = Math.min(100, Math.max(0, raw));
      formulaText = '=Task Utama Done / Total Task Utama (Maks. 100%)';
      formulaCalculation =
        raw > 100
          ? `= ${effectiveDone} / ${effectiveTotalMain} = ${raw}% → 100%`
          : `= ${effectiveDone} / ${effectiveTotalMain} = ${scorePercent}%`;
    } else {
      scorePercent = 0;
      formulaText = 'Tidak ada tugas';
      formulaCalculation = '0%';
    }
  }

  return {
    scorePercent, totalMain, totalAdditional, mainDone, mainPending,
    additionalDone, additionalPending, totalDone, totalPending, totalTasks,
    formulaText, formulaCalculation,
  };
}

// ---------------------------------------------------------------------------
// Laporan tim / anggota (porting talTeamBuildReport, server.ts:602-680)
// ---------------------------------------------------------------------------

export interface TalReportTask {
  id: string;
  title: string;
  type: string;
  status: string;
  date: string;
  time?: string;
}

export interface TalReportSummary {
  total: number;
  finish: number;
  tasks: TalReportTask[];
}

export interface TalTimReportData {
  today: TalReportSummary;
  week: TalReportSummary;
  month: TalReportSummary;
  monthHidden: boolean;
  charts: {
    daily: { date: string; label: string; total: number; finish: number }[];
    weekly: { key: string; label: string; total: number; finish: number }[];
    monthly: { key: string; label: string; total: number; finish: number }[];
  };
  period: {
    today: string; weekStart: string; weekEnd: string;
    weekNumber: number; weekYear: number; month: number; year: number;
  };
}

export interface TalTaskLike {
  id: string;
  title: string;
  type: string;
  status: string;
  taskDate?: Date | string | null;
  taskTime?: string | null;
  weekNumber?: number | null;
  weekYear?: number | null;
  month?: number | null;
  year?: number | null;
  isAdditional?: boolean;
}

/** Petakan baris Prisma TalTask ke bentuk yang dipakai pembangun laporan. */
export function talMapReportTask(t: TalTaskLike): TalReportTask {
  return {
    id: t.id,
    title: t.title || '(Tanpa judul)',
    type: t.type,
    status: t.status,
    date: talDateKey(t.taskDate),
    time: t.taskTime || undefined,
  };
}

export function talTeamBuildReport(tasks: TalTaskLike[], now: Date): TalTimReportData {
  const { y, m, day } = talWibParts(now);
  const todayStr = talDateStr(y, m, day);
  const base = new Date(Date.UTC(y, m - 1, day));
  const dowMon0 = (base.getUTCDay() + 6) % 7;
  const monday = new Date(base);
  monday.setUTCDate(base.getUTCDate() - dowMon0);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const fmtD = (d: Date) => talDateStr(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  const weekStart = fmtD(monday);
  const weekEnd = fmtD(sunday);
  const cur = talIsoWeekOf(y, m, day);
  const isDone = (t: TalTaskLike) => t.status === 'done';
  const dateOf = (t: TalTaskLike) => talDateKey(t.taskDate);
  const inWeek = (t: TalTaskLike) =>
    (t.weekNumber === cur.week && t.weekYear === cur.year) ||
    (!!dateOf(t) && dateOf(t) >= weekStart && dateOf(t) <= weekEnd);
  const inMonth = (t: TalTaskLike) =>
    (t.month === m && t.year === y) ||
    (!!dateOf(t) && dateOf(t) >= `${y}-${pad2(m)}-01` && dateOf(t) <= `${y}-${pad2(m)}-31`);
  const byDateDesc = (a: TalTaskLike, b: TalTaskLike) =>
    dateOf(b).localeCompare(dateOf(a)) || String(a.taskTime || '').localeCompare(String(b.taskTime || ''));
  const summarize = (list: TalTaskLike[]): TalReportSummary => ({
    total: list.length,
    finish: list.filter(isDone).length,
    tasks: list.map(talMapReportTask),
  });

  const todayList = tasks.filter((t) => dateOf(t) === todayStr);
  const weekList = tasks.filter(inWeek);
  const monthList = tasks.filter(inMonth);

  const daily: TalTimReportData['charts']['daily'] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(base);
    d.setUTCDate(base.getUTCDate() - i);
    const ds = fmtD(d);
    const list = tasks.filter((t) => dateOf(t) === ds);
    daily.push({
      date: ds,
      label: `${d.getUTCDate()} ${TAL_MONTHS_SHORT_ID[d.getUTCMonth()]}`,
      total: list.length,
      finish: list.filter(isDone).length,
    });
  }
  const weekly: TalTimReportData['charts']['weekly'] = [];
  for (let i = 7; i >= 0; i--) {
    const mon = new Date(monday);
    mon.setUTCDate(monday.getUTCDate() - i * 7);
    const wk = talIsoWeekOf(mon.getUTCFullYear(), mon.getUTCMonth() + 1, mon.getUTCDate());
    const key = `${wk.year}-W${wk.week}`;
    const list = tasks.filter((t) => {
      if (t.weekNumber && t.weekYear) return `${t.weekYear}-W${t.weekNumber}` === key;
      if (dateOf(t)) {
        const [yy, mm, dd] = dateOf(t).split('-').map(Number);
        const w = talIsoWeekOf(yy, mm, dd);
        return `${w.year}-W${w.week}` === key;
      }
      return false;
    });
    weekly.push({ key, label: `Week ${wk.week}`, total: list.length, finish: list.filter(isDone).length });
  }
  const monthly: TalTimReportData['charts']['monthly'] = [];
  for (let i = 5; i >= 0; i--) {
    const mm = new Date(Date.UTC(y, m - 1, 1));
    mm.setUTCMonth(mm.getUTCMonth() - i);
    const my = mm.getUTCFullYear();
    const mo = mm.getUTCMonth() + 1;
    const list = tasks.filter((t) => {
      if (t.month && t.year) return t.month === mo && t.year === my;
      if (dateOf(t)) {
        const [yy, m2] = dateOf(t).split('-').map(Number);
        return yy === my && m2 === mo;
      }
      return false;
    });
    monthly.push({
      key: `${my}-${pad2(mo)}`,
      label: `${TAL_MONTHS_SHORT_ID[mo - 1]} ${my}`,
      total: list.length,
      finish: list.filter(isDone).length,
    });
  }

  const today = summarize([...todayList].sort(byDateDesc));
  const week = summarize([...weekList].sort(byDateDesc));
  const month = summarize([...monthList].sort(byDateDesc));
  return {
    today, week, month,
    monthHidden: month.total === 0,
    charts: { daily, weekly, monthly },
    period: { today: todayStr, weekStart, weekEnd, weekNumber: cur.week, weekYear: cur.year, month: m, year: y },
  };
}

/** Ambil semua task TAL organisasi lalu saring ke tugas milik/ditugaskan ke user. */
export async function talTasksOfUser(
  organizationId: string,
  user: { id: string; email: string },
): Promise<TalTaskLike[]> {
  const rows = await prisma.talTask.findMany({
    where: { organizationId },
    orderBy: { createdAt: 'desc' },
  });
  return rows.filter((t) => talTeamTaskOfUser(t, user));
}

// ---------------------------------------------------------------------------
// Audit log TAL (§1.14) — append-only, alasan wajib dari UI
// ---------------------------------------------------------------------------

export async function talWriteAuditLog(
  ctx: AuthContext,
  action: {
    actionType: string;
    actionTitle: string;
    reason: string;
    targetSummary?: string;
    affectedCount?: number;
    details?: Record<string, unknown>;
  },
): Promise<void> {
  await prisma.talAuditLog.create({
    data: {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      actionType: action.actionType,
      actionTitle: action.actionTitle,
      adminEmail: ctx.email || '',
      adminName: ctx.name || '',
      reason: action.reason || '',
      targetSummary: action.targetSummary || '',
      affectedCount: action.affectedCount || 0,
      details: (action.details || {}) as any,
    },
  });
}

/** Cek apakah rantai atasan baru akan membentuk siklus (set atasan). */
export async function talManagerWouldCycle(
  organizationId: string,
  userId: string,
  managerId: string,
): Promise<boolean> {
  const users = await talLoadOrgUsers(organizationId);
  const managerOf = new Map(users.map((u) => [u.id, u.managerId]));
  let cur: string | undefined = managerId;
  const seen = new Set<string>();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    if (cur === userId) return true;
    cur = managerOf.get(cur) || undefined;
  }
  return false;
}
