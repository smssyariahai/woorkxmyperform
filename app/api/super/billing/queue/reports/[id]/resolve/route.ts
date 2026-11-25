import { requirePlatformPermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import {
  resolveTenantReport,
  shapeReport,
} from '@/lib/tenant/bank-reconciliation';
import { LifecycleError } from '@/lib/tenant/subscription-lifecycle';

export const dynamic = 'force-dynamic';

/** POST /api/super/billing/queue/reports/[id]/resolve — selesaikan satu
 *  laporan tenant (guard BILLING_MANAGE).
 *  Body { decision: 'settle'|'reject', invoiceId?, amount?, note? }. */
export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const ctx = await requirePlatformPermission(
      'PLATFORM_BILLING_MANAGE',
      req,
    );
    const body = await req.json().catch(() => null);
    const decision = body?.decision;
    if (!['settle', 'reject'].includes(decision)) {
      return apiErr("Keputusan tidak dikenal (settle | reject).", 400);
    }
    const result = await resolveTenantReport({
      reportId: params.id,
      decision,
      actorId: ctx.userId,
      invoiceId: body?.invoiceId ? String(body.invoiceId) : null,
      amount:
        body?.amount !== undefined && body?.amount !== null
          ? Number(body.amount)
          : null,
      note: typeof body?.note === 'string' ? body.note : null,
    });
    return apiOk({
      report: shapeReport(result.report),
      settlement: result.settlement,
    });
  } catch (e: any) {
    if (e instanceof Response) return e;
    if (e instanceof LifecycleError) return apiErr(e.message, e.status);
    return apiErr('Gagal menyelesaikan laporan.', 500);
  }
}
