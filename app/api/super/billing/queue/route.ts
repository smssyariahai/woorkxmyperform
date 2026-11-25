import { requirePlatformPermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { masterPrisma } from '@/lib/tenant/master';
import {
  shapeMutation,
  shapeReport,
} from '@/lib/tenant/bank-reconciliation';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;
const OPEN_MUTATION_STATUSES = ['UNDERPAID', 'OVERPAID', 'DUPLICATE', 'UNKNOWN'];

/** GET /api/super/billing/queue — antrean Rekonsiliasi Manual
 *  (guard BILLING_VIEW). ?status=&bankCode=&page=.
 *  Default: mutasi UNDERPAID/OVERPAID/DUPLICATE/UNKNOWN + laporan PENDING.
 *  ?includeResolved=1 -> tampilkan juga RESOLVED_MANUAL / RESOLVED. */
export async function GET(req: Request) {
  try {
    await requirePlatformPermission('PLATFORM_BILLING_VIEW', req);
    const url = new URL(req.url);
    const status = url.searchParams.get('status') || undefined;
    const bankCode = url.searchParams.get('bankCode') || undefined;
    const includeResolved = url.searchParams.get('includeResolved') === '1';
    const page = Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1);
    const mutationWhere: {
      status?: { in: string[] } | string;
      bankCode?: string;
    } = {};
    if (status) {
      mutationWhere.status = status;
    } else if (!includeResolved) {
      mutationWhere.status = { in: OPEN_MUTATION_STATUSES };
    }
    if (bankCode) mutationWhere.bankCode = bankCode;
    const reportWhere: { status?: string } = {};
    if (!includeResolved) reportWhere.status = 'PENDING';
    const [mutations, reports, mutationTotal, reportTotal] = await Promise.all([
      masterPrisma.bankMutation.findMany({
        where: mutationWhere,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      masterPrisma.tenantPaymentReport.findMany({
        where: reportWhere,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      masterPrisma.bankMutation.count({ where: mutationWhere }),
      masterPrisma.tenantPaymentReport.count({ where: reportWhere }),
    ]);
    return apiOk({
      mutations: mutations.map(shapeMutation),
      reports: reports.map(shapeReport),
      page,
      total: mutationTotal + reportTotal,
      mutationTotal,
      reportTotal,
    });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat antrean rekonsiliasi.', 500);
  }
}
