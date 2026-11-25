// Konstanta Modul Manajemen Perusahaan — WOORK.
// Semua nilai disimpan terstruktur (key), bukan teks bebas.

export const BUSINESS_TYPES = ['UMKM', 'BADAN_USAHA'] as const;
export type BusinessType = (typeof BUSINESS_TYPES)[number];

export const BUSINESS_TYPE_LABEL: Record<BusinessType, string> = {
  UMKM: 'Usaha Perorangan / UMKM',
  BADAN_USAHA: 'Badan Usaha (PT, PT Perorangan, CV, dan sejenisnya)',
};

export const ENTITY_FORMS = [
  'PT',
  'PT_PERORANGAN',
  'PJP',
  'CV',
  'YAYASAN',
  'KOPERASI',
  'FIRMA',
  'BMT',
  'BPR',
  'BPRS',
  'BANK',
  'BUP',
  'KEMENTERIAN',
  'LEMBAGA_PEMERINTAHAN',
  'PERGURUAN_TINGGI',
] as const;
export type EntityForm = (typeof ENTITY_FORMS)[number];

export const ENTITY_FORM_LABEL: Record<EntityForm, string> = {
  PT: 'PT',
  PT_PERORANGAN: 'PT Perorangan',
  PJP: 'Penyedia Jasa Pembayaran (PJP)',
  CV: 'CV',
  YAYASAN: 'Yayasan',
  KOPERASI: 'Koperasi',
  FIRMA: 'Firma',
  BMT: 'BMT',
  BPR: 'BPR',
  BPRS: 'BPRS',
  BANK: 'Bank',
  BUP: 'Badan Usaha Pemerintah',
  KEMENTERIAN: 'Kementerian',
  LEMBAGA_PEMERINTAHAN: 'Lembaga Pemerintahan',
  PERGURUAN_TINGGI: 'Perguruan Tinggi',
};

export const INDUSTRIES = [
  { key: 'AGRICULTURE', label: 'Agriculture' },
  { key: 'AUTOMOTIVE', label: 'Automotive' },
  { key: 'BANKING', label: 'Banking' },
  { key: 'CAPITAL_MARKET', label: 'Capital Market' },
  { key: 'CHEMICAL', label: 'Chemical' },
  { key: 'COSMETIC', label: 'Cosmetic' },
  { key: 'COURSES', label: 'Courses' },
  { key: 'CROWDFUNDING_DONATION', label: 'Crowdfunding/Donation' },
  { key: 'CRYPTO_EXCHANGERS', label: 'Crypto Exchangers' },
  { key: 'ECOMMERCE_JASA', label: 'eCommerce Jasa/Service' },
  { key: 'ECOMMERCE_PROPERTY', label: 'eCommerce Property' },
  { key: 'ECOMMERCE_TRAVEL', label: 'eCommerce Travel' },
  { key: 'ECOMMERCE_MARKETPLACE', label: 'eCommerce/Marketplace' },
  { key: 'EDUTECH', label: 'Education Tech (EduTech)' },
  { key: 'ELECTRONIC', label: 'Electronic' },
  { key: 'EXPEDITION', label: 'Expedition' },
  { key: 'FASHION', label: 'Fashion' },
  { key: 'FMCG_CPG', label: 'FMCG/CPG' },
  { key: 'FNB', label: 'Food & Beverages (F&B)' },
  { key: 'FURNITURE', label: 'Furniture' },
  { key: 'GAMING', label: 'Gaming' },
  { key: 'GROCERY_TECH', label: 'Grocery/GroceryTech' },
  { key: 'HEALTHTECH', label: 'HealthTech' },
  { key: 'HOSPITAL', label: 'Hospital' },
  { key: 'HOTEL_VILLAS', label: 'Hotel Group/Villas' },
  { key: 'HRTECH', label: 'Human Resource Tech (HRTech/Management)' },
  { key: 'HR_PAYROLL_OUTSOURCING', label: 'Human Resource/Payroll Outsourcing' },
  { key: 'INSURANCE_INSURTECH', label: 'Insurance & InsurTech' },
  { key: 'IT_SOLUTION', label: 'IT Solution' },
  { key: 'KOPERASI_JASA', label: 'Koperasi Jasa' },
  { key: 'KOPERASI_PEGAWAI', label: 'Koperasi Pegawai' },
  { key: 'KOPERASI_SERBA_USAHA', label: 'Koperasi Serba Usaha' },
  { key: 'KOPERASI_SIMPAN_PINJAM', label: 'Koperasi Simpan Pinjam' },
  { key: 'KOPERASI_SIMPAN_PINJAM_SYARIAH', label: 'Koperasi Simpan Pinjam Syariah' },
  { key: 'LABORATORIUM', label: 'Laboratorium' },
  { key: 'LOGISTICS', label: 'Logistics' },
  { key: 'MEDIA_PR_ADVERTISING_EVENTS', label: 'Media/PR/Advertising/Events' },
  { key: 'MEDICAL_CLINIC', label: 'Medical Clinic' },
  { key: 'MINING', label: 'Mining' },
  { key: 'MLM', label: 'MLM' },
  { key: 'ONLINE_MOBILE_POS', label: 'Online/Mobile POS' },
  { key: 'OUTSOURCING', label: 'Outsourcing' },
  { key: 'PAYMENT_GATEWAY_REMITTANCE', label: 'Payment/Payment Gateway/Remittance' },
  { key: 'PHARMACY', label: 'Pharmacy' },
  { key: 'PROPERTY_REAL_ESTATE', label: 'Property & Real Estate' },
  { key: 'SCHOOLS', label: 'Schools' },
  { key: 'SME_LENDING', label: 'SME Lending' },
  { key: 'SOCIAL_COMMERCE_ENABLER', label: 'Social Commerce & Enabler' },
  { key: 'TEXTILE_GARMENTS', label: 'Textile & Garments' },
  { key: 'TICKETING', label: 'Ticketing' },
  { key: 'TRANSPORTATION', label: 'Transportation' },
  { key: 'TRAVEL', label: 'Travel' },
  { key: 'UNIVERSITIES', label: 'Universities' },
  { key: 'YAYASAN_KEAGAMAAN', label: 'Yayasan Keagamaan' },
  { key: 'YAYASAN_KEMANUSIAAN', label: 'Yayasan Kemanusiaan' },
  { key: 'YAYASAN_SOSIAL', label: 'Yayasan Sosial' },
] as const;

export const INDUSTRY_KEYS = INDUSTRIES.map((i) => i.key) as unknown as string[];
export const INDUSTRY_LABEL: Record<string, string> = Object.fromEntries(
  INDUSTRIES.map((i) => [i.key, i.label])
);

// Posisi jabatan Akun Master (disimpan di Membership.jobTitle).
export const POSITIONS = [
  'Business Owner',
  'C-Level (CEO/CFO/COO etc)',
  'Senior Manager (Head/VP, etc)',
  'Staff',
  'Lainnya',
] as const;
export const POSITION_OTHER = 'Lainnya';

// ---------------------------------------------------------------------------
// Dokumen legalitas per jenis usaha
// ---------------------------------------------------------------------------

export type DocCategory = 'FOTO' | 'PDF';

export interface DocTypeDef {
  key: string;
  label: string;
  category: DocCategory;
  maxBytes: number;
  required: boolean;
  multiple: boolean;
  /** Bila ada, UI meminta label tambahan (teks bebas atau pilihan). */
  labelPrompt?: string;
  labelOptions?: string[];
  hint?: string;
}

const MB = 1024 * 1024;

export const DOC_TYPES_UMKM: DocTypeDef[] = [
  {
    key: 'KTP',
    label: 'e-KTP / Paspor (WNA)',
    category: 'FOTO',
    maxBytes: 1 * MB,
    required: true,
    multiple: false,
    hint: 'Pastikan gambar dapat dibaca dengan jelas.',
  },
  {
    key: 'SELFIE_KTP',
    label: 'Selfie dengan Membawa e-KTP / Paspor (WNA)',
    category: 'FOTO',
    maxBytes: 1 * MB,
    required: true,
    multiple: false,
    hint: 'Foto harus menampilkan wajah dan dokumen identitas.',
  },
  {
    key: 'FOTO_LOKASI_USAHA',
    label: 'Foto Lokasi Usaha',
    category: 'FOTO',
    maxBytes: 2 * MB,
    required: true,
    multiple: true,
    hint: 'Dapat mengunggah lebih dari satu foto (bagian luar / area usaha).',
  },
  {
    key: 'IZIN_USAHA',
    label: 'Dokumen Izin Usaha (Jika Ada)',
    category: 'PDF',
    maxBytes: 5 * MB,
    required: false,
    multiple: false,
    hint: 'Boleh dilewati bila belum memilikinya.',
  },
];

export const DOC_TYPES_BADAN_USAHA: DocTypeDef[] = [
  {
    key: 'SK_KEMENKUMHAM',
    label: 'SK Kemenkumham',
    category: 'PDF',
    maxBytes: 5 * MB,
    required: true,
    multiple: false,
  },
  {
    key: 'ANGGARAN_DASAR',
    label: 'Anggaran Dasar dan Perubahannya',
    category: 'PDF',
    maxBytes: 10 * MB,
    required: false,
    multiple: false,
    hint: 'Dapat diunggah kemudian.',
  },
  {
    key: 'AKTA_PENDIRIAN',
    label: 'Akta Pendirian dan Perubahannya',
    category: 'PDF',
    maxBytes: 10 * MB,
    required: false,
    multiple: false,
    hint: 'Dapat diunggah kemudian.',
  },
  {
    key: 'COMPANY_PROFILE',
    label: 'Company Profile',
    category: 'PDF',
    maxBytes: 10 * MB,
    required: false,
    multiple: false,
    hint: 'Dapat diunggah kemudian.',
  },
  {
    key: 'NPWP_PERUSAHAAN',
    label: 'NPWP Perusahaan',
    category: 'PDF',
    maxBytes: 1 * MB,
    required: false,
    multiple: false,
    hint: 'Dapat diunggah kemudian.',
  },
  {
    key: 'SIUP',
    label: 'Surat Izin Usaha Perdagangan (SIUP)',
    category: 'PDF',
    maxBytes: 5 * MB,
    required: false,
    multiple: false,
    hint: 'Dapat diunggah kemudian.',
  },
  {
    key: 'NIB',
    label: 'Nomor Induk Berusaha (NIB)',
    category: 'PDF',
    maxBytes: 1 * MB,
    required: false,
    multiple: false,
    hint: 'Dapat diunggah kemudian.',
  },
  {
    key: 'FOTO_LOKASI_PERUSAHAAN',
    label: 'Foto Lokasi Perusahaan (Luar dan Dalam)',
    category: 'FOTO',
    maxBytes: 2 * MB,
    required: false,
    multiple: true,
    labelPrompt: 'Kategori foto',
    labelOptions: ['LUAR', 'DALAM'],
    hint: 'Maksimal 2 MB per file. Pilih kategori luar atau dalam.',
  },
  {
    key: 'KTP_PENGURUS',
    label: 'KTP Pengurus',
    category: 'FOTO',
    maxBytes: 2 * MB,
    required: false,
    multiple: true,
    labelPrompt: 'Nama pengurus',
    hint: 'Isi nama pengurus untuk setiap dokumen yang diunggah.',
  },
  {
    key: 'KTP_PIC',
    label: 'KTP Project Manager / PIC',
    category: 'FOTO',
    maxBytes: 2 * MB,
    required: false,
    multiple: false,
  },
];

export function docTypesFor(businessType: string | null | undefined): DocTypeDef[] {
  if (businessType === 'BADAN_USAHA') return DOC_TYPES_BADAN_USAHA;
  if (businessType === 'UMKM') return DOC_TYPES_UMKM;
  return [];
}

export function findDocType(businessType: string | null | undefined, key: string): DocTypeDef | undefined {
  return docTypesFor(businessType).find((d) => d.key === key);
}

/** MIME yang diizinkan per kategori dokumen. */
export const DOC_MIME: Record<DocCategory, string[]> = {
  FOTO: ['image/jpeg', 'image/png', 'image/webp'],
  PDF: ['application/pdf'],
};

export const DOC_EXT: Record<DocCategory, string[]> = {
  FOTO: ['.jpg', '.jpeg', '.png', '.webp'],
  PDF: ['.pdf'],
};

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/** Validasi nomor telepon longgar (Indonesia / internasional). */
export function isValidPhone(value: string): boolean {
  const v = value.trim();
  return /^\+?[0-9][0-9\s\-()]{7,19}$/.test(v);
}
