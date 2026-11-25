import { requirePlatformPermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import {
  LifecycleError,
  extendPeriod,
  shapeSubscription,
} from '@/lib/tenant/subscription-lifecycle';

export const dynamic = 'force-dynamic';

/** POST /api/super/tenants/[id]/subscription/extend — perpanjang masa
 *  aktif. Guard: PLATFORM_TENANTS_MANAGE. Body { days } (1-365).
 *  TRIAL -> trialEndsAt += hari; selain itu currentPeriodEndsAt += hari. */
export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const ctx = await requirePlatformPermission('PLATFORM_TENANTS_MANAGE', req);
    const body = await req.json().catch(() => null);
    const days = Number(body?.days);
    const updated = await extendPeriod(params.id, days, ctx.userId);
    return apiOk({ subscription: shapeSubscription(updated) });
  } catch (e: any) {
    if (e instanceof Response) return e;
    if (e instanceof LifecycleError) return apiErr(e.message, e.status);
    return apiErr('Gagal memperpanjang masa aktif.', 500);
  }
}
