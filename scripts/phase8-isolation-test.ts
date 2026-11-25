// Phase 8 Bagian 1 — Uji isolasi lintas tenant (live, lewat HTTP publik).
//
// Membuat 2 tenant uji sekali pakai (A dan B), lalu menguji:
//   1. Isolasi baca: tiap tenant hanya melihat datanya sendiri; legacy
//      hanya melihat data legacy.
//   2. Isolasi tulis lintas tenant: A tidak bisa mengubah lead / membalas
//      tiket milik B (harus 404/403) dan data B tetap utuh.
//   3. Rute super-admin ditolak untuk sesi tenant (401/403).
//   4. Header `x-tenant-code` palsu tanpa sesi TIDAK memberi akses ke
//      data tenant.
//   5. Performa kasar: 20x GET /api/customers sebagai tenant A (observasi).
//
// Cleanup TOTAL di finally: master rows + file backup tenant + DROP
// DATABASE + DROP ROLE (via `su postgres`). Bila satu assertion GAGAL,
// skrip tetap lanjut, lalu exit code 1.
//
// TIDAK menyentuh data legacy (hanya GET list), TIDAK memanggil billing
// renew, TIDAK mengirim WA, TIDAK membuat sesi salat/briefing.
import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { registerCompany } from '../lib/tenant/registration';
import { retryProvisioning } from '../lib/tenant/provisioning';
import { masterPrisma } from '../lib/tenant/master';
import { getTenantClientForCode } from '../lib/tenant/resolver';
import { disconnectTenantClient } from '../lib/tenant/tenant-db';

const execFileAsync = promisify(execFile);

const BASE = 'https://staging-fgprxrfzsuzvhmqc.woork.id';
const TEST_PASSWORD = 'UjiPhase82026!';
const LEGACY_ADMIN_EMAIL = 'admin@woork.id';
const LEGACY_ADMIN_PASSWORD = 'password123';

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

interface TestTenant {
  label: string;
  slug: string;
  adminEmail: string;
  tenantId: string;
  tenantCode: string;
  customerId: string;
  customerName: string;
  leadId: string;
  ticketId: string;
}

interface CheckResult {
  id: string;
  name: string;
  pass: boolean;
  detail: string;
}

const results: CheckResult[] = [];

function check(id: string, name: string, pass: boolean, detail: string): void {
  results.push({ id, name, pass, detail });
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${id} ${name} — ${detail}`);
}

/** Cookie jar minimal untuk fetch (undici tidak menyimpan cookie sendiri). */
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

interface HttpResult {
  status: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json: any;
  text: string;
}

async function req(jar: Jar | null, urlPath: string, init: RequestInit = {}): Promise<HttpResult> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string> | undefined) };
  const ck = jar ? jar.header() : '';
  if (ck) headers['Cookie'] = ck;
  const res = await fetch(BASE + urlPath, { ...init, headers, redirect: 'manual' });
  if (jar) jar.store(res);
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    // bukan JSON (mis. redirect/HTML) — json tetap null
  }
  return { status: res.status, json, text };
}

async function login(email: string, password: string): Promise<Jar> {
  const jar = new Jar();
  const csrf = await req(jar, '/api/auth/csrf');
  const token = (csrf.json as { csrfToken?: string } | null)?.csrfToken;
  if (!token) throw new Error(`login ${email}: csrfToken kosong (status ${csrf.status})`);
  const body = new URLSearchParams({ csrfToken: token, email, password, json: 'true' });
  const res = await req(jar, '/api/auth/callback/credentials', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!jar.has('__Secure-authjs.session-token')) {
    throw new Error(
      `login ${email}: tidak ada session cookie (status ${res.status}, body ${res.text.slice(0, 200)})`,
    );
  }
  return jar;
}

async function setupTenant(label: string): Promise<TestTenant> {
  const lower = label.toLowerCase();
  const companyName = `PT Uji Phase8 ${label}`;
  const slug = `uji-phase8-${lower}`;
  const adminEmail = `uji-phase8-${lower}@example.com`;
  const r = await registerCompany({
    companyName,
    slug,
    adminName: `Admin Uji Phase8 ${label}`,
    adminEmail,
    adminPassword: TEST_PASSWORD,
  });
  console.log(`[${label}] terdaftar: ${r.tenantCode} (${r.tenantId}) — menunggu ACTIVE...`);
  let active = false;
  for (let i = 0; i < 45; i++) {
    await sleep(2000);
    const t = await masterPrisma.tenant.findUnique({
      where: { id: r.tenantId },
      select: { tenantStatus: true },
    });
    if (t?.tenantStatus === 'ACTIVE') {
      active = true;
      break;
    }
    if (i === 14) {
      console.log(`[${label}] masih PENDING setelah ~30 dtk — retryProvisioning`);
      await retryProvisioning(r.tenantId).catch((e: unknown) =>
        console.log(`[${label}] retry error:`, String((e as Error)?.message ?? e)),
      );
    }
  }
  if (!active) throw new Error(`tenant ${label} tidak ACTIVE`);
  const client = await getTenantClientForCode(r.tenantCode);
  const admin = await client.user.findFirstOrThrow();
  const stage = await client.leadStage.findFirstOrThrow({ orderBy: { order: 'asc' } });
  const customerName = `Pelanggan Uji ${label}`;
  const customer = await client.customer.create({
    data: { organizationId: r.tenantId, name: customerName },
  });
  const lead = await client.lead.create({
    data: { organizationId: r.tenantId, customerId: customer.id, stageId: stage.id, ownerId: admin.id },
  });
  const ticket = await client.ticket.create({
    data: {
      organizationId: r.tenantId,
      createdById: admin.id,
      title: `Tiket Uji ${label}`,
      category: 'Umum',
      priority: 'normal',
      description: `Tiket uji isolasi ${label}`,
    },
  });
  console.log(`[${label}] seed: customer ${customer.id}, lead ${lead.id}, tiket ${ticket.id}`);
  return {
    label,
    slug,
    adminEmail,
    tenantId: r.tenantId,
    tenantCode: r.tenantCode,
    customerId: customer.id,
    customerName,
    leadId: lead.id,
    ticketId: ticket.id,
  };
}

/** Hapus total satu tenant uji. Mengembalikan daftar sisa yang gagal dibersihkan. */
async function cleanupTenant(t: TestTenant): Promise<string[]> {
  const leftovers: string[] = [];
  // Putuskan pool client tenant di proses ini dulu (kalau tidak, DROP
  // DATABASE gagal karena koneksi sendiri masih terbuka).
  await disconnectTenantClient(t.tenantCode).catch(() => undefined);
  try {
    await masterPrisma.platformAuditLog.deleteMany({ where: { tenantId: t.tenantId } });
  } catch {
    // baris audit mungkin sudah terhapus / tidak ada
  }
  await masterPrisma.provisioningJob.deleteMany({ where: { tenantId: t.tenantId } });
  await masterPrisma.tenantMembership.deleteMany({ where: { tenantId: t.tenantId } });
  await masterPrisma.subscription.deleteMany({ where: { tenantId: t.tenantId } });
  await masterPrisma.tenantDatabaseRegistry.deleteMany({ where: { tenantId: t.tenantId } });
  await masterPrisma.tenant.delete({ where: { id: t.tenantId } }).catch(() => undefined);
  await masterPrisma.platformUser.deleteMany({ where: { email: t.adminEmail } });
  // File backup tenant (bila cron 10-menit sempat membuatnya).
  const dir = path.join(process.cwd(), '..', 'woorkxmyperform-docs', 'db-restore', 'tenant-backups');
  try {
    for (const f of fs.readdirSync(dir)) {
      if (f.startsWith(t.tenantCode)) fs.unlinkSync(path.join(dir, f));
    }
  } catch {
    // direktori tidak ada — tidak apa-apa
  }
  // DROP DATABASE + ROLE sebagai postgres (woo tidak bisa terminate
  // backend milik role tenant yang dipegang proses next-server).
  const sqlFile = path.join(os.tmpdir(), `phase8-drop-${t.tenantCode}.sql`);
  const sql = [
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${t.tenantCode}';`,
    `DROP DATABASE IF EXISTS "${t.tenantCode}";`,
    `DROP ROLE IF EXISTS "${t.tenantCode}";`,
  ].join('\n');
  fs.writeFileSync(sqlFile, sql);
  // File HARUS bisa dibaca user postgres: shell exec memakai umask 0007
  // sehingga writeFileSync menghasilkan mode 660 milik root — tanpa chmod
  // ini psql sebagai postgres gagal "Permission denied" (ditemukan saat
  // uji pertama 2026-11-23: DB/role tertinggal, dibersihkan manual).
  fs.chmodSync(sqlFile, 0o644);
  try {
    await execFileAsync('su', ['postgres', '-c', `psql -v ON_ERROR_STOP=1 -q -f ${sqlFile}`]);
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    const detail = String(err.stderr ?? err.stdout ?? err.message ?? e).trim().slice(0, 400);
    leftovers.push(`DB/role ${t.tenantCode} (su postgres gagal: ${detail})`);
  } finally {
    try {
      fs.unlinkSync(sqlFile);
    } catch {
      // abaikan
    }
  }
  return leftovers;
}

async function main(): Promise<number> {
  const tenants: TestTenant[] = [];
  try {
    console.log('== Phase 8 Bagian 1: uji isolasi lintas tenant ==');
    console.log(`target: ${BASE}`);
    const a = await setupTenant('A');
    tenants.push(a);
    const b = await setupTenant('B');
    tenants.push(b);
    console.log(`tenant A: ${a.tenantCode} (${a.tenantId})`);
    console.log(`tenant B: ${b.tenantCode} (${b.tenantId})`);

    const jarA = await login(a.adminEmail, TEST_PASSWORD);
    const jarB = await login(b.adminEmail, TEST_PASSWORD);
    const jarLegacy = await login(LEGACY_ADMIN_EMAIL, LEGACY_ADMIN_PASSWORD);
    console.log('login: A + B + legacy OK (session cookie didapat)');

    // ---- 1a. Tenant A hanya melihat customer A -------------------------
    const resA = await req(jarA, '/api/customers?perPage=50');
    const itemsA: Array<{ name?: string }> = resA.json?.data?.items ?? [];
    const namesA = itemsA.map((c) => c.name ?? '');
    check(
      '1a',
      'Tenant A hanya melihat customer A',
      resA.status === 200 &&
        resA.json?.success === true &&
        namesA.length === 1 &&
        namesA[0] === a.customerName,
      `status ${resA.status}, total ${resA.json?.data?.total}, names ${JSON.stringify(namesA)}`,
    );

    // ---- 1b. Tenant B hanya melihat customer B -------------------------
    const resB = await req(jarB, '/api/customers?perPage=50');
    const itemsB: Array<{ name?: string }> = resB.json?.data?.items ?? [];
    const namesB = itemsB.map((c) => c.name ?? '');
    check(
      '1b',
      'Tenant B hanya melihat customer B',
      resB.status === 200 &&
        resB.json?.success === true &&
        namesB.length === 1 &&
        namesB[0] === b.customerName,
      `status ${resB.status}, total ${resB.json?.data?.total}, names ${JSON.stringify(namesB)}`,
    );

    // ---- 1c. Legacy hanya melihat customer legacy (6), bukan A/B -------
    const resL = await req(jarLegacy, '/api/customers?perPage=50');
    const itemsL: Array<{ name?: string }> = resL.json?.data?.items ?? [];
    const namesL = itemsL.map((c) => c.name ?? '');
    const leakedL = namesL.filter((n) => n.includes('Pelanggan Uji'));
    check(
      '1c',
      'Legacy hanya melihat customer legacy',
      resL.status === 200 &&
        resL.json?.success === true &&
        (resL.json?.data?.total as number) === 6 &&
        leakedL.length === 0,
      `status ${resL.status}, total ${resL.json?.data?.total}, bocor: ${JSON.stringify(leakedL)}`,
    );

    // ---- 2a. A PUT lead milik B -> harus ditolak ------------------------
    const putLead = await req(jarA, `/api/leads/${b.leadId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: 'SERANGAN PHASE8' }),
    });
    check(
      '2a',
      'A tidak bisa mengubah lead milik B',
      putLead.status === 404 || putLead.status === 403,
      `status ${putLead.status}, body ${putLead.text.slice(0, 160)}`,
    );

    // ---- 2b. A POST balasan ke tiket milik B -> harus ditolak ----------
    const postReply = await req(jarA, `/api/tiket/${b.ticketId}/balasan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'SERANGAN PHASE8' }),
    });
    check(
      '2b',
      'A tidak bisa membalas tiket milik B',
      postReply.status === 404 || postReply.status === 403,
      `status ${postReply.status}, body ${postReply.text.slice(0, 160)}`,
    );

    // ---- 2c. Data B tetap utuh -----------------------------------------
    const detailB = await req(jarB, `/api/tiket/${b.ticketId}`);
    const repliesB: unknown[] = detailB.json?.data?.ticket?.replies ?? [];
    const clientB = await getTenantClientForCode(b.tenantCode);
    const leadB = await clientB.lead.findUnique({ where: { id: b.leadId }, select: { notes: true } });
    check(
      '2c',
      'Data B tetap utuh setelah serangan A',
      detailB.status === 200 && repliesB.length === 0 && (leadB?.notes ?? null) === null,
      `tiket B: status ${detailB.status}, replies ${repliesB.length}; lead B notes: ${JSON.stringify(leadB?.notes ?? null)}`,
    );

    // ---- 3. Sesi tenant tidak boleh masuk rute super-admin --------------
    const superRes = await req(jarA, '/api/super/tenants');
    check(
      '3',
      'Tenant A ditolak di /api/super/tenants',
      superRes.status === 401 || superRes.status === 403,
      `status ${superRes.status}, body ${superRes.text.slice(0, 160)}`,
    );

    // ---- 4. Header x-tenant-code palsu tanpa sesi -----------------------
    const fakeRes = await req(null, '/api/customers?perPage=50', {
      headers: { 'x-tenant-code': a.tenantCode },
    });
    const fakeLeak = fakeRes.text.includes(a.customerName);
    check(
      '4',
      'Header x-tenant-code palsu tanpa sesi tidak memberi data tenant',
      (fakeRes.status === 401 || fakeRes.status === 403) && !fakeLeak,
      `status ${fakeRes.status}, bocor nama customer A: ${fakeLeak}`,
    );

    // ---- 5. Performa kasar: 20x GET /api/customers sebagai A -----------
    const times: number[] = [];
    let perfOk = true;
    for (let i = 0; i < 20; i++) {
      const t0 = Date.now();
      const r = await req(jarA, '/api/customers?perPage=10');
      times.push(Date.now() - t0);
      if (r.status !== 200 || r.json?.success !== true) perfOk = false;
    }
    const avg = Math.round(times.reduce((s, v) => s + v, 0) / times.length);
    const max = Math.max(...times);
    const min = Math.min(...times);
    check('5', 'Performa 20x GET /api/customers (observasi)', perfOk, `20/20 sukses, rata-rata ${avg} ms, min ${min} ms, maks ${max} ms`);

    // ---- Ringkasan -------------------------------------------------------
    const failed = results.filter((r) => !r.pass);
    console.log(`\n== RINGKASAN: ${results.length - failed.length}/${results.length} PASS ==`);
    for (const r of failed) console.log(`  GAGAL: ${r.id} ${r.name} — ${r.detail}`);
    return failed.length === 0 ? 0 : 1;
  } finally {
    // ---- Cleanup TOTAL (selalu jalan, termasuk saat assertion gagal) ----
    console.log('\n== CLEANUP ==');
    const allLeftovers: string[] = [];
    for (const t of tenants) {
      console.log(`membersihkan tenant ${t.label} (${t.tenantCode})...`);
      const left = await cleanupTenant(t).catch((e: unknown) => [
        `cleanup ${t.tenantCode} throw: ${String((e as Error)?.message ?? e).slice(0, 150)}`,
      ]);
      allLeftovers.push(...left);
      console.log(`tenant ${t.label} dibersihkan${left.length ? ` (SISA: ${left.join('; ')})` : ''}`);
    }
    const dbs = await masterPrisma
      .$queryRaw<Array<{ datname: string }>>`SELECT datname FROM pg_database WHERE datname LIKE 'woork_t_%'`
      .catch(() => [{ datname: '(query gagal)' }]);
    const tenantsLeft = await masterPrisma.tenant.count().catch(() => -1);
    console.log(`sisa DB woork_t_*: ${JSON.stringify(dbs.map((d) => d.datname))}`);
    console.log(`sisa master Tenant: ${tenantsLeft}`);
    if (allLeftovers.length > 0) {
      console.log(`PERHATIAN — cleanup tidak total: ${allLeftovers.join(' | ')}`);
    }
    await masterPrisma.$disconnect().catch(() => undefined);
  }
}

main()
  .then((code) => {
    process.exit(code);
  })
  .catch((e: unknown) => {
    console.error('FATAL:', e);
    masterPrisma.$disconnect().catch(() => undefined);
    process.exit(1);
  });
