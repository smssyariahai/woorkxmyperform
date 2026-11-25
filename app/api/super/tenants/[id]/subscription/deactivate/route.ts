import { requirePlatformPermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import {
  LifecycleError,
  shapeSubscription,
  transitionSubscription,
} from '@/lib/tenant/subscription-lifecycle';

export const dynamic = 'force-dynamic';

/** POST /api/super/tenants/[id]/subscription/deactivate — nonaktifkan
 *  (berhenti). Guard: PLATFORM_TENANTS_MANAGE. Body { reason }
 *  (>=10 karakter). Lifecycle -> NONAKTIF + retensi 60 hari,
 *  tenantStatus -> DEACTIVATED. */
export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const ctx = await requirePlatformPermission('PLATFORM_TENANTS_MANAGE', req);
    const body = await req.json().catch(() => null);
    const reason = typeof body?.reason === 'string' ? body.reason : '';
    const result = await transitionSubscription(params.id, 'NONAKTIF', {
      reason,
      actorId: ctx.userId,
    });
    return apiOk({
      subscription: shapeSubscription(result.subscription),
      tenantStatus: result.tenant.tenantStatus,
    });
  } catch (e: any) {
    if (e instanceof Response) return e;
    if (e instanceof LifecycleError) return apiErr(e.message, e.status);
    return apiErr('Gagal menonaktifkan tenant.', 500);
  }
}
