import { prisma } from '@/lib/db';
import { requireAuth, requireModularAccess } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { isTaskPlanLocked } from '@/lib/tal/server';

export const dynamic = 'force-dynamic';

/** POST /api/tal/tasks/batch-delete — hapus banyak task milik sendiri. */
export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    await requireModularAccess(ctx, 'tal', 'WRITE');
    const body = await req.json().catch(() => ({}));
    const ids: string[] = Array.isArray(body.ids) ? body.ids.filter((x: unknown) => typeof x === 'string') : [];
    if (ids.length === 0) return apiErr('Tidak ada task yang dipilih.', 400);
    const rows = await prisma.talTask.findMany({
      where: { organizationId: ctx.organizationId, userId: ctx.userId, id: { in: ids } },
    });
    for (const row of rows) {
      if (await isTaskPlanLocked(ctx.organizationId, ctx.userId, row)) {
        return apiErr('Salah satu task berada di periode yang rencananya sudah terkunci.', 403);
      }
    }
    await prisma.talTask.deleteMany({
      where: { organizationId: ctx.organizationId, userId: ctx.userId, id: { in: ids } },
    });
    return apiOk({ ok: true, deleted: rows.length });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menghapus task TAL.', 500);
  }
}
