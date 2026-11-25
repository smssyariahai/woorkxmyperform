import { requirePlatformPermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { masterPrisma } from '@/lib/tenant/master';
import { backupTenantDb } from '@/lib/tenant/backup';

export const dynamic = 'force-dynamic';

/** POST /api/super/tenants/[id]/backup — buat backup (pg_dump) database
 *  tenant. Guard: PLATFORM_TENANTS_MANAGE. 404 bila tenant tidak ada.
 *  Dijalankan sinkron; 201 dengan info file backup. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePlatformPermission('PLATFORM_TENANTS_MANAGE', req);
    const tenant = await masterPrisma.tenant.findUnique({ where: { id: params.id } });
    if (!tenant) {
      return apiErr('Tenant tidak ditemukan.', 404);
    }
    const result = await backupTenantDb(tenant.id, ctx.userId);
    return apiOk(result, 201);
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr(e?.message ? String(e.message).slice(0, 500) : 'Gagal membuat backup tenant.', 500);
  }
}
