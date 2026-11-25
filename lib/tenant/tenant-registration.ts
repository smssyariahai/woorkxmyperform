// lib/tenant/tenant-registration.ts — Jalur B pendaftaran tenant (Bab 7.1).
// Server-only. Pendaftaran baru TIDAK membuat tenant, akun, atau
// provisioning — semua data tersimpan di master DB sebagai TenantRegistration.
// Provisioning terjadi di Fase 3 (saat Master menyetujui).
// Email konfirmasi TIDAK dikirim di Fase 2: lib/mailer.ts hanya punya
// pengirim khusus pengumuman (sendAnnouncementEmail), bukan pengirim generik
// yang bisa dipakai ulang — tautan status + token ditampilkan di layar sukses.
import { randomUUID, timingSafeEqual } from 'crypto';
import { mkdir, rm, writeFile } from 'fs/promises';
import { basename, join } from 'path';
import { masterPrisma } from '@/lib/tenant/master';
import {
  computeBasePrice,
  getBillingSettings,
  validatePackageSelection,
} from '@/lib/pricing-catalog';
import { verifyTurnstile } from '@/lib/system-settings';

export const LEGAL_ENTITY_TYPES = [
  'PT',
  'CV',
  'Koperasi',
  'Yayasan',
  'Firma',
  'Perseorangan',
  'Lainnya',
] as const;

export const MAX_REGISTRATION_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

export const REGISTRATION_UPLOAD_DIR = join(
  process.cwd(),
  'uploads',
  'registrations',
);

/** Ekstensi -> MIME yang diizinkan untuk dokumen pendaftaran. */
const REGISTRATION_ALLOWED_FILES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
};

/** Ekstensi yang selalu ditolak, di posisi mana pun pada nama file. */
const BLOCKED_EXTENSIONS = new Set([
  '.exe', '.bat', '.cmd', '.sh', '.ps1', '.js', '.mjs', '.ts', '.php', '.py',
  '.rb', '.pl', '.com', '.scr', '.msi', '.jar', '.war', '.apk', '.vbs', '.wsf',
  '.html', '.htm', '.svg', '.zip', '.rar', '.7z', '.tar', '.gz',
]);

function sanitizeFileName(originalName: string): string | null {
  const base = basename(originalName.replace(/\\/g, '/')).trim();
  if (!base || base === '.' || base === '..') return null;
  const cleaned = base.replace(/[^A-Za-z0-9._\-() ]+/g, '_').replace(/^\.+/, '');
  if (!cleaned || cleaned === '.' || cleaned === '..') return null;
  return cleaned.length > 120 ? cleaned.slice(0, 120) : cleaned;
}

/**
 * Validasi file dokumen pendaftaran. Mengembalikan { error } bila ditolak,
 * atau { ext, mime } bila diterima. Pola lib/earsip/server.ts, tapi set
 * yang dibatasi: hanya PDF/JPG/PNG (E-Arsip membolehkan DOC/XLS).
 */
export function validateRegistrationFile(
  file: File,
  buffer: Buffer,
): { error?: string; ext?: string; mime?: string } {
  if (file.size === 0 || buffer.length === 0) return { error: 'File kosong.' };
  if (
    file.size > MAX_REGISTRATION_FILE_BYTES ||
    buffer.length > MAX_REGISTRATION_FILE_BYTES
  ) {
    return { error: 'Ukuran file maksimal 10 MB.' };
  }
  const safeName = sanitizeFileName(file.name);
  if (!safeName) return { error: 'Nama file tidak valid.' };
  const parts = safeName.toLowerCase().split('.');
  if (parts.length < 2) return { error: 'File harus memiliki ekstensi.' };
  for (const seg of parts.slice(1)) {
    if (BLOCKED_EXTENSIONS.has(`.${seg}`)) {
      return { error: 'Jenis file ini tidak diizinkan.' };
    }
  }
  const ext = `.${parts[parts.length - 1]}`;
  const mime = REGISTRATION_ALLOWED_FILES[ext];
  if (!mime) {
    return {
      error: 'Tipe file tidak diizinkan. Hanya PDF, JPG, dan PNG.',
    };
  }
  if (file.type && file.type !== mime) {
    // Browser kadang mengirim MIME generik/kosong — hanya tolak bila jelas berbeda.
    if (file.type !== 'application/octet-stream') {
      return { error: 'Tipe file (MIME) tidak cocok dengan ekstensinya.' };
    }
  }
  // Magic bytes: isi harus cocok dengan tipe yang diklaim.
  const magicOk =
    ext === '.pdf'
      ? buffer.subarray(0, 5).toString('ascii') === '%PDF-'
      : ext === '.png'
        ? buffer
            .subarray(0, 8)
            .equals(
              Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
            )
        : buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff; // JPG/JPEG
  if (!magicOk) return { error: 'Isi file tidak cocok dengan tipe yang diklaim.' };
  return { ext, mime };
}

/**
 * Simpan file upload ke uploads/registrations/<registrationId>/.
 * Nama file di disk dibuat server-side (tidak memakai nama asli user)
 * supaya tidak ada traversal / tabrakan: <docId>-<rand8><ext>.
 * Mengembalikan path relatif untuk kolom storedPath.
 */
export async function saveRegistrationFile(
  registrationId: string,
  documentId: string,
  buffer: Buffer,
  ext: string,
): Promise<string> {
  const dir = join(REGISTRATION_UPLOAD_DIR, registrationId);
  await mkdir(dir, { recursive: true });
  const stored = `${documentId}-${randomUUID().slice(0, 8)}${ext}`;
  await writeFile(join(dir, stored), buffer);
  return `uploads/registrations/${registrationId}/${stored}`;
}

/** Error validasi/bisnis pendaftaran — route memetakannya ke status HTTP. */
export class RegistrationError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'RegistrationError';
    this.status = status;
  }
}

export interface SelfAssessmentInput {
  employeeCount3mo: number;
  neededModules: string[];
  dataDigitized: 'ALL' | 'PARTIAL' | 'NONE';
  adminName: string;
  adminEmail: string;
  adminPhone: string;
  wantsBranding: boolean;
  docVolume: 'LOW' | 'MEDIUM' | 'HIGH';
  heardFrom: string;
  heardFromDetail?: string;
}

export interface CreateRegistrationInput {
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
  nib?: string | null;
  userTierId: string;
  storageTierId: string;
  moduleKeys: string[];
  billingCycle: 'MONTHLY' | 'YEARLY';
  startChoice: 'TRIAL' | 'PAID';
  npwpStatus: 'HAS_NPWP' | 'NO_NPWP';
  npwpStatement?: string | null;
  selfAssessment: SelfAssessmentInput;
  identityDocType: 'NIB' | 'AKTA' | 'SK_KEMENKUMHAM';
  cooperativeDocType?: 'SK_KOPERASI' | 'AKTA_KOPERASI' | null;
  turnstileToken?: string | null;
}

export interface RegistrationFiles {
  identityDoc?: File | null;
  ktpDoc?: File | null;
  npwpDoc?: File | null;
  cooperativeDoc?: File | null;
  supportingDocs?: File[];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function requiredString(
  value: unknown,
  label: string,
  max: number,
): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new RegistrationError(`${label} wajib diisi.`);
  }
  const v = value.trim();
  if (v.length > max) {
    throw new RegistrationError(`${label} terlalu panjang (maks ${max} karakter).`);
  }
  return v;
}

function normalizeNib(nib: string | null | undefined): string | null {
  if (!nib) return null;
  const n = nib.replace(/[\s-]/g, '').toUpperCase();
  return n.length > 0 ? n : null;
}

export interface ValidatedDoc {
  key: 'identityDoc' | 'ktpDoc' | 'npwpDoc' | 'cooperativeDoc' | 'supportingDocs';
  file: File;
  buffer: Buffer;
  ext: string;
  mime: string;
  docType: 'COMPANY_IDENTITY' | 'PIC_KTP' | 'NPWP' | 'COOPERATIVE' | 'SUPPORTING';
  docSubtype: string | null;
}

async function validateDocFile(
  key: ValidatedDoc['key'],
  file: File | null | undefined,
  label: string,
  docType: ValidatedDoc['docType'],
  docSubtype: string | null,
  required: boolean,
): Promise<ValidatedDoc | null> {
  if (!file) {
    if (required) throw new RegistrationError(`Dokumen ${label} wajib diunggah.`);
    return null;
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const checked = validateRegistrationFile(file, buffer);
  if (checked.error) {
    throw new RegistrationError(`Dokumen ${label}: ${checked.error}`);
  }
  return {
    key,
    file,
    buffer,
    ext: checked.ext as string,
    mime: checked.mime as string,
    docType,
    docSubtype,
  };
}

/** Field pendaftaran yang sudah divalidasi + dinormalisasi. */
export interface ValidatedRegistrationFields {
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
  userTierId: string;
  storageTierId: string;
  moduleKeys: string[];
  billingCycle: 'MONTHLY' | 'YEARLY';
  startChoice: 'TRIAL' | 'PAID';
  npwpStatus: 'HAS_NPWP' | 'NO_NPWP';
  npwpStatement: string | null;
  identityDocType: 'NIB' | 'AKTA' | 'SK_KEMENKUMHAM';
  cooperativeDocType: 'SK_KOPERASI' | 'AKTA_KOPERASI' | null;
  selfAssessmentJson: string;
}

/**
 * Validasi BERSAMA (dipakai create Fase 2 dan kirim ulang Fase 3):
 * field wajib + enum + email + self assessment lengkap (Q1–Q7).
 * TIDAK memeriksa Turnstile dan TIDAK memeriksa Trial 1x per NIB —
 * keduanya khusus pembuatan pendaftaran baru.
 */
export async function validateRegistrationFields(
  input: CreateRegistrationInput,
): Promise<ValidatedRegistrationFields> {
  const companyName = requiredString(input.companyName, 'Nama perusahaan', 200);
  const legalEntityType = requiredString(
    input.legalEntityType,
    'Bentuk badan usaha',
    50,
  );
  if (
    !(LEGAL_ENTITY_TYPES as readonly string[]).includes(legalEntityType)
  ) {
    throw new RegistrationError('Bentuk badan usaha tidak valid.');
  }
  const businessField = requiredString(input.businessField, 'Bidang usaha', 100);
  const companyAddress = requiredString(
    input.companyAddress,
    'Alamat perusahaan',
    500,
  );
  const city = requiredString(input.city, 'Kota', 100);
  const companyPhone = requiredString(
    input.companyPhone,
    'Telepon perusahaan',
    30,
  );
  // Nomor HP/WA wajib angka (2026-11-25): hanya digit 0–9, 8–15 digit
  // (batas E.164). UI sudah membuang karakter non-digit saat mengetik;
  // server tetap menolak bila ada yang lolos.
  if (!/^\d{8,15}$/.test(companyPhone)) {
    throw new RegistrationError('Telepon perusahaan hanya boleh berisi angka (8–15 digit).');
  }
  const picName = requiredString(input.picName, 'Nama penanggung jawab', 100);
  const picPosition = requiredString(
    input.picPosition,
    'Jabatan penanggung jawab',
    100,
  );
  const picEmail = requiredString(input.picEmail, 'Email penanggung jawab', 150);
  if (!EMAIL_RE.test(picEmail)) {
    throw new RegistrationError('Email penanggung jawab tidak valid.');
  }
  const picPhone = requiredString(
    input.picPhone,
    'Telepon penanggung jawab',
    30,
  );
  if (!/^\d{8,15}$/.test(picPhone)) {
    throw new RegistrationError('Telepon penanggung jawab hanya boleh berisi angka (8–15 digit).');
  }
  const nib = input.nib ? normalizeNib(String(input.nib)) : null;
  if (nib && nib.length > 50) {
    throw new RegistrationError('NIB terlalu panjang.');
  }

  if (input.billingCycle !== 'MONTHLY' && input.billingCycle !== 'YEARLY') {
    throw new RegistrationError('Siklus tagihan tidak valid.');
  }
  if (input.startChoice !== 'TRIAL' && input.startChoice !== 'PAID') {
    throw new RegistrationError('Pilihan mulai tidak valid.');
  }
  // Toggle trial (2026-11-25): bila Administrator Pusat mematikan trial,
  // pendaftaran baru tidak boleh memilih TRIAL — dipaksa PAID.
  if (input.startChoice === 'TRIAL') {
    const settings = await getBillingSettings();
    if (!settings.trialEnabled) {
      throw new RegistrationError(
        'Sistem trial sedang dinonaktifkan oleh Administrator Pusat. Pilih "Langsung berlangganan".',
      );
    }
  }
  if (input.npwpStatus !== 'HAS_NPWP' && input.npwpStatus !== 'NO_NPWP') {
    throw new RegistrationError('Status NPWP tidak valid.');
  }
  if (
    !['NIB', 'AKTA', 'SK_KEMENKUMHAM'].includes(input.identityDocType)
  ) {
    throw new RegistrationError('Jenis dokumen identitas tidak valid.');
  }
  if (
    input.cooperativeDocType &&
    !['SK_KOPERASI', 'AKTA_KOPERASI'].includes(input.cooperativeDocType)
  ) {
    throw new RegistrationError('Jenis dokumen koperasi tidak valid.');
  }
  const npwpStatement =
    input.npwpStatement && input.npwpStatement.trim().length > 0
      ? input.npwpStatement.trim()
      : null;
  if (input.npwpStatus === 'NO_NPWP') {
    if (!npwpStatement || npwpStatement.length < 10) {
      throw new RegistrationError(
        'Pernyataan tidak memiliki NPWP wajib diisi (minimal 10 karakter).',
      );
    }
    if (npwpStatement.length > 500) {
      throw new RegistrationError('Pernyataan NPWP terlalu panjang.');
    }
  }

  const sa = input.selfAssessment;
  if (!sa || typeof sa !== 'object') {
    throw new RegistrationError('Self assessment wajib diisi.');
  }
  if (
    !Number.isInteger(sa.employeeCount3mo) ||
    sa.employeeCount3mo < 0 ||
    sa.employeeCount3mo > 100000
  ) {
    throw new RegistrationError(
      'Jumlah karyawan 3 bulan pertama tidak valid.',
    );
  }
  if (!['ALL', 'PARTIAL', 'NONE'].includes(sa.dataDigitized)) {
    throw new RegistrationError('Jawaban data digital tidak valid.');
  }
  if (!['LOW', 'MEDIUM', 'HIGH'].includes(sa.docVolume)) {
    throw new RegistrationError('Perkiraan dokumen per bulan tidak valid.');
  }
  const adminName = requiredString(sa.adminName, 'Nama administrator', 100);
  const adminEmail = requiredString(sa.adminEmail, 'Email administrator', 150);
  if (!EMAIL_RE.test(adminEmail)) {
    throw new RegistrationError('Email administrator tidak valid.');
  }
  const adminPhone = requiredString(
    sa.adminPhone,
    'Telepon administrator',
    30,
  );
  const heardFrom = requiredString(
    sa.heardFrom,
    'Dari mana mengetahui WOORK',
    100,
  );
  const heardFromDetail =
    sa.heardFromDetail && sa.heardFromDetail.trim().length > 0
      ? sa.heardFromDetail.trim().slice(0, 500)
      : '';
  const neededModules = Array.isArray(sa.neededModules)
    ? [...new Set(sa.neededModules.map((k) => String(k).trim()).filter(Boolean))]
    : [];
  if (neededModules.length > 0) {
    const known = await masterPrisma.packageModulePrice.findMany({
      where: { moduleKey: { in: neededModules } },
      select: { moduleKey: true },
    });
    const knownSet = new Set(known.map((m) => m.moduleKey));
    for (const key of neededModules) {
      if (!knownSet.has(key)) {
        throw new RegistrationError(`Modul "${key}" tidak ditemukan.`);
      }
    }
  }
  const selfAssessmentJson = JSON.stringify({
    employeeCount3mo: sa.employeeCount3mo,
    neededModules,
    dataDigitized: sa.dataDigitized,
    adminName,
    adminEmail,
    adminPhone,
    wantsBranding: sa.wantsBranding === true,
    docVolume: sa.docVolume,
    heardFrom,
    heardFromDetail,
  });

  return {
    companyName,
    legalEntityType,
    businessField,
    companyAddress,
    city,
    companyPhone,
    picName,
    picPosition,
    picEmail,
    picPhone,
    nib,
    userTierId: input.userTierId,
    storageTierId: input.storageTierId,
    moduleKeys: Array.isArray(input.moduleKeys)
      ? [...new Set(input.moduleKeys.map((k) => String(k).trim()).filter(Boolean))]
      : [],
    billingCycle: input.billingCycle,
    startChoice: input.startChoice,
    npwpStatus: input.npwpStatus,
    npwpStatement,
    identityDocType: input.identityDocType,
    cooperativeDocType: input.cooperativeDocType ?? null,
    selfAssessmentJson,
  };
}

/**
 * Validasi paket BERSAMA (Bab 9.1): tier/storage wajib ada + ACTIVE,
 * minimum storage, PAID wajib ≥1 modul berbayar; TRIAL boleh 0 modul.
 * Mengembalikan moduleKeys yang sudah dinormalisasi (dedup).
 */
export async function validateRegistrationPackage(
  input: Pick<
    CreateRegistrationInput,
    'userTierId' | 'storageTierId' | 'moduleKeys' | 'startChoice'
  >,
): Promise<{ moduleKeys: string[] }> {
  const moduleKeys = Array.isArray(input.moduleKeys)
    ? [...new Set(input.moduleKeys.map((k) => String(k).trim()).filter(Boolean))]
    : [];
  const pkg = await validatePackageSelection({
    userTierId: input.userTierId,
    storageTierId: input.storageTierId,
    moduleKeys,
    isPaid: input.startChoice === 'PAID',
  });
  if (!pkg.ok) {
    throw new RegistrationError(pkg.errors[0] ?? 'Pilihan paket tidak valid.');
  }
  return { moduleKeys };
}

/**
 * Bangun snapshot paket (salinan harga/batas saat mendaftar) dari field
 * yang sudah divalidasi. Dipakai create dan kirim ulang.
 */
export async function buildPackageSnapshot(
  fields: ValidatedRegistrationFields,
  moduleKeys: string[],
): Promise<string> {
  const [userTier, storageTier, modules, settings] = await Promise.all([
    masterPrisma.packageUserTier.findUnique({
      where: { id: fields.userTierId },
    }),
    masterPrisma.packageStorageTier.findUnique({
      where: { id: fields.storageTierId },
    }),
    masterPrisma.packageModulePrice.findMany({
      where: { moduleKey: { in: moduleKeys } },
      orderBy: { sortOrder: 'asc' },
    }),
    getBillingSettings(),
  ]);
  const price = await computeBasePrice({
    userTier,
    storageTier,
    moduleKeys,
    cycle: fields.billingCycle,
  });
  return JSON.stringify({
    userTier: userTier
      ? {
          id: userTier.id,
          name: userTier.name,
          maxUsers: userTier.maxUsers,
          monthlyPrice: userTier.monthlyPrice,
          yearlyPrice: userTier.yearlyPrice,
          minStorageGb: userTier.minStorageGb,
        }
      : null,
    storageTier: storageTier
      ? {
          id: storageTier.id,
          name: storageTier.name,
          capacityGb: storageTier.capacityGb,
          monthlyPrice: storageTier.monthlyPrice,
          yearlyPrice: storageTier.yearlyPrice,
        }
      : null,
    modules: modules.map((m) => ({
      moduleKey: m.moduleKey,
      name: m.name,
      monthlyPrice: m.monthlyPrice,
      yearlyPrice: m.yearlyPrice,
    })),
    billingCycle: fields.billingCycle,
    startChoice: fields.startChoice,
    basePrice: price.base,
    hasCustomPrice: price.hasCustomPrice,
    ppnRateBps: settings.ppnRateBps,
  });
}

/**
 * Validasi dokumen BERSAMA (isi file, sebelum tulis DB): identitas + KTP
 * selalu wajib; NPWP bila HAS_NPWP; dokumen koperasi bila Koperasi;
 * pendukung 0–3. Mengembalikan dokumen tervalidasi (buffer di memori).
 */
export async function validateRegistrationDocs(
  fields: Pick<
    ValidatedRegistrationFields,
    'legalEntityType' | 'npwpStatus' | 'identityDocType' | 'cooperativeDocType'
  >,
  files: RegistrationFiles,
): Promise<ValidatedDoc[]> {
  const docs: ValidatedDoc[] = [];
  const identity = await validateDocFile(
    'identityDoc',
    files.identityDoc,
    'identitas perusahaan',
    'COMPANY_IDENTITY',
    fields.identityDocType,
    true,
  );
  if (identity) docs.push(identity);
  const ktp = await validateDocFile(
    'ktpDoc',
    files.ktpDoc,
    'KTP penanggung jawab',
    'PIC_KTP',
    null,
    true,
  );
  if (ktp) docs.push(ktp);
  const npwp = await validateDocFile(
    'npwpDoc',
    files.npwpDoc,
    'NPWP perusahaan',
    'NPWP',
    null,
    fields.npwpStatus === 'HAS_NPWP',
  );
  if (npwp) docs.push(npwp);
  const coop = await validateDocFile(
    'cooperativeDoc',
    files.cooperativeDoc,
    'koperasi',
    'COOPERATIVE',
    fields.cooperativeDocType ?? null,
    fields.legalEntityType === 'Koperasi',
  );
  if (coop) docs.push(coop);
  const supporting = Array.isArray(files.supportingDocs)
    ? files.supportingDocs.filter((f): f is File => f instanceof File)
    : [];
  if (supporting.length > 3) {
    throw new RegistrationError('Dokumen pendukung maksimal 3 file.');
  }
  for (const f of supporting) {
    const d = await validateDocFile(
      'supportingDocs',
      f,
      'pendukung',
      'SUPPORTING',
      null,
      true,
    );
    if (d) docs.push(d);
  }
  return docs;
}

/**
 * Simpan dokumen tervalidasi: buat row TenantRegistrationDocument +
 * simpan file ke disk + isi storedPath. Mengembalikan path absolut file
 * yang tersimpan (untuk dibersihkan bila langkah berikutnya gagal).
 */
export async function saveValidatedDocs(
  registrationId: string,
  docs: ValidatedDoc[],
): Promise<string[]> {
  const savedPaths: string[] = [];
  for (const d of docs) {
    const docRow = await masterPrisma.tenantRegistrationDocument.create({
      data: {
        registrationId,
        docType: d.docType,
        docSubtype: d.docSubtype,
        fileName: d.file.name,
        storedPath: '',
        mimeType: d.mime,
        fileSize: d.buffer.length,
      },
    });
    const storedPath = await saveRegistrationFile(
      registrationId,
      docRow.id,
      d.buffer,
      d.ext,
    );
    savedPaths.push(join(process.cwd(), storedPath));
    await masterPrisma.tenantRegistrationDocument.update({
      where: { id: docRow.id },
      data: { storedPath },
    });
  }
  return savedPaths;
}

/** Bandingkan statusToken secara aman (timing-safe); false bila beda. */
export function verifyRegistrationToken(
  storedToken: string,
  suppliedToken: string | null | undefined,
): boolean {
  if (!storedToken || !suppliedToken) return false;
  const a = Buffer.from(storedToken);
  const b = Buffer.from(suppliedToken);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Buat pendaftaran tenant baru (Jalur B). Validasi SEMUA dulu — field,
 * email, paket, Turnstile, hak Trial 1x per NIB, dokumen — baru tulis DB.
 * Mengembalikan { id, statusToken }.
 */
export async function createTenantRegistration(
  input: CreateRegistrationInput,
  files: RegistrationFiles,
): Promise<{ id: string; statusToken: string }> {
  // --- 1+2. Field + self assessment — validator bersama (dipakai juga
  // kirim ulang Fase 3). ---
  const fields = await validateRegistrationFields(input);
  const {
    companyName,
    legalEntityType,
    businessField,
    companyAddress,
    city,
    companyPhone,
    picName,
    picPosition,
    picEmail,
    picPhone,
    nib,
    npwpStatement,
    selfAssessmentJson,
  } = fields;

  // --- 3. Turnstile ------------------------------------------------------
  const turnstileOk = await verifyTurnstile(input.turnstileToken);
  if (!turnstileOk) {
    throw new RegistrationError(
      'Verifikasi keamanan gagal. Silakan coba lagi.',
    );
  }

  // --- 4. Paket (Bab 9.1) — validator bersama. ---------------------------
  const { moduleKeys } = await validateRegistrationPackage(input);

  // --- 5. Trial 1x per NIB ----------------------------------------------
  // NIB dinormalisasi; REJECTED tidak menghabiskan hak (boleh daftar ulang).
  // Keterbatasan: tenant Jalur A tidak punya kolom NIB, jadi pemeriksaan
  // hanya melawan pendaftaran Jalur B.
  if (input.startChoice === 'TRIAL' && nib) {
    const used = await masterPrisma.tenantRegistration.findFirst({
      where: {
        nib,
        startChoice: 'TRIAL',
        status: {
          in: ['PENDING_VERIFICATION', 'NEEDS_REVISION', 'APPROVED'],
        },
      },
      select: { id: true },
    });
    if (used) {
      throw new RegistrationError(
        'Perusahaan dengan NIB ini sudah pernah mengajukan trial. Trial hanya bisa dipakai 1 kali per perusahaan.',
        409,
      );
    }
  }

  // --- 6. Dokumen (validasi isi file, sebelum tulis DB) — validator bersama.
  const docs = await validateRegistrationDocs(fields, files);

  // --- 7. Snapshot paket (salinan harga/batas saat mendaftar) ------------
  const packageSnapshotJson = await buildPackageSnapshot(fields, moduleKeys);

  // --- 8. Tulis DB + simpan file -----------------------------------------
  const statusToken = randomUUID();
  let registrationId: string | null = null;
  const savedPaths: string[] = [];
  try {
    const reg = await masterPrisma.tenantRegistration.create({
      data: {
        companyName,
        legalEntityType,
        businessField,
        companyAddress,
        city,
        companyPhone,
        picName,
        picPosition,
        picEmail,
        picPhone,
        nib,
        userTierId: input.userTierId,
        storageTierId: input.storageTierId,
        moduleKeys,
        billingCycle: input.billingCycle,
        startChoice: input.startChoice,
        packageSnapshotJson,
        selfAssessmentJson,
        npwpStatus: input.npwpStatus,
        npwpStatement,
        status: 'PENDING_VERIFICATION',
        statusToken,
      },
    });
    registrationId = reg.id;
    savedPaths.push(...(await saveValidatedDocs(reg.id, docs)));
    await masterPrisma.platformAuditLog.create({
      data: {
        actorUserId: null,
        action: 'COMPANY_REGISTRATION_SUBMITTED',
        tenantId: null,
        metadata: JSON.stringify({
          registrationId: reg.id,
          companyName,
          startChoice: input.startChoice,
        }),
      },
    });
    return { id: reg.id, statusToken };
  } catch (e) {
    // Gagal di tengah jalan: hapus file yang sudah tersimpan + row
    // (best-effort; jangan menutupi error aslinya).
    for (const p of savedPaths) {
      await rm(p, { force: true }).catch(() => undefined);
    }
    if (registrationId) {
      await masterPrisma.tenantRegistration
        .delete({ where: { id: registrationId } })
        .catch(() => undefined);
    }
    if (e instanceof RegistrationError) throw e;
    throw new Error('Gagal menyimpan pendaftaran. Silakan coba lagi.');
  }
}

export interface RegistrationStatus {
  id: string;
  companyName: string;
  status: string;
  decisionReason: string | null;
  decidedAt: Date | null;
  createdAt: Date;
}

/**
 * Status ringkas pendaftaran berdasarkan token. Token salah → null
 * (jangan bocorkan alasan).
 */
export async function getRegistrationStatusByToken(
  id: string,
  token: string,
): Promise<RegistrationStatus | null> {
  if (!id || !token) return null;
  const reg = await masterPrisma.tenantRegistration.findUnique({
    where: { id },
    select: {
      id: true,
      companyName: true,
      status: true,
      statusToken: true,
      decisionReason: true,
      decidedAt: true,
      createdAt: true,
    },
  });
  if (!reg) return null;
  const a = Buffer.from(reg.statusToken);
  const b = Buffer.from(token);
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;
  return {
    id: reg.id,
    companyName: reg.companyName,
    status: reg.status,
    decisionReason: reg.decisionReason,
    decidedAt: reg.decidedAt,
    createdAt: reg.createdAt,
  };
}
