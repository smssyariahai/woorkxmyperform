import { requirePlatformPermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { masterPrisma } from '@/lib/tenant/master';
import {
  LifecycleError,
  getSubscriptionLifecycle,
  shapeSubscription,
} from '@/lib/tenant/subscription-lifecycle';
import { logAutoAction } from '@/lib/tenant/subscription-automation';

export const dynamic = 'force-dynamic';

/** POST /api/super/subscriptions/[tenantId]/change-end-date — ubah tanggal
 *  berakhir langganan (aktivasi tenant ke otomasi: tenant lama tanpa
 *  currentPeriodEndsAt bisa diberi jatuh tempo lewat aksi ini).
 *  Guard: PLATFORM_TENANTS_MANAGE. Body { endDate ISO, reason } (>=10
 *  karakter). TRIAL -> trialEndsAt; selain itu currentPeriodEndsAt.
 *  endDate harus di masa depan (else 400). 409 bila DIHAPUS. */
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
    const endDate = body?.endDate ? new Date(body.endDate) : null;
    if (!endDate || Number.isNaN(endDate.getTime())) {
      return apiErr('Tanggal berakhir tidak valid.', 400);
    }
    if (endDate.getTime() <= Date.now()) {
      return apiErr('Tanggal berakhir harus di masa depan.', 400);
    }
    const { subscription } = await getSubscriptionLifecycle(params.tenantId);
    if (subscription.lifecycleStatus === 'DIHAPUS') {
      return apiErr('Langganan sudah dihapus permanen.', 409);
    }
    const field =
      subscription.lifecycleStatus === 'TRIAL'
        ? 'trialEndsAt'
        : 'currentPeriodEndsAt';
    const updated = await masterPrisma.subscription.update({
      where: { id: subscription.id },
      data: { [field]: endDate },
    });
    await masterPrisma.platformAuditLog.create({
      data: {
        actorUserId: ctx.userId,
        action: 'SUBSCRIPTION_END_DATE_CHANGED',
        tenantId: params.tenantId,
        metadata: JSON.stringify({
          field,
          newEndDate: endDate.toISOString(),
          reason,
        }),
      },
    });
    await logAutoAction(masterPrisma, {
      tenantId: params.tenantId,
      subscriptionId: subscription.id,
      action: 'MANUAL_END_DATE_CHANGED',
      reason,
      detail: `${field === 'trialEndsAt' ? 'Trial berakhir' : 'Periode berakhir'} diubah ke ${endDate.toISOString().slice(0, 10)}`,
      actorType: 'MASTER',
      actorUserId: ctx.userId,
      metadata: { field, newEndDate: endDate.toISOString() },
    });
    return apiOk({
      subscription: {
        ...shapeSubscription(updated),
        graceEndsAt: updated.graceEndsAt,
      },
    });
  } catch (e: any) {
    if (e instanceof Response) return e;
    if (e instanceof LifecycleError) return apiErr(e.message, e.status);
    return apiErr('Gagal mengubah tanggal berakhir.', 500);
  }
}
