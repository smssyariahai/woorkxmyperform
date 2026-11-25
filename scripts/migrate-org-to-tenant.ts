// Phase 6 — CLI migrasi org legacy -> tenant DB.
//
//   DRY-RUN (default):
//     npx tsx scripts/migrate-org-to-tenant.ts --org <legacyOrgId>
//   Tenant dibuat + data disalin + diverifikasi + login HTTP diuji, lalu
//   tenant DIBERSIHKAN TOTAL di finally.
//
//   CUTOVER (hanya di jendela maintenance, oleh parent):
//     npx tsx scripts/migrate-org-to-tenant.ts --org <legacyOrgId> \
//       --cutover --confirm-cutover=<slug-org>
//   Satu-satunya perbedaan dengan dry-run: PlatformUser.passwordHash =
//   hash ASLI legacy User.password (bukan hash test) — lihat
//   lib/tenant/migration.ts. Pengaman: --confirm-cutover HARUS sama persis
//   dengan slug Organization legacy yang dimigrasi; bila tidak cocok (atau
//   tidak ada) CLI berhenti exit 1 TANPA melakukan apa pun. Bila cutover
//   SUKSES, tenant DIPERTAHANKAN (tidak ada cleanup); bila GAGAL, cleanup
//   total berjalan sama seperti dry-run. Verifikasi login HTTP dilewati
//   di cutover (password asli tidak diketahui skrip — parent memverifikasi
//   login dengan password asli di jendela maintenance).
//   --no-dry-run DITOLAK (bukan nama flag yang didukung).
// TIDAK menulis apa pun ke woork_saas (hanya baca); snapshot sebelum/
// sesudah membuktikan woork_saas tidak berubah.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { legacyPrisma } from '../lib/db';
import { masterPrisma } from '../lib/tenant/master';
import {
  TEST_MIGRATION_PASSWORD,
  cleanupMigratedTenant,
  migrateOrgToTenant,
} from '../lib/tenant/migration';

const BASE = 'https://staging-fgprxrfzsuzvhmqc.woork.id';

function loadEnv(): void {
  for (const key of ['DATABASE_URL', 'MASTER_DATABASE_URL']) {
    if (process.env[key]) continue;
    try {
      const lines = readFileSync(join(process.cwd(), '.env'), 'utf8').split('\n');
      for (const line of lines) {
        const m = line.match(new RegExp(`^${key}=(.*)$`));
        if (m) {
          process.env[key] = m[1].trim().replace(/^["']|["']$/g, '');
          break;
        }
      }
    } catch { /* .env tidak ada — Prisma akan error dengan pesan yang jelas */ }
  }
}

class Jar {
  private cookies = new Map<string, string>();
  store(res: Response): void {
    const getSetCookie = (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie;
    const setCookies = typeof getSetCookie === 'function' ? getSetCookie.call(res.headers) : [];
    for (const c of setCookies) {
      const pair = c.split(';')[0] ?? '';
      const eq = pair.indexOf('=');
      if (eq > 0) this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }
  header(): string {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }
  has(name: string): boolean {
    return this.cookies.has(name);
  }
}

async function req(jar: Jar, urlPath: string): Promise<{ status: number; text: string; json: any }> {
  const res = await fetch(BASE + urlPath, { headers: { Cookie: jar.header() }, redirect: 'manual' });
  jar.store(res);
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* bukan JSON */ }
  return { status: res.status, text, json };
}

async function login(email: string, password: string): Promise<Jar> {
  const jar = new Jar();
  const csrf = await req(jar, '/api/auth/csrf');
  const token = (csrf.json as { csrfToken?: string } | null)?.csrfToken;
  if (!token) throw new Error(`login ${email}: csrfToken kosong (status ${csrf.status})`);
  const body = new URLSearchParams({ csrfToken: token, email, password, json: 'true' });
  const res = await fetch(BASE + '/api/auth/callback/credentials', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: jar.header() },
    body: body.toString(),
    redirect: 'manual',
  });
  jar.store(res);
  if (!jar.has('__Secure-authjs.session-token')) {
    throw new Error(`login ${email}: tidak ada session cookie (status ${res.status})`);
  }
  return jar;
}

async function snapshotLegacy(orgId: string): Promise<{ tables: number; users: number; auditLog: number; customers: number }> {
  const [tables] = await legacyPrisma.$queryRaw<{ c: bigint }[]>`
    SELECT count(*)::bigint AS c FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`;
  const [users] = await legacyPrisma.$queryRaw<{ c: bigint }[]>`SELECT count(*)::bigint AS c FROM "User"`;
  const [auditLog] = await legacyPrisma.$queryRaw<{ c: bigint }[]>`
    SELECT count(*)::bigint AS c FROM "AuditLog" WHERE "organizationId" = ${orgId}`;
  const [customers] = await legacyPrisma.$queryRaw<{ c: bigint }[]>`
    SELECT count(*)::bigint AS c FROM "Customer" WHERE "organizationId" = ${orgId}`;
  return {
    tables: Number(tables.c), users: Number(users.c),
    auditLog: Number(auditLog.c), customers: Number(customers.c),
  };
}

async function main(): Promise<number> {
  loadEnv();
  const args = process.argv.slice(2);
  const cutover = args.includes('--cutover');
  if (args.includes('--no-dry-run')) {
    console.error('DITOLAK: gunakan --cutover (dengan --confirm-cutover=<slug-org>), bukan --no-dry-run.');
    return 2;
  }
  const orgIdx = args.indexOf('--org');
  const orgId = orgIdx >= 0 ? args[orgIdx + 1] : undefined;
  if (!orgId) {
    console.error('Pemakaian: npx tsx scripts/migrate-org-to-tenant.ts --org <legacyOrgId> [--cutover --confirm-cutover=<slug-org>]');
    return 2;
  }
  const confirmArg = args.find((a) => a.startsWith('--confirm-cutover='));
  const confirmSlug = confirmArg ? confirmArg.slice('--confirm-cutover='.length) : undefined;
  if (!cutover && confirmArg) {
    console.log('PERINGATAN: --confirm-cutover diabaikan tanpa --cutover (mode dry-run).');
  }
  // Pengaman cutover: konfirmasi eksplisit per slug org — HARUS sama persis
  // dengan slug Organization legacy yang dimigrasi. Dicek SEBELUM migrasi
  // apa pun (hanya baca legacy); bila tidak cocok -> exit 1 TANPA
  // melakukan apa pun. Mode cutover HANYA dijalankan parent di jendela
  // maintenance — TIDAK PERNAH di dry-run.
  if (cutover) {
    const org = await legacyPrisma.organization.findUnique({
      where: { id: orgId },
      select: { slug: true, name: true },
    });
    if (!org) {
      console.error(`CUTOVER DITOLAK: Organization legacy tidak ditemukan: ${orgId}`);
      return 1;
    }
    if (!confirmSlug || confirmSlug !== org.slug) {
      console.error('CUTOVER DITOLAK: mode --cutover wajib disertai --confirm-cutover=<slug-org> yang sama persis dengan slug org yang dimigrasi.');
      console.error(`  org: "${org.name}" slug: "${org.slug}" — yang diberikan: ${confirmSlug ? `"${confirmSlug}"` : '(tidak ada)'}`);
      console.error('  Mode cutover HANYA dijalankan di jendela maintenance. Tanpa konfirmasi yang cocok, tidak ada yang dilakukan.');
      return 1;
    }
    console.log('== Phase 6: CUTOVER migrasi org legacy -> tenant ==');
    console.log(`org legacy: ${orgId} ("${org.name}", slug "${org.slug}") — mode CUTOVER, tenant DIPERTAHANKAN bila sukses`);
  } else {
    console.log('== Phase 6 Tahap 1: dry-run migrasi org legacy -> tenant ==');
    console.log(`org legacy: ${orgId} (mode DRY-RUN — cleanup total di akhir)`);
  }

  const before = await snapshotLegacy(orgId);
  console.log(`snapshot woork_saas SEBELUM: tabel ${before.tables}, user ${before.users}, auditLog org ${before.auditLog}, customer org ${before.customers}`);

  let tenantId = '';
  let tenantCode = '';
  let httpOk = false;
  let succeeded = false;
  try {
    let result;
    try {
      result = await migrateOrgToTenant(orgId, { log: (m) => console.log(m), cutover });
    } catch (e: any) {
      // migrateOrgToTenant menempelkan id tenant ke error bila gagal
      // setelah provisioning — agar cleanup di finally tetap jalan.
      tenantId = e?.tenantId ?? '';
      tenantCode = e?.tenantCode ?? '';
      throw e;
    }
    tenantId = result.tenantId;
    tenantCode = result.tenantCode;
    console.log(`\n== HASIL SALIN (${result.companyName} -> ${tenantCode}) ==`);
    const failed = result.tables.filter((t) => !t.pass);
    for (const t of result.tables) {
      if (t.legacy > 0 || t.tenant > 0) {
        console.log(`  ${t.pass ? 'PASS' : 'FAIL'} ${t.table}: legacy ${t.legacy} -> tenant ${t.tenant}`);
      }
    }
    console.log(`  anggota dimigrasi: ${result.membersMigrated}; mirror User: ${result.referencedUsersMirrored}`);
    console.log(`  checksum invoice: legacy ${result.invoiceTotalLegacy} vs tenant ${result.invoiceTotalTenant}`);
    if (!result.allPass || failed.length > 0) {
      console.log(`\nSALIN GAGAL (${failed.length} tabel) — berhenti, cleanup tetap jalan.`);
      return 1;
    }

    // --- Verifikasi HTTP: login test -> sesi tenant -----------------------
    // DRY-RUN saja: login memakai TEST_MIGRATION_PASSWORD. Di CUTOVER,
    // password test TIDAK berlaku (hash ASLI legacy yang disalin) dan
    // password asli tidak diketahui skrip — verifikasi login dilakukan
    // manual oleh parent dengan password asli di jendela maintenance.
    if (cutover) {
      console.log('\n== VERIFIKASI HTTP DILEWATI (mode cutover) ==');
      console.log('  Login diuji manual oleh parent dengan password asli org (hash legacy sudah disalin).');
      httpOk = true;
    } else {
      console.log(`\n== VERIFIKASI HTTP (login test ${result.adminEmail}) ==`);
      const jar = await login(result.adminEmail, TEST_MIGRATION_PASSWORD);
      console.log('  login: OK (session cookie didapat)');
      const cust = await req(jar, '/api/customers?perPage=50');
      const items = cust.json?.data?.items ?? [];
      const custOk = cust.status === 200 && cust.json?.success === true && items.length === before.customers;
      console.log(`  [${custOk ? 'PASS' : 'FAIL'}] GET /api/customers: status ${cust.status}, total ${cust.json?.data?.total} (harap ${before.customers})`);
      const dash = await req(jar, '/dashboard');
      const dashOk = dash.status === 200 && dash.text.includes(result.companyName);
      console.log(`  [${dashOk ? 'PASS' : 'FAIL'}] GET /dashboard memuat "${result.companyName}": status ${dash.status}`);
      const office = await req(jar, '/api/kantor/office');
      const officeOk = office.status === 200;
      console.log(`  [${officeOk ? 'PASS' : 'FAIL'}] GET /api/kantor/office: status ${office.status}`);
      httpOk = custOk && dashOk && officeOk;
      if (!httpOk) {
        console.log('\nVERIFIKASI HTTP GAGAL — berhenti, cleanup tetap jalan.');
        return 1;
      }
    }
    if (cutover) {
      console.log(`\n== CUTOVER SELESAI: ${result.companyName} -> ${tenantCode} (${tenantId}) ==`);
      console.log('  Tenant DIPERTAHANKAN. Langkah manual berikut di jendela maintenance:');
      console.log('  1) Login sebagai admin org dengan password ASLI -> sesi tenant.');
      console.log('  2) Cek /api/customers, /dashboard, dan (WOORK.ID) 1 invoice.');
      console.log('  3) Scan QR WhatsApp ulang (bila org memakai WA).');
      console.log('  4) Pantau cron + backup tenant 10-menit.');
    } else {
      console.log('\n== DRY-RUN PASS ==');
    }
    succeeded = true;
    return 0;
  } finally {
    // --- Cleanup (dry-run: selalu; cutover: HANYA bila gagal) -------------
    // Cutover sukses = tenant DIPERTAHANKAN (itu tujuan migrasi).
    // Cutover gagal = cleanup total, IDENTIK dengan dry-run.
    console.log('\n== CLEANUP ==');
    if (cutover && succeeded) {
      console.log(`  CUTOVER SUKSES — tenant ${tenantCode} (${tenantId}) DIPERTAHANKAN, tidak ada cleanup.`);
    } else if (tenantId && tenantCode) {
      const left = await cleanupMigratedTenant(tenantId, tenantCode).catch((e: unknown) => [
        `cleanup throw: ${String((e as Error)?.message ?? e).slice(0, 200)}`,
      ]);
      console.log(`  tenant ${tenantCode} dibersihkan${left.length ? ` (SISA: ${left.join('; ')})` : ''}`);
    } else {
      console.log('  tidak ada tenant yang dibuat (gagal sebelum provisioning).');
    }
    const dbs = await masterPrisma.$queryRaw<{ datname: string }[]>`
      SELECT datname FROM pg_database WHERE datname LIKE 'woork_t_%'`.catch(() => [{ datname: '(query gagal)' }]);
    const tenantsLeft = await masterPrisma.tenant.count().catch(() => -1);
    const platformUsersLeft = await masterPrisma.platformUser.count().catch(() => -1);
    console.log(`  sisa DB woork_t_*: ${JSON.stringify(dbs.map((d) => d.datname))}`);
    console.log(`  sisa master Tenant: ${tenantsLeft}, PlatformUser: ${platformUsersLeft}`);
    const after = await snapshotLegacy(orgId);
    const legacyUnchanged =
      after.tables === before.tables && after.users === before.users &&
      after.auditLog === before.auditLog && after.customers === before.customers;
    console.log(`  woork_saas sesudah: tabel ${after.tables}, user ${after.users}, auditLog org ${after.auditLog}, customer org ${after.customers} — ${legacyUnchanged ? 'TIDAK BERUBAH ✓' : 'BERUBAH! ✗'}`);
    if (!legacyUnchanged) console.log('  PERHATIAN: woork_saas berubah selama migrasi — selidiki sebelum lanjut.');
    await masterPrisma.$disconnect().catch(() => undefined);
    await legacyPrisma.$disconnect().catch(() => undefined);
  }
}

main()
  .then((code) => { process.exit(code); })
  .catch((e: unknown) => {
    console.error('FATAL:', e);
    process.exit(1);
  });
