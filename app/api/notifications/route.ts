import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** GET /api/notifications */
export async function GET(req: Request) {
  try {
    const ctx = await requireAuth();
    const { searchParams } = new URL(req.url);
    const limit = Math.min(30, parseInt(searchParams.get('limit') ?? '10'));
    const items = await prisma.notification.findMany({
      where: { organizationId: ctx.organizationId, userId: ctx.userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return apiOk({ items, unread: items.filter((n) => !n.isRead).length });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat notifikasi.', 500);
  }
}

/** PATCH /api/notifications — tandai semua dibaca */
export async function PATCH() {
  try {
    const ctx = await requireAuth();
    await prisma.notification.updateMany({
      where: { organizationId: ctx.organizationId, userId: ctx.userId, isRead: false },
      data: { isRead: true },
    });
    return apiOk({ ok: true });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memperbarui notifikasi.', 500);
  }
}
