// Terapkan migrasi tenant 20261123223000_residence_rest_system (Fase 5a)
// ke SEMUA database tenant yang ada + update registry.migrationVersion +
// beri hak baca backup (woo) atas tabel baru — pola yang sama dengan
// provisioning.ts (MIGRATING) + restoreTenantDb.
//
// Dijalankan sekali: npx tsx scripts/apply-residence-migration.ts
// Idempotent: migrate deploy hanya menerapkan migrasi yang belum tercatat
// di _prisma_migrations; registry + grant diulang aman.
import { masterPrisma } from '../lib/tenant/master';
import { decryptSecret } from '../lib/tenant/crypto';
import {
  adminDbUser,
  latestTenantMigrationVersion,
  runPsql,
  runTenantMigrateDeploy,
  tenantConnectionString,
} from '../lib/tenant/tenant-db';
import { EXPECTED_TABLE_COUNT } from '../lib/tenant/provisioning';

const MIGRATION = '20261123223000_residence_rest_system';

async function main(): Promise<void> {
  const latest = latestTenantMigrationVersion();
  console.log(`[apply-migration] migrasi target ${MIGRATION}; terbaru di repo: ${latest}`);
  if (latest !== MIGRATION) {
    console.log(`[apply-migration] PERINGATAN: migrasi terbaru bukan ${MIGRATION} — lanjut apa adanya`);
  }
  const tenants = await masterPrisma.tenant.findMany({
    include: { registry: true },
    orderBy: { createdAt: 'asc' },
  });
  if (tenants.length === 0) {
    console.log('[apply-migration] tidak ada tenant di master — lewati');
    await masterPrisma.$disconnect();
    process.exit(0);
  }
  const backupReader = adminDbUser();
  let ok = 0;
  let failed = 0;
  for (const t of tenants) {
    const code = t.tenantCode;
    if (!t.registry?.secretReference) {
      console.log(`[apply-migration] ${code}: registry/secret hilang — LEWATI`);
      failed++;
      continue;
    }
    try {
      const password = decryptSecret(t.registry.secretReference);
      const url = tenantConnectionString(code, password);
      const out = await runTenantMigrateDeploy(url);
      const applied = out.includes(MIGRATION) ? 'diterapkan' : 'sudah ada';
      // Hak baca backup (pola provisioning): tabel baru harus bisa dibaca woo.
      await runPsql(url, `GRANT SELECT ON ALL TABLES IN SCHEMA public TO "${backupReader}"`);
      await runPsql(url, `GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO "${backupReader}"`);
      const tablesRaw = await runPsql(
        url,
        `SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
      );
      const tableCount = Number(tablesRaw);
      await masterPrisma.tenantDatabaseRegistry.update({
        where: { tenantId: t.id },
        data: { migrationVersion: latest },
      });
      const countOk = tableCount === EXPECTED_TABLE_COUNT;
      console.log(
        `[apply-migration] ${code}: ${applied}, tabel=${tableCount} (harap ${EXPECTED_TABLE_COUNT}) ${countOk ? 'OK' : 'MISMATCH'}, registry=${latest}`,
      );
      if (!countOk) failed++;
      else ok++;
    } catch (e: any) {
      console.log(`[apply-migration] ${code}: GAGAL — ${String(e?.message ?? e).slice(0, 300)}`);
      failed++;
    }
  }
  console.log(`[apply-migration] selesai: ${ok} OK, ${failed} gagal/dilewati`);
  await masterPrisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error('[apply-migration] GAGAL:', e?.message ?? e);
  try {
    await masterPrisma.$disconnect();
  } catch {
    /* abaikan */
  }
  process.exit(1);
});
