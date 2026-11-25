import { requirePlatformPermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { masterPrisma } from '@/lib/tenant/master';
import {
  LifecycleError,
  getReactivateTarget,
  getSubscriptionLifecycle,
  shapeSubscription,
  transitionSubscription,
} from '@/lib/tenant/subscription-lifecycle';
import { logAutoAction } from '@/lib/tenant/subscription-automation';

export const dynamic = 'force-dynamic';

/** POST /api/super/subscriptions/[tenantId]/cancel-suspension — batalkan
 *  penangguhan (otomatis maupun manual). Guard: PLATFORM_TENANTS_MANAGE.
 *  Body { reason } (>=10 karakter). Kembali ke previous (getReactivateTarget
 *  Fase 4). 409 bila bukan DITANGGUHKAN. */
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
    const { subscription } = await getSubscriptionLifecycle(params.tenantId);
    if (subscription.lifecycleStatus !== 'DITANGGUHKAN') {
      return apiErr('Langganan tidak sedang ditangguhkan.', 409);
    }
    const target = getReactivateTarget(subscription);
    const result = await transitionSubscription(params.tenantId, target, {
      reason,
      actorId: ctx.userId,
    });
    await logAutoAction(masterPrisma, {
      tenantId: params.tenantId,
      subscriptionId: subscription.id,
      action: 'MANUAL_REACTIVATE',
      reason,
      detail: `Penangguhan dibatalkan manual — kembali ${target}`,
      actorType: 'MASTER',
      actorUserId: ctx.userId,
      metadata: { from: 'DITANGGUHKAN', to: target },
    });
    return apiOk({
      subscription: shapeSubscription(result.subscription),
      tenantStatus: result.tenant.tenantStatus,
    });
  } catch (e: any) {
    if (e instanceof Response) return e;
    if (e instanceof LifecycleError) return apiErr(e.message, e.status);
    return apiErr('Gagal membatalkan penangguhan.', 500);
  }
}
