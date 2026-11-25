import { requirePlatformPermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { masterPrisma } from '@/lib/tenant/master';
import { decryptSecret } from '@/lib/tenant/crypto';
import { latestTenantMigrationVersion, runPsql, tenantConnectionString } from '@/lib/tenant/tenant-db';
import { listTenantBackups } from '@/lib/tenant/backup';

export const dynamic = 'force-dynamic';

/**
 * GET /api/super/tenants/[id] — detail satu tenant (Super Admin).
 * Guard: PLATFORM_TENANTS_VIEW. secretReference TIDAK PERNAH dikembalikan.
 * Jumlah user mirror + jumlah tabel dibaca sekali pakai dari tenant DB;
 * bila DB tidak terjangkau, keduanya null (bukan 500).
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    await requirePlatformPermission('PLATFORM_TENANTS_VIEW', req);
    const tenant = await masterPrisma.tenant.findUnique({
      where: { id: params.id },
      include: {
        registry: true,
        subscription: true,
        jobs: { orderBy: { createdAt: 'desc' }, take: 5 },
      },
    });
    if (!tenant) {
      return apiErr('Tenant tidak ditemukan.', 404);
    }
    const membershipCount = await masterPrisma.tenantMembership.count({
      where: { tenantId: tenant.id },
    });
    let userMirrorCount: number | null = null;
    let tableCount: number | null = null;
    if (tenant.registry?.secretReference) {
      try {
        const password = decryptSecret(tenant.registry.secretReference);
        const url = tenantConnectionString(tenant.tenantCode, password);
        const usersRaw = await runPsql(url, `SELECT count(*) FROM "User"`);
        userMirrorCount = Number(usersRaw);
        const tablesRaw = await runPsql(
          url,
          `SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
        );
        tableCount = Number(tablesRaw);
      } catch {
        // Database tenant tidak terjangkau — counts tetap null, halaman
        // detail tetap tampil (kesehatan bisa dicek lewat POST health).
      }
    }
    const latestMigrationVersion = latestTenantMigrationVersion();
    const migrationVersion = tenant.registry?.migrationVersion ?? '';
    return apiOk({
      id: tenant.id,
      tenantCode: tenant.tenantCode,
      companyName: tenant.companyName,
      companySlug: tenant.companySlug,
      databaseName: tenant.databaseName,
      databaseHost: tenant.databaseHost,
      databasePort: tenant.databasePort,
      databaseStatus: tenant.databaseStatus,
      tenantStatus: tenant.tenantStatus,
      createdAt: tenant.createdAt,
      updatedAt: tenant.updatedAt,
      connectionStatus: tenant.registry?.connectionStatus ?? null,
      lastHealthCheck: tenant.registry?.lastHealthCheck ?? null,
      migrationVersion,
      databaseVersion: tenant.registry?.databaseVersion ?? null,
      provisionedAt: tenant.registry?.provisionedAt ?? null,
      subscription: tenant.subscription
        ? {
            plan: tenant.subscription.plan,
            status: tenant.subscription.status,
            billingCycle: tenant.subscription.billingCycle,
            userQuota: tenant.subscription.userQuota,
            trialEndsAt: tenant.subscription.trialEndsAt,
          }
        : null,
      membershipCount,
      userMirrorCount,
      tableCount,
      latestMigrationVersion,
      isMigrationBehind: Boolean(migrationVersion) && migrationVersion !== latestMigrationVersion,
      backups: listTenantBackups(tenant.tenantCode),
      jobs: tenant.jobs.map((j) => ({
        id: j.id,
        status: j.status,
        step: j.step,
        attempts: j.attempts,
        errorMessage: j.errorMessage,
        createdAt: j.createdAt,
        finishedAt: j.finishedAt,
      })),
    });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat detail tenant.', 500);
  }
}
