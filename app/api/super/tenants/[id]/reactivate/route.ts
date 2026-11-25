import { requirePlatformPermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { masterPrisma } from '@/lib/tenant/master';
import { setTenantStatus } from '@/lib/tenant/backup';
import {
  LifecycleError,
  getReactivateTarget,
  getSubscriptionLifecycle,
  shapeSubscription,
  transitionSubscription,
} from '@/lib/tenant/subscription-lifecycle';

export const dynamic = 'force-dynamic';

/** POST /api/super/tenants/[id]/reactivate — aktifkan kembali tenant yang
 *  di-suspend. Guard: PLATFORM_TENANTS_MANAGE. 404 bila tenant tidak ada,
 *  409 bila sudah ACTIVE. Memakai transitionSubscription (satu sumber
 *  kebenaran dengan /subscription/reactivate): pulihkan previous
 *  (DITANGGUHKAN -> previous; NONAKTIF -> AKTIF + hapus retensi). */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePlatformPermission('PLATFORM_TENANTS_MANAGE', req);
    const tenant = await masterPrisma.tenant.findUnique({ where: { id: params.id } });
    if (!tenant) {
      return apiErr('Tenant tidak ditemukan.', 404);
    }
    if (tenant.tenantStatus === 'ACTIVE') {
      return apiErr('Tenant sudah berstatus ACTIVE.', 409);
    }
    const { subscription } = await getSubscriptionLifecycle(params.id);
    const to = getReactivateTarget(subscription);
    // Tenant yang lifecycle-nya sudah AKTIF tapi tenantStatus-nya bukan
    // ACTIVE (mis. masih PENDING_PROVISIONING): perilaku lama — cukup
    // kembalikan tenantStatus ke ACTIVE tanpa transisi lifecycle.
    if (subscription.lifecycleStatus === to) {
      const updated = await setTenantStatus(params.id, 'ACTIVE', ctx.userId);
      return apiOk({
        id: updated.id,
        tenantCode: updated.tenantCode,
        tenantStatus: updated.tenantStatus,
        subscription: shapeSubscription(subscription),
      });
    }
    const result = await transitionSubscription(params.id, to, {
      reason: 'Diaktifkan kembali oleh Administrator Pusat.',
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
    return apiErr('Gagal mengaktifkan kembali tenant.', 500);
  }
}
