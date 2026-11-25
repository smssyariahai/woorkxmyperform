// Health check untuk satu database tenant (Phase 7 — Super Admin).
//
// Memeriksa database tenant dari master DB: registry + kredensial
// terenkripsi dibaca dari master, lalu koneksi SEKALI PAKAI ke tenant DB
// via `psql` (runPsql) — TIDAK memakai client tenant yang di-cache
// aplikasi, supaya hasil cek tidak terpengaruh cache.
//
// SECURITY: password terdekripsi hanya hidup di memori selama cek
// berjalan. TIDAK PERNAH ditulis ke log / error / hasil. Pesan error
// dari psql sudah disanitasi oleh runPsql (redaksi kredensial).
import { masterPrisma } from './master';
import { decryptSecret } from './crypto';
import { latestTenantMigrationVersion, runPsql, tenantConnectionString } from './tenant-db';
import { EXPECTED_TABLE_COUNT } from './provisioning';

export interface HealthCheckItem {
  name: string;
  ok: boolean;
  detail: string;
}

export interface HealthCheckResult {
  ok: boolean;
  checks: HealthCheckItem[];
  tableCount: number | null;
  migrationVersion: string;
  latestMigrationVersion: string;
  checkedAt: string;
}

async function audit(action: string, tenantId: string, actorId: string, metadata: Record<string, unknown>): Promise<void> {
  await masterPrisma.platformAuditLog.create({
    data: { action, tenantId, actorUserId: actorId, metadata: JSON.stringify(metadata) },
  });
}

/**
 * Periksa kesehatan database satu tenant.
 * - Registry / secret hilang -> UNHEALTHY dengan alasan jelas (tanpa throw).
 * - DB tidak terjangkau / dekripsi gagal -> UNHEALTHY, bukan 500.
 * - Registry selalu di-update: connectionStatus + lastHealthCheck.
 * - Hasil audit TENANT_HEALTH_CHECK tercatat dengan actorId pemanggil.
 * Melempar hanya bila tenant tidak ada di master (route sudah 404 dulu).
 */
export async function checkTenantHealth(tenantId: string, actorId: string): Promise<HealthCheckResult> {
  const latestMigrationVersion = latestTenantMigrationVersion();
  const checkedAt = new Date();
  const tenant = await masterPrisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new Error('Tenant tidak ditemukan.');

  const fail = async (
    checks: HealthCheckItem[],
    migrationVersion: string,
  ): Promise<HealthCheckResult> => {
    const failed = checks.filter((c) => !c.ok).map((c) => c.name);
    await audit('TENANT_HEALTH_CHECK', tenantId, actorId, {
      tenantCode: tenant.tenantCode,
      ok: false,
      failedChecks: failed,
      migrationVersion,
      latestMigrationVersion,
    });
    return {
      ok: false,
      checks,
      tableCount: null,
      migrationVersion,
      latestMigrationVersion,
      checkedAt: checkedAt.toISOString(),
    };
  };

  const registry = await masterPrisma.tenantDatabaseRegistry.findUnique({ where: { tenantId } });
  if (!registry || !registry.secretReference) {
    return fail(
      [
        {
          name: 'Registry database',
          ok: false,
          detail: registry
            ? 'Registry database ada tetapi kredensial (secretReference) hilang — database tidak bisa dijangkau.'
            : 'Registry database tidak ditemukan di master — tenant belum selesai provisioning.',
        },
      ],
      registry?.migrationVersion ?? '',
    );
  }

  let password: string;
  try {
    password = decryptSecret(registry.secretReference);
  } catch {
    await masterPrisma.tenantDatabaseRegistry.update({
      where: { tenantId },
      data: { connectionStatus: 'UNHEALTHY', lastHealthCheck: checkedAt },
    });
    return fail(
      [
        {
          name: 'Dekripsi kredensial',
          ok: false,
          detail: 'Kredensial database tidak bisa didekripsi — kunci enkripsi (MASTER_ENCRYPTION_KEY) mungkin berubah.',
        },
      ],
      registry.migrationVersion,
    );
  }

  const url = tenantConnectionString(tenant.tenantCode, password);
  let tableCount: number;
  let membershipCount: number;
  try {
    const tablesRaw = await runPsql(
      url,
      `SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
    );
    tableCount = Number(tablesRaw);
    const membersRaw = await runPsql(url, `SELECT count(*) FROM "Membership"`);
    membershipCount = Number(membersRaw);
  } catch (e: any) {
    await masterPrisma.tenantDatabaseRegistry.update({
      where: { tenantId },
      data: { connectionStatus: 'UNHEALTHY', lastHealthCheck: checkedAt },
    });
    return fail(
      [
        {
          name: 'Koneksi database',
          ok: false,
          detail: `Database tenant tidak bisa dijangkau: ${String(e?.message ?? e).slice(0, 300)}`,
        },
      ],
      registry.migrationVersion,
    );
  }

  const checks: HealthCheckItem[] = [
    { name: 'Koneksi database', ok: true, detail: 'Database tenant bisa dijangkau.' },
    {
      name: 'Jumlah tabel',
      ok: tableCount === EXPECTED_TABLE_COUNT,
      detail:
        tableCount === EXPECTED_TABLE_COUNT
          ? `${tableCount} tabel — sesuai skema tenant.`
          : `Ditemukan ${tableCount} tabel, diharapkan ${EXPECTED_TABLE_COUNT} — skema mungkin belum lengkap atau ada tabel tambahan.`,
    },
    {
      name: 'Versi migrasi',
      ok: registry.migrationVersion === latestMigrationVersion,
      detail:
        registry.migrationVersion === latestMigrationVersion
          ? `Versi migrasi ${registry.migrationVersion} — sudah terbaru.`
          : registry.migrationVersion
            ? `Versi migrasi ${registry.migrationVersion} tertinggal dari ${latestMigrationVersion}.`
            : 'Belum ada versi migrasi tercatat di registry.',
    },
    {
      name: 'Membership',
      ok: membershipCount >= 1,
      detail:
        membershipCount >= 1
          ? `${membershipCount} membership di database tenant.`
          : 'Tidak ada membership di database tenant — seed mungkin belum jalan.',
    },
  ];
  const ok = checks.every((c) => c.ok);
  await masterPrisma.tenantDatabaseRegistry.update({
    where: { tenantId },
    data: { connectionStatus: ok ? 'HEALTHY' : 'UNHEALTHY', lastHealthCheck: checkedAt },
  });
  await audit('TENANT_HEALTH_CHECK', tenantId, actorId, {
    tenantCode: tenant.tenantCode,
    ok,
    tableCount,
    membershipCount,
    migrationVersion: registry.migrationVersion,
    latestMigrationVersion,
    failedChecks: checks.filter((c) => !c.ok).map((c) => c.name),
  });
  return {
    ok,
    checks,
    tableCount,
    migrationVersion: registry.migrationVersion,
    latestMigrationVersion,
    checkedAt: checkedAt.toISOString(),
  };
}
