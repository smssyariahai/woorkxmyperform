// GET /api/daily/overview — 6 kartu ringkasan, dihitung dari data NYATA hari ini.
// Pending Approvals = pengajuan agent Kantor (model Approval) yang menunggu
// review — hanya dihitung bila user punya APPROVALS_REVIEW; selain itu 0.
import { prisma } from '@/lib/db';
import { requirePermission, getUserPermissions } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import {
  getUserTimezone,
  dateKeyInTz,
  dayBounds,
  addDaysToKey,
} from '@/lib/daily/helpers';
import { loadDaySchedule } from '@/lib/daily/schedule';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const ctx = await requirePermission('DAILY_VIEW', req);
    const tz = await getUserTimezone(ctx.organizationId, ctx.userId);
    const now = new Date();
    const todayKey = dateKeyInTz(now, tz);
    const { start: dayStart, end: dayEnd } = dayBounds(todayKey, tz);
    const tomorrowKey = addDaysToKey(todayKey, 1);
    const { end: tomorrowEnd } = dayBounds(tomorrowKey, tz);

    const [myTasksToday, completedToday, overdue, upcomingMeetings] = await Promise.all([
      prisma.talTask.count({
        where: {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          taskDate: { equals: new Date(`${todayKey}T00:00:00.000Z`) },
          status: { not: 'done' },
        },
      }),
      // "Selesai hari ini" = status done + terakhir diubah hari ini
      // (TalTask tidak punya kolom completedAt — ini proxy terbaik).
      prisma.talTask.count({
        where: {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          status: 'done',
          updatedAt: { gte: dayStart, lt: dayEnd },
        },
      }),
      prisma.talTask.count({
        where: {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          taskDate: { lt: new Date(`${todayKey}T00:00:00.000Z`) },
          status: { not: 'done' },
        },
      }),
      prisma.meeting.count({
        where: {
          organizationId: ctx.organizationId,
          status: 'SCHEDULED',
          startsAt: { gte: now, lt: tomorrowEnd },
          OR: [
            { hostId: ctx.userId },
            { participants: { some: { userId: ctx.userId } } },
          ],
        },
      }),
    ]);

    // Event kalender hari ini yang bisa dilihat user (tanpa yang dibatalkan).
    const schedule = await loadDaySchedule({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      dayKey: todayKey,
      tz,
    });
    const todaysEvents = schedule.filter((i) => i.status !== 'CANCELLED').length;

    // Persetujuan agent Kantor yang menunggu — hanya untuk yang berhak review.
    const perms = await getUserPermissions(ctx);
    let pendingApprovals = 0;
    if (perms.has('*') || perms.has('APPROVALS_REVIEW')) {
      pendingApprovals = await prisma.approval.count({
        where: { organizationId: ctx.organizationId, status: 'PENDING' },
      });
    }

    return apiOk({
      date: todayKey,
      timezone: tz,
      cards: [
        { key: 'myTasks', label: 'Tugas Saya', value: myTasksToday, href: '/daily#tasks' },
        { key: 'completedTasks', label: 'Tugas Selesai', value: completedToday, href: '/daily#tasks' },
        { key: 'upcomingMeetings', label: 'Meeting Berikutnya', value: upcomingMeetings, href: '/daily#meetings' },
        { key: 'overdueTasks', label: 'Tugas Terlambat', value: overdue, href: '/daily#tasks' },
        { key: 'todaysEvents', label: 'Agenda Hari Ini', value: todaysEvents, href: '/kalender' },
        { key: 'pendingApprovals', label: 'Menunggu Persetujuan', value: pendingApprovals, href: '/kantor' },
      ],
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('[daily/overview GET]', e);
    return apiErr('Gagal memuat ringkasan harian.', 500);
  }
}
