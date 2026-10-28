// RBAC: roles & permissions untuk WOORK
//
// Kunci lama (INBOX_VIEW, dst) dipertahankan agar seluruh endpoint lama tetap
// berfungsi. Kunci baru mengikuti pola MODUL_AKSI dan dikelompokkan per modul
// untuk halaman Role Management.

export const PERMISSIONS = {
  // --- modul yang sudah ada ---
  INBOX_VIEW: 'INBOX_VIEW',
  INBOX_REPLY: 'INBOX_REPLY',
  CRM_VIEW: 'CRM_VIEW',
  CRM_EDIT: 'CRM_EDIT',
  BROADCAST_CREATE: 'BROADCAST_CREATE',
  BOT_MANAGE: 'BOT_MANAGE',
  TEAM_MANAGE: 'TEAM_MANAGE',
  AUDIT_VIEW: 'AUDIT_VIEW',
  SETTINGS_MANAGE: 'SETTINGS_MANAGE',
  HR_VIEW: 'HR_VIEW',
  HR_MANAGE: 'HR_MANAGE',
  // --- granular: pengguna ---
  USERS_VIEW: 'USERS_VIEW',
  USERS_CREATE: 'USERS_CREATE',
  USERS_UPDATE: 'USERS_UPDATE',
  USERS_DEACTIVATE: 'USERS_DEACTIVATE',
  USERS_ASSIGN_ROLE: 'USERS_ASSIGN_ROLE',
  // --- granular: role & permission ---
  ROLES_VIEW: 'ROLES_VIEW',
  ROLES_CREATE: 'ROLES_CREATE',
  ROLES_UPDATE: 'ROLES_UPDATE',
  ROLES_DELETE: 'ROLES_DELETE',
  PERMISSIONS_MANAGE: 'PERMISSIONS_MANAGE',
  // --- granular: divisi ---
  DEPARTMENTS_VIEW: 'DEPARTMENTS_VIEW',
  DEPARTMENTS_MANAGE: 'DEPARTMENTS_MANAGE',
  // --- kantor (Administrator Pusat) ---
  OFFICES_VIEW: 'OFFICES_VIEW',
  OFFICES_MANAGE: 'OFFICES_MANAGE',
  // --- ekspor & persetujuan (Fase 2 RBAC) ---
  CRM_EXPORT: 'CRM_EXPORT',
  HR_EXPORT: 'HR_EXPORT',
  APPROVALS_REVIEW: 'APPROVALS_REVIEW',
  // --- platform (Admin WOORK, Fase 1 RBAC) ---
  // Hanya dipakai lewat requirePlatformPermission; TIDAK masuk ROLE_PERMISSIONS
  // agar tidak pernah tersinkron ke role tenant oleh sync-rbac.
  PLATFORM_TENANTS_VIEW: 'PLATFORM_TENANTS_VIEW',
  PLATFORM_TENANTS_MANAGE: 'PLATFORM_TENANTS_MANAGE',
  PLATFORM_PACKAGES_MANAGE: 'PLATFORM_PACKAGES_MANAGE',
  PLATFORM_MASTER_VIEW: 'PLATFORM_MASTER_VIEW',
  PLATFORM_MASTER_MANAGE: 'PLATFORM_MASTER_MANAGE',
  PLATFORM_AUDIT_VIEW: 'PLATFORM_AUDIT_VIEW',
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;

export interface PermissionDef {
  key: PermissionKey;
  module: string;
  description: string;
}

export const PERMISSION_CATALOG: PermissionDef[] = [
  { key: 'USERS_VIEW', module: 'Pengguna', description: 'Melihat daftar pengguna kantor' },
  { key: 'USERS_CREATE', module: 'Pengguna', description: 'Menambah pengguna baru' },
  { key: 'USERS_UPDATE', module: 'Pengguna', description: 'Mengedit data & jabatan pengguna' },
  { key: 'USERS_DEACTIVATE', module: 'Pengguna', description: 'Menonaktifkan / mengaktifkan akun' },
  { key: 'USERS_ASSIGN_ROLE', module: 'Pengguna', description: 'Menentukan role pengguna' },
  { key: 'ROLES_VIEW', module: 'Role', description: 'Melihat daftar role' },
  { key: 'ROLES_CREATE', module: 'Role', description: 'Membuat role baru' },
  { key: 'ROLES_UPDATE', module: 'Role', description: 'Mengedit role & permission-nya' },
  { key: 'ROLES_DELETE', module: 'Role', description: 'Menghapus role' },
  { key: 'PERMISSIONS_MANAGE', module: 'Role', description: 'Mengatur permission setiap role' },
  { key: 'DEPARTMENTS_VIEW', module: 'Divisi', description: 'Melihat struktur divisi' },
  { key: 'DEPARTMENTS_MANAGE', module: 'Divisi', description: 'Membuat / mengedit / menghapus divisi' },
  { key: 'INBOX_VIEW', module: 'Inbox', description: 'Melihat inbox' },
  { key: 'INBOX_REPLY', module: 'Inbox', description: 'Membalas pesan' },
  { key: 'CRM_VIEW', module: 'CRM', description: 'Melihat CRM' },
  { key: 'CRM_EDIT', module: 'CRM', description: 'Mengelola data CRM' },
  { key: 'HR_VIEW', module: 'HR', description: 'Melihat modul HR' },
  { key: 'HR_MANAGE', module: 'HR', description: 'Mengelola HR & rekrutmen' },
  { key: 'BROADCAST_CREATE', module: 'Broadcast', description: 'Membuat & mengirim broadcast' },
  { key: 'BOT_MANAGE', module: 'Bot', description: 'Mengelola automation bot' },
  { key: 'AUDIT_VIEW', module: 'Audit', description: 'Melihat audit log' },
  { key: 'SETTINGS_MANAGE', module: 'Pengaturan', description: 'Mengelola pengaturan kantor' },
  { key: 'TEAM_MANAGE', module: 'Pengaturan', description: 'Mengelola tim (legacy)' },
  { key: 'OFFICES_VIEW', module: 'Kantor', description: 'Melihat daftar kantor (Pusat)' },
  { key: 'OFFICES_MANAGE', module: 'Kantor', description: 'Mengelola kantor (Pusat)' },
  // --- ekspor & persetujuan (Fase 2 RBAC) ---
  { key: 'CRM_EXPORT', module: 'CRM', description: 'Mengekspor data CRM ke CSV' },
  { key: 'HR_EXPORT', module: 'HR', description: 'Mengekspor data kandidat HR ke CSV' },
  { key: 'APPROVALS_REVIEW', module: 'Persetujuan', description: 'Menyetujui / menolak pengajuan agent' },
  // --- platform (Admin WOORK) ---
  { key: 'PLATFORM_TENANTS_VIEW', module: 'Platform', description: 'Melihat daftar & statistik tenant' },
  { key: 'PLATFORM_TENANTS_MANAGE', module: 'Platform', description: 'Membuat / mengedit / menonaktifkan tenant' },
  { key: 'PLATFORM_PACKAGES_MANAGE', module: 'Platform', description: 'Mengubah paket berlangganan tenant' },
  { key: 'PLATFORM_MASTER_VIEW', module: 'Platform', description: 'Melihat saldo master & mutasi' },
  { key: 'PLATFORM_MASTER_MANAGE', module: 'Platform', description: 'Top-up & penyesuaian saldo master' },
  { key: 'PLATFORM_AUDIT_VIEW', module: 'Platform', description: 'Melihat audit log platform' },
];

/** Role sistem bawaan per kantor (dibuat otomatis via seedOrgDefaults). */
export const ROLE_PERMISSIONS: Record<string, PermissionKey[]> = {
  OWNER: [
    'INBOX_VIEW', 'INBOX_REPLY', 'CRM_VIEW', 'CRM_EDIT', 'CRM_EXPORT',
    'BROADCAST_CREATE', 'BOT_MANAGE', 'TEAM_MANAGE', 'AUDIT_VIEW', 'SETTINGS_MANAGE',
    'HR_VIEW', 'HR_MANAGE', 'HR_EXPORT', 'APPROVALS_REVIEW',
    'USERS_VIEW', 'USERS_CREATE', 'USERS_UPDATE', 'USERS_DEACTIVATE', 'USERS_ASSIGN_ROLE',
    'ROLES_VIEW', 'ROLES_CREATE', 'ROLES_UPDATE', 'ROLES_DELETE', 'PERMISSIONS_MANAGE',
    'DEPARTMENTS_VIEW', 'DEPARTMENTS_MANAGE',
  ],
  ADMIN: [
    'INBOX_VIEW', 'INBOX_REPLY', 'CRM_VIEW', 'CRM_EDIT', 'CRM_EXPORT',
    'BROADCAST_CREATE', 'BOT_MANAGE', 'TEAM_MANAGE', 'AUDIT_VIEW', 'SETTINGS_MANAGE',
    'HR_VIEW', 'HR_MANAGE', 'HR_EXPORT', 'APPROVALS_REVIEW',
    'USERS_VIEW', 'USERS_CREATE', 'USERS_UPDATE', 'USERS_DEACTIVATE', 'USERS_ASSIGN_ROLE',
    'ROLES_VIEW', 'ROLES_CREATE', 'ROLES_UPDATE', 'ROLES_DELETE', 'PERMISSIONS_MANAGE',
    'DEPARTMENTS_VIEW', 'DEPARTMENTS_MANAGE',
  ],
  SUPERVISOR: [
    'INBOX_VIEW', 'INBOX_REPLY', 'CRM_VIEW', 'CRM_EDIT',
    'BROADCAST_CREATE', 'AUDIT_VIEW', 'HR_VIEW', 'APPROVALS_REVIEW',
    'USERS_VIEW', 'DEPARTMENTS_VIEW',
  ],
  AGENT: ['INBOX_VIEW', 'INBOX_REPLY', 'CRM_VIEW', 'CRM_EDIT', 'APPROVALS_REVIEW'],
  VIEWER: ['INBOX_VIEW', 'CRM_VIEW', 'AUDIT_VIEW'],
};

/**
 * Template role divisi (dapat dibuat Admin Kantor dari halaman Role Management).
 * Dipetakan ke modul yang benar-benar tersedia di aplikasi saat ini.
 */
export const ROLE_TEMPLATES: Array<{
  name: string;
  description: string;
  permissions: PermissionKey[];
}> = [
  {
    name: 'HR',
    description: 'Human Resources — kelola karyawan & rekrutmen',
    permissions: ['HR_VIEW', 'HR_MANAGE', 'USERS_VIEW', 'DEPARTMENTS_VIEW', 'AUDIT_VIEW'],
  },
  {
    name: 'Finance',
    description: 'Keuangan — akses baca laporan & data terkait',
    permissions: ['AUDIT_VIEW', 'CRM_VIEW'],
  },
  {
    name: 'IT Support',
    description: 'IT Support — kelola saluran & bot',
    permissions: ['BOT_MANAGE', 'SETTINGS_MANAGE', 'AUDIT_VIEW', 'INBOX_VIEW'],
  },
  {
    name: 'Manager',
    description: 'Manager — awasi tim & kinerja',
    permissions: [
      'INBOX_VIEW', 'INBOX_REPLY', 'CRM_VIEW', 'CRM_EDIT',
      'BROADCAST_CREATE', 'AUDIT_VIEW', 'HR_VIEW',
      'USERS_VIEW', 'DEPARTMENTS_VIEW',
    ],
  },
  {
    name: 'Karyawan',
    description: 'Karyawan — akses dasar operasional',
    permissions: ['INBOX_VIEW', 'CRM_VIEW'],
  },
];

export const ROLE_DESCRIPTIONS: Record<string, string> = {
  OWNER: 'Pemilik kantor — akses penuh di kantor ini',
  ADMIN: 'Admin kantor — kelola user, role & pengaturan kantor',
  SUPERVISOR: 'Supervisor — awasi tim & audit',
  AGENT: 'Agent — tangani inbox & CRM',
  VIEWER: 'Viewer — hanya melihat',
};

export function roleHasPermission(roleName: string, permission: PermissionKey): boolean {
  return (ROLE_PERMISSIONS[roleName] ?? []).includes(permission);
}
