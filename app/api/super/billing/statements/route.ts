import { requirePlatformPermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { masterPrisma } from '@/lib/tenant/master';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

/** GET /api/super/billing/statements — riwayat statement (guard BILLING_VIEW).
 *  ?bankCode=&page= */
export async function GET(req: Request) {
  try {
    await requirePlatformPermission('PLATFORM_BILLING_VIEW', req);
    const url = new URL(req.url);
    const bankCode = url.searchParams.get('bankCode') || undefined;
    const page = Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1);
    const where: { bankCode?: string } = {};
    if (bankCode) where.bankCode = bankCode;
    const [items, total] = await Promise.all([
      masterPrisma.bankStatement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      masterPrisma.bankStatement.count({ where }),
    ]);
    return apiOk({
      items: items.map((s) => ({
        id: s.id,
        bankCode: s.bankCode,
        fileName: s.fileName,
        rowCount: s.rowCount,
        matchedCount: s.matchedCount,
        queuedCount: s.queuedCount,
        skippedRows: s.skippedRows,
        uploadMethod: s.uploadMethod,
        createdAt: s.createdAt,
      })),
      page,
      total,
    });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat riwayat statement.', 500);
  }
}
