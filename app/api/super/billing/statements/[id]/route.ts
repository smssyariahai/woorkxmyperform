import { requirePlatformPermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { masterPrisma } from '@/lib/tenant/master';
import { shapeMutation } from '@/lib/tenant/bank-reconciliation';

export const dynamic = 'force-dynamic';

/** GET /api/super/billing/statements/[id] — statement + mutasi-mutasinya
 *  (guard BILLING_VIEW). */
export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  try {
    await requirePlatformPermission('PLATFORM_BILLING_VIEW', req);
    const statement = await masterPrisma.bankStatement.findUnique({
      where: { id: params.id },
    });
    if (!statement) {
      return apiErr('Statement tidak ditemukan.', 404);
    }
    const mutations = await masterPrisma.bankMutation.findMany({
      where: { statementId: statement.id },
      orderBy: { valueDate: 'desc' },
      take: 500,
    });
    return apiOk({
      statement: {
        id: statement.id,
        bankCode: statement.bankCode,
        fileName: statement.fileName,
        rowCount: statement.rowCount,
        matchedCount: statement.matchedCount,
        queuedCount: statement.queuedCount,
        skippedRows: statement.skippedRows,
        uploadMethod: statement.uploadMethod,
        createdAt: statement.createdAt,
      },
      mutations: mutations.map(shapeMutation),
    });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat statement.', 500);
  }
}
