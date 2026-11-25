import { requirePlatformPermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { reissueInvoice } from '@/lib/tenant/bank-reconciliation';
import { LifecycleError } from '@/lib/tenant/subscription-lifecycle';
import { shapeInvoice } from '@/lib/tenant/subscription-automation';

export const dynamic = 'force-dynamic';

/** POST /api/super/subscriptions/[tenantId]/invoices/[invoiceId]/reissue —
 *  terbitkan ulang invoice Kedaluwarsa (guard BILLING_MANAGE). Dasar + PPN
 *  + item + tujuan disalin dari invoice lama; kode + nomor + masa berlaku
 *  baru. Invoice lama TETAP Kedaluwarsa. */
export async function POST(
  req: Request,
  { params }: { params: { tenantId: string; invoiceId: string } },
) {
  try {
    const ctx = await requirePlatformPermission(
      'PLATFORM_BILLING_MANAGE',
      req,
    );
    const invoice = await reissueInvoice({
      invoiceId: params.invoiceId,
      actorId: ctx.userId,
      actorType: 'MASTER',
    });
    if (invoice.tenantId !== params.tenantId) {
      return apiErr('Invoice bukan milik tenant ini.', 400);
    }
    return apiOk({ invoice: shapeInvoice(invoice) }, 201);
  } catch (e: any) {
    if (e instanceof Response) return e;
    if (e instanceof LifecycleError) return apiErr(e.message, e.status);
    return apiErr('Gagal menerbitkan ulang invoice.', 500);
  }
}
