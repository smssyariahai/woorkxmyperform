import { requirePlatformPermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { masterPrisma } from '@/lib/tenant/master';

export const dynamic = 'force-dynamic';

/** GET /api/super/tenants — daftar tenant dari master DB + status database
 *  + job provisioning terakhir. secretReference TIDAK PERNAH dikembalikan. */
export async function GET(req: Request) {
  try {
    await requirePlatformPermission('PLATFORM_TENANTS_VIEW', req);
    const tenants = await masterPrisma.tenant.findMany({
      include: {
        registry: true,
        jobs: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
    });
    return apiOk(
      tenants.map((t) => ({
        id: t.id,
        tenantCode: t.tenantCode,
        companyName: t.companyName,
        companySlug: t.companySlug,
        databaseName: t.databaseName,
        databaseHost: t.databaseHost,
        databasePort: t.databasePort,
        databaseStatus: t.databaseStatus,
        tenantStatus: t.tenantStatus,
        createdAt: t.createdAt,
        connectionStatus: t.registry?.connectionStatus ?? null,
        lastHealthCheck: t.registry?.lastHealthCheck ?? null,
        migrationVersion: t.registry?.migrationVersion ?? '',
        lastJob: t.jobs[0]
          ? {
              id: t.jobs[0].id,
              status: t.jobs[0].status,
              step: t.jobs[0].step,
              attempts: t.jobs[0].attempts,
              errorMessage: t.jobs[0].errorMessage,
              createdAt: t.jobs[0].createdAt,
              finishedAt: t.jobs[0].finishedAt,
            }
          : null,
      })),
    );
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat daftar tenant.', 500);
  }
}
