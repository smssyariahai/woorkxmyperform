// Server helper Modul Manajemen Perusahaan — pola lib/earsip/server.ts.
//
// - Dokumen disimpan di uploads/perusahaan/<organizationId>/<uuid>.<ext>.
// - Validasi memakai magic bytes (isi file), bukan hanya ekstensi/MIME.
// - PDF dioptimasi via pdf-lib (re-save); foto dikompres di client, server
//   hanya memvalidasi ulang ukuran akhir.
// - File lama HANYA dihapus setelah penggantinya berhasil disimpan (di route).

import { prisma } from '@/lib/db';
import { mkdir, rm, writeFile } from 'fs/promises';
import { basename, join } from 'path';
import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { PDFDocument } from 'pdf-lib';
import type { DocTypeDef } from './constants';

export const PERUSAHAAN_UPLOAD_DIR = join(process.cwd(), 'uploads', 'perusahaan');

/** Ekstensi yang selalu ditolak di posisi mana pun pada nama file. */
const BLOCKED_EXTENSIONS = new Set([
  '.exe', '.bat', '.cmd', '.sh', '.ps1', '.js', '.mjs', '.ts', '.php', '.py',
  '.rb', '.pl', '.com', '.scr', '.msi', '.jar', '.war', '.apk', '.vbs', '.wsf',
  '.html', '.htm', '.svg', '.zip', '.rar', '.7z', '.tar', '.gz',
]);

export function sanitizeFileName(originalName: string): string | null {
  const base = basename(originalName.replace(/\\/g, '/')).trim();
  if (!base || base === '.' || base === '..') return null;
  const cleaned = base.replace(/[^A-Za-z0-9._\-() ]+/g, '_').replace(/^\.+/, '');
  if (!cleaned || cleaned === '.' || cleaned === '..') return null;
  return cleaned.length > 120 ? cleaned.slice(0, 120) : cleaned;
}

/** Cek magic bytes: PDF %PDF, JPEG FF D8, PNG 89 50 4E 47, WebP RIFF....WEBP. */
export function detectMime(buffer: Buffer): string | null {
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-') {
    return 'application/pdf';
  }
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png';
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

/**
 * Validasi file dokumen perusahaan. Mengembalikan { error } bila ditolak,
 * atau { ext, mime } bila diterima. Menolak:
 * - file kosong / ukuran akhir > batas jenis dokumen
 * - ekstensi akhir tidak sesuai kategori, atau ekstensi TERLARANG di bagian
 *   mana pun dari nama file (menangkap ekstensi ganda)
 * - MIME tidak cocok dengan ekstensi
 * - isi file (magic bytes) tidak cocok dengan tipe yang diklaim
 */
export function validatePerusahaanFile(
  file: File,
  buffer: Buffer,
  docDef: DocTypeDef
): { error?: string; ext?: string; mime?: string } {
  if (file.size === 0 || buffer.length === 0) return { error: 'File kosong.' };
  if (buffer.length > docDef.maxBytes) {
    return {
      error: `Ukuran file melebihi batas ${Math.round(docDef.maxBytes / (1024 * 1024))} MB untuk ${docDef.label}. Perkecil file lalu unggah ulang.`,
    };
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
  const allowedExt = docDef.category === 'PDF' ? ['.pdf'] : ['.jpg', '.jpeg', '.png', '.webp'];
  if (!allowedExt.includes(ext)) {
    return {
      error:
        docDef.category === 'PDF'
          ? 'Dokumen ini hanya menerima file PDF.'
          : 'Foto hanya menerima JPG, JPEG, PNG, atau WebP.',
    };
  }
  const mimeByExt: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
  };
  const mime = mimeByExt[ext]!;
  if (file.type && file.type !== mime && file.type !== 'application/octet-stream') {
    return { error: 'Tipe file (MIME) tidak cocok dengan ekstensinya.' };
  }
  const detected = detectMime(buffer);
  if (detected !== mime) {
    return { error: 'Isi file tidak cocok dengan tipe yang diklaim.' };
  }
  return { ext, mime };
}

/**
 * Simpan file ke uploads/perusahaan/<organizationId>/.
 * Nama file di disk dibuat server-side (uuid + ekstensi) supaya tidak ada
 * traversal / tabrakan. Mengembalikan { storedName, filePath }.
 */
export async function savePerusahaanFile(
  organizationId: string,
  buffer: Buffer,
  ext: string
): Promise<{ storedName: string; filePath: string }> {
  const dir = join(PERUSAHAAN_UPLOAD_DIR, organizationId);
  await mkdir(dir, { recursive: true });
  const storedName = `${randomUUID()}${ext}`;
  await writeFile(join(dir, storedName), buffer);
  return { storedName, filePath: `uploads/perusahaan/${organizationId}/${storedName}` };
}

/**
 * Path absolut dari path relatif tersimpan; null bila kosong/tidak aman.
 * Menolak segala bentuk traversal (hanya basename yang dipakai).
 * Bentuk yang diharapkan: uploads/perusahaan/<organizationId>/<file>
 */
export function perusahaanFilePath(storedPath: string | null | undefined): string | null {
  if (!storedPath) return null;
  const normalized = storedPath.replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean);
  if (segments.length !== 4 || segments[0] !== 'uploads' || segments[1] !== 'perusahaan') {
    return null;
  }
  const orgId = segments[2];
  const file = basename(segments[3]);
  if (!orgId || !file || file === '.' || file === '..') return null;
  return join(PERUSAHAAN_UPLOAD_DIR, orgId, file);
}

/** Hapus file fisik dokumen (best-effort; abaikan bila tidak ada). */
export async function deletePerusahaanFile(storedPath: string | null | undefined): Promise<void> {
  const full = perusahaanFilePath(storedPath);
  if (!full) return;
  if (existsSync(full)) await rm(full, { force: true }).catch(() => {});
}

/**
 * Optimasi PDF via pdf-lib (load + save ulang; menghilangkan metadata /
 * objek tak terpakai). Mengembalikan buffer hasil; bila gagal ATAU hasil
 * lebih besar dari aslinya, kembalikan buffer asli.
 */
export async function optimizePdf(buffer: Buffer): Promise<Buffer> {
  try {
    const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const bytes = await doc.save();
    const out = Buffer.from(bytes);
    return out.length < buffer.length ? out : buffer;
  } catch {
    return buffer;
  }
}

// ---------------------------------------------------------------------------
// Akun Master (owner)
// ---------------------------------------------------------------------------

export interface OrgOwner {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  phone: string | null;
  jobTitle: string | null;
  joinedAt: Date;
}

/**
 * Akun Master = user yang Membership-nya ber-role OWNER di org itu.
 * Bila tidak ada OWNER (data lama), fallback ke membership tertua.
 * Mengembalikan null hanya bila org tidak punya anggota sama sekali.
 */
export async function getOrgOwner(organizationId: string): Promise<OrgOwner | null> {
  // Membership TIDAK punya relasi `user` di tenant client — user diambil
  // terpisah dari mirror User (bentuk hasil sama).
  const ownerRow = await prisma.membership.findFirst({
    where: { organizationId, status: 'ACTIVE', role: { name: 'OWNER' } },
    orderBy: { joinedAt: 'asc' },
  });
  const row =
    ownerRow ??
    (await prisma.membership.findFirst({
      where: { organizationId, status: 'ACTIVE' },
      orderBy: { joinedAt: 'asc' },
    }));
  if (!row) return null;
  const ownerUser = await prisma.user.findUnique({
    where: { id: row.userId },
    select: { id: true, name: true, email: true, phone: true },
  });
  if (!ownerUser) return null;
  return {
    membershipId: row.id,
    userId: ownerUser.id,
    name: ownerUser.name,
    email: ownerUser.email,
    phone: ownerUser.phone,
    jobTitle: row.jobTitle,
    joinedAt: row.joinedAt,
  };
}

/** Ambil profil perusahaan + pajak + dokumen (untuk GET profil). */
export async function getOrgProfile(organizationId: string) {
  // Organization mirror di tenant client TIDAK punya relasi `companyTax` /
  // `companyDocuments`, dan CompanyDocument TIDAK punya relasi `uploadedBy`
  // — ketiganya diambil terpisah lalu digabung (bentuk hasil sama:
  // `companyTax: {...} | null`, dokumen membawa `uploadedBy: {id, name} | null`).
  const [org, companyTax, docs] = await Promise.all([
    prisma.organization.findUnique({ where: { id: organizationId } }),
    prisma.companyTax.findUnique({ where: { organizationId } }),
    prisma.companyDocument.findMany({
      where: { organizationId },
      orderBy: { uploadedAt: 'desc' },
    }),
  ]);
  if (!org) return null;
  const uploaderIds = [...new Set(docs.map((d) => d.uploadedById))];
  const uploaders = uploaderIds.length
    ? await prisma.user.findMany({
        where: { id: { in: uploaderIds } },
        select: { id: true, name: true },
      })
    : [];
  const uploaderById = new Map(uploaders.map((u) => [u.id, u]));
  return {
    ...org,
    companyTax,
    companyDocuments: docs.map((d) => ({
      ...d,
      uploadedBy: uploaderById.get(d.uploadedById) ?? null,
    })),
  };
}
