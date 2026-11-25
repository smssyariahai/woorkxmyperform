import { prisma } from '@/lib/db';
import { requireAuth, requireModularAccess } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** DELETE /api/emas/simulations/[id] — hapus simulasi milik user. */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireAuth();
    await requireModularAccess(ctx, 'emas', 'WRITE');
    const row = await prisma.simulation.findFirst({
      where: { id: params.id, organizationId: ctx.organizationId, userId: ctx.userId },
      select: { id: true },
    });
    if (!row) return apiErr('Simulasi tidak ditemukan.', 404);
    await prisma.simulation.delete({ where: { id: row.id } });
    return apiOk({ success: true });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menghapus simulasi.', 500);
  }
}
