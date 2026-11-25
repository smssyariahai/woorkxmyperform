// GET /api/daily/priorities — pengelompokan tugas saya (belum selesai):
// Must Do Today, High Priority, Upcoming, Overdue, Waiting/Blocked.
// Hanya pengelompokan tampilan — TIDAK mengubah prioritas resmi TalTask.
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import {
  getUserTimezone,
  dateKeyInTz,
  addDaysToKey,
  serializeTask,
  isTaskBlocked,
} from '@/lib/daily/helpers';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const ctx = await requirePermission('DAILY_VIEW', req);
    const tz = await getUserTimezone(ctx.organizationId, ctx.userId);
    const todayKey = dateKeyInTz(new Date(), tz);

    const rows = await prisma.talTask.findMany({
      where: {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        status: { not: 'done' },
      },
      orderBy: [{ taskDate: 'asc' }, { createdAt: 'desc' }],
      take: 500,
    });

    const ser = rows.map((r) => serializeTask(r, todayKey));
    const byId = new Map(ser.map((t) => [t.id, t]));
    const pick = (ids: string[]) => ids.map((id) => byId.get(id)!).filter(Boolean);

    const mustDoToday: string[] = [];
    const highPriority: string[] = [];
    const upcoming: string[] = [];
    const overdue: string[] = [];
    const waitingBlocked: string[] = [];
    for (const t of ser) {
      if (t.taskDate === todayKey) mustDoToday.push(t.id);
      if (t.priority === 'high') highPriority.push(t.id);
      if (t.taskDate && t.taskDate > todayKey && t.taskDate <= addDaysToKey(todayKey, 7)) upcoming.push(t.id);
      if (t.isOverdue) overdue.push(t.id);
      if (t.status === 'pending' || t.isBlocked) waitingBlocked.push(t.id);
    }

    return apiOk({
      today: todayKey,
      timezone: tz,
      groups: [
        {
          key: 'mustDoToday',
          label: 'Must Do Today',
          reason: 'Jatuh tempo hari ini.',
          tasks: pick(mustDoToday),
        },
        {
          key: 'highPriority',
          label: 'High Priority',
          reason: 'Prioritas tinggi (atau Urgent bila jatuh tempo hari ini/lewat).',
          tasks: pick(highPriority),
        },
        {
          key: 'upcoming',
          label: 'Upcoming',
          reason: 'Jatuh tempo dalam 7 hari ke depan.',
          tasks: pick(upcoming),
        },
        {
          key: 'overdue',
          label: 'Overdue',
          reason: 'Sudah melewati deadline dan belum selesai.',
          tasks: pick(overdue),
        },
        {
          key: 'waitingBlocked',
          label: 'Waiting / Blocked',
          reason: 'Menunggu persetujuan atau ada blocker yang dilaporkan.',
          tasks: pick(waitingBlocked),
        },
      ],
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('[daily/priorities GET]', e);
    return apiErr('Gagal memuat prioritas.', 500);
  }
}
