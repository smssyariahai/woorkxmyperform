import { requirePlatformPermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { masterPrisma } from '@/lib/tenant/master';
import {
  LifecycleError,
  getSubscriptionLifecycle,
  shapeSubscription,
} from '@/lib/tenant/subscription-lifecycle';
import {
  getAutomationSettings,
  logAutoAction,
  shapeAutomationSettings,
} from '@/lib/tenant/subscription-automation';

export const dynamic = 'force-dynamic';

/** POST /api/super/subscriptions/[tenantId]/extend-grace — perpanjang
 *  tenggang tenant Menunggak. Guard: PLATFORM_TENANTS_MANAGE.
 *  Body { days 1-30, reason } (>=10 karakter). 409 bila bukan MENUNGGAK. */
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
    const days = body?.days;
    if (!Number.isInteger(days) || days < 1 || days > 30) {
      return apiErr('Jumlah hari perpanjangan tenggang harus 1-30.', 400);
    }
    const { subscription } = await getSubscriptionLifecycle(params.tenantId);
    if (subscription.lifecycleStatus !== 'MENUNGGAK') {
      return apiErr(
        'Hanya langganan Menunggak yang bisa diperpanjang tenggangnya.',
        409,
      );
    }
    const settings = shapeAutomationSettings(await getAutomationSettings());
    const now = new Date();
    const base =
      subscription.graceEndsAt ??
      (subscription.lifecycleChangedAt
        ? new Date(
            subscription.lifecycleChangedAt.getTime() +
              settings.graceDays * 24 * 60 * 60 * 1000,
          )
        : now);
    const newGraceEndsAt = new Date(
      base.getTime() + days * 24 * 60 * 60 * 1000,
    );
    const updated = await masterPrisma.subscription.update({
      where: { id: subscription.id },
      data: { graceEndsAt: newGraceEndsAt },
    });
    await masterPrisma.platformAuditLog.create({
      data: {
        actorUserId: ctx.userId,
        action: 'SUBSCRIPTION_GRACE_EXTENDED',
        tenantId: params.tenantId,
        metadata: JSON.stringify({
          days,
          newGraceEndsAt: newGraceEndsAt.toISOString(),
          reason,
        }),
      },
    });
    await logAutoAction(masterPrisma, {
      tenantId: params.tenantId,
      subscriptionId: subscription.id,
      action: 'MANUAL_GRACE_EXTENDED',
      reason,
      detail: `Tenggang diperpanjang ${days} hari sampai ${newGraceEndsAt.toISOString().slice(0, 10)}`,
      actorType: 'MASTER',
      actorUserId: ctx.userId,
      metadata: { days, newGraceEndsAt: newGraceEndsAt.toISOString() },
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
    return apiErr('Gagal memperpanjang tenggang.', 500);
  }
}
