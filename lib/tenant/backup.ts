// Backup / restore database tenant (Phase 7 — Super Admin).
//
// Backup disimpan di ~/workspace/woorkxmyperform-docs/db-restore/
// tenant-backups/ (subdir yang sama dengan backup-db.sh untuk
// woork_saas / woork_master), nama file `<tenantCode>-YYYYMMDD-HHmmss.sql`.
//
// SECURITY: password DB tenant hanya lewat env PGPASSWORD — TIDAK PERNAH
// di argv, log, atau pesan error. Pesan error disanitasi sebelum dilempar
// (redaksi `://...@` + penghapusan password bila sempat terbawa).
// TIDAK ADA fungsi hapus database di sini: restore menimpa isi DB tenant
// yang sama (DROP + CREATE ulang), dan hanya lewat konfirmasi kode tenant
// di route.
import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { promisify } from 'node:util';
import type { Tenant, TenantDatabaseRegistry } from '@prisma/master-client';
import { masterPrisma } from './master';
import { decryptSecret } from './crypto';
import {
  adminConnectionString,
  adminConnectionStringForDb,
  adminDbUser,
  latestTenantMigrationVersion,
  runPsql,
  runTenantMigrateDeploy,
  tenantConnectionString,
  tenantMaintenanceConnectionString,
} from './tenant-db';
import { invalidateTenantClient } from './resolver';

const execFileAsync = promisify(execFile);

/** Direktori backup tenant — sama dengan yang dipakai backup-db.sh. */
export const TENANT_BACKUP_DIR = path.resolve(
  process.cwd(),
  '..',
  'woorkxmyperform-docs',
  'db-restore',
  'tenant-backups',
);

export interface TenantBackupInfo {
  filename: string;
  sizeBytes: number;
  createdAt: string;
}

export interface TenantBackupResult extends TenantBackupInfo {
  tenantCode: string;
}

export interface TenantRestoreResult {
  filename: string;
  tenantCode: string;
  migrationVersion: string;
  restoredAt: string;
}

function sanitizeError(e: unknown, secrets: string[] = []): string {
  let msg = String((e as any)?.message ?? e);
  for (const s of secrets) {
    if (s) msg = msg.split(s).join('***');
  }
  msg = msg.replace(/:\/\/[^/\s]*@/g, '://***@');
  return msg.slice(0, 2000);
}

function stamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

async function audit(action: string, tenantId: string, actorId: string, metadata: Record<string, unknown>): Promise<void> {
  await masterPrisma.platformAuditLog.create({
    data: { action, tenantId, actorUserId: actorId, metadata: JSON.stringify(metadata) },
  });
}

interface TenantCredentials {
  tenant: Tenant;
  registry: TenantDatabaseRegistry;
  password: string;
}

/** Ambil tenant + registry + password terdekripsi dari master. */
async function loadCredentials(tenantId: string): Promise<TenantCredentials> {
  const tenant = await masterPrisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new Error('Tenant tidak ditemukan.');
  const registry = await masterPrisma.tenantDatabaseRegistry.findUnique({ where: { tenantId } });
  if (!registry || !registry.secretReference) {
    throw new Error('Registry / kredensial database tenant tidak ditemukan — tenant belum selesai provisioning.');
  }
  let password: string;
  try {
    password = decryptSecret(registry.secretReference);
  } catch {
    throw new Error('Kredensial database tidak bisa didekripsi — kunci enkripsi (MASTER_ENCRYPTION_KEY) mungkin berubah.');
  }
  return { tenant, registry, password };
}

/** Daftar backup milik satu tenant, terbaru dulu. */
export function listTenantBackups(tenantCode: string): TenantBackupInfo[] {
  if (!fs.existsSync(TENANT_BACKUP_DIR)) return [];
  const prefix = `${tenantCode}-`;
  return fs
    .readdirSync(TENANT_BACKUP_DIR)
    .filter((name) => name.startsWith(prefix) && name.endsWith('.sql'))
    .map((name) => {
      const stat = fs.statSync(path.join(TENANT_BACKUP_DIR, name));
      return { filename: name, sizeBytes: stat.size, createdAt: stat.mtime.toISOString() };
    })
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/**
 * Buat backup (pg_dump) database tenant. Sinkron — route menunggu sampai
 * selesai. Sukses -> audit TENANT_BACKUP_CREATED; gagal -> audit
 * TENANT_BACKUP_FAILED + throw error tersanitasi.
 */
export async function backupTenantDb(tenantId: string, actorId: string): Promise<TenantBackupResult> {
  const { tenant, password } = await loadCredentials(tenantId);
  const code = tenant.tenantCode;
  fs.mkdirSync(TENANT_BACKUP_DIR, { recursive: true });
  const createdAt = new Date();
  const filename = `${code}-${stamp(createdAt)}.sql`;
  const filePath = path.join(TENANT_BACKUP_DIR, filename);
  try {
    await execFileAsync(
      'pg_dump',
      ['-h', 'localhost', '-p', '5432', '-U', code, '-d', code, '-w', '-f', filePath],
      { timeout: 120_000, maxBuffer: 10 * 1024 * 1024, env: { ...process.env, PGPASSWORD: password } },
    );
    const sizeBytes = fs.statSync(filePath).size;
    if (sizeBytes <= 0) throw new Error('pg_dump menghasilkan file kosong.');
    await audit('TENANT_BACKUP_CREATED', tenantId, actorId, { tenantCode: code, filename, sizeBytes });
    return { tenantCode: code, filename, sizeBytes, createdAt: createdAt.toISOString() };
  } catch (e: any) {
    const message = sanitizeError(e, [password]);
    await audit('TENANT_BACKUP_FAILED', tenantId, actorId, { tenantCode: code, filename, error: message }).catch(() => {});
    throw new Error(`Backup gagal: ${message}`);
  }
}

/**
 * Pulihkan database tenant dari file backup miliknya.
 * Validasi ketat: filename harus basename, diawali `<code>-`, berakhir
 * `.sql`, dan file harus ada di TENANT_BACKUP_DIR (tolak path traversal).
 * Urutan: putuskan client cache -> terminate backend -> DROP + CREATE
 * (owner = admin, sama seperti provisioning, + grant seperti provisioning)
 * -> psql restore sebagai role tenant -> migrate deploy ke versi terbaru.
 */
export async function restoreTenantDb(
  tenantId: string,
  filename: string,
  actorId: string,
): Promise<TenantRestoreResult> {
  const { tenant, password } = await loadCredentials(tenantId);
  const code = tenant.tenantCode;
  if (!filename || path.basename(filename) !== filename || !filename.startsWith(`${code}-`) || !filename.endsWith('.sql')) {
    throw new Error('Nama file backup tidak valid untuk tenant ini.');
  }
  const filePath = path.join(TENANT_BACKUP_DIR, filename);
  if (!fs.existsSync(filePath)) throw new Error('File backup tidak ditemukan.');
  const restoredAt = new Date();
  try {
    // Putuskan semua koneksi aplikasi ke DB ini (cache resolver ikut dibersihkan).
    await invalidateTenantClient(code);
    // Matikan koneksi lain yang masih menempel (boleh gagal karena hak
    // akses — DROP di bawah akan memberi error yang jelas bila masih ada
    // koneksi yang menghalangi).
    try {
      await runPsql(
        adminConnectionString(),
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${code}'`,
      );
    } catch {
      // Lanjutkan — DROP DATABASE akan gagal dengan pesan jelas bila ada
      // koneksi aktif yang tersisa.
    }
    const adminConn = adminConnectionString();
    await runPsql(adminConn, `DROP DATABASE IF EXISTS "${code}"`);
    // Owner = admin (sama seperti provisioning) supaya retry provisioning
    // di masa depan tetap bisa GRANT; role tenant diberi hak seperti saat
    // provisioning (CONNECT + USAGE/CREATE di schema public).
    await runPsql(adminConn, `CREATE DATABASE "${code}" OWNER "${adminDbUser()}"`);
    await runPsql(adminConn, `GRANT CONNECT ON DATABASE "${code}" TO "${code}"`);
    await runPsql(
      adminConnectionStringForDb(code),
      `GRANT USAGE, CREATE ON SCHEMA public TO "${code}"`,
    );
    await execFileAsync(
      'psql',
      ['-h', 'localhost', '-p', '5432', '-U', code, '-d', code, '-w', '-v', 'ON_ERROR_STOP=1', '-f', filePath],
      { timeout: 300_000, maxBuffer: 10 * 1024 * 1024, env: { ...process.env, PGPASSWORD: password } },
    );
    await runTenantMigrateDeploy(tenantConnectionString(code, password));
    // Pulihkan hak baca backup untuk woo: restore membuat ulang semua tabel
    // (DROP DATABASE menghapus ALTER DEFAULT PRIVILEGES lama) sehingga
    // backup-db.sh berikutnya akan gagal "permission denied" tanpa grant
    // ini — siklus backup/restore harus mandiri. Dijalankan sebagai role
    // tenant (pemilik tabel), sama seperti di provisioning.
    const tenantUrl = tenantConnectionString(code, password);
    const backupReader = adminDbUser();
    await runPsql(tenantUrl, `GRANT SELECT ON ALL TABLES IN SCHEMA public TO "${backupReader}"`);
    await runPsql(tenantUrl, `GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO "${backupReader}"`);
    await runPsql(tenantUrl, `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO "${backupReader}"`);
    await runPsql(tenantUrl, `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON SEQUENCES TO "${backupReader}"`);
    const migrationVersion = latestTenantMigrationVersion();
    await masterPrisma.tenantDatabaseRegistry.update({
      where: { tenantId },
      data: { migrationVersion, connectionStatus: 'HEALTHY', lastHealthCheck: restoredAt },
    });
    await audit('TENANT_RESTORE_COMPLETED', tenantId, actorId, {
      tenantCode: code,
      filename,
      migrationVersion,
    });
    return { filename, tenantCode: code, migrationVersion, restoredAt: restoredAt.toISOString() };
  } catch (e: any) {
    const message = sanitizeError(e, [password]);
    await audit('TENANT_RESTORE_FAILED', tenantId, actorId, { tenantCode: code, filename, error: message }).catch(() => {});
    throw new Error(`Restore gagal: ${message}`);
  }
}

/**
 * Ubah status tenant. 'SUSPENDED' | 'ACTIVE' | 'DEACTIVATED' | 'DELETED'
 * (Fase 4: DEACTIVATED = berhenti -> retensi, DELETED = tombstone setelah
 * penghapusan permanen).
 * Suspend memutus koneksi aplikasi ke DB tenant dan memblokir login
 * tenant (requireAuth/middleware memeriksa tenantStatus di master).
 */
export async function setTenantStatus(
  tenantId: string,
  status: 'SUSPENDED' | 'ACTIVE' | 'DEACTIVATED' | 'DELETED',
  actorId: string,
): Promise<{ id: string; tenantCode: string; tenantStatus: string }> {
  if (
    status !== 'SUSPENDED' &&
    status !== 'ACTIVE' &&
    status !== 'DEACTIVATED' &&
    status !== 'DELETED'
  ) {
    throw new Error(
      "Status tenant hanya boleh 'SUSPENDED', 'ACTIVE', 'DEACTIVATED', atau 'DELETED'.",
    );
  }
  const tenant = await masterPrisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new Error('Tenant tidak ditemukan.');
  const updated = await masterPrisma.tenant.update({
    where: { id: tenantId },
    data: { tenantStatus: status },
  });
  // Invalidasi PENUH (client + info cache) SETELAH update master, di kedua
  // arah. `disconnectTenantClient` saja TIDAK cukup: resolver menyimpan
  // `tenantInfoCache` (tenantStatus saat resolve) dan `resolvedClients`;
  // tanpa invalidate, `requireAuthTenant` tetap membaca status lama —
  // terbukti live 2026-11-23: tenant yang di-reactivate tetap ditolak
  // "belum aktif" karena cache masih SUSPENDED.
  await invalidateTenantClient(tenant.tenantCode);
  const auditAction =
    status === 'SUSPENDED'
      ? 'TENANT_SUSPENDED'
      : status === 'DEACTIVATED'
        ? 'TENANT_DEACTIVATED'
        : status === 'DELETED'
          ? 'TENANT_DELETED'
          : 'TENANT_REACTIVATED';
  await audit(auditAction, tenantId, actorId, {
    tenantCode: tenant.tenantCode,
    tenantStatus: status,
  });
  return { id: updated.id, tenantCode: updated.tenantCode, tenantStatus: updated.tenantStatus };
}

/**
 * Hapus fisik database + role tenant (Fase 4 — konfirmasi penghapusan).
 * Urutan: putuskan client aplikasi → matikan backend yang masih menempel
 * → DROP DATABASE → DROP ROLE. DROP boleh dicoba lagi (IF EXISTS).
 *
 * Pelajaran live 2026-11-24: mematikan backend HANYA sebagai admin (`woo`)
 * TIDAK CUKUP — `woo` tidak boleh men-terminate backend milik role lain,
 * dan satu koneksi idle milik role tenant menghalangi DROP DATABASE.
 * Karena itu terminate dilakukan dulu SEBAGAI ROLE TENANT SENDIRI (role
 * boleh men-terminate backend miliknya), lalu sebagai admin sebagai
 * jaring pengaman. Koneksi psql terminate memakai maintenance DB
 * `postgres` (bukan DB tenant) supaya tidak men-terminate dirinya sendiri.
 */
export async function dropTenantDatabase(tenantId: string): Promise<{ tenantCode: string }> {
  const { tenant, password } = await loadCredentials(tenantId);
  const code = tenant.tenantCode;
  if (!/^woork_t_[0-9a-f]{8}$/.test(code)) {
    throw new Error('Kode tenant tidak valid untuk penghapusan database.');
  }
  await invalidateTenantClient(code);
  const terminateSql = `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${code}' AND pid <> pg_backend_pid()`;
  try {
    await runPsql(tenantMaintenanceConnectionString(code, password), terminateSql);
  } catch {
    // Lanjutkan — percobaan admin di bawah + DROP akan memberi error jelas.
  }
  try {
    await runPsql(adminConnectionString(), terminateSql);
  } catch {
    // Lanjutkan — DROP di bawah akan gagal dengan pesan jelas bila ada
    // koneksi aktif yang tersisa.
  }
  const adminConn = adminConnectionString();
  await runPsql(adminConn, `DROP DATABASE IF EXISTS "${code}"`);
  await runPsql(adminConn, `DROP ROLE IF EXISTS "${code}"`);
  return { tenantCode: code };
}
