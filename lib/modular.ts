// Registry Sistem Modular — WOORK SaaS (14 modul).
//
// Satu sumber kebenaran untuk struktur modul: halaman, permission, harga,
// dan pemetaan modul lama (AVAILABLE_MODULES) -> modul baru. Dipakai
// Sidebar, penegakan permission (lib/auth-helpers), halaman langganan,
// dan wizard pembuatan kantor.
//
// Modul berbayar dihitung PER USER (kuota karyawan) per siklus:
//   total = sum(harga modul) x kuota x (1 bila MONTHLY, 10 bila YEARLY).

import { PERMISSION_CATALOG } from './permissions';

export type ModularKey = 'dashboard' | 'chat' | 'hris' | 'audit' | 'setting' | 'pusat' | 'islami' | 'emas' | 'pengumuman' | 'tal' | 'koperasi' | 'tiket' | 'kantor' | 'esign' | 'earsip' | 'meet' | 'perusahaan' | 'kalender' | 'daily' | 'absensi';

export type ModuleAccessLevel = 'READ' | 'WRITE' | 'NONE';

export interface ModularPageDef {
  href: string;
  label: string;
  /** Kelompok tampilan di sidebar (mis. modul 'pusat'). Kosong = tampil flat seperti biasa. */
  section?: string;
  /** permission tenant yang dibutuhkan (salah satu). Kosong = selalu tampil. */
  perms?: string[];
  /** permission platform yang dibutuhkan (salah satu). Dipakai menu Administrator Pusat. */
  platformPerms?: string[];
  /** hanya Administrator Pusat. */
  superOnly?: boolean;
  /** kunci modul lama (AVAILABLE_MODULES) bila ada — untuk baris UserModuleAccess lama. */
  legacyKey?: string;
}

export interface ModularModuleDef {
  key: ModularKey;
  label: string;
  /** Kelompok di sidebar: 'utama' (Menu Utama) atau 'sistem' (Sistem). Default 'utama'. */
  group?: 'utama' | 'sistem';
  /** true = masuk hitungan invoice; false = selalu ikut (Rp0). */
  billable: boolean;
  /** harga default per user per bulan (Rp). Tahunan = 10x bulanan. */
  defaultMonthlyPerUser: number;
  pages: ModularPageDef[];
}

export const MODULAR_MODULES: ModularModuleDef[] = [
  {
    key: 'dashboard',
    group: 'utama',
    label: 'Dashboard',
    billable: false,
    defaultMonthlyPerUser: 0,
    pages: [{ href: '/dashboard', label: 'Dashboard' }],
  },
  {
    key: 'tal',
    group: 'utama',
    label: 'TAL',
    billable: false,
    defaultMonthlyPerUser: 0,
    // Porting MyPerform Gelombang 4 (fondasi 2026-11-12). Route dinamis
    // /tal/tal-tim-saya/laporan/[userId] TIDAK didaftar di sini: guard
    // pageModuleForPath mengenalinya lewat prefix '/tal/tal-tim-saya'
    // (pola yang sama seperti /pengumuman/[id] lewat '/pengumuman').
    // Kalender kerja backup punya dua route (/kalender-kerja dan
    // /tal/kalender-kerja) — di WOORK hanya /tal/kalender-kerja.
    pages: [
      { href: '/tal', label: 'TAL' },
      { href: '/tal/tasks', label: 'Tugas' },
      { href: '/tal/templates', label: 'Template Rutinitas' },
      { href: '/tal/rekapitulasi', label: 'Rekapitulasi' },
      { href: '/tal/rekapitulasi-hr', label: 'Rekap HR' },
      { href: '/tal/badges', label: 'Lencana & Trofi' },
      { href: '/tal/preferences', label: 'Preferensi Notifikasi' },
      { href: '/tal/tal-tim-saya', label: 'Tim Saya' },
      { href: '/tal/tal-tim-saya/pengaturan', label: 'Pengaturan Tim' },
      { href: '/tal/kalender-kerja', label: 'Kalender Kerja' },
    ],
  },
  {
    key: 'koperasi',
    group: 'utama',
    label: 'Koperasi',
    billable: false,
    defaultMonthlyPerUser: 0,
    // Porting MyPerform Gelombang 5 (fondasi 2026-11-13). Simpanan &
    // pembiayaan di backup masih placeholder (KoperasiSoon) — halaman
    // /koperasi/simpanan-baru & /koperasi/pembiayaan-baru didaftar di sini
    // agar guard modul mengenalinya; isinya dibuat sub-tahap berikutnya.
    pages: [
      { href: '/koperasi', label: 'Koperasi' },
      { href: '/koperasi/anggota', label: 'Anggota' },
      { href: '/koperasi/anggota-baru', label: 'Anggota Baru' },
      { href: '/koperasi/simpanan-baru', label: 'Simpanan Baru' },
      { href: '/koperasi/pembiayaan-baru', label: 'Pembiayaan Baru' },
      { href: '/koperasi/pengaturan', label: 'Pengaturan' },
    ],
  },
  {
    key: 'emas',
    group: 'utama',
    label: 'Emas',
    billable: false,
    defaultMonthlyPerUser: 0,
    pages: [
      { href: '/emas', label: 'Emas' },
      { href: '/emas/kalkulator-gadai-emas', label: 'Kalkulator Gadai Emas' },
      { href: '/emas/kalkulator-pelunasan-emas', label: 'Kalkulator Pelunasan Emas' },
      { href: '/emas/pke', label: 'PKE' },
      { href: '/emas/simulasi-emas', label: 'Simulasi Emas' },
      { href: '/emas/simulasi-emas/pengaturan-url', label: 'Pengaturan URL JSON' },
      { href: '/emas/tabel-harga-emas', label: 'Tabel Harga Emas' },
      { href: '/emas/calculator', label: 'Gadai Elektronik' },
    ],
  },
  {
    key: 'islami',
    group: 'utama',
    label: 'Islami',
    billable: false,
    defaultMonthlyPerUser: 0,
    pages: [
      { href: '/islami', label: 'Islami' },
      { href: '/islami/al-quran', label: 'Al-Qur\u2019an' },
      { href: '/islami/hadits', label: 'Hadits' },
      { href: '/islami/jadwal-shalat', label: 'Jadwal Shalat' },
      { href: '/islami/kompas-kiblat', label: 'Kompas Kiblat' },
      { href: '/islami/tasbih', label: 'Tasbih' },
      { href: '/islami/dzikir', label: 'Dzikir' },
      { href: '/islami/doa-harian', label: 'Doa Harian' },
      { href: '/islami/asmaul-husna', label: 'Asmaul Husna' },
      { href: '/islami/kitab-maulid', label: 'Kitab Maulid' },
      { href: '/islami/panduan-shalat', label: 'Panduan Shalat' },
      { href: '/islami/panduan-puasa', label: 'Panduan Puasa' },
      { href: '/islami/thaharah', label: 'Thaharah' },
      { href: '/islami/kalkulator-zakat', label: 'Kalkulator Zakat' },
      { href: '/islami/kisah-nabi', label: 'Kisah Nabi' },
      { href: '/islami/malaikat-kitab', label: 'Malaikat & Kitab' },
      { href: '/islami/kalender-hijriah', label: 'Kalender Hijriah' },
      { href: '/islami/adab-islami', label: 'Adab Islami' },
      { href: '/islami/tempat-bersejarah', label: 'Tempat Bersejarah' },
    ],
  },
  {
    key: 'pengumuman',
    group: 'utama',
    label: 'Pengumuman',
    billable: false,
    defaultMonthlyPerUser: 0,
    // Satu halaman tab (Daftar | Buat Baru | Draft & Terjadwal) + detail
    // /pengumuman/[id]. Route /pengumuman/baru, /terjadwal, /preferensi
    // dari draf desain TIDAK dibuat — tab & modal di halaman utama.
    pages: [{ href: '/pengumuman', label: 'Pengumuman' }],
  },
  {
    key: 'tiket',
    group: 'utama',
    label: 'Tiket',
    billable: false,
    defaultMonthlyPerUser: 0,
    pages: [{ href: '/tiket', label: 'Tiket', perms: ['TIKET_VIEW'], legacyKey: 'tiket' }],
  },
  {
    key: 'kantor',
    group: 'utama',
    label: 'Kantor Virtual',
    billable: false,
    defaultMonthlyPerUser: 0,
    // Kantor Virtual baru dari Ruang (2026-11-20, Wave 0): read-only di v1
    // (hanya menampilkan agent/tugas/aktivitas dari DB). Selalu aktif
    // (non-billable, pola Tiket). Sub-route /kantor/* dikenali guard lewat
    // prefix '/kantor' (pageModuleForPath).
    pages: [
      { href: '/kantor', label: 'Kantor Virtual', legacyKey: 'kantor' },
      { href: '/admin-kantor/residence', label: 'Staff Residence', perms: ['DEPARTMENTS_VIEW'] },
    ],
  },
  {
    key: 'earsip',
    group: 'utama',
    label: 'E-Arsip',
    billable: false,
    defaultMonthlyPerUser: 0,
    pages: [
      { href: '/earsip', label: 'E-Arsip', perms: ['EARSIP_VIEW'], legacyKey: 'earsip' },
      { href: '/earsip/kategori', label: 'Kategori Arsip', perms: ['EARSIP_MANAGE'], legacyKey: 'earsip' },
    ],
  },
  {
    key: 'meet',
    group: 'utama',
    label: 'WOORK MEET',
    billable: false,
    defaultMonthlyPerUser: 0,
    // WOORK MEET (2026-11-20, Fase 2): sub-route /meet/* (/meet/new,
    // /meet/[id], /meet/room/[id], ...) dikenali guard lewat prefix '/meet'
    // (pageModuleForPath) — tidak perlu didaftar satu per satu.
    pages: [{ href: '/meet', label: 'WOORK MEET', perms: ['MEET_VIEW'], legacyKey: 'meet' }],
  },
  {
    key: 'perusahaan',
    group: 'utama',
    label: 'Manajemen Perusahaan',
    billable: false,
    defaultMonthlyPerUser: 0,
    // Manajemen Perusahaan (2026-11-21): identitas akun master, profil
    // perusahaan + pajak, dan dokumen legalitas. Memperluas model
    // Organization (bukan model Company duplikat). Selalu aktif
    // (non-billable, pola Tiket/Kantor). Sub-route /perusahaan/*
    // dikenali guard lewat prefix '/perusahaan' (pageModuleForPath).
    pages: [{ href: '/perusahaan', label: 'Manajemen Perusahaan', perms: ['PERUSAHAAN_VIEW'], legacyKey: 'perusahaan' }],
  },
  {
    key: 'kalender',
    group: 'utama',
    label: 'Work Calendar',
    billable: false,
    defaultMonthlyPerUser: 0,
    // Work Calendar (2026-11-21): kalender kerja terpusat — event manual
    // + sinkron dari Meeting, tugas TAL, cuti TAL, Invoice, Pengumuman,
    // dan hari libur TAL. Selalu aktif (non-billable, pola Tiket/Kantor).
    // Sub-route /kalender/* dikenali guard lewat prefix '/kalender'.
    pages: [{ href: '/kalender', label: 'Work Calendar', perms: ['CALENDAR_VIEW'], legacyKey: 'kalender' }],
  },
  {
    key: 'daily',
    group: 'utama',
    label: 'Daily Workspace',
    billable: false,
    defaultMonthlyPerUser: 0,
    // Daily Workspace (2026-11-21): pusat aktivitas & produktivitas
    // harian — agregasi dari Work Calendar, TalTask, Meeting, dan
    // Notification (bukan penyimpanan tugas/kalender baru). Selalu aktif
    // (non-billable, pola Tiket/Kantor). Sub-route /daily/* dikenali
    // guard lewat prefix '/daily'.
    pages: [{ href: '/daily', label: 'Daily Workspace', perms: ['DAILY_VIEW'], legacyKey: 'daily' }],
  },
  {
    key: 'absensi',
    group: 'utama',
    label: 'Attendance',
    billable: false,
    defaultMonthlyPerUser: 0,
    // Attendance (2026-11-21): absensi terpadu website + WhatsApp
    // AI-Agent — SATU backend/engine/DB. Cuti/izin pakai TalCuti
    // (tidak diduplikasi). Selalu aktif (non-billable, pola
    // Tiket/Kantor). Sub-route /absensi/* dikenali guard lewat
    // prefix '/absensi'.
    pages: [{ href: '/absensi', label: 'Attendance', perms: ['ATTENDANCE_VIEW'], legacyKey: 'absensi' }],
  },
  {
    key: 'chat',
    group: 'utama',
    label: 'Chat',
    billable: true,
    defaultMonthlyPerUser: 25000,
    pages: [
      { href: '/inbox', label: 'Inbox', perms: ['INBOX_VIEW'], legacyKey: 'inbox' },
      { href: '/crm', label: 'CRM', perms: ['CRM_VIEW'], legacyKey: 'crm' },
      { href: '/broadcast', label: 'Broadcast', perms: ['BROADCAST_CREATE'], legacyKey: 'broadcast' },
      { href: '/channels', label: 'Saluran', perms: ['SETTINGS_MANAGE'], legacyKey: 'channels' },
      { href: '/bot', label: 'Bot', perms: ['BOT_MANAGE'], legacyKey: 'bot' },
    ],
  },
  {
    key: 'esign',
    group: 'utama',
    label: 'E-Sign',
    billable: false,
    defaultMonthlyPerUser: 0,
    // Pecahan dari modul 'hris' (2026-11-19, Item 1): E-Sign kini modul
    // mandiri di Menu Utama, selalu aktif (non-billable, pola Tiket).
    // Sub-route /esign/* (/esign/[id], /activity, /new, /settings)
    // dikenali guard lewat prefix '/esign' (pageModuleForPath) — tidak
    // perlu didaftar satu per satu. Route publik /esign/sign/[token] juga
    // tercakup prefix ini tapi tetap publik (middleware mengecualikannya)
    // dan TIDAK dipindah/diubah.
    pages: [{ href: '/esign', label: 'E-Sign', perms: ['ESIGN_VIEW'], legacyKey: 'esign' }],
  },
  {
    key: 'hris',
    group: 'utama',
    label: 'HRIS',
    billable: true,
    defaultMonthlyPerUser: 30000,
    pages: [
      { href: '/hr', label: 'HR', perms: ['HR_VIEW'], legacyKey: 'hr' },
      { href: '/hr/detail', label: 'HR Detail', perms: ['HR_VIEW'], legacyKey: 'hr' },
      { href: '/admin-kantor/departments', label: 'Divisi', perms: ['DEPARTMENTS_VIEW'] },
    ],
  },
  {
    key: 'audit',
    group: 'sistem',
    label: 'Audit Trail Log',
    billable: true,
    defaultMonthlyPerUser: 10000,
    pages: [{ href: '/audit', label: 'Audit', perms: ['AUDIT_VIEW'] }],
  },
  {
    key: 'setting',
    group: 'sistem',
    label: 'Setting',
    billable: false,
    defaultMonthlyPerUser: 0,
    pages: [
      { href: '/admin-kantor', label: 'Dashboard Kantor', perms: ['USERS_VIEW', 'ROLES_VIEW', 'DEPARTMENTS_VIEW', 'SETTINGS_MANAGE'] },
      { href: '/admin-kantor/users', label: 'Pengguna', perms: ['USERS_VIEW'] },
      { href: '/admin-kantor/roles', label: 'Role & Permission', perms: ['ROLES_VIEW'] },
      { href: '/admin-kantor/office', label: 'Pengaturan Kantor', perms: ['SETTINGS_MANAGE'] },
      { href: '/admin-kantor/catalog', label: 'Katalog Agent', perms: ['DEPARTMENTS_VIEW'] },
      { href: '/settings', label: 'Pengaturan' },
      { href: '/settings/profile', label: 'Profil' },
      { href: '/settings/team', label: 'Tim' },
      { href: '/settings/help', label: 'Bantuan' },
      { href: '/upgrade', label: 'Langganan & Tagihan' },
    ],
  },
  {
    key: 'pusat',
    group: 'sistem',
    label: 'Administrator Pusat',
    billable: false,
    defaultMonthlyPerUser: 0,
    // Halaman 'pusat' dikelompokkan per `section` di Sidebar (Bagian 1
    // tiket /admin terstruktur). Urutan di sini = urutan tampil.
    pages: [
      // Manajemen Kantor
      { href: '/admin/dashboard', label: 'Dashboard Pusat', section: 'Manajemen Kantor', platformPerms: ['PLATFORM_TENANTS_VIEW', 'PLATFORM_MASTER_VIEW', 'PLATFORM_AUDIT_VIEW'] },
      { href: '/admin/offices', label: 'Kantor', section: 'Manajemen Kantor', platformPerms: ['PLATFORM_TENANTS_VIEW', 'PLATFORM_TENANTS_MANAGE'] },
      { href: '/admin/tenants', label: 'Tenant & Database', section: 'Manajemen Kantor', platformPerms: ['PLATFORM_TENANTS_VIEW', 'PLATFORM_TENANTS_MANAGE'] },
      { href: '/admin/verifikasi-pendaftaran', label: 'Verifikasi Pendaftaran', section: 'Manajemen Kantor', platformPerms: ['PLATFORM_REGISTRATIONS_VIEW', 'PLATFORM_REGISTRATIONS_MANAGE'] },
      { href: '/admin/offices/new', label: 'Tambah Kantor', section: 'Manajemen Kantor', platformPerms: ['PLATFORM_TENANTS_MANAGE'] },
      { href: '/admin/pengumuman', label: 'Pengumuman Platform', section: 'Manajemen Kantor', platformPerms: ['PLATFORM_ANNOUNCEMENTS_VIEW', 'PLATFORM_ANNOUNCEMENTS_MANAGE'] },
      { href: '/admin/tiket', label: 'Tiket', section: 'Manajemen Kantor', superOnly: true },
      // Manajemen Pengguna
      { href: '/admin/pengguna', label: 'Pengguna', section: 'Manajemen Pengguna', superOnly: true },
      { href: '/admin/platform-admins', label: 'Admin WOORK', section: 'Manajemen Pengguna', superOnly: true },
      { href: '/admin/peran-platform', label: 'Peran Platform', section: 'Manajemen Pengguna', superOnly: true },
      // Keuangan & Paket
      { href: '/admin/invoices', label: 'Invoice', section: 'Keuangan & Paket', platformPerms: ['PLATFORM_TENANTS_VIEW', 'PLATFORM_TENANTS_MANAGE'] },
      { href: '/admin/modul', label: 'Harga Modul', section: 'Keuangan & Paket', platformPerms: ['PLATFORM_PACKAGES_MANAGE'] },
      { href: '/admin/paket-harga', label: 'Paket & Harga', section: 'Keuangan & Paket', platformPerms: ['PLATFORM_PACKAGES_MANAGE'] },
      { href: '/admin/langganan', label: 'Pemantauan Langganan', section: 'Keuangan & Paket', platformPerms: ['PLATFORM_TENANTS_VIEW', 'PLATFORM_TENANTS_MANAGE'] },
      { href: '/admin/billing', label: 'Billing & Rekonsiliasi', section: 'Keuangan & Paket', platformPerms: ['PLATFORM_BILLING_VIEW', 'PLATFORM_BILLING_MANAGE'] },
      { href: '/admin/saldo-master', label: 'Saldo Master', section: 'Keuangan & Paket', platformPerms: ['PLATFORM_MASTER_VIEW', 'PLATFORM_MASTER_MANAGE'] },
      // Sistem & Pengawasan
      { href: '/admin/audit', label: 'Audit Global', section: 'Sistem & Pengawasan', platformPerms: ['PLATFORM_AUDIT_VIEW'] },
      { href: '/admin/pengaturan', label: 'Pengaturan Sistem', section: 'Sistem & Pengawasan', superOnly: true },
    ],
  },
];

export const MODULAR_MODULE_MAP = new Map<ModularKey, ModularModuleDef>(
  MODULAR_MODULES.map((m) => [m.key, m])
);

export const BILLABLE_MODULES = MODULAR_MODULES.filter((m) => m.billable);

/** Harga default per modul berbayar (dipakai seed + fallback bila tabel kosong). */
export const DEFAULT_MODULE_PRICES: Record<string, { monthlyPerUser: number; yearlyPerUser: number }> = {
  chat: { monthlyPerUser: 25000, yearlyPerUser: 250000 },
  hris: { monthlyPerUser: 30000, yearlyPerUser: 300000 },
  audit: { monthlyPerUser: 10000, yearlyPerUser: 100000 },
};

/** Pengali tahunan terhadap harga bulanan (tahunan = 10x bulanan). */
export const YEARLY_MULTIPLIER = 10;

/** Pemetaan kunci modul lama -> modul baru. */
export const LEGACY_TO_MODULAR: Record<string, ModularKey> = {
  inbox: 'chat',
  crm: 'chat',
  broadcast: 'chat',
  bot: 'chat',
  channels: 'chat',
  hr: 'hris',
  esign: 'esign',
  islami: 'islami',
  emas: 'emas',
  pengumuman: 'pengumuman',
  tal: 'tal',
  koperasi: 'koperasi',
  tiket: 'tiket',
  kantor: 'kantor',
  earsip: 'earsip',
  meet: 'meet',
  perusahaan: 'perusahaan',
  kalender: 'kalender',
  daily: 'daily',
  absensi: 'absensi',
};

/** Pemetaan modul baru -> kunci modul lama di dalamnya. */
export const MODULAR_TO_LEGACY: Record<ModularKey, string[]> = {
  dashboard: [],
  chat: ['inbox', 'crm', 'broadcast', 'bot', 'channels'],
  hris: ['hr'],
  audit: [],
  setting: [],
  pusat: [],
  islami: ['islami'],
  emas: ['emas'],
  pengumuman: ['pengumuman'],
  tal: ['tal'],
  koperasi: ['koperasi'],
  tiket: ['tiket'],
  kantor: ['kantor'],
  esign: ['esign'],
  earsip: ['earsip'],
  meet: ['meet'],
  perusahaan: ['perusahaan'],
  kalender: ['kalender'],
  daily: ['daily'],
  absensi: ['absensi'],
};

/** Modul katalog permission (PERMISSION_CATALOG.module) -> modul baru. */
const CATALOG_MODULE_TO_MODULAR: Record<string, ModularKey> = {
  Inbox: 'chat',
  CRM: 'chat',
  Broadcast: 'chat',
  Bot: 'chat',
  HR: 'hris',
  'E-Sign': 'esign',
  Divisi: 'hris',
  Persetujuan: 'hris',
  Audit: 'audit',
  Pengaturan: 'setting',
  Pengguna: 'setting',
  Role: 'setting',
  Kantor: 'pusat',
  Platform: 'pusat',
  Tiket: 'tiket',
  'E-Arsip': 'earsip',
  Meet: 'meet',
  Perusahaan: 'perusahaan',
  Kalender: 'kalender',
  'Daily Workspace': 'daily',
  Attendance: 'absensi',
};

/**
 * Permission -> modul baru + level yang dibutuhkan.
 * Permission *_VIEW butuh READ; selain itu butuh WRITE.
 */
export const PERMISSION_MODULE_LEVEL = new Map<
  string,
  { module: ModularKey; level: 'READ' | 'WRITE' }
>(
  PERMISSION_CATALOG.map((p) => [
    p.key,
    {
      module: CATALOG_MODULE_TO_MODULAR[p.module] ?? 'setting',
      level: p.key.endsWith('_VIEW') ? ('READ' as const) : ('WRITE' as const),
    },
  ])
);

/**
 * Modul sensitif — Bab 8: default TANPA akses (NONE) bila pengguna tidak
 * punya baris UserModuleAccess eksplisit. Admin perusahaan harus
 * mengaktifkan secara eksplisit (baris WRITE) lewat Manajemen Pengguna.
 * - 'koperasi': data sensitif NIK/KTP anggota.
 * - 'setting': Setting perusahaan (logo/warna, pengaturan kantor).
 * - 'pusat': modul Master-only (tidak terlihat tenant — masuk set agar
 *   tidak ada jalan pintas bila suatu saat terekspos).
 * Modul lain tetap default WRITE (ikut aturan kantor).
 * Catatan G3 (Fase 7): SEMUA 21 modul PERMISSION_CATALOG sudah terpetakan
 * di CATALOG_MODULE_TO_MODULAR — tidak ada permission yang jatuh ke
 * fallback 'setting', jadi set ini tidak mengunci permission lain.
 * Backfill akses existing: scripts/backfill-sensitive-module-access.ts.
 */
export const SENSITIVE_MODULES_DEFAULT_NONE: ReadonlySet<ModularKey> = new Set([
  'koperasi',
  'setting',
  'pusat',
] as const);

/**
 * Lima modul berbayar Bab 9 (Fase 1): TAL, Koperasi Keanggotaan, Simulasi
 * Emas, Ekosistem Islami, AI Workspace (kunci 'kantor' — pemetaan
 * provisional Fase 1). Didefinisikan di sini (bukan lib/subscription)
 * supaya lib/tenant/package-sync.ts bisa memakainya tanpa menarik
 * rantai impor lib/db. Penegakan paket Fase 7 (Bab 8): modul ini AKTIF
 * hanya bila baris SubscriptionModule tenant-nya ACTIVE; baris ditulis
 * oleh sinkronisasi paket (lib/tenant/package-sync.ts).
 */
export const PAID_MODULE_KEYS: readonly ModularKey[] = [
  'tal',
  'koperasi',
  'emas',
  'islami',
  'kantor',
] as const;

/** Kunci modul lama untuk satu permission (bila ada) — dipakai cek baris legacy. */
const CATALOG_MODULE_TO_LEGACY: Record<string, string> = {
  Inbox: 'inbox',
  CRM: 'crm',
  Broadcast: 'broadcast',
  Bot: 'bot',
  HR: 'hr',
  'E-Sign': 'esign',
};

export function legacyKeyOfPermission(permissionKey: string): string | undefined {
  const def = PERMISSION_CATALOG.find((p) => p.key === permissionKey);
  if (!def) return undefined;
  return CATALOG_MODULE_TO_LEGACY[def.module];
}

/** Cari modul + halaman dari sebuah pathname (prefix terpanjang yang cocok). */
export function pageModuleForPath(
  pathname: string
): { module: ModularKey; page: ModularPageDef } | null {
  let best: { module: ModularKey; page: ModularPageDef } | null = null;
  for (const mod of MODULAR_MODULES) {
    for (const page of mod.pages) {
      if (pathname === page.href || pathname.startsWith(page.href + '/')) {
        if (!best || page.href.length > best.page.href.length) best = { module: mod.key, page };
      }
    }
  }
  return best;
}

/** Total invoice: sum(harga modul per user) x kuota x periode. */
export function calcSubscriptionTotal(args: {
  modules: Array<{ monthlyPerUser: number; yearlyPerUser: number }>;
  userQuota: number;
  cycle: 'MONTHLY' | 'YEARLY';
}): number {
  const perUser = args.modules.reduce(
    (sum, m) => sum + (args.cycle === 'YEARLY' ? m.yearlyPerUser : m.monthlyPerUser),
    0
  );
  return perUser * Math.max(0, args.userQuota);
}

/** Akhir periode dari tanggal mulai + siklus (bulanan +1 bulan, tahunan +1 tahun). */
export function periodEndFrom(start: Date, cycle: 'MONTHLY' | 'YEARLY'): Date {
  const d = new Date(start);
  if (cycle === 'YEARLY') d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d;
}

export function formatIDR(n: number): string {
  return 'Rp ' + Number(n || 0).toLocaleString('id-ID');
}

/** Urutan level untuk perbandingan: NONE < READ < WRITE. */
export const LEVEL_RANK: Record<ModuleAccessLevel, number> = { NONE: 0, READ: 1, WRITE: 2 };
