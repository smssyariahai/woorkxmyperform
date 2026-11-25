import { requirePlatformPermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { masterPrisma } from '@/lib/tenant/master';
import {
  createManualInvoice,
  getCreditBalance,
} from '@/lib/tenant/bank-reconciliation';
import {
  getSubscriptionLifecycle,
  LifecycleError,
} from '@/lib/tenant/subscription-lifecycle';
import { shapeInvoice } from '@/lib/tenant/subscription-automation';

export const dynamic = 'force-dynamic';

/** GET /api/super/subscriptions/[tenantId]/invoices — daftar invoice
 *  tenant + saldo kredit (guard BILLING_VIEW). */
export async function GET(
  req: Request,
  { params }: { params: { tenantId: string } },
) {
  try {
    await requirePlatformPermission('PLATFORM_BILLING_VIEW', req);
    const { subscription } = await getSubscriptionLifecycle(params.tenantId);
    const [invoices, creditBalance] = await Promise.all([
      masterPrisma.subscriptionInvoice.findMany({
        where: { tenantId: params.tenantId },
        orderBy: { issuedAt: 'desc' },
      }),
      getCreditBalance(params.tenantId),
    ]);
    return apiOk({
      subscriptionId: subscription.id,
      invoices: invoices.map(shapeInvoice),
      creditBalance,
    });
  } catch (e: any) {
    if (e instanceof Response) return e;
    if (e instanceof LifecycleError) return apiErr(e.message, e.status);
    return apiErr('Gagal memuat invoice tenant.', 500);
  }
}

/** POST /api/super/subscriptions/[tenantId]/invoices — terbitkan invoice
 *  manual nego (guard BILLING_MANAGE). Body { purpose, items,
 *  baseAmount?, periodStart, periodEnd, billingCycle, reason,
 *  replacesInvoiceId?, packageSnapshot?, validityHours?,
 *  catalogBaseAmount? } -> 201 invoice. */
export async function POST(
  req: Request,
  { params }: { params: { tenantId: string } },
) {
  try {
    const ctx = await requirePlatformPermission(
      'PLATFORM_BILLING_MANAGE',
      req,
    );
    const body = await req.json().catch(() => null);
    const invoice = await createManualInvoice({
      tenantId: params.tenantId,
      purpose: String(body?.purpose ?? 'OTHER'),
      items: body?.items,
      baseAmount:
        body?.baseAmount !== undefined && body?.baseAmount !== null
          ? Number(body.baseAmount)
          : null,
      periodStart: body?.periodStart ? new Date(body.periodStart) : new Date(NaN),
      periodEnd: body?.periodEnd ? new Date(body.periodEnd) : new Date(NaN),
      billingCycle: String(body?.billingCycle ?? 'MONTHLY'),
      reason: typeof body?.reason === 'string' ? body.reason : '',
      actorId: ctx.userId,
      replacesInvoiceId: body?.replacesInvoiceId
        ? String(body.replacesInvoiceId)
        : null,
      packageSnapshot: body?.packageSnapshot ?? null,
      validityHours:
        body?.validityHours !== undefined && body?.validityHours !== null
          ? Number(body.validityHours)
          : null,
      catalogBaseAmount:
        body?.catalogBaseAmount !== undefined &&
        body?.catalogBaseAmount !== null
          ? Number(body.catalogBaseAmount)
          : null,
    });
    return apiOk({ invoice: shapeInvoice(invoice) }, 201);
  } catch (e: any) {
    if (e instanceof Response) return e;
    if (e instanceof LifecycleError) return apiErr(e.message, e.status);
    return apiErr('Gagal menerbitkan invoice manual.', 500);
  }
}
