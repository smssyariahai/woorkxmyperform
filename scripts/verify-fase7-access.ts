/**
 * Verifikasi Fase 7 Bab 8 — hak akses dua lapis (live, HTTP publik + DB).
 *
 * Membuat 3 tenant uji sekali pakai (A paket {tal}, B paket 5 modul,
 * C grandfathered tanpa paket) + anggota uji, lalu menguji desain
 * FASE7_DESIGN_2026-11-24.md §3.4:
 *   (a) Paket: OWNER A TAL 200; koperasi/emas/islami/kantor 403 paket.
 *   (b) Level user: koperasi NONE -> 403; READ -> GET 200 + POST 403;
 *       tanpa baris (default baru) -> 403; WRITE -> GET 200 + POST lolos gerbang.
 *   (c) Tidak menular: user X anggota A+B — di A TAL 200 + koperasi 403
 *       (paket menang atas baris WRITE); di B TAL 403 (baris NONE) +
 *       koperasi 200 (baris WRITE).
 *   (d) Anti-eskalasi: assign role platform -> 404; super-admin sebagai
 *       OWNER -> 403; buat role dengan permission tak dimiliki -> 403;
 *       ubah role sendiri -> 409.
 *   (e) Audit: ASSIGN_ROLE + UPDATE_ROLE_PERMISSIONS + UPDATE_MODULE_ACCESS
 *       + ACCESS_DENIED ada di AuditLog TENANT; TIDAK ADA yang bocor ke
 *       PlatformAuditLog master.
 *   (f) Grouping: moduleLevelFromLegacy semua-anak-NONE -> NONE;
 *       /api/me/modules menampilkan tal: NONE.
 *   (g) Grandfathering: sync WOORK.ID + KAYU -> 5 baris ACTIVE; OWNER C
 *       (tanpa paket) TAL/emas/islami/kantor 200; koperasi 403 adalah
 *       default sensitif yang disengaja (bukan kegagalan paket).
 *
 * Jalankan: `npx tsx scripts/verify-fase7-access.ts` — exit 0 bila semua
 * cek lolos, exit 1 bila ada yang gagal. Cleanup TOTAL di finally
 * (pola phase8-isolation-test.ts): tenant uji + PlatformUser uji dihapus,
 * DB + role di-DROP. TIDAK menyentuh tenant asli (hanya sync paket
 * WOORK.ID + KAYU yang memang harus jalan saat deploy — idempotent).
 */
import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { registerCompany } from '../lib/tenant/registration';
import { retryProvisioning } from '../lib/tenant/provisioning';
import { masterPrisma } from '../lib/tenant/master';
import { getTenantClientForCode } from '../lib/tenant/resolver';
import { disconnectTenantClient } from '../lib/tenant/tenant-db';
import { syncPackageModulesToTenant } from '../lib/tenant/package-sync';
import { PERMISSION_CATALOG } from '../lib/permissions';
import {
  effectiveModuleLevel,
  isModuleSubscribed,
  moduleLevelFromLegacy,
} from '../lib/subscription';

const execFileAsync = promisify(execFile);

const BASE = 'https://staging-fgprxrfzsuzvhmqc.woork.id';
const TEST_PASSWORD = 'Fase7Test123';
const PLATFORM_ROLE_ID = 'cmvrvia22005rhymvplk5wvvm'; // 'Full Akses'

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

interface CheckResult {
  id: string;
  name: string;
  pass: boolean;
  detail: string;
}

const results: CheckResult[] = [];

function check(id: string, name: string, pass: boolean, detail: string): void {
  results.push({ id, name, pass, detail });
  // eslint-disable-next-line no-console
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${id} ${name} — ${detail}`);
}

/** Cookie jar minimal untuk fetch (pola phase8-isolation-test.ts). */
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
    // bukan JSON (mis. redirect/HTML)
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
      `login ${email}: tidak ada session cookie (status ${res.status}, body ${res.text.slice(0, 200)})`
    );
  }
  return jar;
}

interface TestTenant {
  label: string;
  adminEmail: string;
  tenantId: string;
  tenantCode: string;
}

async function setupTenant(label: string): Promise<TestTenant> {
  const lower = label.toLowerCase();
  const r = await registerCompany({
    companyName: `PT Uji Fase7 ${label}`,
    slug: `uji-fase7-${lower}`,
    adminName: `Admin Uji Fase7 ${label}`,
    adminEmail: `uji-fase7-${lower}@contoh-f7.test`,
    adminPassword: TEST_PASSWORD,
  });
  // eslint-disable-next-line no-console
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
      // eslint-disable-next-line no-console
      console.log(`[${label}] masih PENDING setelah ~30 dtk — retryProvisioning`);
      await retryProvisioning(r.tenantId).catch((e: unknown) =>
        // eslint-disable-next-line no-console
        console.log(`[${label}] retry error:`, String((e as Error)?.message ?? e))
      );
    }
  }
  if (!active) throw new Error(`tenant ${label} tidak ACTIVE`);
  return { label, adminEmail: `uji-fase7-${lower}@contoh-f7.test`, tenantId: r.tenantId, tenantCode: r.tenantCode };
}

interface TestMember {
  email: string;
  platformUserId: string;
  membershipId: string;
}

async function createMember(
  tenant: TestTenant,
  email: string,
  name: string,
  roleName: string
): Promise<TestMember> {
  const hash = await bcrypt.hash(TEST_PASSWORD, 10);
  const pu = await masterPrisma.platformUser.create({
    data: { id: randomUUID(), email, name, passwordHash: hash, status: 'ACTIVE' },
  });
  await masterPrisma.tenantMembership.create({
    data: { tenantId: tenant.tenantId, userId: pu.id, roleReference: roleName, membershipStatus: 'ACTIVE' },
  });
  const client = await getTenantClientForCode(tenant.tenantCode);
  const org = await client.organization.findFirstOrThrow();
  const role = await client.role.findFirstOrThrow({ where: { name: roleName } });
  await client.user.create({ data: { id: pu.id, name, email, status: 'ACTIVE' } });
  const membership = await client.membership.create({
    data: { userId: pu.id, organizationId: org.id, roleId: role.id, status: 'ACTIVE' },
  });
  await disconnectTenantClient(tenant.tenantCode).catch(() => undefined);
  return { email, platformUserId: pu.id, membershipId: membership.id };
}

async function setModuleRow(
  tenantCode: string,
  membershipId: string,
  moduleKey: string,
  access: 'READ' | 'WRITE' | 'NONE'
): Promise<void> {
  const client = await getTenantClientForCode(tenantCode);
  try {
    await client.userModuleAccess.upsert({
      where: { membershipId_moduleKey: { membershipId, moduleKey } },
      update: { allowed: access !== 'NONE', access },
      create: { membershipId, moduleKey, allowed: access !== 'NONE', access },
    });
  } finally {
    await disconnectTenantClient(tenantCode).catch(() => undefined);
  }
}

async function deleteModuleRow(tenantCode: string, membershipId: string, moduleKey: string): Promise<void> {
  const client = await getTenantClientForCode(tenantCode);
  try {
    await client.userModuleAccess
      .delete({ where: { membershipId_moduleKey: { membershipId, moduleKey } } })
      .catch(() => undefined);
  } finally {
    await disconnectTenantClient(tenantCode).catch(() => undefined);
  }
}

/** Hapus total satu tenant uji (pola phase8-isolation-test.ts). */
async function cleanupTenant(t: TestTenant): Promise<string[]> {
  const leftovers: string[] = [];
  await disconnectTenantClient(t.tenantCode).catch(() => undefined);
  try {
    await masterPrisma.platformAuditLog.deleteMany({ where: { tenantId: t.tenantId } });
  } catch {
    // abaikan
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
  const sqlFile = path.join(os.tmpdir(), `fase7-drop-${t.tenantCode}.sql`);
  const sql = [
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${t.tenantCode}';`,
    `DROP DATABASE IF EXISTS "${t.tenantCode}";`,
    `DROP ROLE IF EXISTS "${t.tenantCode}";`,
  ].join('\n');
  fs.writeFileSync(sqlFile, sql);
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

function msgOf(r: HttpResult): string {
  const m = (r.json as { error?: string; message?: string } | null)?.error
    ?? (r.json as { message?: string } | null)?.message
    ?? r.text.slice(0, 120);
  return String(m);
}

async function main(): Promise<number> {
  const tenants: TestTenant[] = [];
  const extraPlatformUserEmails: string[] = [];
  try {
    // eslint-disable-next-line no-console
    console.log('== Fase 7 Bab 8: verifikasi akses dua lapis ==');
    // ---------- Setup: 3 tenant uji ----------
    const tenantA = await setupTenant('A');
    tenants.push(tenantA);
    const tenantB = await setupTenant('B');
    tenants.push(tenantB);
    const tenantC = await setupTenant('C');
    tenants.push(tenantC);
    // Paket: A = {tal} saja; B = kelima modul; C = tanpa paket (grandfathered).
    await masterPrisma.subscription.update({
      where: { tenantId: tenantA.tenantId },
      data: { moduleKeys: ['tal'] },
    });
    await masterPrisma.subscription.update({
      where: { tenantId: tenantB.tenantId },
      data: { moduleKeys: ['tal', 'koperasi', 'emas', 'islami', 'kantor'] },
    });
    for (const t of [tenantA, tenantB]) {
      const res = await syncPackageModulesToTenant(t.tenantId);
      // eslint-disable-next-line no-console
      console.log(`[setup] sync paket ${res.tenantCode}: ${JSON.stringify(res.synced)}`);
    }

    const jarOwnerA = await login(tenantA.adminEmail, TEST_PASSWORD);
    const jarOwnerB = await login(tenantB.adminEmail, TEST_PASSWORD);
    const jarOwnerC = await login(tenantC.adminEmail, TEST_PASSWORD);

    // ---------- (a) Paket: OWNER A ----------
    const talA = await req(jarOwnerA, '/api/tal/tasks');
    check('a1', 'Paket: OWNER A TAL 200', talA.status === 200, `status ${talA.status}`);
    const kopA = await req(jarOwnerA, '/api/koperasi/anggota');
    check(
      'a2',
      'Paket: OWNER A koperasi 403 (paket)',
      kopA.status === 403 && msgOf(kopA).includes('tidak aktif dalam langganan'),
      `status ${kopA.status} — ${msgOf(kopA)}`
    );
    const emasA = await req(jarOwnerA, '/api/emas/prices');
    check(
      'a3',
      'Paket: OWNER A emas 403 (paket)',
      emasA.status === 403 && msgOf(emasA).includes('tidak aktif dalam langganan'),
      `status ${emasA.status} — ${msgOf(emasA)}`
    );
    const islA = await req(jarOwnerA, '/api/islami/bookmarks');
    check(
      'a4',
      'Paket: OWNER A islami 403 (paket)',
      islA.status === 403 && msgOf(islA).includes('tidak aktif dalam langganan'),
      `status ${islA.status} — ${msgOf(islA)}`
    );
    const kanA = await req(jarOwnerA, '/api/kantor/agents');
    check(
      'a5',
      'Paket: OWNER A kantor 403 (paket)',
      kanA.status === 403 && msgOf(kanA).includes('tidak aktif dalam langganan'),
      `status ${kanA.status} — ${msgOf(kanA)}`
    );

    // ---------- (b) Level user: anggota Standar M di tenant B ----------
    const memberM = await createMember(tenantB, 'member-f7@contoh-f7.test', 'Member Uji F7', 'VIEWER');
    extraPlatformUserEmails.push(memberM.email);
    const jarM = await login(memberM.email, TEST_PASSWORD);
    const kopM0 = await req(jarM, '/api/koperasi/anggota');
    check(
      'b1',
      'Level: M tanpa baris koperasi -> 403 (default NONE)',
      kopM0.status === 403 && msgOf(kopM0).includes('tidak diaktifkan untuk akun Anda'),
      `status ${kopM0.status} — ${msgOf(kopM0)}`
    );
    await setModuleRow(tenantB.tenantCode, memberM.membershipId, 'koperasi', 'NONE');
    const kopM1 = await req(jarM, '/api/koperasi/anggota');
    check(
      'b2',
      'Level: M baris NONE koperasi -> 403',
      kopM1.status === 403 && msgOf(kopM1).includes('tidak diaktifkan untuk akun Anda'),
      `status ${kopM1.status} — ${msgOf(kopM1)}`
    );
    await setModuleRow(tenantB.tenantCode, memberM.membershipId, 'koperasi', 'READ');
    const kopM2 = await req(jarM, '/api/koperasi/anggota');
    check('b3', 'Level: M baris READ koperasi -> GET 200', kopM2.status === 200, `status ${kopM2.status}`);
    const kopM3 = await req(jarM, '/api/koperasi/anggota', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    check(
      'b4',
      'Level: M baris READ koperasi -> POST 403 (hanya baca)',
      kopM3.status === 403 && msgOf(kopM3).includes('hanya baca'),
      `status ${kopM3.status} — ${msgOf(kopM3)}`
    );
    await setModuleRow(tenantB.tenantCode, memberM.membershipId, 'koperasi', 'WRITE');
    const kopM4 = await req(jarM, '/api/koperasi/anggota');
    check('b5', 'Level: M baris WRITE koperasi -> GET 200', kopM4.status === 200, `status ${kopM4.status}`);
    const kopM5 = await req(jarM, '/api/koperasi/anggota', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    check(
      'b6',
      'Level: M baris WRITE koperasi -> POST lolos gerbang (400 validasi, bukan 403)',
      kopM5.status === 400 || kopM5.status === 422,
      `status ${kopM5.status} — ${msgOf(kopM5)}`
    );

    // ---------- (c) Tidak menular: user X anggota A + B ----------
    const userX = await createMember(tenantA, 'cross-f7@contoh-f7.test', 'Cross Uji F7', 'VIEWER');
    extraPlatformUserEmails.push(userX.email);
    // Tambah membership X di B (mirror juga) — dibuat SETELAH A agar sesi
    // login pertama X terikat ke A (membership ACTIVE pertama, createdAt).
    {
      const clientB = await getTenantClientForCode(tenantB.tenantCode);
      try {
        const orgB = await clientB.organization.findFirstOrThrow();
        const roleB = await clientB.role.findFirstOrThrow({ where: { name: 'VIEWER' } });
        await clientB.user.create({
          data: { id: userX.platformUserId, name: 'Cross Uji F7', email: userX.email, status: 'ACTIVE' },
        });
        await clientB.membership.create({
          data: { userId: userX.platformUserId, organizationId: orgB.id, roleId: roleB.id, status: 'ACTIVE' },
        });
      } finally {
        await disconnectTenantClient(tenantB.tenantCode).catch(() => undefined);
      }
      await masterPrisma.tenantMembership.create({
        data: { tenantId: tenantB.tenantId, userId: userX.platformUserId, roleReference: 'VIEWER', membershipStatus: 'ACTIVE' },
      });
    }
    const jarXa = await login(userX.email, TEST_PASSWORD);
    const talXa = await req(jarXa, '/api/tal/tasks');
    check('c1', 'Isolasi: X di A TAL 200', talXa.status === 200, `status ${talXa.status}`);
    // Baris WRITE koperasi di A sekalipun TIDAK boleh membuka koperasi A (paket).
    await setModuleRow(tenantA.tenantCode, userX.membershipId, 'koperasi', 'WRITE');
    const kopXa = await req(jarXa, '/api/koperasi/anggota');
    check(
      'c2',
      'Isolasi: X di A koperasi 403 (paket menang atas baris WRITE)',
      kopXa.status === 403 && msgOf(kopXa).includes('tidak aktif dalam langganan'),
      `status ${kopXa.status} — ${msgOf(kopXa)}`
    );
    // Pindah sesi X ke B: hapus membership A, login ulang (sesi baru terikat B).
    await masterPrisma.tenantMembership.deleteMany({
      where: { tenantId: tenantA.tenantId, userId: userX.platformUserId },
    });
    {
      const clientA = await getTenantClientForCode(tenantA.tenantCode);
      try {
        await clientA.membership
          .deleteMany({ where: { userId: userX.platformUserId } })
          .catch(() => undefined);
      } finally {
        await disconnectTenantClient(tenantA.tenantCode).catch(() => undefined);
      }
    }
    const clientB2 = await getTenantClientForCode(tenantB.tenantCode);
    const membershipXB = await clientB2.membership.findFirstOrThrow({
      where: { userId: userX.platformUserId },
      select: { id: true },
    });
    await disconnectTenantClient(tenantB.tenantCode).catch(() => undefined);
    await setModuleRow(tenantB.tenantCode, membershipXB.id, 'tal', 'NONE');
    const jarXb = await login(userX.email, TEST_PASSWORD);
    const talXb = await req(jarXb, '/api/tal/tasks');
    check(
      'c3',
      'Isolasi: X di B TAL 403 (baris NONE di B)',
      talXb.status === 403 && msgOf(talXb).includes('tidak diaktifkan untuk akun Anda'),
      `status ${talXb.status} — ${msgOf(talXb)}`
    );
    await setModuleRow(tenantB.tenantCode, membershipXB.id, 'koperasi', 'WRITE');
    const kopXb = await req(jarXb, '/api/koperasi/anggota');
    check('c4', 'Isolasi: X di B koperasi 200 (baris WRITE di B)', kopXb.status === 200, `status ${kopXb.status}`);

    // ---------- (d) Anti-eskalasi sebagai OWNER B ----------
    const ownerBMember = await (async () => {
      const client = await getTenantClientForCode(tenantB.tenantCode);
      try {
        const roleOwner = await client.role.findFirstOrThrow({ where: { name: 'OWNER' } });
        return await client.membership.findFirstOrThrow({
          where: { roleId: roleOwner.id },
          select: { id: true },
        });
      } finally {
        await disconnectTenantClient(tenantB.tenantCode).catch(() => undefined);
      }
    })();
    const esc1 = await req(jarOwnerB, `/api/admin/users/${memberM.membershipId}/role`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roleId: PLATFORM_ROLE_ID }),
    });
    check('d1', 'Anti-eskalasi: assign role platform -> 404', esc1.status === 404, `status ${esc1.status} — ${msgOf(esc1)}`);
    const esc2 = await req(jarOwnerB, `/api/admin/users/${memberM.membershipId}/super-admin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isSuperAdmin: true }),
    });
    check('d2', 'Anti-eskalasi: OWNER set super-admin -> 403', esc2.status === 403, `status ${esc2.status} — ${msgOf(esc2)}`);
    // Permission yang OWNER B tidak miliki (dinamis dari DB).
    const ownerKeys = await (async () => {
      const client = await getTenantClientForCode(tenantB.tenantCode);
      try {
        const roleOwner = await client.role.findFirstOrThrow({
          where: { name: 'OWNER' },
          include: { permissions: { include: { permission: true } } },
        });
        return new Set(roleOwner.permissions.map((rp) => rp.permission.key));
      } finally {
        await disconnectTenantClient(tenantB.tenantCode).catch(() => undefined);
      }
    })();
    const missingKey = PERMISSION_CATALOG.map((p) => p.key).find(
      (k) => !k.startsWith('PLATFORM_') && !ownerKeys.has(k)
    );
    if (missingKey) {
      const esc3 = await req(jarOwnerB, '/api/admin/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'F7-Temp-Role', permissions: [missingKey] }),
      });
      check(
        'd3',
        `Anti-eskalasi: buat role dengan permission tak dimiliki (${missingKey}) -> 403`,
        esc3.status === 403,
        `status ${esc3.status} — ${msgOf(esc3)}`
      );
    } else {
      check('d3', 'Anti-eskalasi: OWNER punya semua permission non-platform (cek dilewati)', true, 'tidak ada kunci yang hilang');
    }
    const viewerRoleId = await (async () => {
      const client = await getTenantClientForCode(tenantB.tenantCode);
      try {
        const r = await client.role.findFirstOrThrow({ where: { name: 'VIEWER' } });
        return r.id;
      } finally {
        await disconnectTenantClient(tenantB.tenantCode).catch(() => undefined);
      }
    })();
    const esc4b = await req(jarOwnerB, `/api/admin/users/${ownerBMember.id}/role`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roleId: viewerRoleId }),
    });
    check(
      'd4',
      'Anti-eskalasi: OWNER ubah role sendiri -> 409',
      esc4b.status === 409,
      `status ${esc4b.status} — ${msgOf(esc4b)}`
    );

    // ---------- (e) Audit di tenant (via API asli) ----------
    // ASSIGN_ROLE: OWNER B ubah role M VIEWER -> satu role seed yang
    // permission-nya subset OWNER (nama role seed tidak dijamin 'Karyawan').
    const karyawanRoleId = await (async () => {
      const client = await getTenantClientForCode(tenantB.tenantCode);
      try {
        const roles = await client.role.findMany({
          where: { organizationId: tenantB.tenantId },
          include: { permissions: { include: { permission: true } } },
        });
        const cand = roles.find(
          (r: any) => r.name !== 'OWNER' && r.permissions.every((rp: any) => ownerKeys.has(rp.permission.key))
        );
        if (!cand) throw new Error('Tidak ada role seed yang permission-nya subset OWNER');
        return cand.id;
      } finally {
        await disconnectTenantClient(tenantB.tenantCode).catch(() => undefined);
      }
    })();
    const asg = await req(jarOwnerB, `/api/admin/users/${memberM.membershipId}/role`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roleId: karyawanRoleId }),
    });
    check('e0', 'Audit: ASSIGN_ROLE via API 200', asg.status === 200, `status ${asg.status} — ${msgOf(asg)}`);
    // UPDATE_ROLE_PERMISSIONS: buat role lalu ubah permission-nya.
    const ownerKeyList = [...ownerKeys].filter((k) => !k.startsWith('PLATFORM_'));
    const p1 = ownerKeyList[0];
    const p2 = ownerKeyList[1];
    const roleCreate = await req(jarOwnerB, '/api/admin/roles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'F7-Audit-Role', permissions: [p1] }),
    });
    check('e1', 'Audit: buat role uji 201', roleCreate.status === 201, `status ${roleCreate.status} — ${msgOf(roleCreate)}`);
    const testRoleId = (roleCreate.json as { data?: { id?: string } } | null)?.data?.id;
    if (testRoleId) {
      const rolePatch = await req(jarOwnerB, `/api/admin/roles/${testRoleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions: [p1, p2] }),
      });
      check('e2', 'Audit: PATCH role permissions 200', rolePatch.status === 200, `status ${rolePatch.status} — ${msgOf(rolePatch)}`);
    } else {
      check('e2', 'Audit: PATCH role permissions 200', false, 'role uji tidak terbentuk');
    }
    // UPDATE_MODULE_ACCESS: PATCH user M, koperasi NONE -> READ.
    const userPatch = await req(jarOwnerB, `/api/admin/users/${memberM.membershipId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ moduleAccess: { koperasi: 'READ' } }),
    });
    check('e3', 'Audit: PATCH user moduleAccess 200', userPatch.status === 200, `status ${userPatch.status} — ${msgOf(userPatch)}`);
    // Baca AuditLog tenant B + A.
    const auditB = await (async () => {
      const client = await getTenantClientForCode(tenantB.tenantCode);
      try {
        return await client.auditLog.findMany({
          where: { action: { in: ['ASSIGN_ROLE', 'UPDATE_ROLE_PERMISSIONS', 'UPDATE_MODULE_ACCESS', 'ACCESS_DENIED'] } },
          select: { action: true, description: true },
        });
      } finally {
        await disconnectTenantClient(tenantB.tenantCode).catch(() => undefined);
      }
    })();
    const actionsB = new Set(auditB.map((a) => a.action));
    check('e4', 'Audit: tenant B punya ASSIGN_ROLE', actionsB.has('ASSIGN_ROLE'), `aksi: ${[...actionsB].join(',')}`);
    check('e5', 'Audit: tenant B punya UPDATE_ROLE_PERMISSIONS', actionsB.has('UPDATE_ROLE_PERMISSIONS'), `aksi: ${[...actionsB].join(',')}`);
    const updMod = auditB.find((a) => a.action === 'UPDATE_MODULE_ACCESS');
    check(
      'e6',
      'Audit: tenant B punya UPDATE_MODULE_ACCESS (koperasi)',
      !!updMod && (updMod.description ?? '').includes('koperasi'),
      updMod ? updMod.description ?? '' : 'tidak ada'
    );
    check('e7', 'Audit: tenant B punya ACCESS_DENIED', actionsB.has('ACCESS_DENIED'), `aksi: ${[...actionsB].join(',')}`);
    const auditA = await (async () => {
      const client = await getTenantClientForCode(tenantA.tenantCode);
      try {
        return await client.auditLog.count({ where: { action: 'ACCESS_DENIED' } });
      } finally {
        await disconnectTenantClient(tenantA.tenantCode).catch(() => undefined);
      }
    })();
    check('e8', 'Audit: tenant A punya ACCESS_DENIED (403 paket)', auditA > 0, `jumlah ${auditA}`);
    const masterLeak = await masterPrisma.platformAuditLog.count({
      where: {
        tenantId: { in: [tenantA.tenantId, tenantB.tenantId, tenantC.tenantId] },
        action: { in: ['ASSIGN_ROLE', 'UPDATE_ROLE_PERMISSIONS', 'UPDATE_MODULE_ACCESS', 'ACCESS_DENIED'] },
      },
    });
    check('e9', 'Audit: TIDAK ADA audit tenant yang bocor ke master', masterLeak === 0, `jumlah ${masterLeak}`);

    // ---------- (f) Grouping parent-submodul ----------
    check(
      'f1',
      'Grouping: moduleLevelFromLegacy({tal:NONE}, tal) = NONE',
      moduleLevelFromLegacy({ tal: 'NONE' }, 'tal') === 'NONE',
      `hasil ${moduleLevelFromLegacy({ tal: 'NONE' }, 'tal')}`
    );
    check(
      'f2',
      'Grouping: moduleLevelFromLegacy({}, tal) = WRITE (bukan sensitif)',
      moduleLevelFromLegacy({}, 'tal') === 'WRITE',
      `hasil ${moduleLevelFromLegacy({}, 'tal')}`
    );
    check(
      'f3',
      'Grouping: effectiveModuleLevel({}, koperasi) = NONE (sensitif)',
      effectiveModuleLevel({}, 'koperasi') === 'NONE',
      `hasil ${effectiveModuleLevel({}, 'koperasi')}`
    );
    check(
      'f4',
      'Grouping: effectiveModuleLevel({}, tal) = WRITE',
      effectiveModuleLevel({}, 'tal') === 'WRITE',
      `hasil ${effectiveModuleLevel({}, 'tal')}`
    );
    check(
      'f5',
      'Grouping: isModuleSubscribed(null, tal) = true (grandfathering)',
      isModuleSubscribed(null, 'tal') === true,
      `hasil ${isModuleSubscribed(null, 'tal')}`
    );
    const meXb = await req(jarXb, '/api/me/modules');
    const levelsXb = (meXb.json as { data?: { moduleLevels?: Record<string, string> } } | null)?.data?.moduleLevels ?? {};
    check(
      'f6',
      'Grouping: /api/me/modules X di B menampilkan tal: NONE',
      meXb.status === 200 && levelsXb['tal'] === 'NONE',
      `status ${meXb.status}, tal=${levelsXb['tal'] ?? '?'}`
    );

    // ---------- (g) Grandfathering ----------
    for (const code of ['woork_t_7862d085', 'woork_t_a4c39018']) {
      const tenantRow = await masterPrisma.tenant.findFirstOrThrow({
        where: { tenantCode: code },
        select: { id: true },
      });
      const synced = await syncPackageModulesToTenant(tenantRow.id);
      const client = await getTenantClientForCode(code);
      try {
        const rows = await client.subscriptionModule.findMany({
          where: { moduleKey: { in: ['tal', 'koperasi', 'emas', 'islami', 'kantor'] } },
          select: { moduleKey: true, status: true },
        });
        const allActive =
          rows.length === 5 && rows.every((r) => r.status === 'ACTIVE');
        check(
          `g-${code}`,
          `Grandfathering: ${code} 5 baris modul ACTIVE`,
          allActive,
          `${JSON.stringify(synced.synced)}; baris: ${rows.map((r) => `${r.moduleKey}=${r.status}`).join(' ')}`
        );
      } finally {
        await disconnectTenantClient(code).catch(() => undefined);
      }
    }
    const talC = await req(jarOwnerC, '/api/tal/tasks');
    check('g-c1', 'Grandfathering: OWNER C TAL 200 (tanpa paket)', talC.status === 200, `status ${talC.status}`);
    const emasC = await req(jarOwnerC, '/api/emas/prices');
    check('g-c2', 'Grandfathering: OWNER C emas 200 (tanpa paket)', emasC.status === 200, `status ${emasC.status}`);
    const islC = await req(jarOwnerC, '/api/islami/bookmarks');
    check('g-c3', 'Grandfathering: OWNER C islami 200 (tanpa paket)', islC.status === 200, `status ${islC.status}`);
    const kanC = await req(jarOwnerC, '/api/kantor/agents');
    check('g-c4', 'Grandfathering: OWNER C kantor 200 (tanpa paket)', kanC.status === 200, `status ${kanC.status}`);
    const kopC = await req(jarOwnerC, '/api/koperasi/anggota');
    check(
      'g-c5',
      'Grandfathering: OWNER C koperasi 403 — default sensitif (DISEGAR, bukan gagal paket)',
      kopC.status === 403 && msgOf(kopC).includes('tidak diaktifkan untuk akun Anda'),
      `status ${kopC.status} — ${msgOf(kopC)}`
    );

    const failed = results.filter((r) => !r.pass);
    // eslint-disable-next-line no-console
    console.log(`\n== ringkasan: ${results.length - failed.length}/${results.length} lolos ==`);
    return failed.length === 0 ? 0 : 1;
  } finally {
    // ---------- Cleanup TOTAL ----------
    for (const t of tenants) {
      // eslint-disable-next-line no-console
      console.log(`[cleanup] menghapus tenant uji ${t.tenantCode}...`);
      const left = await cleanupTenant(t);
      if (left.length > 0) {
        // eslint-disable-next-line no-console
        console.log(`[cleanup] SISA: ${left.join('; ')}`);
      }
    }
    if (extraPlatformUserEmails.length > 0) {
      await masterPrisma.platformUser
        .deleteMany({ where: { email: { in: extraPlatformUserEmails } } })
        .catch(() => undefined);
    }
  }
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error('[verify-fase7-access] fatal:', (e as Error).message);
    process.exit(1);
  });
