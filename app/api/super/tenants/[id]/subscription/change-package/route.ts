import { requirePlatformPermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import {
  LifecycleError,
  changePackage,
  shapeSubscription,
} from '@/lib/tenant/subscription-lifecycle';

export const dynamic = 'force-dynamic';

/** POST /api/super/tenants/[id]/subscription/change-package — ubah paket.
 *  Guard: PLATFORM_TENANTS_MANAGE. Body { userTierId, storageTierId,
 *  moduleKeys }. 400 bila validasi paket gagal, 404 bila tenant tidak ada. */
export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const ctx = await requirePlatformPermission('PLATFORM_TENANTS_MANAGE', req);
    const body = await req.json().catch(() => null);
    const userTierId = typeof body?.userTierId === 'string' ? body.userTierId : '';
    const storageTierId =
      typeof body?.storageTierId === 'string' ? body.storageTierId : '';
    const moduleKeys = Array.isArray(body?.moduleKeys)
      ? body.moduleKeys.filter((k: unknown) => typeof k === 'string')
      : [];
    if (!userTierId || !storageTierId) {
      return apiErr('Tier pengguna dan tier storage wajib dipilih.', 400);
    }
    const { subscription, packageSyncWarning } = await changePackage(
      params.id,
      { userTierId, storageTierId, moduleKeys },
      ctx.userId,
    );
    return apiOk({ subscription: shapeSubscription(subscription), packageSyncWarning });
  } catch (e: any) {
    if (e instanceof Response) return e;
    if (e instanceof LifecycleError) return apiErr(e.message, e.status);
    return apiErr('Gagal mengubah paket langganan.', 500);
  }
}
