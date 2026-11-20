// Server helper Modul E-Arsip — dipakai API tenant (/api/earsip/*).
//
// Aturan kerahasiaan (ditegakkan di BACKEND, bukan hanya di UI):
// - Dokumen CONFIDENTIAL hanya boleh dilihat/diunduh Super Admin atau
//   pemegang EARSIP_MANAGE (lihat canAccessConfidential + confidentialWhere).
// - Semua endpoint baca/file WAJIB memakai filter ini.
// - Dokumen PUBLIC/INTERNAL boleh dilihat semua pemegang EARSIP_VIEW.
//
// Upload (pola Koperasi + E-Sign):
// - Multipart field `file`, tipe PDF/DOC/DOCX/XLS/XLSX/JPG/JPEG/PNG,
//   maks 10 MB, tolak executable / ekstensi ganda / nama file berbahaya.
// - Disimpan di uploads/earsip/<organizationId>/, DB hanya menyimpan
//   path relatif (pola Koperasi).
// - Satu file per dokumen. TIDAK ADA tabel versi dokumen (ditunda);
//   aktivitas dicatat ke AuditLog existing via lib/audit.ts.

import { prisma } from '@/lib/db';
import type { AuthContext } from '@/lib/auth-helpers';
import { getUserPermissions } from '@/lib/auth-helpers';
import { mkdir, rm, writeFile } from 'fs/promises';
import { basename, join } from 'path';
import { randomUUID } from 'crypto';
import { existsSync } from 'fs';

export const EARSIP_CONFIDENTIALITIES = ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL'] as const;
export type EarsipConfidentiality = (typeof EARSIP_CONFIDENTIALITIES)[number];

export const EARSIP_CONFIDENTIALITY_LABEL: Record<EarsipConfidentiality, string> = {
  PUBLIC: 'Publik',
  INTERNAL: 'Internal',
  CONFIDENTIAL: 'Rahasia',
};

export const EARSIP_STATUSES = ['ACTIVE', 'ARCHIVED'] as const;
export type EarsipStatus = (typeof EARSIP_STATUSES)[number];

export const EARSIP_STATUS_LABEL: Record<EarsipStatus, string> = {
  ACTIVE: 'Aktif',
  ARCHIVED: 'Diarsipkan',
};

export const EARSIP_UPLOAD_DIR = join(process.cwd(), 'uploads', 'earsip');
export const MAX_EARSIP_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

/** Ekstensi -> MIME yang diizinkan (satu-satunya yang diterima). */
export const EARSIP_ALLOWED_FILES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
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

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// ---------------------------------------------------------------------------
// Kerahasiaan
// ---------------------------------------------------------------------------

/** Boleh mengakses dokumen CONFIDENTIAL? Super Admin atau EARSIP_MANAGE. */
export async function canAccessConfidential(ctx: AuthContext): Promise<boolean> {
  if (ctx.isSuperAdmin) return true;
  const keys = await getUserPermissions(ctx);
  return keys.has('EARSIP_MANAGE');
}

/**
 * Filter Prisma untuk daftar/stats: non-manager tidak melihat dokumen
 * CONFIDENTIAL sama sekali (bahkan keberadaannya tidak bocor lewat total).
 */
export function confidentialWhere(canAccess: boolean): Record<string, unknown> {
  if (canAccess) return {};
  return { confidentiality: { not: 'CONFIDENTIAL' } };
}

/** Pemegang EARSIP_MANAGE (atau Super Admin) — untuk edit/hapus/kategori. */
export async function userCanManageEarsip(ctx: AuthContext): Promise<boolean> {
  if (ctx.isSuperAdmin) return true;
  const keys = await getUserPermissions(ctx);
  return keys.has('EARSIP_MANAGE');
}

// ---------------------------------------------------------------------------
// Pemetaan baris Prisma -> DTO client
// ---------------------------------------------------------------------------

export type ArchiveCategoryRow = {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  parentId: string | null;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: { name: string } | null;
  parent?: { id: string; name: string } | null;
  _count?: { documents: number; children: number };
};

export type ArchiveDocumentRow = {
  id: string;
  organizationId: string;
  categoryId: string;
  title: string;
  documentNumber: string | null;
  documentDate: Date | null;
  description: string | null;
  filePath: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  uploaderId: string;
  confidentiality: string;
  status: string;
  uploadedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  category?: { id: string; name: string } | null;
  uploader?: { name: string; email: string } | null;
};

export function mapArchiveCategory(row: ArchiveCategoryRow) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    description: row.description,
    parentId: row.parentId,
    parentName: row.parent?.name ?? null,
    createdById: row.createdById,
    createdByName: row.createdBy?.name ?? null,
    documentCount: row._count?.documents ?? 0,
    childCount: row._count?.children ?? 0,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function mapArchiveDocument(row: ArchiveDocumentRow) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    categoryId: row.categoryId,
    categoryName: row.category?.name ?? '-',
    title: row.title,
    documentNumber: row.documentNumber,
    documentDate: row.documentDate ? row.documentDate.toISOString() : null,
    description: row.description,
    fileName: row.fileName,
    fileSize: row.fileSize,
    mimeType: row.mimeType,
    uploaderId: row.uploaderId,
    uploaderName: row.uploader?.name ?? 'Pengguna',
    uploaderEmail: row.uploader?.email,
    confidentiality: row.confidentiality,
    status: row.status,
    uploadedAt: row.uploadedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const archiveCategoryInclude = {
  createdBy: { select: { name: true } },
  parent: { select: { id: true, name: true } },
  _count: { select: { documents: true, children: true } },
} as const;

export const archiveDocumentInclude = {
  category: { select: { id: true, name: true } },
  uploader: { select: { name: true, email: true } },
} as const;

// ---------------------------------------------------------------------------
// Validasi input kategori
// ---------------------------------------------------------------------------

export function parseCategoryInput(body: Record<string, unknown>): {
  error?: string;
  data?: { name: string; description: string | null; parentId: string | null };
} {
  const name = String(body.name ?? '').trim();
  if (!name) return { error: 'Nama kategori wajib diisi.' };
  if (name.length > 100) return { error: 'Nama kategori maksimal 100 karakter.' };
  const description = String(body.description ?? '').trim();
  if (description.length > 500) return { error: 'Deskripsi maksimal 500 karakter.' };
  const parentId =
    body.parentId === null || body.parentId === undefined || body.parentId === ''
      ? null
      : String(body.parentId);
  return { data: { name, description: description || null, parentId } };
}

export function parseCategoryUpdate(body: Record<string, unknown>): {
  error?: string;
  data?: { name?: string; description?: string | null; parentId?: string | null; hasParent?: boolean };
} {
  const data: NonNullable<ReturnType<typeof parseCategoryUpdate>['data']> = {};
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return { error: 'Nama kategori wajib diisi.' };
    if (name.length > 100) return { error: 'Nama kategori maksimal 100 karakter.' };
    data.name = name;
  }
  if (body.description !== undefined) {
    const description = String(body.description ?? '').trim();
    if (description.length > 500) return { error: 'Deskripsi maksimal 500 karakter.' };
    data.description = description || null;
  }
  if (body.parentId !== undefined) {
    data.hasParent = true;
    data.parentId =
      body.parentId === null || body.parentId === '' ? null : String(body.parentId);
  }
  if (Object.keys(data).length === 0) return { error: 'Tidak ada perubahan yang dikirim.' };
  return { data };
}

/**
 * Cek apakah `ancestorId` adalah leluhur dari kategori `categoryId`
 * (menelusuri rantai parent ke atas). Dipakai untuk mencegah siklus saat
 * memindahkan kategori di bawah turunannya sendiri.
 */
export async function isCategoryDescendant(
  organizationId: string,
  categoryId: string,
  ancestorId: string
): Promise<boolean> {
  let currentId: string | null = categoryId;
  const seen = new Set<string>();
  while (currentId) {
    if (seen.has(currentId)) break;
    seen.add(currentId);
    if (currentId === ancestorId) return true;
    const row: { parentId: string | null } | null = await prisma.archiveCategory.findFirst({
      where: { id: currentId, organizationId },
      select: { parentId: true },
    });
    currentId = row?.parentId ?? null;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Validasi input dokumen (edit metadata, bukan upload)
// ---------------------------------------------------------------------------

export function parseDocumentUpdate(body: Record<string, unknown>): {
  error?: string;
  data?: {
    title?: string;
    documentNumber?: string | null;
    documentDate?: Date | null;
    description?: string | null;
    categoryId?: string;
    confidentiality?: EarsipConfidentiality;
    status?: EarsipStatus;
  };
} {
  const data: NonNullable<ReturnType<typeof parseDocumentUpdate>['data']> = {};
  if (body.title !== undefined) {
    const title = String(body.title).trim();
    if (!title) return { error: 'Judul dokumen wajib diisi.' };
    if (title.length > 200) return { error: 'Judul dokumen maksimal 200 karakter.' };
    data.title = title;
  }
  if (body.documentNumber !== undefined) {
    const n = String(body.documentNumber ?? '').trim();
    if (n.length > 100) return { error: 'Nomor dokumen maksimal 100 karakter.' };
    data.documentNumber = n || null;
  }
  if (body.documentDate !== undefined) {
    if (body.documentDate === null || body.documentDate === '') {
      data.documentDate = null;
    } else {
      const d = new Date(String(body.documentDate));
      if (Number.isNaN(d.getTime())) return { error: 'Tanggal dokumen tidak valid.' };
      data.documentDate = d;
    }
  }
  if (body.description !== undefined) {
    const description = String(body.description ?? '').trim();
    if (description.length > 2000) return { error: 'Deskripsi maksimal 2000 karakter.' };
    data.description = description || null;
  }
  if (body.categoryId !== undefined) {
    const categoryId = String(body.categoryId).trim();
    if (!categoryId) return { error: 'Kategori wajib dipilih.' };
    data.categoryId = categoryId;
  }
  if (body.confidentiality !== undefined) {
    const c = String(body.confidentiality);
    if (!(EARSIP_CONFIDENTIALITIES as readonly string[]).includes(c)) {
      return { error: 'Tingkat kerahasiaan tidak dikenal.' };
    }
    data.confidentiality = c as EarsipConfidentiality;
  }
  if (body.status !== undefined) {
    const s = String(body.status);
    if (!(EARSIP_STATUSES as readonly string[]).includes(s)) {
      return { error: 'Status tidak dikenal.' };
    }
    data.status = s as EarsipStatus;
  }
  if (Object.keys(data).length === 0) return { error: 'Tidak ada perubahan yang dikirim.' };
  return { data };
}

// ---------------------------------------------------------------------------
// Upload file
// ---------------------------------------------------------------------------

/**
 * Sanitasi nama file: buang path, ganti karakter berbahaya, batasi panjang.
 * Mengembalikan nama dasar aman (tanpa direktori) atau null bila kosong.
 */
export function sanitizeFileName(originalName: string): string | null {
  const base = basename(originalName.replace(/\\/g, '/')).trim();
  if (!base || base === '.' || base === '..') return null;
  const cleaned = base.replace(/[^A-Za-z0-9._\-() ]+/g, '_').replace(/^\.+/, '');
  if (!cleaned || cleaned === '.' || cleaned === '..') return null;
  return cleaned.length > 120 ? cleaned.slice(0, 120) : cleaned;
}

/**
 * Validasi file upload. Mengembalikan { error } bila ditolak, atau
 * { ext, mime } bila diterima. Menolak:
 * - file kosong / > 10 MB
 * - ekstensi akhir tidak diizinkan, atau ekstensi TERLARANG di bagian mana
 *   pun dari nama file (menangkap ekstensi ganda: laporan.pdf.exe, a.jpg.php)
 * - MIME tidak cocok dengan ekstensi
 * - isi file tidak cocok dengan tipe yang diklaim (magic bytes)
 */
export function validateEarsipFile(file: File, buffer: Buffer): { error?: string; ext?: string; mime?: string } {
  if (file.size === 0 || buffer.length === 0) return { error: 'File kosong.' };
  if (file.size > MAX_EARSIP_FILE_BYTES || buffer.length > MAX_EARSIP_FILE_BYTES) {
    return { error: 'Ukuran file maksimal 10 MB.' };
  }
  const safeName = sanitizeFileName(file.name);
  if (!safeName) return { error: 'Nama file tidak valid.' };
  const parts = safeName.toLowerCase().split('.');
  if (parts.length < 2) return { error: 'File harus memiliki ekstensi.' };
  // Semua segmen ekstensi diperiksa: segmen terlarang di mana pun = tolak.
  for (const seg of parts.slice(1)) {
    if (BLOCKED_EXTENSIONS.has(`.${seg}`)) {
      return { error: 'Jenis file ini tidak diizinkan.' };
    }
  }
  const ext = `.${parts[parts.length - 1]}`;
  const mime = EARSIP_ALLOWED_FILES[ext];
  if (!mime) return { error: 'Tipe file tidak diizinkan. Hanya PDF, DOC, DOCX, XLS, XLSX, JPG, dan PNG.' };
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
        ? buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
        : ext === '.jpg' || ext === '.jpeg'
          ? buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
          : ext === '.docx' || ext === '.xlsx'
            ? buffer[0] === 0x50 && buffer[1] === 0x4b // ZIP (PK)
            : buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0; // OLE (DOC/XLS)
  if (!magicOk) return { error: 'Isi file tidak cocok dengan tipe yang diklaim.' };
  return { ext, mime };
}

/**
 * Simpan file upload ke uploads/earsip/<organizationId>/.
 * Nama file di disk dibuat server-side (tidak memakai nama asli user)
 * supaya tidak ada traversal / tabrakan: <docId>-<rand8><ext>.
 * Mengembalikan path relatif untuk kolom filePath.
 */
export async function saveEarsipFile(
  organizationId: string,
  documentId: string,
  buffer: Buffer,
  ext: string
): Promise<string> {
  const dir = join(EARSIP_UPLOAD_DIR, organizationId);
  await mkdir(dir, { recursive: true });
  const stored = `${documentId}-${randomUUID().slice(0, 8)}${ext}`;
  await writeFile(join(dir, stored), buffer);
  return `uploads/earsip/${organizationId}/${stored}`;
}

/**
 * Path absolut dari path relatif tersimpan; null bila kosong/tidak aman.
 * Menolak segala bentuk traversal (hanya basename yang dipakai).
 */
export function earsipFilePath(storedPath: string | null | undefined): string | null {
  if (!storedPath) return null;
  const normalized = storedPath.replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean);
  // Bentuk yang diharapkan: uploads/earsip/<organizationId>/<file>
  if (segments.length !== 4 || segments[0] !== 'uploads' || segments[1] !== 'earsip') return null;
  const orgId = segments[2];
  const file = basename(segments[3]);
  if (!orgId || !file || file === '.' || file === '..') return null;
  return join(EARSIP_UPLOAD_DIR, orgId, file);
}

/** Hapus file fisik dokumen (best-effort, dipakai saat hapus dokumen). */
export async function deleteEarsipFile(storedPath: string | null | undefined): Promise<void> {
  const full = earsipFilePath(storedPath);
  if (!full) return;
  if (existsSync(full)) await rm(full, { force: true }).catch(() => {});
}

/** Anggota aktif kantor (id + nama) — untuk filter pengunggah di halaman. */
export async function listEarsipUploaders(organizationId: string): Promise<Array<{ id: string; name: string }>> {
  const rows = await prisma.membership.findMany({
    where: { organizationId, status: 'ACTIVE' },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { joinedAt: 'asc' },
  });
  return rows.map((r) => ({ id: r.user.id, name: r.user.name }));
}
