// Phase 8 Bagian 2 — Uji konkurensi, kegagalan provisioning, dan load
// ringan (live, lewat HTTP publik + panggilan library langsung).
//
//   A. Konkurensi: 10x POST /api/customers paralel (5 tenant A + 5 tenant B)
//      → tiap tenant hanya punya customer-nya sendiri, tanpa 500; lalu 2x
//      PUT bersamaan ke lead yang sama milik A (last-write-wins).
//   B. Kegagalan provisioning:
//      B.1 slug ganda ditolak bersih (tanpa tenant/DB setengah jadi).
//      B.2 email admin ganda ditolak bersih.
//      B.3 retry via API pada tenant ACTIVE → 409, data tenant utuh.
//      B.4 tenant PENDING (record dibuat tanpa menjalankan step) →
//          retryProvisioning → ACTIVE (jalur resume pasca-reset).
//   C. Load ringan (observasi): 30x GET /api/customers + 10x GET
//      /api/kantor/office paralel (maks 40 request) → sukses/5xx, avg/p95/maks.
//
// Cleanup TOTAL di finally: master rows + file backup tenant + DROP
// DATABASE + DROP ROLE (via `su postgres`). Bila satu assertion GAGAL,
// skrip tetap lanjut, lalu exit code 1.
//
// TIDAK menyentuh data legacy (hanya GET list), TIDAK memanggil billing
// renew, TIDAK mengirim WA, TIDAK membuat sesi salat/briefing, TIDAK
// mematikan PostgreSQL.
import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { registerCompany } from '../lib/tenant/registration';
import { createTenantRecord, retryProvisioning } from '../lib/tenant/provisioning';
import { masterPrisma } from '../lib/tenant/master';
import { getTenantClientForCode } from '../lib/tenant/resolver';
import { disconnectTenantClient } from '../lib/tenant/tenant-db';

const execFileAsync = promisify(execFile);

const BASE = 'https://staging-fgprxrfzsuzvhmqc.woork.id';
const TEST_PASSWORD = 'UjiPhase82026!';
const LEGACY_ADMIN_EMAIL = 'admin@woork.id';
const LEGACY_ADMIN_PASSWORD = 'password123';

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

interface CleanupRef {
  label: string;
  slug: string;
  adminEmail: string;
  tenantId: string;
  tenantCode: string;
}

interface TestTenant extends CleanupRef {
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

async function login(email: string, password: string, loginType?: string): Promise<Jar> {
  const jar = new Jar();
  const csrf = await req(jar, '/api/auth/csrf');
  const token = (csrf.json as { csrfToken?: string } | null)?.csrfToken;
  if (!token) throw new Error(`login ${email}: csrfToken kosong (status ${csrf.status})`);
  const params: Record<string, string> = { csrfToken: token, email, password, json: 'true' };
  if (loginType) params.loginType = loginType;
  const body = new URLSearchParams(params);
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
  const companyName = `PT Uji Phase8S ${label}`;
  const slug = `uji-phase8s-${lower}`;
  const adminEmail = `uji-phase8s-${lower}@example.com`;
  const r = await registerCompany({
    companyName,
    slug,
    adminName: `Admin Uji Phase8S ${label}`,
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
      description: `Tiket uji stress ${label}`,
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

async function countTenantDbs(): Promise<number> {
  const rows = await masterPrisma
    .$queryRaw<Array<{ n: bigint }>>`SELECT count(*)::bigint AS n FROM pg_database WHERE datname LIKE 'woork_t_%'`
    .catch(() => [{ n: BigInt(-1) }]);
  return Number(rows[0]?.n ?? -1);
}

async function dbExists(code: string): Promise<boolean> {
  const rows = await masterPrisma
    .$queryRaw<Array<{ n: bigint }>>`SELECT count(*)::bigint AS n FROM pg_database WHERE datname = ${code}`
    .catch(() => [{ n: BigInt(-1) }]);
  return Number(rows[0]?.n ?? 0) > 0;
}

/** Hapus total satu tenant uji. Mengembalikan daftar sisa yang gagal dibersihkan. */
async function cleanupTenant(t: CleanupRef): Promise<string[]> {
  const leftovers: string[] = [];
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
  const dir = path.join(process.cwd(), '..', 'woorkxmyperform-docs', 'db-restore', 'tenant-backups');
  try {
    for (const f of fs.readdirSync(dir)) {
      if (f.startsWith(t.tenantCode)) fs.unlinkSync(path.join(dir, f));
    }
  } catch {
    // direktori tidak ada — tidak apa-apa
  }
  const sqlFile = path.join(os.tmpdir(), `phase8-drop-${t.tenantCode}.sql`);
  const sql = [
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${t.tenantCode}';`,
    `DROP DATABASE IF EXISTS "${t.tenantCode}";`,
    `DROP ROLE IF EXISTS "${t.tenantCode}";`,
  ].join('\n');
  fs.writeFileSync(sqlFile, sql);
  // File HARUS bisa dibaca user postgres (umask 0007 → mode 660 milik root).
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
  const tenants: CleanupRef[] = [];
  try {
    console.log('== Phase 8 Bagian 2: konkurensi, kegagalan provisioning, load ==');
    console.log(`target: ${BASE}`);
    const a = await setupTenant('A');
    tenants.push(a);
    const b = await setupTenant('B');
    tenants.push(b);
    const c = await setupTenant('C');
    tenants.push(c);
    console.log(`tenant A: ${a.tenantCode}, B: ${b.tenantCode}, C: ${c.tenantCode}`);

    const jarA = await login(a.adminEmail, TEST_PASSWORD);
    const jarB = await login(b.adminEmail, TEST_PASSWORD);
    const jarC = await login(c.adminEmail, TEST_PASSWORD);
    const jarSuper = await login(LEGACY_ADMIN_EMAIL, LEGACY_ADMIN_PASSWORD, 'admin');
    console.log('login: A + B + C + super-admin OK');

    // ---- A.1 Paralel POST /api/customers: 5 dari A + 5 dari B -----------
    const postJobs: Array<Promise<HttpResult>> = [];
    for (let i = 1; i <= 5; i++) {
      postJobs.push(
        req(jarA, '/api/customers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: `Paralel A-${i}` }),
        }),
      );
      postJobs.push(
        req(jarB, '/api/customers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: `Paralel B-${i}` }),
        }),
      );
    }
    const postRes = await Promise.all(postJobs);
    const post500 = postRes.filter((r) => r.status >= 500).length;
    const postOk = postRes.filter((r) => r.status === 200 || r.status === 201).length;
    const listA = await req(jarA, '/api/customers?perPage=50');
    const namesA: string[] = (listA.json?.data?.items ?? []).map((x: { name?: string }) => x.name ?? '');
    const listB = await req(jarB, '/api/customers?perPage=50');
    const namesB: string[] = (listB.json?.data?.items ?? []).map((x: { name?: string }) => x.name ?? '');
    const aHasAll = [1, 2, 3, 4, 5].every((i) => namesA.includes(`Paralel A-${i}`));
    const bHasAll = [1, 2, 3, 4, 5].every((i) => namesB.includes(`Paralel B-${i}`));
    const aLeak = namesA.some((n) => n.startsWith('Paralel B-'));
    const bLeak = namesB.some((n) => n.startsWith('Paralel A-'));
    check(
      'A.1',
      'POST paralel 5+5 customer tidak tertukar lintas tenant',
      post500 === 0 &&
        postOk === 10 &&
        listA.json?.data?.total === 6 &&
        listB.json?.data?.total === 6 &&
        aHasAll &&
        bHasAll &&
        !aLeak &&
        !bLeak,
      `POST ok ${postOk}/10, 5xx ${post500}; A total ${listA.json?.data?.total} (punya A-1..5: ${aHasAll}, bocor B: ${aLeak}); B total ${listB.json?.data?.total} (punya B-1..5: ${bHasAll}, bocor A: ${bLeak})`,
    );

    // ---- A.2 Dua PUT bersamaan ke lead yang sama milik A -----------------
    const [put1, put2] = await Promise.all([
      req(jarA, `/api/leads/${a.leadId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: 'KONKUREN-1' }),
      }),
      req(jarA, `/api/leads/${a.leadId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: 'KONKUREN-2' }),
      }),
    ]);
    const clientA = await getTenantClientForCode(a.tenantCode);
    const leadA = await clientA.lead.findUnique({ where: { id: a.leadId }, select: { notes: true } });
    const clientB = await getTenantClientForCode(b.tenantCode);
    const leadB = await clientB.lead.findUnique({ where: { id: b.leadId }, select: { notes: true } });
    const put500 = [put1, put2].filter((r) => r.status >= 500).length;
    check(
      'A.2',
      'PUT bersamaan ke lead yang sama (last-write-wins, tanpa 500)',
      put500 === 0 &&
        put1.status === 200 &&
        put2.status === 200 &&
        (leadA?.notes === 'KONKUREN-1' || leadA?.notes === 'KONKUREN-2') &&
        (leadB?.notes ?? null) === null,
      `PUT status ${put1.status}/${put2.status}, 5xx ${put500}; notes akhir lead A: ${JSON.stringify(leadA?.notes ?? null)}; notes lead B: ${JSON.stringify(leadB?.notes ?? null)}`,
    );

    // ---- B.1 Slug ganda ditolak bersih ------------------------------------
    const dbsBeforeB1 = await countTenantDbs();
    let slugErr = '';
    try {
      await registerCompany({
        companyName: 'PT Uji Slug Ganda',
        slug: a.slug,
        adminName: 'Admin Ganda',
        adminEmail: 'uji-phase8s-ganda@example.com',
        adminPassword: TEST_PASSWORD,
      });
    } catch (e: unknown) {
      slugErr = String((e as Error)?.message ?? e);
    }
    const dbsAfterB1 = await countTenantDbs();
    const slugCount = await masterPrisma.tenant.count({ where: { companySlug: a.slug } });
    check(
      'B.1',
      'Slug ganda ditolak bersih (tanpa tenant/DB setengah jadi)',
      slugErr.includes('slug sudah dipakai') && slugCount === 1 && dbsAfterB1 === dbsBeforeB1,
      `error: ${JSON.stringify(slugErr)}; tenant dgn slug tsb: ${slugCount}; DB woork_t_* sebelum ${dbsBeforeB1} → sesudah ${dbsAfterB1}`,
    );

    // ---- B.2 Email admin ganda ditolak bersih ----------------------------
    const dbsBeforeB2 = await countTenantDbs();
    let emailErr = '';
    try {
      await registerCompany({
        companyName: 'PT Uji Email Ganda',
        slug: 'uji-phase8s-dupemail',
        adminName: 'Admin Ganda',
        adminEmail: a.adminEmail,
        adminPassword: TEST_PASSWORD,
      });
    } catch (e: unknown) {
      emailErr = String((e as Error)?.message ?? e);
    }
    const dbsAfterB2 = await countTenantDbs();
    const dupSlugCount = await masterPrisma.tenant.count({ where: { companySlug: 'uji-phase8s-dupemail' } });
    check(
      'B.2',
      'Email admin ganda ditolak bersih',
      emailErr.includes('email sudah terdaftar') && dupSlugCount === 0 && dbsAfterB2 === dbsBeforeB2,
      `error: ${JSON.stringify(emailErr)}; tenant dgn slug dupemail: ${dupSlugCount}; DB woork_t_* sebelum ${dbsBeforeB2} → sesudah ${dbsAfterB2}`,
    );

    // ---- B.3 Retry API pada tenant ACTIVE → 409, data utuh ---------------
    const jobsBefore = await masterPrisma.provisioningJob.count({ where: { tenantId: a.tenantId } });
    const retryRes = await req(jarSuper, `/api/super/tenants/${a.tenantId}/retry`, { method: 'POST' });
    const jobsAfter = await masterPrisma.provisioningJob.count({ where: { tenantId: a.tenantId } });
    const listA2 = await req(jarA, '/api/customers?perPage=50');
    check(
      'B.3',
      'Retry pada tenant ACTIVE → 409, tanpa job baru, data utuh',
      retryRes.status === 409 && jobsAfter === jobsBefore && listA2.json?.data?.total === 6,
      `status retry ${retryRes.status}, body ${retryRes.text.slice(0, 120)}; job ${jobsBefore} → ${jobsAfter}; customer A total ${listA2.json?.data?.total}`,
    );

    // ---- B.4 Tenant PENDING → retryProvisioning → ACTIVE ------------------
    const rec = await createTenantRecord({
      companyName: 'PT Uji Phase8S D',
      slug: 'uji-phase8s-d',
      adminName: 'Admin Uji Phase8S D',
      adminEmail: 'uji-phase8s-d@example.com',
      adminPassword: TEST_PASSWORD,
    });
    const dRef: CleanupRef = {
      label: 'D',
      slug: 'uji-phase8s-d',
      adminEmail: 'uji-phase8s-d@example.com',
      tenantId: rec.tenant.id,
      tenantCode: rec.tenant.tenantCode,
    };
    tenants.push(dRef);
    const statusBefore = await masterPrisma.tenant.findUnique({
      where: { id: rec.tenant.id },
      select: { tenantStatus: true },
    });
    const dbBefore = await dbExists(rec.tenant.tenantCode);
    await retryProvisioning(rec.tenant.id);
    const statusAfter = await masterPrisma.tenant.findUnique({
      where: { id: rec.tenant.id },
      select: { tenantStatus: true },
    });
    const clientD = await getTenantClientForCode(rec.tenant.tenantCode);
    const dUser = await clientD.user.findFirst();
    const dStages = await clientD.leadStage.count();
    const jarD = await login(dRef.adminEmail, TEST_PASSWORD);
    const listD = await req(jarD, '/api/customers?perPage=50');
    check(
      'B.4',
      'Tenant PENDING di-resume retryProvisioning → ACTIVE + seed lengkap',
      statusBefore?.tenantStatus === 'PENDING_PROVISIONING' &&
        dbBefore === false &&
        statusAfter?.tenantStatus === 'ACTIVE' &&
        dUser !== null &&
        dStages === 7 &&
        listD.status === 200 &&
        listD.json?.data?.total === 0,
      `status ${statusBefore?.tenantStatus} → ${statusAfter?.tenantStatus}; DB ada sebelum retry: ${dbBefore}; user mirror: ${dUser !== null}; leadStage: ${dStages}; GET customers D: ${listD.status} total ${listD.json?.data?.total}`,
    );

    // ---- C. Load ringan: 30x customers + 10x kantor/office (paralel) -----
    type Timed = { status: number; ms: number; ok: boolean };
    const loadJobs: Array<Promise<Timed>> = [];
    const timed = async (jar: Jar, urlPath: string): Promise<Timed> => {
      const t0 = Date.now();
      const r = await req(jar, urlPath);
      return { status: r.status, ms: Date.now() - t0, ok: r.status === 200 && r.json?.success === true };
    };
    for (let i = 0; i < 10; i++) {
      loadJobs.push(timed(jarA, '/api/customers?perPage=10'));
      loadJobs.push(timed(jarB, '/api/customers?perPage=10'));
      loadJobs.push(timed(jarC, '/api/customers?perPage=10'));
    }
    for (let i = 0; i < 4; i++) loadJobs.push(timed(jarA, '/api/kantor/office'));
    for (let i = 0; i < 3; i++) loadJobs.push(timed(jarB, '/api/kantor/office'));
    for (let i = 0; i < 3; i++) loadJobs.push(timed(jarC, '/api/kantor/office'));
    const loadRes = await Promise.all(loadJobs);
    const okCount = loadRes.filter((r) => r.ok).length;
    const err5xx = loadRes.filter((r) => r.status >= 500).length;
    const times = loadRes.map((r) => r.ms).sort((x, y) => x - y);
    const avg = Math.round(times.reduce((s, v) => s + v, 0) / times.length);
    const p95 = times[Math.max(0, Math.ceil(0.95 * times.length) - 1)] ?? 0;
    const max = times[times.length - 1] ?? 0;
    const min = times[0] ?? 0;
    check(
      'C',
      'Load 40 request paralel (30 customers + 10 kantor/office)',
      okCount === 40 && err5xx === 0,
      `${okCount}/40 sukses, 5xx ${err5xx}; rata-rata ${avg} ms, p95 ${p95} ms, min ${min} ms, maks ${max} ms`,
    );

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
