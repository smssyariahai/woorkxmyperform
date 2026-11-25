import { prisma } from '@/lib/db';
import { requireAuth, requireModularAccess } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { mapLockReport, mapTalTask } from '@/lib/tal/server';
import {
  getSundayFromWeekNumber,
  getWeekDetails,
  getWeeksInMonth,
} from '@/lib/tal/date';

export const dynamic = 'force-dynamic';

/**
 * GET /api/tal/rekap?year&month — rekap PRIBADI sebulan (bukan rekap tim/HR).
 * Agregasi server-side: total/selesai/persentase, per tipe, per kategori,
 * target vs realisasi (kategori result), rincian per minggu & per hari,
 * plus lock/report scope bulan itu.
 */
export async function GET(req: Request) {
  try {
    const ctx = await requireAuth();
    await requireModularAccess(ctx, 'tal', 'READ');
    const q = new URL(req.url).searchParams;
    const year = Number(q.get('year') ?? new Date().getFullYear());
    const month = Number(q.get('month') ?? new Date().getMonth() + 1);
    if (!Number.isFinite(year) || month < 1 || month > 12) {
      return apiErr('year/month tidak valid.', 400);
    }
    const monthStr = `${year}-${String(month).padStart(2, '0')}`;
    const firstDay = new Date(Date.UTC(year, month - 1, 1));
    const lastDay = new Date(Date.UTC(year, month, 0));

    const [monthlyTasks, weeklyTasks, dailyTasks, locks] = await Promise.all([
      prisma.talTask.findMany({
        where: { organizationId: ctx.organizationId, userId: ctx.userId, type: 'monthly', month, year },
      }),
      prisma.talTask.findMany({
        where: { organizationId: ctx.organizationId, userId: ctx.userId, type: 'weekly', month, year },
      }),
      prisma.talTask.findMany({
        where: {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          type: 'daily',
          taskDate: { gte: firstDay, lte: lastDay },
        },
      }),
      prisma.talLockReport.findMany({
        where: { organizationId: ctx.organizationId, userId: ctx.userId },
        orderBy: { scopeKey: 'asc' },
        take: 500,
      }),
    ]);

    const tasks = [...monthlyTasks, ...weeklyTasks, ...dailyTasks].map(mapTalTask);
    const monthLocks = locks
      .map(mapLockReport)
      .filter((l) => {
        if (l.scope === 'monthly') return l.scopeKey === monthStr;
        if (l.scope === 'daily') return l.scopeKey.startsWith(monthStr);
        if (l.scope === 'weekly') {
          const m = l.scopeKey.match(/(\d{4})-W(\d{1,2})/);
          if (!m) return false;
          const wd = getWeekDetails(getSundayFromWeekNumber(Number(m[1]), Number(m[2])));
          return wd.majorityMonth === month && Number(m[1]) === year;
        }
        return false;
      });

    const pct = (done: number, total: number) =>
      total > 0 ? Math.round((done / total) * 100) : 0;
    const summarize = (list: typeof tasks) => {
      const done = list.filter((t) => t.status === 'done').length;
      return { total: list.length, done, percent: pct(done, list.length) };
    };
    const byType: Record<string, { total: number; done: number; percent: number }> = {
      daily: summarize(tasks.filter((t) => t.type === 'daily')),
      weekly: summarize(tasks.filter((t) => t.type === 'weekly')),
      monthly: summarize(tasks.filter((t) => t.type === 'monthly')),
    };
    const byCategory: Record<string, { total: number; done: number }> = {
      result: { total: 0, done: 0 },
      non_result: { total: 0, done: 0 },
    };
    for (const t of tasks) {
      const c = byCategory[t.category] ?? (byCategory[t.category] = { total: 0, done: 0 });
      c.total++;
      if (t.status === 'done') c.done++;
    }
    const resultTasks = tasks.filter((t) => t.category === 'result');
    const targetTotal = resultTasks.reduce((a, t) => a + (t.targetValue ?? 0), 0);
    const actualTotal = resultTasks.reduce((a, t) => a + (t.actualValue ?? 0), 0);
    const achievementPercent =
      targetTotal > 0 ? Math.min(100, Math.round((actualTotal / targetTotal) * 100)) : 0;

    const weeks = getWeeksInMonth(year, month).map((w) => {
      const wt = tasks.filter(
        (t) => t.type === 'weekly' && t.weekNumber === w.weekNumber && t.weekYear === w.weekYear
      );
      const done = wt.filter((t) => t.status === 'done').length;
      const lock = monthLocks.find(
        (l) => l.scope === 'weekly' && l.scopeKey === `${w.weekYear}-W${String(w.weekNumber).padStart(2, '0')}`
      );
      return {
        weekNumber: w.weekNumber,
        weekYear: w.weekYear,
        total: wt.length,
        done,
        percent: pct(done, wt.length),
        planScore: lock?.planScore ?? null,
        reportScore: lock?.reportScore ?? null,
        isReported: !!lock?.isReported,
      };
    });

    const daily: Array<{ date: string; total: number; done: number; percent: number; isReported: boolean }> = [];
    const daysInMonth = new Date(year, month, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dt = tasks.filter((t) => t.type === 'daily' && t.date === dateStr);
      if (dt.length === 0) continue;
      const done = dt.filter((t) => t.status === 'done').length;
      const lock = monthLocks.find((l) => l.scope === 'daily' && l.scopeKey === dateStr);
      daily.push({ date: dateStr, total: dt.length, done, percent: pct(done, dt.length), isReported: !!lock?.isReported });
    }

    return apiOk({
      rekap: {
        year,
        month,
        totals: summarize(tasks),
        byType,
        byCategory,
        targetTotal,
        actualTotal,
        achievementPercent,
        weekly: weeks,
        daily,
        locks: monthLocks,
        tasks,
      },
    });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat rekap TAL.', 500);
  }
}
