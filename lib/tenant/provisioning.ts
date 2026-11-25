// Tenant provisioning engine — creates a real, isolated PostgreSQL
// database per tenant (woork_t_<8 hex>), runs the tenant migrations,
// seeds it, verifies it, and activates the tenant in the master DB.
//
// State machine (ProvisioningJob.step): CREATING_DB -> MIGRATING ->
// SEEDING -> VERIFYING -> DONE. A failure marks the job FAILED and the
// tenant databaseStatus FAILED, and is recorded in the audit log.
// COMPENSATION: a failed run NEVER drops the database or role
// automatically — the error message records what was already created so a
// retry can resume from the failed step.
//
// SECURITY: the tenant DB role password is generated here, stored only
// AES-256-GCM encrypted in the registry, and is NEVER logged. The admin
// password is stored only as a bcrypt hash (in PlatformUser, and in the
// job inputJson as a hash so a retry can finish seeding).
import { randomUUID } from 'node:crypto';
import type { ProvisioningJob, Tenant } from '@prisma/master-client';
import { masterPrisma } from './master';
import { generateTenantCode, validateTenantCode } from './tenant-code';
import { decryptSecret, encryptSecret } from './crypto';
import {
  adminConnectionString,
  adminConnectionStringForDb,
  adminDbUser,
  disconnectTenantClient,
  generateDbPassword,
  getTenantClient,
  latestTenantMigrationVersion,
  runPsql,
  runTenantMigrateDeploy,
  tenantConnectionString,
} from './tenant-db';
import { expectedPermissionCount, seedTenantDb, seedTenantMirrors } from './seed-tenant';
import { invalidateTenantClient } from './resolver';
import { hashPassword } from '../password';
import { slugify } from '../utils';

export interface ProvisionInput {
  companyName: string;
  slug: string;
  adminName: string;
  adminEmail: string;
  adminPassword: string;
}

export interface ProvisionResult {
  tenantId: string;
  tenantCode: string;
  databaseName: string;
  status: string;
  jobId: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
const TRIAL_DAYS = 14;
// 121 tenant models + the Prisma migrations table.
export const EXPECTED_TABLE_COUNT = 128; // Fase 5a: 122 + 6 model Residence
const REQUIRED_TABLES = ['Role', 'Membership', 'Permission', 'Channel', 'LeadStage', 'DealStage', 'Subscription', 'Organization', 'User'];

function log(code: string, message: string): void {
  console.log(`[provisioning ${code}] ${message}`);
}

async function auditLog(action: string, tenantId: string | null, metadata: Record<string, unknown>): Promise<void> {
  await masterPrisma.platformAuditLog.create({
    data: { action, tenantId, metadata: JSON.stringify(metadata) },
  });
}

async function setJobStep(jobId: string, step: string, status?: string): Promise<void> {
  await masterPrisma.provisioningJob.update({
    where: { id: jobId },
    data: { step, ...(status ? { status } : {}) },
  });
}

// ---------------------------------------------------------------------------
// Validation + tenant/job record creation
// ---------------------------------------------------------------------------

/** Validate input and check uniqueness in the master DB. Throws on any
 *  problem — before anything is created. Returns the normalised slug. */
export async function validateProvisionInput(input: ProvisionInput): Promise<{ slug: string }> {
  const companyName = input.companyName.trim();
  if (companyName.length < 2) throw new Error('companyName minimal 2 karakter');
  const slug = slugify(input.slug || input.companyName);
  if (!SLUG_RE.test(slug) || slug.length < 2) {
    throw new Error(`slug tidak valid: "${input.slug}"`);
  }
  if (!input.adminName.trim()) throw new Error('adminName wajib diisi');
  const adminEmail = input.adminEmail.trim().toLowerCase();
  if (!EMAIL_RE.test(adminEmail)) throw new Error(`adminEmail tidak valid: "${input.adminEmail}"`);
  if (input.adminPassword.length < 8) throw new Error('adminPassword minimal 8 karakter');
  const slugTaken = await masterPrisma.tenant.findUnique({ where: { companySlug: slug } });
  if (slugTaken) throw new Error(`slug sudah dipakai: "${slug}"`);
  const emailTaken = await masterPrisma.platformUser.findUnique({ where: { email: adminEmail } });
  if (emailTaken) throw new Error(`adminEmail sudah terdaftar: "${adminEmail}"`);
  return { slug };
}

export interface TenantRecord {
  tenant: Tenant;
  job: ProvisioningJob;
  adminPasswordHash: string;
}

/** Create the Tenant + ProvisioningJob + audit row in the master DB.
 *  The admin password is hashed here; the hash (never the plaintext) is
 *  stored in the job inputJson so a later retry can finish seeding. */
export async function createTenantRecord(input: ProvisionInput): Promise<TenantRecord> {
  const { slug } = await validateProvisionInput(input);
  const adminEmail = input.adminEmail.trim().toLowerCase();
  const adminPasswordHash = await hashPassword(input.adminPassword);

  let tenantCode = generateTenantCode();
  for (let i = 0; i < 3; i++) {
    const clash = await masterPrisma.tenant.findUnique({ where: { tenantCode } });
    if (!clash) break;
    tenantCode = generateTenantCode();
  }

  const tenant = await masterPrisma.tenant.create({
    data: {
      tenantCode,
      companyName: input.companyName.trim(),
      companySlug: slug,
      databaseName: tenantCode,
      databaseHost: 'localhost',
      databasePort: 5432,
      databaseStatus: 'PROVISIONING',
      tenantStatus: 'PENDING_PROVISIONING',
    },
  });
  const job = await masterPrisma.provisioningJob.create({
    data: {
      tenantId: tenant.id,
      status: 'PENDING',
      step: '',
      attempts: 0,
      inputJson: JSON.stringify({
        companyName: tenant.companyName,
        slug,
        adminName: input.adminName.trim(),
        adminEmail,
        adminPasswordHash,
      }),
    },
  });
  await auditLog('TENANT_PROVISION_STARTED', tenant.id, {
    companyName: tenant.companyName,
    companySlug: slug,
    tenantCode,
  });
  return { tenant, job, adminPasswordHash };
}

// ---------------------------------------------------------------------------
// Provisioning steps (shared by provisionTenant and retryProvisioning)
// ---------------------------------------------------------------------------

interface StepContext {
  adminEmail: string;
  adminName: string;
  adminPasswordHash?: string;
}

export async function runProvisioningSteps(
  tenant: Tenant,
  job: ProvisioningJob,
  ctx: StepContext,
): Promise<ProvisionResult> {
  const code = tenant.tenantCode;
  if (!validateTenantCode(code)) throw new Error(`tenantCode tidak valid: ${code}`);
  log(code, `mulai provisioning untuk "${tenant.companyName}" (tenant ${tenant.id})`);
  let dbPassword = '';
  let tenantUrl = '';

  try {
    // --- Step CREATING_DB -------------------------------------------------
    await setJobStep(job.id, 'CREATING_DB', 'RUNNING');
    log(code, 'CREATING_DB: memeriksa database & role');
    const adminConn = adminConnectionString();
    const owner = adminDbUser();
    const dbExists = (await runPsql(adminConn, `SELECT count(*) FROM pg_database WHERE datname = '${code}'`)) === '1';
    if (!dbExists) {
      await runPsql(adminConn, `CREATE DATABASE "${code}" OWNER "${owner}"`);
      log(code, 'CREATING_DB: database dibuat');
    } else {
      log(code, 'CREATING_DB: database sudah ada, dilewati');
    }

    const registry = await masterPrisma.tenantDatabaseRegistry.findUnique({ where: { tenantId: tenant.id } });
    if (registry?.secretReference) {
      dbPassword = decryptSecret(registry.secretReference);
    } else {
      dbPassword = generateDbPassword();
    }
    const roleExists = (await runPsql(adminConn, `SELECT count(*) FROM pg_roles WHERE rolname = '${code}'`)) === '1';
    if (!roleExists) {
      await runPsql(adminConn, `CREATE ROLE "${code}" LOGIN PASSWORD '${dbPassword}'`);
      log(code, 'CREATING_DB: role database dibuat');
    } else if (!registry?.secretReference) {
      // Role exists but we hold no password for it (a previous attempt
      // died between CREATE ROLE and the registry write) — reset it so
      // the stored password is the real one.
      await runPsql(adminConn, `ALTER ROLE "${code}" WITH PASSWORD '${dbPassword}'`);
      log(code, 'CREATING_DB: password role di-reset (role sudah ada)');
    } else {
      log(code, 'CREATING_DB: role sudah ada, dipakai kembali');
    }
    await runPsql(adminConn, `GRANT CONNECT ON DATABASE "${code}" TO "${code}"`);
    await runPsql(
      adminConnectionStringForDb(code),
      `GRANT USAGE, CREATE ON SCHEMA public TO "${code}"`,
    );
    await masterPrisma.tenantDatabaseRegistry.upsert({
      where: { tenantId: tenant.id },
      update: {
        databaseName: code,
        databaseHost: 'localhost',
        databasePort: 5432,
        databaseUserReference: code,
        secretReference: encryptSecret(dbPassword),
        databaseVersion: 'PostgreSQL 16',
        connectionStatus: 'PROVISIONING',
      },
      create: {
        tenantId: tenant.id,
        databaseName: code,
        databaseHost: 'localhost',
        databasePort: 5432,
        databaseUserReference: code,
        secretReference: encryptSecret(dbPassword),
        databaseVersion: 'PostgreSQL 16',
        migrationVersion: '',
        connectionStatus: 'PROVISIONING',
      },
    });
    tenantUrl = tenantConnectionString(code, dbPassword);

    // --- Step MIGRATING ---------------------------------------------------
    await setJobStep(job.id, 'MIGRATING');
    log(code, 'MIGRATING: menjalankan prisma migrate deploy (tenant schema)');
    await runTenantMigrateDeploy(tenantUrl);
    const migrationVersion = latestTenantMigrationVersion();
    await masterPrisma.tenantDatabaseRegistry.update({
      where: { tenantId: tenant.id },
      data: { migrationVersion },
    });
    log(code, `MIGRATING: selesai (versi ${migrationVersion})`);
    // Backup otomatis (backup-db.sh) menjalankan pg_dump sebagai `woo`
    // (pemilik database) — tetapi tabel dibuat migrate deploy sebagai role
    // tenant, jadi `woo` tidak punya hak baca dan pg_dump gagal
    // ("permission denied for table _prisma_migrations", terbukti 2026-11-23).
    // Beri `woo` SELECT atas tabel + sequence yang ada DAN yang dibuat
    // migrasi berikutnya (default privileges), dijalankan sebagai role
    // tenant (pemilik tabel). Tanpa ini backup tenant 10-menit tidak jalan.
    const backupReader = adminDbUser();
    await runPsql(tenantUrl, `GRANT SELECT ON ALL TABLES IN SCHEMA public TO "${backupReader}"`);
    await runPsql(tenantUrl, `GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO "${backupReader}"`);
    await runPsql(tenantUrl, `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO "${backupReader}"`);
    await runPsql(tenantUrl, `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON SEQUENCES TO "${backupReader}"`);
    log(code, 'MIGRATING: hak baca backup untuk woo diberikan');

    // --- Step SEEDING -----------------------------------------------------
    await setJobStep(job.id, 'SEEDING');
    log(code, 'SEEDING: seed role/permission/stage/channel + admin');
    const client = getTenantClient(tenantUrl);
    const seedCounts = await seedTenantDb(client, tenant.id);
    const ownerRole = await client.role.findUniqueOrThrow({
      where: { organizationId_name: { organizationId: tenant.id, name: 'OWNER' } },
    });
    const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
    await client.subscription.upsert({
      where: { organizationId: tenant.id },
      update: {},
      create: {
        organizationId: tenant.id,
        plan: 'FREE',
        status: 'ACTIVE',
        trialEndsAt,
        billingCycle: 'MONTHLY',
        userQuota: 10,
      },
    });
    // Admin OAuth tidak punya password: passwordHash boleh null
    // (PlatformUser.passwordHash nullable di master). Alur login
    // password tetap menolak akun tanpa hash di sisi auth.
    const platformUser = await masterPrisma.platformUser.upsert({
      where: { email: ctx.adminEmail },
      update: {},
      create: {
        id: randomUUID(),
        email: ctx.adminEmail,
        name: ctx.adminName,
        passwordHash: ctx.adminPasswordHash ?? null,
        status: 'ACTIVE',
      },
    });
    // Mirror Organization + User admin ke tenant DB (Lapisan E).
    await seedTenantMirrors(client, tenant, platformUser);
    const ownerMembership = await client.membership.upsert({
      where: { userId_organizationId: { userId: platformUser.id, organizationId: tenant.id } },
      update: {},
      create: {
        userId: platformUser.id,
        organizationId: tenant.id,
        roleId: ownerRole.id,
        status: 'ACTIVE',
      },
    });
    // Bab 8 Fase 7: modul sensitif default NONE — OWNER tenant baru WAJIB
    // punya baris WRITE 'setting' sejak lahir, kalau tidak ia terkunci dari
    // fungsi adminnya sendiri (manajemen pengguna/role, yang permission-nya
    // digerbang modul 'setting'). Koperasi TIDAK diberi otomatis (R3 desain:
    // butuh pengaktifan eksplisit bahkan untuk OWNER). 'pusat' Master-only.
    await client.userModuleAccess.upsert({
      where: { membershipId_moduleKey: { membershipId: ownerMembership.id, moduleKey: 'setting' } },
      update: { allowed: true, access: 'WRITE' },
      create: { membershipId: ownerMembership.id, moduleKey: 'setting', allowed: true, access: 'WRITE' },
    });
    const masterSub = await masterPrisma.subscription.upsert({
      where: { tenantId: tenant.id },
      update: {},
      create: {
        tenantId: tenant.id,
        plan: 'FREE',
        status: 'ACTIVE',
        trialEndsAt,
        billingCycle: 'MONTHLY',
        userQuota: 10,
      },
    });
    await masterPrisma.tenantMembership.upsert({
      where: { userId_tenantId: { userId: platformUser.id, tenantId: tenant.id } },
      update: {},
      create: {
        userId: platformUser.id,
        tenantId: tenant.id,
        roleReference: 'OWNER',
        membershipStatus: 'ACTIVE',
      },
    });
    await masterPrisma.tenant.update({
      where: { id: tenant.id },
      data: { subscriptionId: masterSub.id },
    });
    log(code, `SEEDING: selesai ${JSON.stringify(seedCounts)}`);

    // --- Step VERIFYING ---------------------------------------------------
    await setJobStep(job.id, 'VERIFYING');
    log(code, 'VERIFYING: memeriksa tabel, seed, dan isolasi awal');
    const tables = await client.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`;
    const tableNames = new Set(tables.map((t) => t.table_name));
    if (tableNames.size !== EXPECTED_TABLE_COUNT) {
      throw new Error(`verifikasi gagal: diharapkan ${EXPECTED_TABLE_COUNT} tabel, ditemukan ${tableNames.size}`);
    }
    const missing = REQUIRED_TABLES.filter((t) => !tableNames.has(t));
    if (missing.length) {
      throw new Error(`verifikasi gagal: tabel wajib hilang: ${missing.join(', ')}`);
    }
    const [roleCount, permCount, leadCount, dealCount, channelCount, adminMemberCount] = await Promise.all([
      client.role.count({ where: { organizationId: tenant.id } }),
      client.permission.count(),
      client.leadStage.count({ where: { organizationId: tenant.id } }),
      client.dealStage.count({ where: { organizationId: tenant.id } }),
      client.channel.count({ where: { organizationId: tenant.id } }),
      client.membership.count({ where: { organizationId: tenant.id, userId: platformUser.id } }),
    ]);
    if (roleCount !== 5) throw new Error(`verifikasi gagal: role ${roleCount}, diharapkan 5`);
    if (permCount !== expectedPermissionCount()) {
      throw new Error(`verifikasi gagal: permission ${permCount}, diharapkan ${expectedPermissionCount()}`);
    }
    if (leadCount !== 7 || dealCount !== 5 || channelCount !== 4) {
      throw new Error(`verifikasi gagal: lead ${leadCount}/7, deal ${dealCount}/5, channel ${channelCount}/4`);
    }
    if (adminMemberCount !== 1) throw new Error('verifikasi gagal: membership admin tidak ditemukan');
    const [mirrorOrgCount, mirrorUserCount] = await Promise.all([
      client.organization.count({ where: { id: tenant.id } }),
      client.user.count({ where: { id: platformUser.id } }),
    ]);
    if (mirrorOrgCount !== 1) throw new Error('verifikasi gagal: baris mirror Organization tidak ditemukan');
    if (mirrorUserCount !== 1) throw new Error('verifikasi gagal: baris mirror User admin tidak ditemukan');
    const [customerCount, conversationCount, invoiceCount] = await Promise.all([
      client.customer.count(),
      client.conversation.count(),
      client.invoice.count(),
    ]);
    if (customerCount !== 0 || conversationCount !== 0 || invoiceCount !== 0) {
      throw new Error(`verifikasi gagal: tenant DB baru tidak kosong (customer ${customerCount}, conversation ${conversationCount}, invoice ${invoiceCount})`);
    }
    const now = new Date();
    await masterPrisma.tenantDatabaseRegistry.update({
      where: { tenantId: tenant.id },
      data: { connectionStatus: 'HEALTHY', lastHealthCheck: now, provisionedAt: now },
    });
    log(code, `VERIFYING: OK (${tableNames.size} tabel, seed lengkap, data operasional kosong)`);

    // --- Step DONE --------------------------------------------------------
    await setJobStep(job.id, 'DONE', 'SUCCEEDED');
    await masterPrisma.provisioningJob.update({
      where: { id: job.id },
      data: { finishedAt: new Date() },
    });
    await masterPrisma.tenant.update({
      where: { id: tenant.id },
      data: { tenantStatus: 'ACTIVE', databaseStatus: 'ACTIVE' },
    });
    // Cache resolver bisa saja sudah mencatat status PENDING_PROVISIONING
    // (mis. sync paket saat approve me-resolve selagi provisioning jalan) —
    // tanpa invalidasi di sini, OWNER tenant baru terus ditolak "belum
    // aktif" walau master sudah ACTIVE (terbukti E2E 2026-11-25: B2 +
    // Jalur A). Gagal invalidasi tidak boleh menggagalkan provisioning
    // yang sudah selesai.
    try {
      await invalidateTenantClient(code);
    } catch (e) {
      console.error('[provisioning] invalidasi cache tenant gagal:', e);
    }
    await auditLog('TENANT_PROVISION_SUCCEEDED', tenant.id, { tenantCode: code, databaseName: code });
    log(code, 'DONE: tenant ACTIVE');
    return { tenantId: tenant.id, tenantCode: code, databaseName: code, status: 'ACTIVE', jobId: job.id };
  } catch (e: any) {
    const message = String(e?.message ?? e).slice(0, 2000);
    const step = (await masterPrisma.provisioningJob.findUnique({ where: { id: job.id }, select: { step: true } }))?.step ?? '';
    await masterPrisma.provisioningJob.update({
      where: { id: job.id },
      data: { status: 'FAILED', step, errorMessage: message, attempts: { increment: 1 }, finishedAt: new Date() },
    });
    await masterPrisma.tenant.update({
      where: { id: tenant.id },
      data: { databaseStatus: 'FAILED' },
    });
    await auditLog('TENANT_PROVISION_FAILED', tenant.id, {
      tenantCode: code,
      step,
      error: message,
      createdSoFar: 'database/role yang sudah dibuat TIDAK di-drop otomatis — lihat errorMessage job untuk melanjutkan retry',
    });
    log(code, `FAILED pada step ${step}: ${message}`);
    throw e;
  } finally {
    await disconnectTenantClient(code);
  }
}

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------

/** Full provisioning run: validate -> create tenant/job -> run steps. */
export async function provisionTenant(input: ProvisionInput): Promise<ProvisionResult> {
  const { tenant, job, adminPasswordHash } = await createTenantRecord(input);
  return runProvisioningSteps(tenant, job, {
    adminEmail: input.adminEmail.trim().toLowerCase(),
    adminName: input.adminName.trim(),
    adminPasswordHash,
  });
}

/** Retry a failed provisioning. Creates a NEW job (full history kept) for
 *  the same tenant and resumes from the failed step: existing database and
 *  role are reused (password read back from the registry), migrate deploy
 *  and seed are idempotent. */
export async function retryProvisioning(tenantId: string): Promise<ProvisionResult> {
  const tenant = await masterPrisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  const lastJob = await masterPrisma.provisioningJob.findFirst({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
  });
  if (!lastJob) throw new Error(`tidak ada provisioning job untuk tenant ${tenantId}`);
  const prevInput = JSON.parse(lastJob.inputJson) as {
    companyName: string;
    slug: string;
    adminName: string;
    adminEmail: string;
    adminPasswordHash?: string;
  };
  const job = await masterPrisma.provisioningJob.create({
    data: {
      tenantId,
      status: 'PENDING',
      step: '',
      attempts: 0,
      inputJson: lastJob.inputJson,
    },
  });
  await masterPrisma.tenant.update({
    where: { id: tenantId },
    data: { tenantStatus: 'PENDING_PROVISIONING', databaseStatus: 'PROVISIONING' },
  });
  await auditLog('TENANT_PROVISION_RETRY', tenantId, {
    tenantCode: tenant.tenantCode,
    previousJobId: lastJob.id,
  });
  return runProvisioningSteps(tenant, job, {
    adminEmail: prevInput.adminEmail,
    adminName: prevInput.adminName,
    adminPasswordHash: prevInput.adminPasswordHash,
  });
}
