// Rute super-admin / platform (P2-2 Phase 4): baca data platform dan legacy eksplisit.
// JANGAN pakai proxy `prisma` — rapuh bila super admin suatu hari punya sesi tenant.
import { legacyPrisma as prisma } from '@/lib/db';
import { requirePlatformPermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const TYPE_LABEL: Record<string, string> = {
  MASTER_TOPUP: 'Top Up Master',
  DISTRIBUTE: 'Distribusi ke Tenant',
  USAGE: 'Pemakaian AI',
  USAGE_REFUND: 'Refund Pemakaian',
  ADJUST: 'Penyesuaian',
};

/** GET /api/super/master/transactions — riwayat transaksi Saldo Master */
export async function GET(req: Request) {
  try {
    await requirePlatformPermission('PLATFORM_MASTER_VIEW', req);
    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const perPage = Math.min(100, Math.max(10, parseInt(url.searchParams.get('perPage') || '20', 10)));
    const type = url.searchParams.get('type') || '';

    const where: any = type ? { type } : {};
    const [total, rows] = await Promise.all([
      prisma.masterLedger.count({ where }),
      prisma.masterLedger.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
        include: { organization: { select: { name: true } } },
      }),
    ]);

    // Saldo sebelum = balanceAfter - amount
    const items = rows.map((r) => ({
      id: r.id,
      seq: r.seq,
      createdAt: r.createdAt,
      type: r.type,
      typeLabel: TYPE_LABEL[r.type] ?? r.type,
      tenant: r.organization?.name ?? null,
      description: r.description,
      balanceBefore: r.balanceAfter - r.amount,
      in: r.amount > 0 ? r.amount : 0,
      out: r.amount < 0 ? Math.abs(r.amount) : 0,
      balanceAfter: r.balanceAfter,
      reference: r.reference,
    }));
    return apiOk({ items, total, page, perPage });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat riwayat transaksi.', 500);
  }
}
