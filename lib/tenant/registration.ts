// Logika registrasi perusahaan (database-per-tenant) — LAPISAN A.
//
// Dipakai oleh 3 jalur registrasi:
//   1. Registrasi email+password (formulir biasa).
//   2. Registrasi OAuth (Google dsb.) — tanpa password: `adminPassword`
//      tidak diberikan sehingga `passwordHash` bernilai null.
//   3. Registrasi oleh Super Admin / undangan internal.
//
// Alur:
//   1. Validasi + cek keunikan (slug perusahaan, email admin) di master DB.
//   2. SATU transaksi master: PlatformUser + Tenant + ProvisioningJob +
//      TenantMembership (OWNER) + Subscription (FREE, trial 14 hari) +
//      update Tenant.subscriptionId + audit COMPANY_REGISTERED.
//   3. SETELAH transaksi sukses, provisioning database tenant dipicu secara
//      ASYNC (setImmediate, tanpa await) lewat `runProvisioningSteps` dari
//      lib/tenant/provisioning.ts. Kegagalan provisioning TIDAK menggagalkan
//      registrasi — statusnya terlihat di halaman provisioning dan bisa
//      di-retry lewat `retryProvisioning` (yang membaca `inputJson` job).
//
// KEAMANAN:
//   - Turnstile tetap dicek di action (app/(auth)/actions.ts) SEBELUM
//     fungsi ini dipanggil — bukan di sini.
//   - Password TIDAK PERNAH di-log atau disimpan plaintext di mana pun:
//     hanya bcrypt hash-nya yang disimpan di PlatformUser.passwordHash dan
//     di ProvisioningJob.inputJson (agar retry provisioning bisa
//     menyelesaikan seeding). Jalur OAuth menyimpan hash null.
//   - Fungsi ini TIDAK menyentuh database produksi `woork_saas` —
//     semua tulis di sini memakai `masterPrisma` (woork_master).
//   - `createTenantRecord` dari provisioning.ts TIDAK dipakai di sini
//     karena ia mewajibkan adminPassword min 8 karakter (validateProvisionInput)
//     sehingga tidak bisa dipakai jalur OAuth.
import { randomUUID } from 'node:crypto';
import type { ProvisioningJob, Tenant } from '@prisma/master-client';
import { masterPrisma } from './master';
import { generateTenantCode } from './tenant-code';
import { runProvisioningSteps } from './provisioning';
import { hashPassword } from '../password';
import { slugify } from '../utils';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
const TRIAL_DAYS = 14;

export interface RegisterCompanyInput {
  companyName: string;
  slug?: string;
  adminName: string;
  adminEmail: string;
  /** Bila tidak diberikan (string kosong/undefined) -> jalur OAuth, passwordHash null. */
  adminPassword?: string;
  /**
   * LAPISAN B (Super Admin): bila diberikan, PlatformUser yang sudah ada
   * dipakai sebagai OWNER tenant baru — pembuatan PlatformUser dilewati.
   * Email user itu HARUS sama dengan `adminEmail` (dicek di bawah).
   */
  platformUserId?: string;
  /** Siklus langganan tenant baru (default MONTHLY). */
  billingCycle?: 'MONTHLY' | 'YEARLY';
  /**
   * 'TRIAL' (default) = trial 14 hari; 'PAID' = langsung AKTIF tanpa trial
   * (dipakai Jalur A saat sistem trial dinonaktifkan).
   */
  startChoice?: 'TRIAL' | 'PAID';
}

export interface RegisterCompanyResult {
  tenantId: string;
  tenantCode: string;
  platformUserId: string;
}

/**
 * Mendaftarkan perusahaan baru: membuat user platform + tenant + job
 * provisioning + membership OWNER + subscription trial di master DB dalam
 * satu transaksi, lalu memicu provisioning database tenant secara async.
 *
 * Throw Error berbahasa Indonesia bila validasi gagal. Kegagalan
 * provisioning async tidak melempar ke pemanggil (hanya di-log; status
 * terlihat di job provisioning).
 */
export async function registerCompany(input: RegisterCompanyInput): Promise<RegisterCompanyResult> {
  // --- Validasi + normalisasi (sebelum ada tulis apa pun) -----------------
  const companyName = input.companyName.trim();
  if (companyName.length < 2) throw new Error('Nama perusahaan minimal 2 karakter');

  const slug = slugify(input.slug || companyName);
  if (!SLUG_RE.test(slug) || slug.length < 2) {
    throw new Error(`slug tidak valid: "${slug}"`);
  }

  const adminName = input.adminName.trim();
  if (!adminName) throw new Error('Nama admin wajib diisi');

  const adminEmail = input.adminEmail.trim().toLowerCase();
  if (!EMAIL_RE.test(adminEmail)) throw new Error(`format email tidak valid: "${input.adminEmail}"`);

  // Password tidak di-trim (spasi bisa jadi bagian password). String kosong
  // diperlakukan sama dengan tidak diberikan -> jalur OAuth.
  const hasPassword = input.adminPassword !== undefined && input.adminPassword !== null && input.adminPassword !== '';
  if (hasPassword && input.adminPassword!.length < 8) {
    throw new Error('Password minimal 8 karakter');
  }

  // Cek keunikan SEBELUM transaksi agar pesannya ramah. Balapan (race) dua
  // registrasi bersamaan tetap ditangkap oleh unique constraint di dalam
  // transaksi (lihat catch P2002 di bawah).
  const slugTaken = await masterPrisma.tenant.findUnique({ where: { companySlug: slug } });
  if (slugTaken) throw new Error(`slug sudah dipakai: "${slug}"`);

  // LAPISAN B: bila platformUserId diberikan (Super Admin membuat tenant
  // untuk owner yang sudah punya akun platform), validasi user itu dan
  // lewati cek email-taken — email tersebut memang milik user itu.
  let existingPlatformUser: { id: string; email: string } | null = null;
  if (input.platformUserId) {
    existingPlatformUser = await masterPrisma.platformUser.findUnique({
      where: { id: input.platformUserId },
      select: { id: true, email: true },
    });
    if (!existingPlatformUser) throw new Error('Pengguna platform tidak ditemukan.');
    if (existingPlatformUser.email.toLowerCase() !== adminEmail) {
      throw new Error('Email admin tidak cocok dengan pengguna platform.');
    }
  } else {
    const emailTaken = await masterPrisma.platformUser.findUnique({ where: { email: adminEmail } });
    if (emailTaken) throw new Error(`email sudah terdaftar: "${adminEmail}"`);
  }

  // Hash password DI LUAR transaksi: bcrypt lambat (~ratusan ms) dan tidak
  // boleh menahan transaksi database terbuka.
  const adminPasswordHash = hasPassword ? await hashPassword(input.adminPassword!) : undefined;

  // --- Tenant code: cek bentrok SEBELUM transaksi -------------------------
  // Alasan: generateTenantCode() sendiri murni (randomBytes, tanpa DB), tapi
  // pengecekan bentroknya memakai masterPrisma.findUnique — panggilan itu
  // TIDAK BOLEH dilakukan di dalam callback $transaction (di sana hanya
  // client transaksi `tx` yang boleh dipakai; memakai masterPrisma langsung
  // akan berjalan di luar transaksi). Karena itu pola yang dipakai sama
  // seperti createTenantRecord di provisioning.ts: generate + cek bentrok
  // (maksimal 3x) sebelum transaksi dimulai. Ruang kodenya 2^32 sehingga
  // peluang bentrok antar dua registrasi bersamaan praktis nol; bila
  // toh terjadi, unique constraint tenantCode di dalam transaksi akan
  // menggagalkan transaksi (P2002) dan tidak ada data setengah jadi.
  let tenantCode = generateTenantCode();
  for (let i = 0; i < 3; i++) {
    const clash = await masterPrisma.tenant.findUnique({ where: { tenantCode } });
    if (!clash) break;
    tenantCode = generateTenantCode();
  }

  const isTrial = input.startChoice !== 'PAID';
  const billingCycle = input.billingCycle === 'YEARLY' ? 'YEARLY' : 'MONTHLY';
  const trialEndsAt = isTrial ? new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000) : null;
  const currentPeriodEndsAt = isTrial
    ? null
    : new Date(Date.now() + (billingCycle === 'YEARLY' ? 365 : 30) * 24 * 60 * 60 * 1000);

  // --- Satu transaksi master ----------------------------------------------
  let tenant: Tenant;
  let job: ProvisioningJob;
  let platformUserId: string;
  try {
    const created = await masterPrisma.$transaction(async (tx) => {
      // LAPISAN B: platformUserId yang diberikan dipakai apa adanya;
      // bila tidak ada, buat PlatformUser baru seperti biasa.
      const platformUser = existingPlatformUser
        ? { id: existingPlatformUser.id }
        : await tx.platformUser.create({
            data: {
              id: randomUUID(),
              email: adminEmail,
              name: adminName,
              passwordHash: adminPasswordHash ?? null,
              status: 'ACTIVE',
            },
          });

      const createdTenant = await tx.tenant.create({
        data: {
          tenantCode,
          companyName,
          companySlug: slug,
          databaseName: tenantCode,
          databaseHost: 'localhost',
          databasePort: 5432,
          databaseStatus: 'PROVISIONING',
          tenantStatus: 'PENDING_PROVISIONING',
        },
      });

      const createdJob = await tx.provisioningJob.create({
        data: {
          tenantId: createdTenant.id,
          status: 'PENDING',
          step: '',
          attempts: 0,
          // FORMAT YANG SAMA dengan createTenantRecord di provisioning.ts:
          // retryProvisioning membaca inputJson ini dan mengharapkan kunci
          // companyName, slug, adminName, adminEmail, adminPasswordHash.
          // Bila tidak ada password (OAuth), adminPasswordHash: undefined
          // dihilangkan oleh JSON.stringify — itu disengaja.
          inputJson: JSON.stringify({
            companyName,
            slug,
            adminName,
            adminEmail,
            adminPasswordHash,
          }),
        },
      });

      await tx.tenantMembership.create({
        data: {
          userId: platformUser.id,
          tenantId: createdTenant.id,
          roleReference: 'OWNER',
          membershipStatus: 'ACTIVE',
        },
      });

      const subscription = await tx.subscription.create({
        data: {
          tenantId: createdTenant.id,
          plan: 'FREE',
          status: 'ACTIVE',
          // Fase 4: Jalur A membuat trial, kecuali sistem trial
          // dinonaktifkan (startChoice 'PAID' → langsung AKTIF).
          lifecycleStatus: isTrial ? 'TRIAL' : 'AKTIF',
          trialEndsAt,
          currentPeriodEndsAt,
          billingCycle,
          userQuota: 10,
        },
      });

      await tx.tenant.update({
        where: { id: createdTenant.id },
        data: { subscriptionId: subscription.id },
      });

      await tx.platformAuditLog.create({
        data: {
          action: 'COMPANY_REGISTERED',
          tenantId: createdTenant.id,
          metadata: JSON.stringify({ companyName, companySlug: slug, tenantCode, adminEmail }),
        },
      });

      return { platformUser, tenant: createdTenant, job: createdJob };
    });
    tenant = created.tenant;
    job = created.job;
    platformUserId = created.platformUser.id;
  } catch (e: any) {
    // Backstop balapan: unique constraint yang lolos dari cek di atas
    // diterjemahkan kembali ke pesan ramah, bukan error Prisma mentah.
    if (e?.code === 'P2002') {
      const target = String((e?.meta as any)?.target ?? '');
      if (target.includes('companySlug')) throw new Error(`slug sudah dipakai: "${slug}"`);
      if (target.includes('email')) throw new Error(`email sudah terdaftar: "${adminEmail}"`);
      if (target.includes('tenantCode')) throw new Error('Terjadi bentrok kode tenant, silakan coba lagi.');
    }
    throw e;
  }

  // --- Provisioning async: JANGAN await, JANGAN blokir respons ------------
  // runProvisioningSteps sudah mencatat kegagalan ke master (job FAILED +
  // audit TENANT_PROVISION_FAILED) lalu melempar; di sini error itu hanya
  // di-log. Registrasi tetap dianggap berhasil — status provisioning
  // terlihat di halaman provisioning dan bisa di-retry.
  // CATATAN (LAPISAN B, diverifikasi di provisioning.ts baris ~283):
  // untuk jalur OAuth (tanpa password hash), step SEEDING TIDAK gagal —
  // seeding memakai `adminPasswordHash ?? null`, jadi admin tenant dibuat
  // dengan passwordHash null (login via Google; password bisa disetel
  // kemudian lewat reset password). Komentar lama yang menyebut seeding
  // gagal untuk OAuth sudah tidak berlaku.
  setImmediate(() => {
    runProvisioningSteps(tenant, job, { adminEmail, adminName, adminPasswordHash }).catch((e) =>
      console.error(`[registration ${tenantCode}] provisioning gagal (lihat job):`, String(e?.message ?? e)),
    );
  });

  return { tenantId: tenant.id, tenantCode, platformUserId };
}
