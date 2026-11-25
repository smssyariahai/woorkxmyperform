import { requirePlatformPermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import {
  LifecycleError,
  getSubscriptionLifecycle,
  shapeSubscription,
} from '@/lib/tenant/subscription-lifecycle';

export const dynamic = 'force-dynamic';

/** GET /api/super/tenants/[id]/subscription — detail langganan + riwayat.
 *  Guard: PLATFORM_TENANTS_VIEW. 404 bila tenant/langganan tidak ada. */
export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  try {
    await requirePlatformPermission('PLATFORM_TENANTS_VIEW', req);
    const { subscription, tenant, history } =
      await getSubscriptionLifecycle(params.id);
    return apiOk({
      subscription: shapeSubscription(subscription),
      tenant: {
        id: tenant.id,
        tenantCode: tenant.tenantCode,
        companyName: tenant.companyName,
        tenantStatus: tenant.tenantStatus,
      },
      history: history.map((h) => ({
        id: h.id,
        fromStatus: h.fromStatus,
        toStatus: h.toStatus,
        reason: h.reason,
        changedByUserId: h.changedByUserId,
        createdAt: h.createdAt,
      })),
    });
  } catch (e: any) {
    if (e instanceof Response) return e;
    if (e instanceof LifecycleError) return apiErr(e.message, e.status);
    return apiErr('Gagal memuat langganan tenant.', 500);
  }
}
