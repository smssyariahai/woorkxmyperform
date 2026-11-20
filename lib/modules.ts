// Modul aplikasi yang dapat diaktifkan/nonaktifkan per kantor.
export const AVAILABLE_MODULES = [
  { key: 'inbox', label: 'Inbox' },
  { key: 'crm', label: 'CRM' },
  { key: 'hr', label: 'HR & Rekrutmen' },
  { key: 'broadcast', label: 'Broadcast' },
  { key: 'bot', label: 'Bot' },
  { key: 'channels', label: 'Saluran' },
  { key: 'esign', label: 'E-Sign' },
  { key: 'islami', label: 'Islami' },
  { key: 'emas', label: 'Emas' },
  { key: 'pengumuman', label: 'Pengumuman' },
  { key: 'tal', label: 'TAL' },
  { key: 'koperasi', label: 'Koperasi' },
  { key: 'tiket', label: 'Tiket' },
  { key: 'kantor', label: 'Kantor Virtual' },
  { key: 'earsip', label: 'E-Arsip' },
  { key: 'meet', label: 'WOORK MEET' },
] as const;

export type ModuleKey = (typeof AVAILABLE_MODULES)[number]['key'];

// Modul katalog permission -> kunci modul paket (Fase 2 RBAC).
// Hanya modul fitur yang dipetakan; modul administratif (Pengguna, Role,
// Divisi, Pengaturan, Kantor, Platform, Audit, Persetujuan) TIDAK dibatasi
// modul agar admin tidak bisa mengunci diri sendiri dari pengelolaan.
export const MODULE_BY_CATALOG_MODULE: Record<string, ModuleKey> = {
  'Inbox': 'inbox',
  'CRM': 'crm',
  'HR': 'hr',
  'Broadcast': 'broadcast',
  'Bot': 'bot',
  'E-Sign': 'esign',
  'Tiket': 'tiket',
  'E-Arsip': 'earsip',
  'Meet': 'meet',
};

/** Parse Organization.modules (JSON string) secara aman; rusak/kosong = [] (semua aktif). */
export function parseOrgModules(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((k) => typeof k === 'string') : [];
  } catch {
    return [];
  }
}
