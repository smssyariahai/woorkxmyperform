// lib/tenant/registration-review.ts — Verifikasi Master atas pendaftaran
// Jalur B (Fase 3, Bab 7.1). Server-only.
//
// Setujui memakai ulang registerCompany (JANGAN ubah isinya): admin pertama
// = kontak Q4 self assessment, tanpa password (jalur OAuth — admin mengatur
// password lewat /forgot-password). Email undangan TIDAK bisa dikirim
// (mailer tak punya pengirim generik — batas yang sama seperti Fase 2);
// UI menampilkan instruksi ini ke Master setelah persetujuan.
// Subscription bawaan registerCompany (FREE, trial 14 hari, kuota 10)
// ditimpa sesudahnya dengan paket pendaftaran (satu transaksi master).
import { rm } from 'fs/promises';
import { join } from 'path';
import { masterPrisma } from '@/lib/tenant/master';
import { registerCompany } from '@/lib/tenant/registration';
import {
  buildPackageSnapshot,
  RegistrationError,
  saveValidatedDocs,
  validateRegistrationDocs,
  validateRegistrationFields,
  validateRegistrationPackage,
  verifyRegistrationToken,
  type CreateRegistrationInput,
  type RegistrationFiles,
  type SelfAssessmentInput,
} from '@/lib/tenant/tenant-registration';
import { slugify } from '@/lib/utils';
import { syncPackageModulesToTenant } from './package-sync';

export interface ApproveRegistrationResult {
  tenantId: string;
  tenantCode: string;
  adminEmail: string;
  startChoice: string;
  /** Bila sinkronisasi modul paket ke DB tenant gagal (mis. provisioning
   *  belum selesai) — persetujuan TETAP berhasil; jalankan ulang via
   *  scripts/sync-package-modules.ts. */
  packageSyncWarning?: string;
}

function parseSelfAssessment(raw: string): SelfAssessmentInput {
  try {
    const v = JSON.parse(raw) as SelfAssessmentInput;
    if (!v || typeof v.adminName !== 'string' || typeof v.adminEmail !== 'string') {
      throw new Error('bad self assessment');
    }
    return v;
  } catch {
    throw new RegistrationError(
      'Data self assessment pendaftaran ini rusak dan tidak bisa diproses.',
      400,
    );
  }
}

function parsePackageSnapshot(raw: string): Record<string, any> | null {
  try {
    return JSON.parse(raw) as Record<string, any>;
  } catch {
    return null;
  }
}

/**
 * Jaring pengaman idempotensi: bila registerCompany gagal karena slug/email
 * sudah dipakai, periksa apakah tenant itu sebenarnya sudah dibuat pada
 * percobaan persetujuan sebelumnya (yang gagal sebelum penanda APPROVED
 * tersimpan). Adopsi hanya bila OWNER tenant itu adalah admin Q4 yang sama
 * dan belum ada pendaftaran lain yang mengklaim tenant tersebut.
 */
async function findOrphanTenant(
  companyName: string,
  adminEmailLower: string,
  registrationId: string,
): Promise<{ tenantId: string; tenantCode: string } | null> {
  const slug = slugify(companyName);
  const tenant = await masterPrisma.tenant.findUnique({
    where: { companySlug: slug },
    select: { id: true, tenantCode: true },
  });
  if (!tenant) return null;
  const claimed = await masterPrisma.tenantRegistration.findFirst({
    where: { tenantId: tenant.id, NOT: { id: registrationId } },
    select: { id: true },
  });
  if (claimed) return null;
  const owner = await masterPrisma.tenantMembership.findFirst({
    where: { tenantId: tenant.id, roleReference: 'OWNER' },
    select: { userId: true },
  });
  if (!owner) return null;
  const user = await masterPrisma.platformUser.findUnique({
    where: { id: owner.userId },
    select: { email: true },
  });
  if (!user || user.email.toLowerCase() !== adminEmailLower) return null;
  return { tenantId: tenant.id, tenantCode: tenant.tenantCode };
}

/**
 * Setujui pendaftaran: buat tenant via registerCompany (atau lanjutkan bila
 * tenantId sudah terisi), timpa Subscription dengan paket pendaftaran,
 * tandai APPROVED, audit. Aman diulang bila tenantId sudah terisi.
 */
export async function approveRegistration(
  registrationId: string,
  decidedByUserId: string,
): Promise<ApproveRegistrationResult> {
  const reg = await masterPrisma.tenantRegistration.findUnique({
    where: { id: registrationId },
  });
  if (!reg) {
    throw new RegistrationError('Pendaftaran tidak ditemukan.', 404);
  }
  if (reg.status === 'APPROVED') {
    throw new RegistrationError('Pendaftaran ini sudah disetujui.', 409);
  }
  if (reg.status !== 'PENDING_VERIFICATION') {
    throw new RegistrationError(
      'Pendaftaran ini sudah diputuskan dan tidak bisa disetujui.',
      409,
    );
  }

  const sa = parseSelfAssessment(reg.selfAssessmentJson);
  const adminEmail = sa.adminEmail.trim().toLowerCase();

  let tenantId = reg.tenantId;
  let tenantCode: string | null = null;
  if (!tenantId) {
    const existing = await masterPrisma.platformUser.findUnique({
      where: { email: adminEmail },
      select: { id: true },
    });
    try {
      const res = await registerCompany({
        companyName: reg.companyName,
        adminName: sa.adminName,
        adminEmail: sa.adminEmail,
        ...(existing ? { platformUserId: existing.id } : {}),
      });
      tenantId = res.tenantId;
      tenantCode = res.tenantCode;
    } catch (e) {
      const adopted = await findOrphanTenant(
        reg.companyName,
        adminEmail,
        reg.id,
      );
      if (!adopted) {
        if (e instanceof Error) {
          throw new RegistrationError(e.message, 409);
        }
        throw e;
      }
      tenantId = adopted.tenantId;
      tenantCode = adopted.tenantCode;
    }
  }
  if (!tenantCode) {
    const tenant = await masterPrisma.tenant.findUnique({
      where: { id: tenantId },
      select: { tenantCode: true },
    });
    if (!tenant) {
      throw new RegistrationError(
        'Tenant pendaftaran ini tidak ditemukan.',
        409,
      );
    }
    tenantCode = tenant.tenantCode;
  }

  // Satu transaksi master: timpa Subscription + tandai APPROVED + audit.
  const snapshot = parsePackageSnapshot(reg.packageSnapshotJson);
  const isTrial = reg.startChoice === 'TRIAL';
  const userQuota = isTrial
    ? 5
    : (snapshot?.userTier?.maxUsers as number | null | undefined) ?? 10;
  const trialEndsAt = isTrial
    ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    : null;
  // Fase 4: akhir periode berjalan untuk langganan berbayar (dipakai Fase 5
  // sebagai tanggal jatuh tempo). Trial memakai trialEndsAt yang sudah ada.
  const currentPeriodEndsAt = isTrial
    ? null
    : new Date(
        Date.now() +
          (reg.billingCycle === 'YEARLY' ? 365 : 30) * 24 * 60 * 60 * 1000,
      );
  await masterPrisma.$transaction(async (tx) => {
    await tx.subscription.update({
      where: { tenantId },
      data: {
        userTierId: reg.userTierId,
        storageTierId: reg.storageTierId,
        moduleKeys: reg.moduleKeys,
        packageSnapshotJson: reg.packageSnapshotJson,
        billingCycle: reg.billingCycle,
        // Fase 4: siklus hidup mengikuti pilihan mulai pendaftaran.
        lifecycleStatus: isTrial ? 'TRIAL' : 'AKTIF',
        currentPeriodEndsAt,
        trialEndsAt,
        userQuota,
      },
    });
    await tx.tenantRegistration.update({
      where: { id: reg.id },
      data: {
        status: 'APPROVED',
        decidedByUserId,
        decidedAt: new Date(),
        decisionReason: null,
        tenantId,
      },
    });
    await tx.platformAuditLog.create({
      data: {
        actorUserId: decidedByUserId,
        action: 'REGISTRATION_APPROVED',
        tenantId,
        metadata: JSON.stringify({
          registrationId: reg.id,
          tenantId,
          tenantCode,
          adminEmail,
          startChoice: reg.startChoice,
          packageSnapshot: snapshot,
        }),
      },
    });
  });

  // Fase 7 (Bab 8 G1): sinkronkan paket -> baris SubscriptionModule di DB
  // tenant (menegakkan modul berbayar). Pilihan modul pendaftaran diteruskan
  // eksplisit: trial tanpa modul berarti TIDAK ADA modul berbayar yang aktif
  // (bukan semua aktif). Gagal di sini TIDAK menggagalkan
  // persetujuan — provisioning bisa saja belum selesai; skrip
  // scripts/sync-package-modules.ts bisa mengulang.
  let packageSyncWarning: string | undefined;
  try {
    await syncPackageModulesToTenant(tenantId, { moduleKeys: reg.moduleKeys });
  } catch (e) {
    packageSyncWarning = (e as Error)?.message ?? String(e);
    console.error('[approveRegistration] sinkronisasi modul paket gagal:', packageSyncWarning);
  }

  return { tenantId, tenantCode, adminEmail, startChoice: reg.startChoice, packageSyncWarning };
}

async function decideRegistration(
  registrationId: string,
  decidedByUserId: string,
  reason: string,
  status: 'NEEDS_REVISION' | 'REJECTED',
  auditAction: 'REGISTRATION_REVISION_REQUESTED' | 'REGISTRATION_REJECTED',
): Promise<void> {
  if (!reason || reason.trim().length < 10) {
    throw new RegistrationError(
      'Alasan wajib diisi minimal 10 karakter.',
    );
  }
  const reg = await masterPrisma.tenantRegistration.findUnique({
    where: { id: registrationId },
    select: { id: true, status: true },
  });
  if (!reg) {
    throw new RegistrationError('Pendaftaran tidak ditemukan.', 404);
  }
  if (reg.status !== 'PENDING_VERIFICATION') {
    throw new RegistrationError('Pendaftaran ini sudah diputuskan.', 409);
  }
  const cleanReason = reason.trim();
  await masterPrisma.$transaction(async (tx) => {
    await tx.tenantRegistration.update({
      where: { id: reg.id },
      data: {
        status,
        decidedByUserId,
        decidedAt: new Date(),
        decisionReason: cleanReason,
      },
    });
    await tx.platformAuditLog.create({
      data: {
        actorUserId: decidedByUserId,
        action: auditAction,
        tenantId: null,
        metadata: JSON.stringify({
          registrationId: reg.id,
          reason: cleanReason,
        }),
      },
    });
  });
}

/** Minta Perbaikan: status → NEEDS_REVISION + alasan (≥10 karakter). */
export async function requestRegistrationRevision(
  registrationId: string,
  decidedByUserId: string,
  reason: string,
): Promise<void> {
  await decideRegistration(
    registrationId,
    decidedByUserId,
    reason,
    'NEEDS_REVISION',
    'REGISTRATION_REVISION_REQUESTED',
  );
}

/** Tolak pendaftaran: status → REJECTED + alasan (≥10 karakter). Terminal. */
export async function rejectRegistration(
  registrationId: string,
  decidedByUserId: string,
  reason: string,
): Promise<void> {
  await decideRegistration(
    registrationId,
    decidedByUserId,
    reason,
    'REJECTED',
    'REGISTRATION_REJECTED',
  );
}

export interface RegistrationEditData {
  id: string;
  companyName: string;
  legalEntityType: string;
  businessField: string;
  companyAddress: string;
  city: string;
  companyPhone: string;
  picName: string;
  picPosition: string;
  picEmail: string;
  picPhone: string;
  nib: string | null;
  userTierId: string | null;
  storageTierId: string | null;
  moduleKeys: string[];
  billingCycle: string;
  startChoice: string;
  npwpStatus: string;
  npwpStatement: string | null;
  identityDocType: string | null;
  cooperativeDocType: string | null;
  selfAssessment: SelfAssessmentInput | null;
  documents: {
    id: string;
    docType: string;
    docSubtype: string | null;
    fileName: string;
    fileSize: number;
  }[];
  decisionReason: string | null;
}

/**
 * Data lengkap untuk prefill form kirim ulang. Hanya bila status
 * NEEDS_REVISION + token cocok; selain itu null (jangan bocorkan alasan).
 */
export async function getRegistrationEditData(
  id: string,
  token: string | null | undefined,
): Promise<RegistrationEditData | null> {
  if (!id || !token) return null;
  const reg = await masterPrisma.tenantRegistration.findUnique({
    where: { id },
    include: { documents: { orderBy: { createdAt: 'asc' } } },
  });
  if (
    !reg ||
    reg.status !== 'NEEDS_REVISION' ||
    !verifyRegistrationToken(reg.statusToken, token)
  ) {
    return null;
  }
  let sa: SelfAssessmentInput | null = null;
  try {
    sa = JSON.parse(reg.selfAssessmentJson) as SelfAssessmentInput;
  } catch {
    sa = null;
  }
  const identity = reg.documents.find(
    (d) => d.docType === 'COMPANY_IDENTITY',
  );
  const coop = reg.documents.find((d) => d.docType === 'COOPERATIVE');
  return {
    id: reg.id,
    companyName: reg.companyName,
    legalEntityType: reg.legalEntityType,
    businessField: reg.businessField,
    companyAddress: reg.companyAddress,
    city: reg.city,
    companyPhone: reg.companyPhone,
    picName: reg.picName,
    picPosition: reg.picPosition,
    picEmail: reg.picEmail,
    picPhone: reg.picPhone,
    nib: reg.nib,
    userTierId: reg.userTierId,
    storageTierId: reg.storageTierId,
    moduleKeys: reg.moduleKeys,
    billingCycle: reg.billingCycle,
    startChoice: reg.startChoice,
    npwpStatus: reg.npwpStatus,
    npwpStatement: reg.npwpStatement,
    identityDocType: identity?.docSubtype ?? null,
    cooperativeDocType: coop?.docSubtype ?? null,
    selfAssessment: sa,
    documents: reg.documents.map((d) => ({
      id: d.id,
      docType: d.docType,
      docSubtype: d.docSubtype,
      fileName: d.fileName,
      fileSize: d.fileSize,
    })),
    decisionReason: reg.decisionReason,
  };
}

/**
 * Kirim ulang oleh pemohon (tanpa login, pakai statusToken yang sama).
 * Token harus cocok + status NEEDS_REVISION. Validasi ulang memakai
 * validator YANG SAMA dengan create Fase 2 (tanpa Turnstile, tanpa cek
 * Trial 1x per NIB — ini pendaftaran yang sama, bukan pendaftaran baru).
 * Dokumen lama dihapus (row + file), dokumen baru disimpan, status kembali
 * PENDING_VERIFICATION, keputusan sebelumnya dibersihkan.
 */
export async function resubmitRegistration(
  registrationId: string,
  token: string | null | undefined,
  input: CreateRegistrationInput,
  files: RegistrationFiles,
): Promise<{ id: string; status: string }> {
  const reg = await masterPrisma.tenantRegistration.findUnique({
    where: { id: registrationId },
  });
  if (!reg || !verifyRegistrationToken(reg.statusToken, token)) {
    throw new RegistrationError('Pendaftaran tidak ditemukan.', 404);
  }
  if (reg.status !== 'NEEDS_REVISION') {
    throw new RegistrationError(
      'Pendaftaran ini tidak sedang menunggu perbaikan.',
      409,
    );
  }

  // Validasi SEMUA dulu (sebelum ada tulis apa pun).
  const fields = await validateRegistrationFields(input);
  const { moduleKeys } = await validateRegistrationPackage(input);
  const docs = await validateRegistrationDocs(fields, files);
  const packageSnapshotJson = await buildPackageSnapshot(fields, moduleKeys);

  // Update field + status; dokumen lama diganti dokumen baru.
  await masterPrisma.tenantRegistration.update({
    where: { id: reg.id },
    data: {
      companyName: fields.companyName,
      legalEntityType: fields.legalEntityType,
      businessField: fields.businessField,
      companyAddress: fields.companyAddress,
      city: fields.city,
      companyPhone: fields.companyPhone,
      picName: fields.picName,
      picPosition: fields.picPosition,
      picEmail: fields.picEmail,
      picPhone: fields.picPhone,
      nib: fields.nib,
      userTierId: fields.userTierId,
      storageTierId: fields.storageTierId,
      moduleKeys,
      billingCycle: fields.billingCycle,
      startChoice: fields.startChoice,
      packageSnapshotJson,
      selfAssessmentJson: fields.selfAssessmentJson,
      npwpStatus: fields.npwpStatus,
      npwpStatement: fields.npwpStatement,
      status: 'PENDING_VERIFICATION',
      decidedByUserId: null,
      decidedAt: null,
      decisionReason: null,
    },
  });
  const oldDocs = await masterPrisma.tenantRegistrationDocument.findMany({
    where: { registrationId: reg.id },
    select: { id: true, storedPath: true },
  });
  await saveValidatedDocs(reg.id, docs);
  await masterPrisma.tenantRegistrationDocument.deleteMany({
    where: { registrationId: reg.id, id: { in: oldDocs.map((d) => d.id) } },
  });
  for (const d of oldDocs) {
    if (d.storedPath) {
      await rm(join(process.cwd(), d.storedPath), { force: true }).catch(
        () => undefined,
      );
    }
  }
  await masterPrisma.platformAuditLog.create({
    data: {
      actorUserId: null,
      action: 'REGISTRATION_RESUBMITTED',
      tenantId: null,
      metadata: JSON.stringify({
        registrationId: reg.id,
        companyName: fields.companyName,
      }),
    },
  });
  return { id: reg.id, status: 'PENDING_VERIFICATION' };
}

/** Catat setiap akses unduh KTP (hanya Master Administrator yang boleh). */
export async function logRegistrationKtpAccess(
  registrationId: string,
  docId: string,
  viewerUserId: string,
): Promise<void> {
  await masterPrisma.platformAuditLog.create({
    data: {
      actorUserId: viewerUserId,
      action: 'REGISTRATION_KTP_VIEWED',
      tenantId: null,
      metadata: JSON.stringify({ registrationId, docId }),
    },
  });
}
