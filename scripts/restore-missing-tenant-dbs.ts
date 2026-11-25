// Restore database tenant yang hilang dari backup 10-menit.
// Dipanggil heal.sh §6c setelah woork_master pulih. Best-effort: tidak
// pernah menggagalkan heal (exit 0 selalu) dan tidak pernah menghapus DB
// yang sudah ada.
//
// Untuk tiap Tenant di master yang DB-nya hilang TAPI file backup
// db-restore/tenant-backups/<code>-latest.sql ada:
//   1. pastikan role <code> ada dengan password dari registry
//      (password lama hilang bersama DB bila role ikut terhapus; registry
//      adalah sumber kebenaran — role dibuat ulang / di-reset ke password
//      registry, BUKAN password baru, supaya tidak perlu rotasi registry)
//   2. restoreTenantDb(): DROP (no-op) + CREATE DATABASE OWNER woo +
//      grant + psql restore sebagai role tenant + migrate deploy +
//      update registry + audit TENANT_RESTORE_COMPLETED
// Tenant yang DB-nya sudah ada dilewati; yang backupnya tidak ada hanya
// dicatat (tetap tidak bisa dipakai sampai diperbaiki manual).
import * as fs from 'node:fs';
import * as path from 'node:path';
import { masterPrisma } from '../lib/tenant/master';
import { decryptSecret } from '../lib/tenant/crypto';
import { adminConnectionString, runPsql } from '../lib/tenant/tenant-db';
import { TENANT_BACKUP_DIR, restoreTenantDb } from '../lib/tenant/backup';

async function main(): Promise<void> {
  const tenants = await masterPrisma.tenant.findMany({
    include: { registry: true },
    orderBy: { createdAt: 'asc' },
  });
  if (tenants.length === 0) {
    console.log('[heal-tenants] tidak ada tenant di master — lewati');
    await masterPrisma.$disconnect();
    process.exit(0);
  }
  const adminConn = adminConnectionString();
  let restored = 0;
  let skipped = 0;
  let failed = 0;
  for (const t of tenants) {
    const code = t.tenantCode;
    let dbExists = false;
    try {
      dbExists = (await runPsql(adminConn, `SELECT count(*) FROM pg_database WHERE datname = '${code}'`)) === '1';
    } catch {
      dbExists = false;
    }
    if (dbExists) {
      skipped++;
      continue;
    }
    const file = `${code}-latest.sql`;
    if (!fs.existsSync(path.join(TENANT_BACKUP_DIR, file))) {
      console.log(`[heal-tenants] ${code}: DB hilang dan backup ${file} tidak ada — LEWATI`);
      failed++;
      continue;
    }
    if (!t.registry?.secretReference) {
      console.log(`[heal-tenants] ${code}: registry/secret hilang — LEWATI`);
      failed++;
      continue;
    }
    try {
      const password = decryptSecret(t.registry.secretReference);
      const roleExists = (await runPsql(adminConn, `SELECT count(*) FROM pg_roles WHERE rolname = '${code}'`)) === '1';
      if (!roleExists) {
        await runPsql(adminConn, `CREATE ROLE "${code}" LOGIN PASSWORD '${password}'`);
      } else {
        await runPsql(adminConn, `ALTER ROLE "${code}" WITH PASSWORD '${password}'`);
      }
      await restoreTenantDb(t.id, file, 'heal');
      console.log(`[heal-tenants] ${code}: DIPULIHKAN dari ${file}`);
      restored++;
    } catch (e: any) {
      console.log(`[heal-tenants] ${code}: GAGAL — ${String(e?.message ?? e).slice(0, 200)}`);
      failed++;
    }
  }
  console.log(`[heal-tenants] selesai: ${restored} dipulihkan, ${skipped} sudah ada, ${failed} gagal/dilewati`);
  await masterPrisma.$disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error('[heal-tenants] FATAL:', e);
  process.exit(0);
});
