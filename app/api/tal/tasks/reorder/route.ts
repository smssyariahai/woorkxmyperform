import { prisma } from '@/lib/db';
import { requireAuth, requireModularAccess } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** POST /api/tal/tasks/reorder — simpan urutan (orderNo) task milik sendiri. */
export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    await requireModularAccess(ctx, 'tal', 'WRITE');
    const body = await req.json().catch(() => ({}));
    const ordered: Array<{ id: string; order: number }> = Array.isArray(body.ordered)
      ? body.ordered.filter((x: any) => typeof x?.id === 'string' && typeof x?.order === 'number')
      : [];
    if (ordered.length === 0) return apiErr('Tidak ada urutan yang dikirim.', 400);
    const rows = await prisma.talTask.findMany({
      where: {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        id: { in: ordered.map((o) => o.id) },
      },
      select: { id: true },
    });
    const ownIds = new Set(rows.map((r) => r.id));
    for (const o of ordered) {
      if (!ownIds.has(o.id)) continue;
      await prisma.talTask.update({ where: { id: o.id }, data: { orderNo: o.order } });
    }
    return apiOk({ ok: true });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menyimpan urutan task TAL.', 500);
  }
}
