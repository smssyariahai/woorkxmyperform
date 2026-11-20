import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { copyTasksToTarget, mapTalTask } from '@/lib/tal/server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/tal/tasks/copy — salin task milik sendiri ke periode/tanggal lain.
 * Body: { ids[], target: { targetType, targetDate?, targetWeekNumber?,
 * targetWeekYear?, targetMonth?, targetYear? } }.
 */
export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    const body = await req.json().catch(() => ({}));
    const ids: string[] = Array.isArray(body.ids) ? body.ids.filter((x: unknown) => typeof x === 'string') : [];
    const target = body.target ?? {};
    if (ids.length === 0) return apiErr('Tidak ada task yang dipilih.', 400);
    if (!['daily', 'weekly', 'monthly'].includes(target.targetType)) {
      return apiErr('targetType harus daily, weekly, atau monthly.', 400);
    }
    const rows = await prisma.talTask.findMany({
      where: { organizationId: ctx.organizationId, userId: ctx.userId, id: { in: ids } },
    });
    if (rows.length === 0) return apiErr('Task tidak ditemukan.', 404);
    try {
      const created = await copyTasksToTarget(ctx, rows.map(mapTalTask), {
        targetType: target.targetType,
        targetDate: target.targetDate,
        targetWeekNumber: target.targetWeekNumber,
        targetWeekYear: target.targetWeekYear,
        targetMonth: target.targetMonth,
        targetYear: target.targetYear,
      });
      return apiOk({ tasks: created, count: created.length });
    } catch (err: any) {
      return apiErr(err?.message ?? 'Gagal menyalin task TAL.', 400);
    }
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menyalin task TAL.', 500);
  }
}
