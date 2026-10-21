import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/**
 * GET /api/campaigns/audience-contacts?q=...
 * Daftar kontak yang ada di inbox (punya percakapan) + bernomor HP,
 * untuk pemilih audience broadcast manual.
 */
export async function GET(req: Request) {
  try {
    const ctx = await requirePermission('BROADCAST_CREATE');
    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q')?.trim() ?? '';

    const customers = await prisma.customer.findMany({
      where: {
        organizationId: ctx.organizationId,
        phone: { not: null },
        conversations: { some: {} },
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { phone: { contains: q } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        name: true,
        phone: true,
        conversations: {
          select: { lastMessageAt: true, channelType: true },
          orderBy: { lastMessageAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { name: 'asc' },
      take: 500,
    });

    return apiOk(
      customers.map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        lastChat: c.conversations[0]?.lastMessageAt ?? null,
        channelType: c.conversations[0]?.channelType ?? null,
      }))
    );
  } catch (e: any) {
    if (e?.message === 'UNAUTHORIZED') return apiErr('Tidak diizinkan.', 403);
    return apiErr(e?.message || 'Gagal memuat kontak.', 500);
  }
}
