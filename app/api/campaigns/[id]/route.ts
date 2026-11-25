import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/** GET /api/campaigns/:id — detail campaign + daftar penerima */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requirePermission('BROADCAST_CREATE');
  const row = await prisma.campaign.findFirst({
    where: { id: params.id, organizationId: ctx.organizationId },
    include: {
      recipients: {
        include: { customer: { select: { name: true, phone: true } } },
        orderBy: { id: 'asc' },
      },
      _count: { select: { recipients: true } },
    },
  });
  if (!row) return apiErr('Campaign tidak ditemukan.', 404);
  // Campaign TIDAK punya relasi `createdBy` di tenant client — ambil dari
  // mirror User (Lapisan F).
  const createdByUser = await prisma.user.findUnique({
    where: { id: row.createdById },
    select: { name: true, email: true },
  });
  const c = { ...row, createdBy: createdByUser };
  return apiOk({
    ...c,
    hasImage: !!c.imagePath,
    imageUrl: c.imagePath ? `/api/campaigns/${c.id}/image` : null,
  });
}

/** DELETE /api/campaigns/:id — hapus campaign beserta penerimanya */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('BROADCAST_CREATE');
    const campaign = await prisma.campaign.findFirst({
      where: { id: params.id, organizationId: ctx.organizationId },
      select: { id: true, name: true, status: true },
    });
    if (!campaign) return apiErr('Campaign tidak ditemukan.', 404);
    if (campaign.status === 'SENDING') {
      return apiErr('Campaign sedang dikirim — tunggu hingga selesai sebelum dihapus.', 409);
    }

    await prisma.campaign.delete({ where: { id: campaign.id } });

    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'DELETE_CAMPAIGN',
      module: 'BROADCAST',
      description: `Menghapus campaign "${campaign.name}"`,
      ipAddress: getClientIp(req),
    });
    return apiOk({ id: campaign.id });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menghapus campaign.', 500);
  }
}
