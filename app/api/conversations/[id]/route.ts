import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/** GET /api/conversations/:id — detail + pesan */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('INBOX_VIEW');
    const conv = await prisma.conversation.findFirst({
      where: { id: params.id, organizationId: ctx.organizationId },
      include: {
        customer: { include: { tags: { include: { tag: true } } } },
        assignee: { select: { id: true, name: true } },
        channel: true,
        messages: {
          include: { sender: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'asc' },
          take: 500,
        },
      },
    });
    if (!conv) return apiErr('Percakapan tidak ditemukan.', 404);

    // tandai dibaca
    if (conv.customer.unreadCount > 0) {
      await prisma.customer.update({
        where: { id: conv.customerId },
        data: { unreadCount: 0 },
      });
    }

    // ratakan tags: [{tag}] -> [{id,name,color}]
    const { tags, ...customerRest } = conv.customer as any;
    return apiOk({
      ...conv,
      customer: { ...customerRest, tags: (tags ?? []).map((t: any) => t.tag) },
    });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat percakapan.', 500);
  }
}

/** PATCH /api/conversations/:id — ubah status / botEnabled */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('INBOX_REPLY');
    const body = await req.json().catch(() => ({}));
    const data: { status?: string; botEnabled?: boolean } = {};

    if (body?.status !== undefined) {
      const status = String(body.status).toUpperCase();
      if (!['NEW', 'IN_PROGRESS', 'RESOLVED'].includes(status)) {
        return apiErr('Status tidak valid. Gunakan NEW, IN_PROGRESS, atau RESOLVED.', 422);
      }
      data.status = status;
    }
    if (body?.botEnabled !== undefined) {
      data.botEnabled = !!body.botEnabled;
    }
    if (Object.keys(data).length === 0) return apiErr('Tidak ada perubahan.', 422);

    const conv = await prisma.conversation.findFirst({
      where: { id: params.id, organizationId: ctx.organizationId },
      select: { id: true, status: true, botEnabled: true },
    });
    if (!conv) return apiErr('Percakapan tidak ditemukan.', 404);

    const updated = await prisma.conversation.update({ where: { id: conv.id }, data });

    const desc: string[] = [];
    if (data.status) {
      const label = data.status === 'NEW' ? 'Baru' : data.status === 'IN_PROGRESS' ? 'Proses' : 'Selesai';
      desc.push(`status → ${label}`);
    }
    if (data.botEnabled !== undefined) desc.push(`bot ${data.botEnabled ? 'ON' : 'OFF'}`);
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'UPDATE_CONVERSATION',
      module: 'INBOX',
      description: `Mengubah percakapan: ${desc.join(', ')}`,
      ipAddress: getClientIp(req),
    }).catch(() => {});

    return apiOk({ id: updated.id, status: updated.status, botEnabled: updated.botEnabled });
  } catch (e: any) {
    if (e?.message === 'UNAUTHORIZED') return apiErr('Tidak diizinkan.', 403);
    return apiErr(e?.message || 'Gagal mengubah status.', 500);
  }
}

/** DELETE /api/conversations/:id — hapus 1 percakapan beserta pesannya */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('INBOX_REPLY');
    const conv = await prisma.conversation.findFirst({
      where: { id: params.id, organizationId: ctx.organizationId },
      include: { customer: { select: { name: true } } },
    });
    if (!conv) return apiErr('Percakapan tidak ditemukan.', 404);

    await prisma.conversation.delete({ where: { id: conv.id } });

    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'DELETE_CONVERSATION',
      module: 'INBOX',
      description: `Menghapus percakapan dengan ${conv.customer.name}`,
      ipAddress: getClientIp(req),
    }).catch(() => {});

    return apiOk({ deleted: true });
  } catch (e: any) {
    if (e?.message === 'UNAUTHORIZED') return apiErr('Tidak diizinkan.', 403);
    return apiErr(e?.message || 'Gagal menghapus percakapan.', 500);
  }
}
