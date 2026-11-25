import { requirePlatformPermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { masterPrisma } from '@/lib/tenant/master';
import { LifecycleError } from '@/lib/tenant/subscription-lifecycle';
import { shapeInvoice } from '@/lib/tenant/subscription-automation';

export const dynamic = 'force-dynamic';

/** POST /api/super/subscriptions/[tenantId]/invoices/[invoiceId]/cancel —
 *  batalkan invoice Belum Dibayar (guard BILLING_MANAGE).
 *  Body { reason >= 10 }. Status -> 'Dibatalkan/Diganti' + audit. */
export async function POST(
  req: Request,
  { params }: { params: { tenantId: string; invoiceId: string } },
) {
  try {
    const ctx = await requirePlatformPermission(
      'PLATFORM_BILLING_MANAGE',
      req,
    );
    const body = await req.json().catch(() => null);
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
    if (reason.length < 10) {
      return apiErr('Alasan wajib diisi minimal 10 karakter.', 400);
    }
    const invoice = await masterPrisma.subscriptionInvoice.findUnique({
      where: { id: params.invoiceId },
    });
    if (!invoice || invoice.tenantId !== params.tenantId) {
      return apiErr('Invoice tidak ditemukan.', 404);
    }
    if (invoice.status !== 'Belum Dibayar') {
      return apiErr(
        `Hanya invoice Belum Dibayar yang bisa dibatalkan (status saat ini: ${invoice.status}).`,
        409,
      );
    }
    const updated = await masterPrisma.subscriptionInvoice.update({
      where: { id: invoice.id },
      data: { status: 'Dibatalkan/Diganti' },
    });
    await masterPrisma.platformAuditLog.create({
      data: {
        actorUserId: ctx.userId,
        action: 'INVOICE_CANCELLED',
        tenantId: params.tenantId,
        metadata: JSON.stringify({
          invoiceId: invoice.id,
          invoiceNumber: invoice.number,
          reason,
        }),
      },
    });
    return apiOk({ invoice: shapeInvoice(updated) });
  } catch (e: any) {
    if (e instanceof Response) return e;
    if (e instanceof LifecycleError) return apiErr(e.message, e.status);
    return apiErr('Gagal membatalkan invoice.', 500);
  }
}
