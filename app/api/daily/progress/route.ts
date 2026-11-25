// GET /api/daily/progress?range=today|week|month — progres kerja.
// Task Completion dan Calendar Activity Completion DIPISAH (jangan campur
// jumlah meeting dengan jumlah task selesai).
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import {
  getUserTimezone,
  dateKeyInTz,
  addDaysToKey,
} from '@/lib/daily/helpers';
import { loadDaySchedule } from '@/lib/daily/schedule';

export const dynamic = 'force-dynamic';

const RANGES = ['today', 'week', 'month'] as const;

function weekBounds(todayKey: string): { from: Date; to: Date; fromKey: string; toKey: string } {
  const [y, m, d] = todayKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay(); // 0=Min .. 6=Sab
  const shiftToMonday = (dow + 6) % 7;
  const fromKey = addDaysToKey(todayKey, -shiftToMonday);
  const toKey = addDaysToKey(fromKey, 6);
  const from = new Date(`${fromKey}T00:00:00.000Z`);
  const to = new Date(`${addDaysToKey(toKey, 1)}T00:00:00.000Z`);
  return { from, to, fromKey, toKey };
}

export async function GET(req: Request) {
  try {
    const ctx = await requirePermission('DAILY_VIEW', req);
    const tz = await getUserTimezone(ctx.organizationId, ctx.userId);
    const todayKey = dateKeyInTz(new Date(), tz);
    const sp = new URL(req.url).searchParams;
    const range = sp.get('range') ?? 'today';
    if (!(RANGES as readonly string[]).includes(range)) {
      return apiErr(`Range tidak valid: ${range}.`, 400);
    }

    let fromKey = todayKey;
    let toKey = todayKey;
    if (range === 'week') {
      const w = weekBounds(todayKey);
      fromKey = w.fromKey;
      toKey = w.toKey;
    } else if (range === 'month') {
      fromKey = todayKey.slice(0, 8) + '01';
      const [y, mo] = todayKey.split('-').map(Number);
      const lastDay = new Date(Date.UTC(y, mo, 0)).getUTCDate();
      toKey = `${todayKey.slice(0, 8)}${String(lastDay).padStart(2, '0')}`;
    }
    const fromDate = new Date(`${fromKey}T00:00:00.000Z`);
    const toDate = new Date(`${addDaysToKey(toKey, 1)}T00:00:00.000Z`);

    const [tasks, overdueCount] = await Promise.all([
      prisma.talTask.findMany({
        where: {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          taskDate: { gte: fromDate, lt: toDate },
        },
        select: { status: true, taskDate: true },
      }),
      // Terlambat = tanggal lewat & belum selesai (di luar rentang pun dihitung).
      prisma.talTask.count({
        where: {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          taskDate: { lt: new Date(`${todayKey}T00:00:00.000Z`) },
          status: { not: 'done' },
        },
      }),
    ]);

    const total = tasks.length;
    const completed = tasks.filter((t) => t.status === 'done').length;
    const inProgress = tasks.filter((t) => t.status === 'on_progress').length;
    const todo = tasks.filter((t) => t.status === 'todo').length;
    const taskPercent = total > 0 ? Math.round((completed / total) * 100) : 0;

    // Kalender: hitung event per hari dalam rentang (pakai loader jadwal agar
    // visibilitas + recurring konsisten). Dibatasi 31 hari agar tidak berat.
    let calTotal = 0;
    let calCompleted = 0;
    const dayCount =
      Math.round((toDate.getTime() - fromDate.getTime()) / (24 * 3600 * 1000));
    const cappedDays = Math.min(dayCount, 31);
    const dayItems = await Promise.all(
      Array.from({ length: cappedDays }, (_, i) =>
        loadDaySchedule({
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          dayKey: addDaysToKey(fromKey, i),
          tz,
        })
      )
    );
    for (const items of dayItems) {
      for (const it of items) {
        if (it.status === 'CANCELLED') continue;
        calTotal++;
        if (it.status === 'COMPLETED' || it.timeStatus === 'completed') calCompleted++;
      }
    }
    const calScheduled = calTotal - calCompleted;
    const calPercent = calTotal > 0 ? Math.round((calCompleted / calTotal) * 100) : 0;

    return apiOk({
      range,
      from: fromKey,
      to: toKey,
      timezone: tz,
      task: { total, completed, inProgress, todo, overdue: overdueCount, percent: taskPercent },
      calendar: { total: calTotal, completed: calCompleted, scheduled: calScheduled, percent: calPercent },
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('[daily/progress GET]', e);
    return apiErr('Gagal memuat progres harian.', 500);
  }
}
