// Registry Sistem Modular — WOORK SaaS (6 modul).
//
// Satu sumber kebenaran untuk struktur modul: halaman, permission, harga,
// dan pemetaan modul lama (AVAILABLE_MODULES) -> modul baru. Dipakai
// Sidebar, penegakan permission (lib/auth-helpers), halaman langganan,
// dan wizard pembuatan kantor.
//
// Modul berbayar dihitung PER USER (kuota karyawan) per siklus:
//   total = sum(harga modul) x kuota x (1 bila MONTHLY, 10 bila YEARLY).

import { PERMISSION_CATALOG } from './permissions';

export type ModularKey = 'dashboard' | 'chat' | 'hris' | 'audit' | 'setting' | 'pusat';

export type ModuleAccessLevel = 'READ' | 'WRITE' | 'NONE';

export interface ModularPageDef {
  href: string;
  label: string;
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
  /** true = masuk hitungan invoice; false = selalu ikut (Rp0). */
  billable: boolean;
  /** harga default per user per bulan (Rp). Tahunan = 10x bulanan. */
  defaultMonthlyPerUser: number;
  pages: ModularPageDef[];
}

export const MODULAR_MODULES: ModularModuleDef[] = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    billable: false,
    defaultMonthlyPerUser: 0,
    pages: [{ href: '/dashboard', label: 'Dashboard' }],
  },
  {
    key: 'chat',
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
    key: 'hris',
    label: 'HRIS',
    billable: true,
    defaultMonthlyPerUser: 30000,
    pages: [
      { href: '/hr', label: 'HR', perms: ['HR_VIEW'], legacyKey: 'hr' },
      { href: '/kantor', label: 'Kantor Virtual', legacyKey: 'kantor' },
      { href: '/admin-kantor/departments', label: 'Divisi', perms: ['DEPARTMENTS_VIEW'] },
      { href: '/esign', label: 'E-Sign', perms: ['ESIGN_VIEW'], legacyKey: 'esign' },
    ],
  },
  {
    key: 'audit',
    label: 'Audit Trail Log',
    billable: true,
    defaultMonthlyPerUser: 10000,
    pages: [{ href: '/audit', label: 'Audit', perms: ['AUDIT_VIEW'] }],
  },
  {
    key: 'setting',
    label: 'Setting',
    billable: false,
    defaultMonthlyPerUser: 0,
    pages: [
      { href: '/admin-kantor', label: 'Dashboard Kantor', perms: ['USERS_VIEW', 'ROLES_VIEW', 'DEPARTMENTS_VIEW', 'SETTINGS_MANAGE'] },
      { href: '/admin-kantor/users', label: 'Pengguna', perms: ['USERS_VIEW'] },
      { href: '/admin-kantor/roles', label: 'Role & Permission', perms: ['ROLES_VIEW'] },
      { href: '/admin-kantor/office', label: 'Pengaturan Kantor', perms: ['SETTINGS_MANAGE'] },
      { href: '/settings', label: 'Pengaturan' },
      { href: '/settings/profile', label: 'Profil' },
      { href: '/settings/team', label: 'Tim' },
      { href: '/settings/help', label: 'Bantuan' },
      { href: '/upgrade', label: 'Langganan & Tagihan' },
    ],
  },
  {
    key: 'pusat',
    label: 'Administrator Pusat',
    billable: false,
    defaultMonthlyPerUser: 0,
    pages: [
      { href: '/admin', label: 'Dashboard Pusat', platformPerms: ['PLATFORM_TENANTS_VIEW', 'PLATFORM_MASTER_VIEW', 'PLATFORM_AUDIT_VIEW'] },
      { href: '/admin/offices', label: 'Kantor', platformPerms: ['PLATFORM_TENANTS_VIEW', 'PLATFORM_TENANTS_MANAGE'] },
      { href: '/admin/invoices', label: 'Invoice', platformPerms: ['PLATFORM_TENANTS_VIEW', 'PLATFORM_TENANTS_MANAGE'] },
      { href: '/admin/modul', label: 'Harga Modul', platformPerms: ['PLATFORM_PACKAGES_MANAGE'] },
      { href: '/admin/saldo-master', label: 'Saldo Master', platformPerms: ['PLATFORM_MASTER_VIEW', 'PLATFORM_MASTER_MANAGE'] },
      { href: '/admin/audit', label: 'Audit Global', platformPerms: ['PLATFORM_AUDIT_VIEW'] },
      { href: '/admin/platform-admins', label: 'Admin WOORK', superOnly: true },
      { href: '/admin/pengaturan', label: 'Pengaturan Sistem', superOnly: true },
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
  kantor: 'hris',
  esign: 'hris',
};

/** Pemetaan modul baru -> kunci modul lama di dalamnya. */
export const MODULAR_TO_LEGACY: Record<ModularKey, string[]> = {
  dashboard: [],
  chat: ['inbox', 'crm', 'broadcast', 'bot', 'channels'],
  hris: ['hr', 'kantor', 'esign'],
  audit: [],
  setting: [],
  pusat: [],
};

/** Modul katalog permission (PERMISSION_CATALOG.module) -> modul baru. */
const CATALOG_MODULE_TO_MODULAR: Record<string, ModularKey> = {
  Inbox: 'chat',
  CRM: 'chat',
  Broadcast: 'chat',
  Bot: 'chat',
  HR: 'hris',
  'E-Sign': 'hris',
  Divisi: 'hris',
  Persetujuan: 'hris',
  Audit: 'audit',
  Pengaturan: 'setting',
  Pengguna: 'setting',
  Role: 'setting',
  Kantor: 'pusat',
  Platform: 'pusat',
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
