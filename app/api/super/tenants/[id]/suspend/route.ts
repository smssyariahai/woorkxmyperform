import { requirePlatformPermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { masterPrisma } from '@/lib/tenant/master';
import {
  LifecycleError,
  shapeSubscription,
  transitionSubscription,
} from '@/lib/tenant/subscription-lifecycle';

export const dynamic = 'force-dynamic';

/** POST /api/super/tenants/[id]/suspend — suspend tenant.
 *  Guard: PLATFORM_TENANTS_MANAGE. 404 bila tenant tidak ada, 409 bila
 *  sudah SUSPENDED. Memakai transitionSubscription (satu sumber kebenaran
 *  dengan /subscription/suspend): lifecycle -> DITANGGUHKAN,
 *  tenantStatus -> SUSPENDED, OWNER tetap bisa login (Fase 4). */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePlatformPermission('PLATFORM_TENANTS_MANAGE', req);
    const tenant = await masterPrisma.tenant.findUnique({ where: { id: params.id } });
    if (!tenant) {
      return apiErr('Tenant tidak ditemukan.', 404);
    }
    if (tenant.tenantStatus === 'SUSPENDED') {
      return apiErr('Tenant sudah berstatus SUSPENDED.', 409);
    }
    const result = await transitionSubscription(params.id, 'DITANGGUHKAN', {
      reason: 'Ditangguhkan oleh Administrator Pusat.',
      actorId: ctx.userId,
    });
    return apiOk({
      id: result.tenant.id,
      tenantCode: result.tenant.tenantCode,
      tenantStatus: result.tenant.tenantStatus,
      subscription: shapeSubscription(result.subscription),
    });
  } catch (e: any) {
    if (e instanceof Response) return e;
    if (e instanceof LifecycleError) return apiErr(e.message, e.status);
    return apiErr('Gagal men-suspend tenant.', 500);
  }
}
