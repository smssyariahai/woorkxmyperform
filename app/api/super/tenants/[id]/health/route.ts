import { requirePlatformPermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { masterPrisma } from '@/lib/tenant/master';
import { checkTenantHealth } from '@/lib/tenant/health';

export const dynamic = 'force-dynamic';

/** POST /api/super/tenants/[id]/health — cek kesehatan database tenant.
 *  Guard: PLATFORM_TENANTS_MANAGE. 404 bila tenant tidak ada.
 *  Selalu 200 dengan hasil cek (ok / tidak) — cek yang gagal bukan 500. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePlatformPermission('PLATFORM_TENANTS_MANAGE', req);
    const tenant = await masterPrisma.tenant.findUnique({ where: { id: params.id } });
    if (!tenant) {
      return apiErr('Tenant tidak ditemukan.', 404);
    }
    const result = await checkTenantHealth(tenant.id, ctx.userId);
    return apiOk(result);
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memeriksa kesehatan tenant.', 500);
  }
}
