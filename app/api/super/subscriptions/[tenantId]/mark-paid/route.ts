import { requirePlatformPermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { masterPrisma } from '@/lib/tenant/master';
import {
  LifecycleError,
  applyPayment,
  getSubscriptionLifecycle,
  shapeSubscription,
} from '@/lib/tenant/subscription-lifecycle';
import {
  logAutoAction,
  shapeInvoice,
} from '@/lib/tenant/subscription-automation';
import { settleManually } from '@/lib/tenant/bank-reconciliation';

export const dynamic = 'force-dynamic';

/** POST /api/super/subscriptions/[tenantId]/mark-paid — tandai lunas
 *  (konfirmasi manual Master atas pembayaran). Guard: PLATFORM_TENANTS_MANAGE.
 *
 *  JALUR KOMPATIBILITAS FASE 5 (dipertahankan): body lama
 *  { invoiceId?, amount, paidAt?, reason } tetap jalan. Bila invoiceId ada,
 *  pelunasan kini didelegasikan ke settleManually (Fase 6 §9.5) sehingga
 *  selisih tercatat dengan benar: selisih == kode unik -> FORGIVEN_CODE;
 *  selisih lebih besar -> wajib handling FOLLOW_UP_INVOICE / FORGIVEN_REASON;
 *  lebih bayar -> CREDIT. Field baru opsional: handling, proofMutationId,
 *  proofNote, followUpBase. Bila TIDAK ada invoiceId -> jalur lama
 *  (applyPayment langsung, tanpa invoice).
 *
 *  Body { invoiceId?, amount, paidAt?, reason (>=10 karakter),
 *  handling?, proofMutationId?, proofNote?, followUpBase? }. */
export async function POST(
  req: Request,
  { params }: { params: { tenantId: string } },
) {
  try {
    const ctx = await requirePlatformPermission(
      'PLATFORM_TENANTS_MANAGE',
      req,
    );
    const body = await req.json().catch(() => null);
    const reason = typeof body?.reason === 'string' ? body.reason : '';
    if (reason.trim().length < 10) {
      return apiErr('Alasan wajib diisi minimal 10 karakter.', 400);
    }
    const amount = Number(body?.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return apiErr('Jumlah pembayaran harus lebih dari 0.', 400);
    }
    const paidAt = body?.paidAt ? new Date(body.paidAt) : undefined;
    if (paidAt && Number.isNaN(paidAt.getTime())) {
      return apiErr('Tanggal pembayaran tidak valid.', 400);
    }
    const { subscription } = await getSubscriptionLifecycle(params.tenantId);
    let invoiceId: string | null = null;
    if (body?.invoiceId) {
      invoiceId = String(body.invoiceId);
      const inv = await masterPrisma.subscriptionInvoice.findUnique({
        where: { id: invoiceId },
      });
      if (!inv) return apiErr('Invoice tidak ditemukan.', 404);
      if (inv.subscriptionId !== subscription.id) {
        return apiErr('Invoice bukan milik langganan ini.', 400);
      }
      if (inv.status !== 'Belum Dibayar') {
        return apiErr(`Invoice sudah berstatus ${inv.status}.`, 409);
      }
      // Fase 6: delegasikan ke settleManually — selisih ditangani di sana
      // (aturan §9.5), bukan ditolak mentah seperti Fase 5.
      const settled = await settleManually({
        invoiceId,
        amountReceived: amount,
        handling:
          typeof body?.handling === 'string' ? body.handling : null,
        reason,
        actorId: ctx.userId,
        proofMutationId:
          typeof body?.proofMutationId === 'string'
            ? body.proofMutationId
            : null,
        proofNote:
          typeof body?.proofNote === 'string' ? body.proofNote : null,
        followUpBase:
          body?.followUpBase !== undefined && body?.followUpBase !== null
            ? Number(body.followUpBase)
            : null,
      });
      const fresh = await getSubscriptionLifecycle(params.tenantId);
      return apiOk({
        subscription: {
          ...shapeSubscription(fresh.subscription),
          graceEndsAt: fresh.subscription.graceEndsAt,
        },
        invoice: shapeInvoice(settled.invoice),
        newEnd: fresh.subscription.currentPeriodEndsAt,
        wasSuspended:
          fresh.subscription.previousLifecycleStatus === 'DITANGGUHKAN',
        settlement: settled.settlement,
        followUpInvoice: settled.followUpInvoice
          ? shapeInvoice(settled.followUpInvoice)
          : null,
      });
    }
    // Tanpa invoice: jalur lama (applyPayment langsung).
    const result = await applyPayment(subscription.id, {
      invoiceId,
      amount,
      paidAt,
      actorId: ctx.userId,
      reason,
      actorType: 'MASTER',
    });
    await logAutoAction(masterPrisma, {
      tenantId: params.tenantId,
      subscriptionId: subscription.id,
      action: 'MANUAL_PAYMENT_CONFIRMED',
      reason,
      detail: `Pembayaran Rp${amount.toLocaleString('id-ID')} dikonfirmasi manual (tanpa invoice), periode baru sampai ${result.newEnd.toISOString().slice(0, 10)}`,
      actorType: 'MASTER',
      actorUserId: ctx.userId,
      metadata: {
        invoiceId: null,
        amount,
        newEnd: result.newEnd.toISOString(),
        wasSuspended: result.wasSuspended,
      },
    });
    return apiOk({
      subscription: {
        ...shapeSubscription(result.subscription),
        graceEndsAt: result.subscription.graceEndsAt,
      },
      invoice: null,
      newEnd: result.newEnd,
      wasSuspended: result.wasSuspended,
    });
  } catch (e: any) {
    if (e instanceof Response) return e;
    if (e instanceof LifecycleError) return apiErr(e.message, e.status);
    return apiErr('Gagal menandai lunas.', 500);
  }
}
