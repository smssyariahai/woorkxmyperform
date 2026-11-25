import { requirePlatformPermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { masterPrisma } from '@/lib/tenant/master';
import { listTenantBackups } from '@/lib/tenant/backup';

export const dynamic = 'force-dynamic';

/** GET /api/super/tenants/[id]/backups — daftar file backup tenant.
 *  Guard: PLATFORM_TENANTS_VIEW. 404 bila tenant tidak ada. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    await requirePlatformPermission('PLATFORM_TENANTS_VIEW', req);
    const tenant = await masterPrisma.tenant.findUnique({ where: { id: params.id } });
    if (!tenant) {
      return apiErr('Tenant tidak ditemukan.', 404);
    }
    return apiOk(listTenantBackups(tenant.tenantCode));
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat daftar backup tenant.', 500);
  }
}
