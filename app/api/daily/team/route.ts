// GET /api/daily/team — Team Workspace (DAILY_MANAGE).
// Manager melihat anggota departemennya sendiri. Bila tidak punya departemen
// atau bukan manager → {available:false} (bukan error).
// Privasi: event PRIVATE anggota tidak tampil; alasan cuti tidak tampil.
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import {
  getUserTimezone,
  dateKeyInTz,
  addDaysToKey,
  getMyDepartmentId,
} from '@/lib/daily/helpers';
import { loadTeamDaySchedule } from '@/lib/daily/schedule';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const ctx = await requirePermission('DAILY_MANAGE', req);
    const tz = await getUserTimezone(ctx.organizationId, ctx.userId);
    const now = new Date();
    const todayKey = dateKeyInTz(now, tz);

    const departmentId = await getMyDepartmentId(ctx.organizationId, ctx.userId);
    if (!departmentId) {
      return apiOk({
        available: false,
        reason: 'Anda belum terdaftar di departemen mana pun, sehingga Team Workspace tidak tersedia.',
      });
    }

    // Membership TIDAK punya relasi `user` di tenant client (dan `orderBy`
    // relasi juga tidak bisa) — user diambil terpisah, digabung, lalu
    // diurutkan per nama di JS (bentuk hasil sama).
    const memberRows = await prisma.membership.findMany({
      where: { organizationId: ctx.organizationId, departmentId, status: 'ACTIVE' },
      include: { department: { select: { id: true, name: true } } },
    });
    const teamUserIds = [...new Set(memberRows.map((m) => m.userId))];
    const teamUsers = teamUserIds.length
      ? await prisma.user.findMany({
          where: { id: { in: teamUserIds } },
          select: { id: true, name: true, email: true },
        })
      : [];
    const teamUserById = new Map(teamUsers.map((u) => [u.id, u]));
    const memberships = memberRows
      .map((m) => ({ ...m, user: teamUserById.get(m.userId) ?? null }))
      .filter((m): m is typeof m & { user: { id: string; name: string; email: string } } => !!m.user)
      .sort((a, b) => a.user.name.localeCompare(b.user.name));
    const members = memberships.map((m) => ({
      userId: m.user.id,
      name: m.user.name,
      email: m.user.email,
      jobTitle: m.jobTitle ?? null,
    }));
    const memberIds = members.map((m) => m.userId);
    const departmentName = memberships[0]?.department?.name ?? 'Tim Saya';

    const [yy, mm] = todayKey.split('-').map(Number);
    const monthStart = new Date(Date.UTC(yy, mm - 1, 1));
    const monthEnd = new Date(Date.UTC(yy, mm, 1));
    const todayDate = new Date(`${todayKey}T00:00:00.000Z`);
    const in7Date = new Date(`${addDaysToKey(todayKey, 7)}T00:00:00.000Z`);

    const [monthTasks, overdueTasks, meetingsWeek, pendingApprovals, cutiToday, meetingsNow, eventsNow] =
      await Promise.all([
        prisma.talTask.findMany({
          where: {
            organizationId: ctx.organizationId,
            userId: { in: memberIds },
            taskDate: { gte: monthStart, lt: monthEnd },
          },
          select: { userId: true, status: true },
        }),
        prisma.talTask.findMany({
          where: {
            organizationId: ctx.organizationId,
            userId: { in: memberIds },
            taskDate: { lt: todayDate },
            status: { not: 'done' },
          },
          select: { userId: true },
        }),
        prisma.meeting.findMany({
          where: {
            organizationId: ctx.organizationId,
            status: 'SCHEDULED',
            startsAt: { gte: now, lte: in7Date },
            OR: [
              { hostId: { in: memberIds } },
              { participants: { some: { userId: { in: memberIds } } } },
            ],
          },
          select: { id: true, hostId: true, participants: { select: { userId: true } } },
        }),
        prisma.approval.count({
          where: { organizationId: ctx.organizationId, status: 'PENDING' },
        }),
        prisma.talCuti.findMany({
          where: { organizationId: ctx.organizationId, userId: { in: memberIds }, cutiDate: todayDate },
          select: { userId: true },
        }),
        prisma.meeting.findMany({
          where: {
            organizationId: ctx.organizationId,
            status: { in: ['SCHEDULED', 'ONGOING'] },
            startsAt: { lte: now },
            OR: [
              { endsAt: { gte: now } },
              { endsAt: null, startsAt: { gte: new Date(now.getTime() - 2 * 3600 * 1000) } },
            ],
            AND: [
              {
                OR: [
                  { hostId: { in: memberIds } },
                  { participants: { some: { userId: { in: memberIds } } } },
                ],
              },
            ],
          },
          select: { id: true, hostId: true, participants: { select: { userId: true } } },
        }),
        prisma.calendarEvent.findMany({
          where: {
            organizationId: ctx.organizationId,
            status: 'SCHEDULED',
            isAllDay: false,
            startAt: { lte: now },
            endAt: { gte: now },
            OR: [
              { createdById: { in: memberIds } },
              { attendees: { some: { userId: { in: memberIds } } } },
            ],
          },
          select: { id: true, createdById: true, attendees: { select: { userId: true } } },
        }),
      ]);

    const activeTasks = monthTasks.filter((t) => t.status !== 'done').length;
    const completedTasks = monthTasks.filter((t) => t.status === 'done').length;

    // Team Schedule hari ini (event COMPANY/TEAM + meeting; PRIVATE disaring).
    const teamSchedule = await loadTeamDaySchedule(
      ctx.organizationId,
      ctx.userId,
      memberIds,
      todayKey,
      tz
    );

    // Progres per anggota (bulan berjalan).
    const overdueByUser = new Map<string, number>();
    for (const t of overdueTasks) {
      overdueByUser.set(t.userId, (overdueByUser.get(t.userId) ?? 0) + 1);
    }
    const taskProgress = members.map((m) => {
      const mine = monthTasks.filter((t) => t.userId === m.userId);
      const done = mine.filter((t) => t.status === 'done').length;
      const active = mine.filter((t) => t.status !== 'done').length;
      const overdue = overdueByUser.get(m.userId) ?? 0;
      const total = mine.length;
      return {
        userId: m.userId,
        name: m.name,
        email: m.email,
        jobTitle: m.jobTitle,
        active,
        completed: done,
        overdue,
        percent: total > 0 ? Math.round((done / total) * 100) : 0,
      };
    });

    // Ketersediaan anggota (tanpa alasan cuti, tanpa judul event).
    const onLeaveIds = new Set(cutiToday.map((c) => c.userId));
    const inMeetingIds = new Set<string>();
    for (const mt of meetingsNow) {
      inMeetingIds.add(mt.hostId);
      for (const p of mt.participants) if (p.userId) inMeetingIds.add(p.userId);
    }
    const busyIds = new Set<string>();
    for (const ev of eventsNow) {
      busyIds.add(ev.createdById);
      for (const a of ev.attendees) busyIds.add(a.userId);
    }
    const hour = Number(
      new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, hour: '2-digit' }).format(now)
    ) % 24;
    const weekdayShort = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(now);
    const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const dow = dowMap[weekdayShort] ?? 1;
    const isWorkingHours = dow >= 1 && dow <= 5 && hour >= 8 && hour < 17;

    const availability = members.map((m) => {
      let status: 'On Leave' | 'In Meeting' | 'Busy' | 'Available' | 'Off Hours' = isWorkingHours
        ? 'Available'
        : 'Off Hours';
      if (onLeaveIds.has(m.userId)) status = 'On Leave';
      else if (inMeetingIds.has(m.userId)) status = 'In Meeting';
      else if (busyIds.has(m.userId)) status = 'Busy';
      return { userId: m.userId, name: m.name, status };
    });

    return apiOk({
      available: true,
      departmentId,
      departmentName,
      today: todayKey,
      timezone: tz,
      overview: {
        totalMembers: members.length,
        activeTasks,
        completedTasks,
        overdueTasks: overdueTasks.length,
        scheduledMeetings: meetingsWeek.length,
        pendingApprovals,
      },
      members,
      schedule: teamSchedule,
      taskProgress,
      availability,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('[daily/team GET]', e);
    return apiErr('Gagal memuat Team Workspace.', 500);
  }
}
