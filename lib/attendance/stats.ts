// WOORK ATTENDANCE — agregasi statistik (dipakai dashboard + laporan).
// Dihitung batch: record/libur/cuti/jadwal dimuat sekali, lalu tiap
// pengguna × hari dihitung murni (tanpa query per hari). Alpha (absent)
// hanya dihitung untuk hari kerja yang SUDAH lewat (bukan hari ini / depan)
// dan TANPA membuat record ABSENT palsu.

import { prisma } from '../db';
import { addDaysToKey, dbDateKey } from '../daily/helpers';
import { todayKeyJakarta } from './http';
import { holidayDatesInRange, loadActiveSchedules, pickSchedule } from './schedule';
import { getSetting } from './service';
import { loadHrByEmail } from './serialize';

export interface ScopeMember {
  userId: string;
  name: string | null;
  email: string | null;
  departmentId: string | null;
  departmentName: string | null;
  position: string | null;
  departmentHr: string | null;
}

/** Anggota aktif organisasi (opsional dibatasi satu departemen). */
export async function loadScopeMembers(
  organizationId: string,
  departmentId?: string | null
): Promise<ScopeMember[]> {
  // Membership TIDAK punya relasi `user` di tenant client (dan `orderBy`
  // relasi juga tidak bisa) — user diambil terpisah, digabung, lalu
  // diurutkan per nama di JS (bentuk hasil sama).
  const memberRows = await prisma.membership.findMany({
    where: {
      organizationId,
      status: 'ACTIVE',
      ...(departmentId ? { departmentId } : {}),
    },
    include: { department: { select: { name: true } } },
  });
  const scopeUserIds = [...new Set(memberRows.map((m) => m.userId))];
  const scopeUsers = scopeUserIds.length
    ? await prisma.user.findMany({
        where: { id: { in: scopeUserIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const scopeUserById = new Map(scopeUsers.map((u) => [u.id, u]));
  const memberships = memberRows
    .map((m) => ({ ...m, user: scopeUserById.get(m.userId) ?? null }))
    .filter((m): m is typeof m & { user: { id: string; name: string; email: string } } => !!m.user)
    .sort((a, b) => a.user.name.localeCompare(b.user.name));
  const hrMap = await loadHrByEmail(
    organizationId,
    memberships.map((m) => m.user.email).filter((e): e is string => !!e)
  );
  return memberships.map((m) => {
    const hr = m.user.email ? hrMap.get(m.user.email) : undefined;
    return {
      userId: m.user.id,
      name: m.user.name,
      email: m.user.email,
      departmentId: m.departmentId,
      departmentName: m.department?.name ?? null,
      position: hr?.position ?? null,
      departmentHr: hr?.department ?? null,
    };
  });
}

export interface UserRangeStats extends ScopeMember {
  workDays: number;
  present: number;
  late: number;
  earlyLeave: number;
  incomplete: number;
  lateMinutes: number;
  earlyMinutes: number;
  overtimeMinutes: number;
  workMinutes: number;
  absent: number;
  leaveDays: number;
  holidayDays: number;
}

export interface DayStats {
  date: string;
  present: number;
  late: number;
  earlyLeave: number;
  incomplete: number;
  absent: number;
  leave: number;
  holiday: boolean;
  holidayName: string | null;
  workDays: number;
}

export interface RangeStats {
  users: UserRangeStats[];
  days: DayStats[];
  totals: {
    workDays: number;
    present: number;
    late: number;
    earlyLeave: number;
    incomplete: number;
    lateMinutes: number;
    earlyMinutes: number;
    overtimeMinutes: number;
    workMinutes: number;
    absent: number;
    leaveDays: number;
    holidayDays: number;
  };
}

/**
 * Statistik rentang untuk sekelompok anggota. Satu kali muat record, libur,
 * cuti, dan jadwal; selebihnya perhitungan murni.
 */
export async function computeRangeStats(
  organizationId: string,
  members: ScopeMember[],
  fromKey: string,
  toKey: string
): Promise<RangeStats> {
  const todayKey = todayKeyJakarta();
  const userIds = members.map((m) => m.userId);
  const [records, holidays, leaves, schedules, setting] = await Promise.all([
    userIds.length === 0
      ? Promise.resolve([])
      : prisma.attendanceRecord.findMany({
          where: {
            organizationId,
            userId: { in: userIds },
            date: { gte: new Date(`${fromKey}T00:00:00Z`), lte: new Date(`${toKey}T00:00:00Z`) },
          },
          select: { userId: true, date: true, status: true, lateMinutes: true, earlyMinutes: true, overtimeMinutes: true, workMinutes: true },
        }),
    holidayDatesInRange(organizationId, fromKey, toKey),
    userIds.length === 0
      ? Promise.resolve([])
      : prisma.talCuti.findMany({
          where: {
            organizationId,
            userId: { in: userIds },
            cutiDate: { gte: new Date(`${fromKey}T00:00:00Z`), lte: new Date(`${toKey}T00:00:00Z`) },
          },
          select: { userId: true, cutiDate: true },
        }),
    loadActiveSchedules(organizationId),
    getSetting(organizationId),
  ]);

  const recordMap = new Map<string, (typeof records)[number]>();
  for (const r of records) recordMap.set(`${r.userId}|${dbDateKey(r.date)}`, r);
  const leaveMap = new Map<string, Set<string>>();
  for (const c of leaves) {
    const set = leaveMap.get(c.userId) ?? new Set<string>();
    set.add(dbDateKey(c.cutiDate)!);
    leaveMap.set(c.userId, set);
  }
  const deptByUser = new Map(members.map((m) => [m.userId, m.departmentId]));

  // Hari kerja per pengguna per hari (jadwal dimuat sekali).
  const workdayMap = new Map<string, boolean>(); // `${userId}|${dateKey}` -> isWorkDay
  const days: DayStats[] = [];
  let cur = fromKey;
  while (cur <= toKey) {
    const holiday = holidays.get(cur);
    const isHoliday = !!holiday;
    const dayStat: DayStats = {
      date: cur,
      present: 0,
      late: 0,
      earlyLeave: 0,
      incomplete: 0,
      absent: 0,
      leave: 0,
      holiday: isHoliday,
      holidayName: holiday ?? null,
      workDays: 0,
    };
    for (const m of members) {
      const onLeave = leaveMap.get(m.userId)?.has(cur) ?? false;
      let isWorkDay = false;
      if (!isHoliday && !onLeave) {
        const resolved = pickSchedule(schedules, m.userId, deptByUser.get(m.userId) ?? null, cur);
        if (resolved) {
          const dow = new Date(`${cur}T00:00:00Z`).getUTCDay();
          isWorkDay = !!resolved.schedule.daysOfWeek[String(dow)];
        } else {
          const dow = new Date(`${cur}T00:00:00Z`).getUTCDay();
          isWorkDay = setting.workDays.includes(dow);
        }
      }
      workdayMap.set(`${m.userId}|${cur}`, isWorkDay);
      if (isWorkDay) dayStat.workDays += 1;
      if (onLeave) dayStat.leave += 1;
      const rec = recordMap.get(`${m.userId}|${cur}`);
      if (rec) {
        if (rec.status === 'PRESENT') dayStat.present += 1;
        else if (rec.status === 'LATE') { dayStat.present += 1; dayStat.late += 1; }
        else if (rec.status === 'EARLY_LEAVE') { dayStat.present += 1; dayStat.earlyLeave += 1; }
        else if (rec.status === 'INCOMPLETE') dayStat.incomplete += 1;
      } else if (isWorkDay && !onLeave && !isHoliday && cur < todayKey) {
        dayStat.absent += 1;
      }
    }
    days.push(dayStat);
    cur = addDaysToKey(cur, 1);
  }

  const users: UserRangeStats[] = members.map((m) => {
    const stat: UserRangeStats = {
      ...m,
      workDays: 0,
      present: 0,
      late: 0,
      earlyLeave: 0,
      incomplete: 0,
      lateMinutes: 0,
      earlyMinutes: 0,
      overtimeMinutes: 0,
      workMinutes: 0,
      absent: 0,
      leaveDays: 0,
      holidayDays: 0,
    };
    let d = fromKey;
    while (d <= toKey) {
      const isWorkDay = workdayMap.get(`${m.userId}|${d}`) ?? false;
      const onLeave = leaveMap.get(m.userId)?.has(d) ?? false;
      const isHoliday = holidays.has(d);
      if (isWorkDay) stat.workDays += 1;
      if (onLeave) stat.leaveDays += 1;
      if (isHoliday) stat.holidayDays += 1;
      const rec = recordMap.get(`${m.userId}|${d}`);
      if (rec) {
        if (rec.status === 'PRESENT') stat.present += 1;
        else if (rec.status === 'LATE') { stat.present += 1; stat.late += 1; }
        else if (rec.status === 'EARLY_LEAVE') { stat.present += 1; stat.earlyLeave += 1; }
        else if (rec.status === 'INCOMPLETE') stat.incomplete += 1;
        stat.lateMinutes += rec.lateMinutes;
        stat.earlyMinutes += rec.earlyMinutes;
        stat.overtimeMinutes += rec.overtimeMinutes;
        stat.workMinutes += rec.workMinutes;
      } else if (isWorkDay && !onLeave && !isHoliday && d < todayKey) {
        stat.absent += 1;
      }
      d = addDaysToKey(d, 1);
    }
    return stat;
  });

  const totals = users.reduce(
    (acc, u) => ({
      workDays: acc.workDays + u.workDays,
      present: acc.present + u.present,
      late: acc.late + u.late,
      earlyLeave: acc.earlyLeave + u.earlyLeave,
      incomplete: acc.incomplete + u.incomplete,
      lateMinutes: acc.lateMinutes + u.lateMinutes,
      earlyMinutes: acc.earlyMinutes + u.earlyMinutes,
      overtimeMinutes: acc.overtimeMinutes + u.overtimeMinutes,
      workMinutes: acc.workMinutes + u.workMinutes,
      absent: acc.absent + u.absent,
      leaveDays: acc.leaveDays + u.leaveDays,
      holidayDays: acc.holidayDays + u.holidayDays,
    }),
    { workDays: 0, present: 0, late: 0, earlyLeave: 0, incomplete: 0, lateMinutes: 0, earlyMinutes: 0, overtimeMinutes: 0, workMinutes: 0, absent: 0, leaveDays: 0, holidayDays: 0 }
  );

  return { users, days, totals };
}