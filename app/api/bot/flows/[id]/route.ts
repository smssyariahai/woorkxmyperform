import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** PATCH /api/bot/flows/:id — toggle aktif */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('BOT_MANAGE');
    const body = await req.json();
    const flow = await prisma.botFlow.findFirst({
      where: { id: params.id, organizationId: ctx.organizationId },
    });
    if (!flow) return apiErr('Flow tidak ditemukan.', 404);
    const updated = await prisma.botFlow.update({
      where: { id: flow.id },
      data: { isActive: body.isActive !== false },
    });
    return apiOk(updated);
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal mengubah flow.', 500);
  }
}

/** DELETE /api/bot/flows/:id */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('BOT_MANAGE');
    const flow = await prisma.botFlow.findFirst({
      where: { id: params.id, organizationId: ctx.organizationId },
    });
    if (!flow) return apiErr('Flow tidak ditemukan.', 404);
    await prisma.botFlow.delete({ where: { id: flow.id } });
    return apiOk({ deleted: true });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menghapus flow.', 500);
  }
}
