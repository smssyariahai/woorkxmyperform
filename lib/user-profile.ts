// Konstanta & tipe bersama untuk Manajemen Pengguna — halaman Tambah/Edit
// (Sidebar 1–4). Dipakai API dan komponen form agar daftar pilihan identik.

export const GENDERS = [
  { value: 'L', label: 'Laki-laki' },
  { value: 'P', label: 'Perempuan' },
] as const;

export const MARITAL_STATUSES = ['Lajang', 'Menikah', 'Cerai'] as const;

export const BLOOD_TYPES = ['A', 'B', 'AB', 'O'] as const;

export const RELIGIONS = ['Katolik', 'Islam', 'Kristen', 'Buddha', 'Hindu', 'Konghucu', 'Lainnya'] as const;

/** Level akses dokumen pengguna (Sidebar 1 — Info Akun). */
export const DOC_ACCESS_LEVELS = [
  { value: 'UMUM', label: 'Umum', hint: 'Boleh mengakses dokumen umum kantor.' },
  { value: 'INTERNAL', label: 'Internal', hint: 'Boleh mengakses dokumen internal kantor.' },
  { value: 'RAHASIA', label: 'Rahasia', hint: 'Boleh mengakses dokumen berklasifikasi rahasia.' },
] as const;

export const RELATIONSHIPS = [
  'Ayah',
  'Ibu',
  'Saudara Kandung',
  'Pasangan',
  'Anak',
  'Sepupu',
  'Keponakan',
  'Mertua',
  'Saudara Ipar (laki-laki)',
  'Saudara Ipar (perempuan)',
  'Paman',
  'Bibi',
  'Kakek',
  'Nenek',
  'Teman',
  'Rekan Kerja',
  'Lainnya',
] as const;

/** Derajat pendidikan formal (Sidebar 2 — Pendidikan Formal). */
export const FORMAL_DEGREES = [
  'Taman Kanak-kanak',
  'Sekolah Dasar',
  'Sekolah Menengah Pertama',
  'Sekolah Menengah Atas (SMA)',
  'Sekolah Menengah Kejuruan (SMK)',
  'Gelar Associate 1 (D1)',
  'Gelar Associate 2 (D2)',
  'Gelar Associate 3 (D3)',
  'Gelar Associate 4 (D4)',
  'Gelar Sarjana (S1)',
  'Bachelor Degree (S1) + Profesi Apoteker',
  'Bachelor Degree (S1) + Profesi Keperawatan (Ners)',
  'Bachelor Degree (S1) + Profesi Psikologi',
  'Bachelor Degree (S1) + Profesi Dokter',
  'Gelar Doktor (S3)',
  'Gelar Doktor (PhD)',
  'Ahli Nautika Tingkat I',
  'Ahli Nautika Tingkat II',
  'Ahli Nautika Tingkat III',
  'Ahli Nautika Tingkat IV',
  'Ahli Teknika Tingkat I',
  'Ahli Teknika Tingkat II',
  'Teknisi Level III',
  'Teknisi Level IV',
  'Pendidikan Profesional',
  'Pendidikan Militer',
  'Dokter Spesialis',
  'Diploma Dek',
  'Ahli Nautika Level III M',
  'Ahli Nautika Level III O',
  'Ahli Nautika Level IV M',
  'Ahli Nautika Level IV O',
  'Ahli Nautika Level V M',
  'Ahli Nautika Level V O',
  'Penilaian sebagai Dek Pelaut Mampu',
  'Rating yang menjadi bagian dari pengawasan navigasi',
  'Ijasah Mesin (Engine)',
  'Teknisi Level III M',
  'Ahli Teknika Tingkat III O',
  'Teknisi Level IV M',
  'Teknisi Level IV O',
  'Level Teknisi V M',
  'Level Teknisi V O',
  'Peringkat sebagai Mesin Pelaut Mampu',
  'Rating yang menjadi bagian dari jam tangan teknik',
] as const;

export const EMPLOYMENT_STATUSES = ['Tetap', 'Kontrak', 'Magang', 'Freelance', 'Percobaan'] as const;

export const JOB_LEVELS = [
  'Staff',
  'Senior Staff',
  'Supervisor',
  'Asisten Manajer',
  'Manajer',
  'Senior Manajer',
  'Direktur',
  'Komisaris',
] as const;

/**
 * Jenis field custom (Sidebar 3 — Info Tambahan).
 * Selain yang diminta (Teks Pendek, Teks Panjang, Nominal, Tanggal),
 * ditambahkan: Angka, Waktu, Pilihan (dropdown), Ya/Tidak, Email,
 * No. Telepon, Tautan/URL, dan File/Lampiran.
 */
export const CUSTOM_FIELD_TYPES = [
  { value: 'SHORT_TEXT', label: 'Teks Pendek', hint: 'Satu baris teks, mis. hobi atau golongan SIM.' },
  { value: 'LONG_TEXT', label: 'Teks Panjang', hint: 'Paragraf, mis. catatan khusus atau alamat domisili.' },
  { value: 'NUMBER', label: 'Angka', hint: 'Bilangan bulat, mis. jumlah anak atau tahun pengalaman.' },
  { value: 'CURRENCY', label: 'Nominal (Rp)', hint: 'Uang dalam rupiah, mis. tunjangan atau gaji pokok.' },
  { value: 'DATE', label: 'Tanggal', hint: 'Tanggal saja, mis. tanggal berlaku SIM.' },
  { value: 'TIME', label: 'Waktu', hint: 'Jam, mis. jam kerja pilihan.' },
  { value: 'SELECT', label: 'Pilihan (Dropdown)', hint: 'Satu dari beberapa pilihan yang ditentukan admin.' },
  { value: 'BOOLEAN', label: 'Ya / Tidak', hint: 'Centang, mis. bersedia dinas luar kota.' },
  { value: 'EMAIL', label: 'Email', hint: 'Alamat email tambahan.' },
  { value: 'PHONE', label: 'No. Telepon', hint: 'Nomor telepon tambahan.' },
  { value: 'URL', label: 'Tautan / URL', hint: 'Link, mis. portofolio atau LinkedIn.' },
  { value: 'FILE', label: 'File / Lampiran', hint: 'Unggah file, mis. scan KTP atau NPWP.' },
] as const;

export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number]['value'];

export function isCustomFieldType(v: unknown): v is CustomFieldType {
  return typeof v === 'string' && CUSTOM_FIELD_TYPES.some((t) => t.value === v);
}

/** Nilai mentah (string) dari UserCustomValue -> label yang enak dibaca. */
export function formatCustomValue(type: string, raw: string | null | undefined, options?: string | null): string {
  if (raw === null || raw === undefined || raw === '') return '—';
  if (type === 'BOOLEAN') return raw === 'true' ? 'Ya' : 'Tidak';
  if (type === 'CURRENCY') {
    const n = Number(raw);
    return Number.isFinite(n) ? `Rp ${n.toLocaleString('id-ID')}` : raw;
  }
  if (type === 'DATE') {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? raw : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  if (type === 'FILE') return raw.split('/').pop() ?? raw;
  return raw;
}

/** Parse JSON options (SELECT) secara aman. */
export function parseFieldOptions(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
