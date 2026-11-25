// GET /api/daily/summary?date=YYYY-MM-DD — ringkasan akhir hari.
// "Selesai hari itu" untuk tugas dihitung dari updatedAt (TalTask tidak punya
// kolom completedAt — dicatat sebagai keterbatasan di laporan).
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import {
  getUserTimezone,
  dateKeyInTz,
  dayBounds,
  serializeTask,
} from '@/lib/daily/helpers';
import { loadDaySchedule } from '@/lib/daily/schedule';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const ctx = await requirePermission('DAILY_VIEW', req);
    const tz = await getUserTimezone(ctx.organizationId, ctx.userId);
    const sp = new URL(req.url).searchParams;
    const date = sp.get('date')?.trim() || dateKeyInTz(new Date(), tz);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return apiErr('Parameter date harus YYYY-MM-DD.', 400);
    }
    const { start, end } = dayBounds(date, tz);
    const todayKey = dateKeyInTz(new Date(), tz);

    const [tasksDone, tasksPending, meetings] = await Promise.all([
      prisma.talTask.findMany({
        where: {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          status: 'done',
          updatedAt: { gte: start, lt: end },
        },
        orderBy: { updatedAt: 'desc' },
        take: 100,
      }),
      prisma.talTask.findMany({
        where: {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          status: { not: 'done' },
          taskDate: { equals: new Date(`${date}T00:00:00.000Z`) },
        },
        orderBy: { taskDate: 'asc' },
        take: 100,
      }),
      prisma.meeting.findMany({
        where: {
          organizationId: ctx.organizationId,
          startsAt: { gte: start, lt: end },
          OR: [
            { hostId: ctx.userId },
            { participants: { some: { userId: ctx.userId } } },
          ],
        },
        select: { id: true, title: true, startsAt: true, endsAt: true, status: true },
        orderBy: { startsAt: 'asc' },
      }),
    ]);

    const schedule = await loadDaySchedule({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      dayKey: date,
      tz,
    });
    const agendaDone = schedule.filter(
      (i) => i.status === 'COMPLETED' || i.timeStatus === 'completed'
    ).length;
    const agendaTotal = schedule.filter((i) => i.status !== 'CANCELLED').length;
    const missedDeadlines = tasksPending.filter((t) => {
      const k = t.taskDate ? new Date(t.taskDate).toISOString().slice(0, 10) : null;
      return k && k < todayKey;
    }).length;

    return apiOk({
      date,
      timezone: tz,
      tasksCompleted: tasksDone.map((t) => serializeTask(t, date)),
      tasksPending: tasksPending.map((t) => serializeTask(t, date)),
      meetingsAttended: meetings.map((m) => ({
        id: m.id,
        title: m.title,
        startsAt: m.startsAt.toISOString(),
        endsAt: m.endsAt ? m.endsAt.toISOString() : null,
        status: m.status,
        sourceUrl: `/meet/${m.id}`,
      })),
      agendaDone,
      agendaTotal,
      missedDeadlines,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('[daily/summary GET]', e);
    return apiErr('Gagal memuat ringkasan akhir hari.', 500);
  }
}
