import { requirePlatformPermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { masterPrisma } from '@/lib/tenant/master';
import { decryptSecret } from '@/lib/tenant/crypto';
import { latestTenantMigrationVersion, runTenantMigrateDeploy, tenantConnectionString } from '@/lib/tenant/tenant-db';

export const dynamic = 'force-dynamic';

/** POST /api/super/tenants/[id]/migrate — jalankan migrasi tenant ke versi
 *  terbaru. Guard: PLATFORM_TENANTS_MANAGE. 404 bila tenant / registry
 *  tidak ada, 409 bila sudah versi terbaru. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePlatformPermission('PLATFORM_TENANTS_MANAGE', req);
    const tenant = await masterPrisma.tenant.findUnique({
      where: { id: params.id },
      include: { registry: true },
    });
    if (!tenant) {
      return apiErr('Tenant tidak ditemukan.', 404);
    }
    if (!tenant.registry?.secretReference) {
      return apiErr('Registry / kredensial database tenant tidak ditemukan.', 404);
    }
    const latest = latestTenantMigrationVersion();
    const current = tenant.registry.migrationVersion ?? '';
    if (current === latest) {
      return apiErr('Database tenant sudah memakai versi migrasi terbaru.', 409);
    }
    let password: string;
    try {
      password = decryptSecret(tenant.registry.secretReference);
    } catch {
      return apiErr('Kredensial database tidak bisa didekripsi.', 500);
    }
    await runTenantMigrateDeploy(tenantConnectionString(tenant.tenantCode, password));
    await masterPrisma.tenantDatabaseRegistry.update({
      where: { tenantId: tenant.id },
      data: { migrationVersion: latest },
    });
    await masterPrisma.platformAuditLog.create({
      data: {
        action: 'TENANT_MIGRATED',
        tenantId: tenant.id,
        actorUserId: ctx.userId,
        metadata: JSON.stringify({
          tenantCode: tenant.tenantCode,
          previousVersion: current,
          migrationVersion: latest,
        }),
      },
    });
    return apiOk({ tenantId: tenant.id, tenantCode: tenant.tenantCode, previousVersion: current, migrationVersion: latest });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr(e?.message ? String(e.message).slice(0, 500) : 'Gagal menjalankan migrasi tenant.', 500);
  }
}
