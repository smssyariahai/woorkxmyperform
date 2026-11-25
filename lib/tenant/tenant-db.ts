// Tenant database helpers — connection strings, psql execution, per-tenant
// Prisma clients and tenant migration runner.
//
// SECURITY: connection strings carry passwords. NEVER log a connection
// string, argv containing one, or a decrypted secret. Error messages are
// sanitised (any `://...@` fragment is redacted) before being thrown.
import { execFile } from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { PrismaClient } from '@prisma/tenant-client';
import { loadTenantEnv, requireEnv } from './env';

const execFileAsync = promisify(execFile);

/**
 * Root repo (tempat `prisma/tenant/schema.prisma` berada).
 *
 * JANGAN pakai `path.resolve(__dirname, '..', '..')`: di bundle produksi
 * webpack `__dirname` adalah direktori file hasil build (di bawah `.next/`),
 * sehingga REPO_ROOT jatuh ke `.next/` dan `latestTenantMigrationVersion()`
 * / `runTenantMigrateDeploy()` gagal ENOENT — terbukti live 2026-11-23
 * (detail + health + migrate tenant 500). Sebagai gantinya: jalan naik
 * dari `__dirname` sampai ketemu penanda skema tenant (maks 6 tingkat),
 * fallback ke `process.cwd()` (server start-all.sh + tsx jalan dari root
 * repo, jadi cwd selalu benar di sana).
 */
function findRepoRoot(): string {
  const marker = path.join('prisma', 'tenant', 'schema.prisma');
  let dir = __dirname;
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, marker))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

const REPO_ROOT = findRepoRoot();

function readDatabaseUrl(): string {
  loadTenantEnv();
  const raw = requireEnv('DATABASE_URL').trim();
  // Strip a wrapping quote pair, mirroring backup-db.sh / env.ts.
  return raw.replace(/^["']|["']$/g, '');
}

function parseDatabaseUrl(): URL {
  return new URL(readDatabaseUrl());
}

/** Connection string to the `postgres` maintenance DB, as the admin user
 *  from DATABASE_URL (the `woo` role, which has CREATEDB). Used for
 *  CREATE DATABASE / CREATE ROLE — never for tenant data. */
export function adminConnectionString(): string {
  const url = parseDatabaseUrl();
  url.pathname = '/postgres';
  url.search = '';
  return url.toString();
}

/** Connection string to a tenant database as its own least-privilege role
 *  (user = tenant code, database = tenant code). */
export function tenantConnectionString(code: string, password: string): string {
  const url = parseDatabaseUrl();
  url.username = code;
  url.password = password;
  url.pathname = '/' + code;
  // JANGAN tambah parameter pool di sini: URL ini juga dipakai psql /
  // runPsql, dan psql menolak parameter `connection_limit` ("invalid URI
  // query parameter", terbukti 2026-11-23 saat restore gagal). Batas pool
  // dipasang di getTenantClient() (datasourceUrl Prisma) saja.
  url.search = '';
  return url.toString();
}

/** Connection string to the `postgres` maintenance DB as the tenant's own
 *  role. Dipakai untuk mematikan koneksi tenant yang masih menempel sebelum
 *  DROP DATABASE: role tenant BOLEH men-terminate backend miliknya sendiri,
 *  sementara admin (`woo`) TIDAK BOLEH men-terminate backend role lain —
 *  terbukti live 2026-11-24 saat penghapusan Fase 4 gagal karena satu
 *  koneksi idle milik role tenant menghalangi DROP. */
export function tenantMaintenanceConnectionString(code: string, password: string): string {
  const url = parseDatabaseUrl();
  url.username = code;
  url.password = password;
  url.pathname = '/postgres';
  url.search = '';
  return url.toString();
}

/**
 * Batas pool per tenant — HANYA untuk PrismaClient (datasourceUrl).
 * Audit Phase 4: default Prisma 9 koneksi/pool (CPU×2+1) dengan
 * max_connections=100 hanya cukup untuk ~8 tenant (legacy 9 + master 9 +
 * N×9). connection_limit=3 → ~25 tenant; satu perusahaan jarang memakai
 * >3 koneksi bersamaan. Bila tenant mendekati ~20–25, pasang PgBouncer
 * (lihat PHASE4_AUDIT_2026-11-23.md §2.3). pool_timeout tetap 10 dtk.
 */
function withPoolLimit(tenantUrl: string): string {
  const u = new URL(tenantUrl);
  u.searchParams.set('connection_limit', '3');
  u.searchParams.set('pool_timeout', '10');
  return u.toString();
}

/** Admin connection string for one specific database (same admin user as
 *  DATABASE_URL, database name replaced). Used for schema grants. */
export function adminConnectionStringForDb(databaseName: string): string {
  const url = parseDatabaseUrl();
  url.pathname = '/' + databaseName;
  url.search = '';
  return url.toString();
}

/** The admin (superuser-ish) role name from DATABASE_URL — the owner of
 *  newly created tenant databases. */
export function adminDbUser(): string {
  return decodeURIComponent(parseDatabaseUrl().username);
}

/** Redact any `://credentials@` fragment from a message (psql errors
 *  should never contain credentials, but never trust that). */
function redactCredentials(text: string): string {
  return text.replace(/:\/\/[^/\s]*@/g, '://***@');
}

/** Run one SQL statement via `psql` against the given connection string.
 *  Uses `-t -A` (tuples only, unaligned) so stdout is machine-parseable.
 *  Timeout 60s. Throws an Error with the (redacted) stderr on failure.
 *  The connection string is passed as an argv element and is NEVER logged. */
export async function runPsql(connectionString: string, sql: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('psql', [
      connectionString,
      '-t',
      '-A',
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      sql,
    ], { timeout: 60_000, maxBuffer: 10 * 1024 * 1024 });
    return stdout.trim();
  } catch (e: any) {
    const stderr = redactCredentials(String(e?.stderr ?? e?.message ?? e));
    throw new Error(`psql failed: ${stderr}`);
  }
}

/** Generate a random database-role password (32 chars, URL-safe base64). */
export function generateDbPassword(): string {
  return crypto.randomBytes(24).toString('base64url');
}

/** Latest tenant migration version: the lexicographically largest directory
 *  in prisma/tenant/migrations (migration_lock.toml is not a version). */
export function latestTenantMigrationVersion(): string {
  const dir = path.join(REPO_ROOT, 'prisma', 'tenant', 'migrations');
  const names = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  return names.length ? names[names.length - 1] : '';
}

/** Run `prisma migrate deploy` for the tenant schema against a tenant
 *  database. Uses the local Prisma engine mirror (same env as heal.sh).
 *  Timeout 180s. Throws on non-zero exit. */
export async function runTenantMigrateDeploy(tenantUrl: string): Promise<string> {
  const engines = path.join(REPO_ROOT, 'node_modules', '@prisma', 'engines');
  const env = {
    ...process.env,
    DATABASE_URL: tenantUrl,
    PRISMA_ENGINES_MIRROR: 'http://localhost:8765',
    PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING: '1',
    PRISMA_SCHEMA_ENGINE_BINARY: path.join(engines, 'schema-engine-debian-openssl-3.0.x'),
    PRISMA_QUERY_ENGINE_LIBRARY: path.join(engines, 'libquery_engine-debian-openssl-3.0.x.so.node'),
    CHECKPOINT_DISABLE: '1',
  };
  try {
    const { stdout, stderr } = await execFileAsync(
      'npx',
      ['prisma', 'migrate', 'deploy', '--schema=prisma/tenant/schema.prisma'],
      { cwd: REPO_ROOT, timeout: 180_000, maxBuffer: 10 * 1024 * 1024, env },
    );
    return (stdout + '\n' + stderr).trim();
  } catch (e: any) {
    const out = redactCredentials(String(e?.stdout ?? '') + '\n' + String(e?.stderr ?? e?.message ?? e));
    throw new Error(`prisma migrate deploy failed: ${out.trim()}`);
  }
}

// ---------------------------------------------------------------------------
// Per-tenant Prisma clients (tenant schema), cached by tenant code.
// Same global-cache pattern as lib/db.ts / lib/tenant/master.ts.
// ---------------------------------------------------------------------------
const tenantClients = new Map<string, PrismaClient>();
/** Terakhir client dipakai (ms sejak epoch), per kode tenant. */
const tenantClientLastUsed = new Map<string, number>();
/** Batas idle sebelum client dieviksi (30 menit, rekomendasi audit §2.3). */
const TENANT_CLIENT_IDLE_MS = 30 * 60 * 1000;

/** Handler yang dipanggil saat satu client dieviksi (didaftarkan resolver). */
let evictedHandler: ((code: string) => void) | null = null;
/**
 * Daftarkan handler eviksi — dipakai lib/tenant/resolver.ts untuk menghapus
 * entri cache-nya sendiri (resolvedClients/tenantInfoCache), karena resolver
 * memegang referensi client yang sama. Tanpa ini, proxy tetap memakai
 * client yang sudah di-disconnect (cache resolver tidak tahu eviksi).
 */
export function onTenantClientEvicted(handler: (code: string) => void): void {
  evictedHandler = handler;
}

/**
 * Eviksi malas (P2-5): putuskan client tenant yang tidak dipakai lebih
 * dari TENANT_CLIENT_IDLE_MS. Dijalankan saat getTenantClient dipanggil —
 * tanpa timer global/setInterval. Client yang sedang diminta (exceptCode)
 * tidak pernah dieviksi; client lain hanya dieviksi bila lastUsed-nya
 * sudah lewat batas (request yang sedang berjalan selalu memperbarui
 * lastUsed di awal resolve, jadi tidak ikut terhapus).
 */
function evictIdleClients(exceptCode: string): void {
  const now = Date.now();
  for (const [code, client] of tenantClients) {
    if (code === exceptCode) continue;
    const lastUsed = tenantClientLastUsed.get(code) ?? 0;
    if (now - lastUsed <= TENANT_CLIENT_IDLE_MS) continue;
    tenantClients.delete(code);
    tenantClientLastUsed.delete(code);
    try {
      evictedHandler?.(code);
    } catch {
      // Handler eviksi tidak boleh menggagalkan pemakaian client lain.
    }
    // Jangan tunggu disconnect — client ini sudah idle >30 menit; tutup
    // pool-nya di latar belakang.
    void client.$disconnect().catch(() => {});
  }
}

function tenantCodeFromUrl(tenantUrl: string): string {
  return new URL(tenantUrl).pathname.replace(/^\//, '');
}

/** Get (or create) the cached Prisma client for one tenant database. */
export function getTenantClient(tenantUrl: string): PrismaClient {
  const code = tenantCodeFromUrl(tenantUrl);
  const existing = tenantClients.get(code);
  tenantClientLastUsed.set(code, Date.now());
  if (existing) {
    evictIdleClients(code);
    return existing;
  }
  const client = new PrismaClient({
    datasourceUrl: withPoolLimit(tenantUrl),
    log: ['error'],
  });
  tenantClients.set(code, client);
  evictIdleClients(code);
  return client;
}

/** Disconnect and drop the cached client for a tenant code. */
export async function disconnectTenantClient(code: string): Promise<void> {
  const client = tenantClients.get(code);
  if (!client) return;
  tenantClients.delete(code);
  tenantClientLastUsed.delete(code);
  try {
    await client.$disconnect();
  } catch {
    // Already disconnected — ignore.
  }
}
