// lib/koperasi/server.ts — helper SERVER untuk API route Koperasi (Gelombang 5).
// Porting logika koperasi backup (src/server/server.ts: koperasiValidate,
// koperasiValues, koperasiMapRow, getKirimUrls/saveKirimUrls, validUrlEntry,
// dan src/components/koperasi/kirimJson.ts: buildAnggotaJson) ke Prisma +
// NextAuth. Semua query di route WAJIB memfilter organizationId dari sesi.
//
// Perbedaan vs backup (disengaja, sesuai kontrak Gelombang 5):
// - Foto disimpan sebagai FILE di uploads/koperasi/ (bukan data URL di DB);
//   kolom *Path hanya menyimpan path relatif file.
// - defaultUrlId disimpan di level ORGANISASI (KoperasiSetting key
//   'kirim_json'), bukan per user seperti backup (profile koperasi_url_default).
// - Validasi create diperlonggar: hanya NIK, namaLengkap, dan cabang yang
//   wajib; backup juga mewajibkan tempatLahir, tanggalLahir, jenisKelamin,
//   alamatKtp, noHp, dan setujuPernyataan=true.
// - OCR KTP ditunda (butuh kunci AI, modul API keys Gelombang 6).

import type { AuthContext } from '@/lib/auth-helpers';
import { prisma } from '@/lib/db';
import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import { basename, extname, join } from 'path';
import { existsSync } from 'fs';

// ---------------------------------------------------------------------------
// RBAC dasar: admin Koperasi = super admin, OWNER, atau ADMIN.
// Pola yang sama dengan isTalAdmin (lib/tal/server.ts). Dipakai untuk
// DELETE anggota dan tulis pengaturan/urls. Endpoint tulis anggota
// (POST/PATCH) dan kirim-json terbuka untuk semua user login organisasi
// (sesuai kontrak Gelombang 5; route pengumuman/TAL juga tidak menegakkan
// level modul READ/WRITE per pengguna di API — belum ada ModularKey /
// PermissionKey 'koperasi').
// ---------------------------------------------------------------------------
export function isKoperasiAdmin(ctx: AuthContext): boolean {
  return ctx.isSuperAdmin === true || ctx.role === 'OWNER' || ctx.role === 'ADMIN';
}

// ---------------------------------------------------------------------------
// Cabang — fallback = CABANG_OPTIONS backup
// (src/components/koperasi/cabang.ts).
// ---------------------------------------------------------------------------
export const DEFAULT_CABANG: string[] = [
  'Cabang Ciremai Raya',
  'Cabang Arjawinangun',
  'Cabang Kanoman',
  'Cabang Tegal',
];

export async function getCabangList(organizationId: string): Promise<string[]> {
  const row = await prisma.koperasiSetting.findFirst({
    where: { organizationId, key: 'cabang' },
    select: { settings: true },
  });
  const raw = (row?.settings as Record<string, unknown> | null) ?? {};
  const list = (raw as { cabang?: unknown }).cabang;
  if (Array.isArray(list)) {
    const cleaned = list
      .filter((c): c is string => typeof c === 'string')
      .map((c) => c.trim())
      .filter(Boolean);
    if (cleaned.length > 0) return cleaned;
  }
  return [...DEFAULT_CABANG];
}

// ---------------------------------------------------------------------------
// KoperasiSetting — akses generik (hindari asumsi nama unique constraint).
// ---------------------------------------------------------------------------
export async function getKoperasiSetting(
  organizationId: string,
  key: string
): Promise<Record<string, unknown>> {
  const row = await prisma.koperasiSetting.findFirst({
    where: { organizationId, key },
    select: { settings: true },
  });
  const raw = row?.settings;
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
}

export async function saveKoperasiSetting(
  organizationId: string,
  key: string,
  settings: Record<string, unknown>
): Promise<void> {
  const existing = await prisma.koperasiSetting.findFirst({
    where: { organizationId, key },
    select: { id: true },
  });
  if (existing) {
    await prisma.koperasiSetting.update({
      where: { id: existing.id },
      data: { settings: settings as never },
    });
  } else {
    await prisma.koperasiSetting.create({
      data: { organizationId, key, settings: settings as never },
    });
  }
}

// ---------------------------------------------------------------------------
// URL kirim JSON (setting key 'kirim_json': { urls, defaultUrlId }).
// Porting getKirimUrls/saveKirimUrls + validUrlEntry backup
// (src/server/server.ts), termasuk normalisasi nilai lama { url }.
// ---------------------------------------------------------------------------
export interface KirimUrlEntry {
  id: string;
  judul: string;
  url: string;
  deskripsi: string;
}

export interface KirimJsonSetting {
  urls: KirimUrlEntry[];
  defaultUrlId: string | null;
}

export function newKirimUrlId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function normalizeKirimUrls(raw: unknown): KirimUrlEntry[] {
  if (Array.isArray((raw as { urls?: unknown } | null)?.urls)) {
    return ((raw as { urls: unknown[] }).urls as unknown[])
      .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object')
      .filter((e) => typeof e.url === 'string' && (e.url as string).trim())
      .map((e) => ({
        id:
          typeof e.id === 'string' && e.id
            ? (e.id as string)
            : newKirimUrlId(),
        judul:
          typeof e.judul === 'string' && (e.judul as string).trim()
            ? (e.judul as string).trim()
            : 'URL Server',
        url: (e.url as string).trim(),
        deskripsi: typeof e.deskripsi === 'string' ? (e.deskripsi as string) : '',
      }));
  }
  // Nilai lama { url } dinormalisasi menjadi satu entri agar tidak hilang.
  const v = (raw ?? {}) as Record<string, unknown>;
  if (typeof v.url === 'string' && (v.url as string).trim()) {
    return [{ id: newKirimUrlId(), judul: 'URL Server', url: (v.url as string).trim(), deskripsi: '' }];
  }
  return [];
}

export async function getKirimJsonSetting(organizationId: string): Promise<KirimJsonSetting> {
  const raw = await getKoperasiSetting(organizationId, 'kirim_json');
  const urls = normalizeKirimUrls(raw);
  const defaultUrlId =
    typeof raw.defaultUrlId === 'string' && urls.some((u) => u.id === raw.defaultUrlId)
      ? (raw.defaultUrlId as string)
      : null;
  return { urls, defaultUrlId };
}

export async function saveKirimJsonSetting(
  organizationId: string,
  setting: KirimJsonSetting
): Promise<void> {
  await saveKoperasiSetting(organizationId, 'kirim_json', {
    urls: setting.urls,
    defaultUrlId: setting.defaultUrlId,
  });
}

/** Validasi satu entri URL (porting validUrlEntry backup). */
export function validUrlEntry(body: unknown): KirimUrlEntry | string {
  const b = (body ?? {}) as Record<string, unknown>;
  const judul = typeof b.judul === 'string' ? b.judul.trim() : '';
  const url = typeof b.url === 'string' ? b.url.trim() : '';
  const deskripsi = typeof b.deskripsi === 'string' ? b.deskripsi.trim() : '';
  if (!judul) return 'Judul URL tidak boleh kosong.';
  if (!url) return 'URL tidak boleh kosong.';
  if (!/^https?:\/\//i.test(url)) return 'URL harus diawali http:// atau https://.';
  try {
    new URL(url);
  } catch {
    return 'URL tidak valid.';
  }
  return { id: '', judul, url, deskripsi };
}

// ---------------------------------------------------------------------------
// Foto anggota — file di uploads/koperasi/, satu file per foto per anggota.
// Nama file: <anggotaId>-ktp.<jpg|png>, <anggotaId>-anggota.<jpg|png>,
// <anggotaId>-ttd.<png|jpg> (ekstensi mengikuti mime yang dikirim; kontrak
// menyebut .jpg/.jpg/.png untuk kasus umum JPEG/PNG tanda tangan).
// ---------------------------------------------------------------------------
export type KoperasiPhotoKind = 'ktp' | 'anggota' | 'ttd';

export const KOPERASI_PHOTO_DIR = join(process.cwd(), 'uploads', 'koperasi');
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024; // 2 MB per foto (decoded)

const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
};

/** Parse + validasi data URL foto. Lempar Error dengan pesan ramah bila invalid. */
export function parsePhotoDataUrl(dataUrl: string): { buffer: Buffer; mime: string; ext: string } {
  const m = dataUrl.match(/^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/=]+)$/);
  if (!m) {
    throw new Error('Foto harus berupa data URL gambar JPEG atau PNG.');
  }
  const mime = m[1];
  const buffer = Buffer.from(m[2], 'base64');
  if (buffer.length === 0) throw new Error('Foto kosong.');
  if (buffer.length > MAX_PHOTO_BYTES) {
    throw new Error('Ukuran foto maksimal 2 MB per foto.');
  }
  return { buffer, mime, ext: mime === 'image/png' ? '.png' : '.jpg' };
}

function photoFileName(anggotaId: string, kind: KoperasiPhotoKind, ext: string): string {
  return `${anggotaId}-${kind}${ext}`;
}

/** Path absolut dari path relatif tersimpan; null bila kosong/tidak aman. */
export function koperasiPhotoPath(storedPath: string | null | undefined): string | null {
  if (!storedPath) return null;
  const safe = basename(storedPath.replace(/\\/g, '/'));
  if (!safe || safe === '.' || safe === '..') return null;
  return join(KOPERASI_PHOTO_DIR, safe);
}

/** Simpan foto dari data URL; kembalikan path relatif untuk kolom *Path. */
export async function saveKoperasiPhoto(
  anggotaId: string,
  kind: KoperasiPhotoKind,
  dataUrl: string
): Promise<string> {
  const { buffer, ext } = parsePhotoDataUrl(dataUrl);
  await mkdir(KOPERASI_PHOTO_DIR, { recursive: true });
  // Bersihkan varian ekstensi lain dari foto yang sama (ganti jpg -> png dst).
  for (const oldExt of ['.jpg', '.jpeg', '.png']) {
    if (oldExt === ext) continue;
    const oldFile = join(KOPERASI_PHOTO_DIR, photoFileName(anggotaId, kind, oldExt));
    if (existsSync(oldFile)) await rm(oldFile, { force: true }).catch(() => {});
  }
  const fileName = photoFileName(anggotaId, kind, ext);
  await writeFile(join(KOPERASI_PHOTO_DIR, fileName), buffer);
  return `uploads/koperasi/${fileName}`;
}

/** Hapus satu foto (semua varian ekstensi) milik anggota. */
export async function deleteKoperasiPhotoKind(
  anggotaId: string,
  kind: KoperasiPhotoKind
): Promise<void> {
  for (const ext of ['.jpg', '.jpeg', '.png']) {
    const file = join(KOPERASI_PHOTO_DIR, photoFileName(anggotaId, kind, ext));
    if (existsSync(file)) await rm(file, { force: true }).catch(() => {});
  }
}

/** Hapus ketiga file foto milik anggota (dipakai saat hapus anggota). */
export async function deleteKoperasiPhotos(anggotaId: string): Promise<void> {
  await Promise.all([
    deleteKoperasiPhotoKind(anggotaId, 'ktp'),
    deleteKoperasiPhotoKind(anggotaId, 'anggota'),
    deleteKoperasiPhotoKind(anggotaId, 'ttd'),
  ]);
}

/** Baca file foto tersimpan lalu ubah ke data URL base64; "" bila tidak ada. */
export async function photoFileToDataUrl(storedPath: string | null | undefined): Promise<string> {
  const full = koperasiPhotoPath(storedPath);
  if (!full || !existsSync(full)) return '';
  try {
    const buf = await readFile(full);
    const ext = extname(full).toLowerCase();
    const mime = MIME_BY_EXT[ext] ?? 'application/octet-stream';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Validasi input anggota (porting koperasiValidate backup, diperlonggar
// sesuai kontrak Gelombang 5 — lihat catatan di kepala file).
// Foto: string data URL = ganti, "" = hapus (PATCH saja), undefined = tidak
// ada / pertahankan (PATCH) — divalidasi di sini, ditulis route setelah
// baris anggota tersimpan (nama file butuh anggotaId).
// ---------------------------------------------------------------------------
export interface ParsedAnggotaInput {
  // Field skalar siap tulis ke Prisma (hanya field yang dikirim pada PATCH).
  data: Record<string, unknown>;
  photos: {
    fotoKtp?: string;
    fotoAnggota?: string;
    tandaTangan?: string;
  };
}

const STR_FIELDS = [
  'cabang',
  'nik',
  'namaLengkap',
  'tempatLahir',
  'jenisKelamin',
  'alamatKtp',
  'noHp',
  'namaIbuKandung',
  'pekerjaan',
  'statusPerkawinan',
  'penghasilanBulanan',
  'tujuanKeanggotaan',
] as const;

function parseTanggalLahir(value: unknown): Date | null | string {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') return 'Tanggal Lahir tidak valid.';
  const m = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return 'Tanggal Lahir tidak valid (format YYYY-MM-DD).';
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (
    Number.isNaN(d.getTime()) ||
    d.getUTCFullYear() !== Number(m[1]) ||
    d.getUTCMonth() !== Number(m[2]) - 1 ||
    d.getUTCDate() !== Number(m[3])
  ) {
    return 'Tanggal Lahir tidak valid.';
  }
  return d;
}

export function parseAnggotaInput(
  body: unknown,
  opts: { isCreate: boolean; cabangList: string[] }
): { data: ParsedAnggotaInput | null; error: string | null } {
  const b = (body ?? {}) as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  const photos: ParsedAnggotaInput['photos'] = {};

  const strVal = (k: string): string | undefined => {
    const v = b[k];
    if (v === undefined || v === null) return undefined;
    return String(v).trim();
  };

  if (opts.isCreate) {
    // Create: isi default untuk field yang tidak dikirim.
    for (const k of STR_FIELDS) data[k] = strVal(k) ?? '';
    data.setujuMobileBanking = b.setujuMobileBanking === true;
    data.setujuPernyataan = b.setujuPernyataan === true;
    const tgl = parseTanggalLahir(b.tanggalLahir);
    if (typeof tgl === 'string') return { data: null, error: tgl };
    data.tanggalLahir = tgl;
  } else {
    // PATCH: hanya field yang dikirim yang ditulis.
    for (const k of STR_FIELDS) {
      const v = strVal(k);
      if (v !== undefined) data[k] = v;
    }
    if (b.setujuMobileBanking !== undefined) data.setujuMobileBanking = b.setujuMobileBanking === true;
    if (b.setujuPernyataan !== undefined) data.setujuPernyataan = b.setujuPernyataan === true;
    if (b.tanggalLahir !== undefined) {
      const tgl = parseTanggalLahir(b.tanggalLahir);
      if (typeof tgl === 'string') return { data: null, error: tgl };
      data.tanggalLahir = tgl;
    }
  }

  // Validasi wajib (kontrak Gelombang 5).
  const nik = (data.nik as string | undefined) ?? (opts.isCreate ? '' : undefined);
  if (opts.isCreate || nik !== undefined) {
    if (!/^\d{16}$/.test(nik ?? '')) return { data: null, error: 'NIK harus 16 digit angka.' };
  }
  const nama = (data.namaLengkap as string | undefined) ?? (opts.isCreate ? '' : undefined);
  if (opts.isCreate || nama !== undefined) {
    if (!nama) return { data: null, error: 'Nama Lengkap wajib diisi.' };
  }
  const cabang = (data.cabang as string | undefined) ?? (opts.isCreate ? '' : undefined);
  if (opts.isCreate || cabang !== undefined) {
    if (!cabang) return { data: null, error: 'Cabang wajib diisi.' };
    if (!opts.cabangList.includes(cabang)) {
      return { data: null, error: `Cabang tidak dikenal: ${cabang}.` };
    }
  }

  // Foto: validasi data URL di sini (decode + ukuran), tulis belakangan.
  const photoFields: Array<[keyof ParsedAnggotaInput['photos'], string]> = [
    ['fotoKtp', 'fotoKtp'],
    ['fotoAnggota', 'fotoAnggota'],
    ['tandaTangan', 'tandaTangan'],
  ];
  for (const [key, bodyKey] of photoFields) {
    const v = b[bodyKey];
    if (v === undefined || v === null) continue;
    if (typeof v !== 'string') return { data: null, error: `Field ${bodyKey} tidak valid.` };
    if (v === '') {
      if (!opts.isCreate) photos[key] = '';
      continue;
    }
    try {
      parsePhotoDataUrl(v);
    } catch (e: any) {
      return { data: null, error: e?.message ?? `Field ${bodyKey} tidak valid.` };
    }
    photos[key] = v;
  }

  return { data: { data, photos }, error: null };
}

/** Terapkan foto hasil parse ke baris anggota (tulis/hapus file + update path). */
export async function applyAnggotaPhotos(
  anggotaId: string,
  photos: ParsedAnggotaInput['photos']
): Promise<{ fotoKtpPath?: string; fotoAnggotaPath?: string; tandaTanganPath?: string }> {
  const patch: { fotoKtpPath?: string; fotoAnggotaPath?: string; tandaTanganPath?: string } = {};
  if (photos.fotoKtp !== undefined) {
    if (photos.fotoKtp === '') {
      await deleteKoperasiPhotoKind(anggotaId, 'ktp');
      patch.fotoKtpPath = '';
    } else {
      patch.fotoKtpPath = await saveKoperasiPhoto(anggotaId, 'ktp', photos.fotoKtp);
    }
  }
  if (photos.fotoAnggota !== undefined) {
    if (photos.fotoAnggota === '') {
      await deleteKoperasiPhotoKind(anggotaId, 'anggota');
      patch.fotoAnggotaPath = '';
    } else {
      patch.fotoAnggotaPath = await saveKoperasiPhoto(anggotaId, 'anggota', photos.fotoAnggota);
    }
  }
  if (photos.tandaTangan !== undefined) {
    if (photos.tandaTangan === '') {
      await deleteKoperasiPhotoKind(anggotaId, 'ttd');
      patch.tandaTanganPath = '';
    } else {
      patch.tandaTanganPath = await saveKoperasiPhoto(anggotaId, 'ttd', photos.tandaTangan);
    }
  }
  return patch;
}

// ---------------------------------------------------------------------------
// Mapping Prisma -> DTO (tanpa isi foto — hanya URL serve).
// Porting koperasiMapRow backup; tanggalLahir jadi "YYYY-MM-DD" | null.
// ---------------------------------------------------------------------------
export interface KoperasiAnggotaRow {
  id: string;
  cabang: string;
  nik: string;
  namaLengkap: string;
  tempatLahir: string;
  tanggalLahir: Date | null;
  jenisKelamin: string;
  alamatKtp: string;
  noHp: string;
  namaIbuKandung: string;
  pekerjaan: string;
  statusPerkawinan: string;
  penghasilanBulanan: string;
  tujuanKeanggotaan: string;
  fotoKtpPath: string;
  fotoAnggotaPath: string;
  tandaTanganPath: string;
  setujuMobileBanking: boolean;
  setujuPernyataan: boolean;
  hasSimpanan: boolean;
  hasPinjaman: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export function fotoServeUrl(anggotaId: string, kind: KoperasiPhotoKind, hasPhoto: boolean): string | null {
  if (!hasPhoto) return null;
  return `/api/koperasi/anggota/${anggotaId}/foto?type=${kind}`;
}

export function mapAnggota(r: KoperasiAnggotaRow): Record<string, unknown> {
  return {
    id: r.id,
    cabang: r.cabang,
    nik: r.nik,
    namaLengkap: r.namaLengkap,
    tempatLahir: r.tempatLahir,
    tanggalLahir: r.tanggalLahir ? r.tanggalLahir.toISOString().slice(0, 10) : null,
    jenisKelamin: r.jenisKelamin,
    alamatKtp: r.alamatKtp,
    noHp: r.noHp,
    namaIbuKandung: r.namaIbuKandung,
    pekerjaan: r.pekerjaan,
    statusPerkawinan: r.statusPerkawinan,
    penghasilanBulanan: r.penghasilanBulanan,
    tujuanKeanggotaan: r.tujuanKeanggotaan,
    fotoKtpUrl: fotoServeUrl(r.id, 'ktp', !!r.fotoKtpPath),
    fotoAnggotaUrl: fotoServeUrl(r.id, 'anggota', !!r.fotoAnggotaPath),
    tandaTanganUrl: fotoServeUrl(r.id, 'ttd', !!r.tandaTanganPath),
    setujuMobileBanking: r.setujuMobileBanking,
    setujuPernyataan: r.setujuPernyataan,
    hasSimpanan: r.hasSimpanan,
    hasPinjaman: r.hasPinjaman,
    createdBy: r.createdBy,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// buildAnggotaJson — port persis src/components/koperasi/kirimJson.ts.
// Bentuk selalu { title: "PENDAFTARAN_ANGGOTA", data: {...} }; foto adalah
// data URL base64, "" bila anggota tidak punya foto itu.
// ---------------------------------------------------------------------------
export interface AnggotaJsonSource {
  cabang?: string;
  nik?: string;
  namaLengkap?: string;
  tempatLahir?: string;
  tanggalLahir?: string;
  jenisKelamin?: string;
  alamatKtp?: string;
  noHp?: string;
  namaIbuKandung?: string;
  pekerjaan?: string;
  statusPerkawinan?: string;
  penghasilanBulanan?: string;
  tujuanKeanggotaan?: string;
  fotoKtp?: string;
  fotoAnggota?: string;
  tandaTangan?: string;
  setujuMobileBanking?: boolean;
  createdAt?: string;
}

export interface AnggotaJsonPayload {
  title: string;
  data: Record<string, unknown>;
}

export function buildAnggotaJson(src: AnggotaJsonSource): AnggotaJsonPayload {
  const data: Record<string, unknown> = {
    cabang: src.cabang || '',
    nama: src.namaLengkap || '',
    tempat_lahir: src.tempatLahir || '',
    tgllahir: src.tanggalLahir || '',
    jenis_kelamin: src.jenisKelamin || '',
    no_id: src.nik || '',
    alamat: src.alamatKtp || '',
    no_hp: src.noHp || '',
    nama_ibu_kandung: src.namaIbuKandung || '',
    pekerjaan: src.pekerjaan || '',
    status_perkawinan: src.statusPerkawinan || '',
    penghasilan_bulanan: src.penghasilanBulanan || '',
    tujuan_keanggotaan: src.tujuanKeanggotaan || '',
    setuju_mobile_banking: !!src.setujuMobileBanking,
    foto_ktp: src.fotoKtp || '',
    foto_anggota: src.fotoAnggota || '',
    tanda_tangan: src.tandaTangan || '',
  };
  if (src.createdAt) {
    const d = new Date(src.createdAt);
    if (!Number.isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      data.tanggal_daftar = `${y}-${m}-${day}`;
    }
  }
  return { title: 'PENDAFTARAN_ANGGOTA', data };
}
