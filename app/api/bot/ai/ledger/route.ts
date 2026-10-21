import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** GET /api/bot/ai/ledger — riwayat transaksi kredit milik owner */
export async function GET(req: Request) {
  try {
    const ctx = await requirePermission('BOT_MANAGE', req);
    const items = await prisma.creditLedger.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, type: true, amount: true, balanceAfter: true, description: true, createdAt: true },
    });
    return apiOk({ items });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat riwayat kredit.', 500);
  }
}
