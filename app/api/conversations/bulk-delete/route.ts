import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/** POST /api/conversations/bulk-delete — hapus banyak percakapan sekaligus. Body: { ids: string[] } */
export async function POST(req: Request) {
  try {
    const ctx = await requirePermission('INBOX_REPLY');
    const body = await req.json().catch(() => ({}));
    const ids = [...new Set((body?.ids ?? []) as string[])].filter(
      (id) => typeof id === 'string' && id.length > 0
    );
    if (ids.length === 0) return apiErr('Tidak ada percakapan yang dipilih.', 422);
    if (ids.length > 200) return apiErr('Maksimal 200 percakapan per penghapusan.', 422);

    const found = await prisma.conversation.findMany({
      where: { id: { in: ids }, organizationId: ctx.organizationId },
      select: { id: true },
    });
    if (found.length === 0) return apiErr('Percakapan tidak ditemukan.', 404);

    const result = await prisma.conversation.deleteMany({
      where: { id: { in: found.map((c) => c.id) } },
    });

    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'BULK_DELETE_CONVERSATION',
      module: 'INBOX',
      description: `Menghapus ${result.count} percakapan sekaligus`,
      ipAddress: getClientIp(req),
    }).catch(() => {});

    return apiOk({ deleted: result.count });
  } catch (e: any) {
    if (e?.message === 'UNAUTHORIZED') return apiErr('Tidak diizinkan.', 403);
    return apiErr(e?.message || 'Gagal menghapus percakapan.', 500);
  }
}
