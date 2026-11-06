import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { apiErr } from '@/lib/utils';
import type { PermissionKey } from '@/lib/permissions';
import { PERMISSION_CATALOG } from '@/lib/permissions';
import { AVAILABLE_MODULES, MODULE_BY_CATALOG_MODULE, parseOrgModules, type ModuleKey } from '@/lib/modules';
import { audit, getClientIp } from '@/lib/audit';
import { getTrialStatus, isWritePermission } from '@/lib/trial';

export interface AuthContext {
  userId: string;
  email: string;
  name: string;
  organizationId: string;
  organizationName: string;
  role: string;
  isSuperAdmin: boolean;
}

export interface AuthOptions {
  /**
   * Organisasi otorisasi. Bila diisi, keanggotaan + permission dicek di
   * organisasi tersebut, BUKAN di organisasi aktif sesi. Dipakai endpoint
   * berbasis token (mis. tanda tangan E-Sign): dokumen bisa milik kantor
   * lain dari organisasi aktif user, selama user anggota AKTIF di kantor
   * pemilik dokumen. Tanpa ini, perilaku lama dipertahankan.
   */
  organizationId?: string;
}

/**
 * Ambil sesi aktif; kembalikan 401 bila belum login.
 * Memverifikasi ke database setiap panggilan: user nonaktif / membership
 * dicabut / kantor dinonaktifkan langsung kehilangan akses (deny by default).
 * Dengan opts.organizationId, keanggotaan diverifikasi di organisasi itu.
 */
export async function requireAuth(opts?: AuthOptions): Promise<AuthContext> {
  const session = await auth();
  const u = session?.user as any;
  if (!u?.id) {
    throw apiErr('Belum login. Silakan masuk kembali.', 401);
  }
  const targetOrgId = opts?.organizationId ?? (u.organizationId as string);
  if (!targetOrgId) {
    throw apiErr('Belum login. Silakan masuk kembali.', 401);
  }
  const dbUser = await prisma.user.findUnique({
    where: { id: u.id as string },
    select: { status: true, isSuperAdmin: true },
  });
  if (!dbUser || dbUser.status !== 'ACTIVE') {
    throw apiErr('Akun Anda dinonaktifkan. Hubungi administrator.', 401);
  }
  const membership = await prisma.membership.findFirst({
    where: { userId: u.id as string, organizationId: targetOrgId },
    include: {
      organization: { select: { isActive: true, name: true } },
      role: { select: { name: true } },
    },
  });
  if (!membership || membership.status !== 'ACTIVE') {
    if (opts?.organizationId) {
      throw apiErr(
        'Anda bukan anggota aktif kantor pemilik dokumen ini, jadi Anda tidak dapat memproses dokumen ini.',
        403
      );
    }
    throw apiErr('Akses Anda ke kantor ini telah dicabut.', 403);
  }
  if (!membership.organization.isActive && !dbUser.isSuperAdmin) {
    throw apiErr('Kantor ini sedang dinonaktifkan.', 403);
  }
  return {
    userId: u.id,
    email: u.email,
    name: u.name,
    organizationId: targetOrgId,
    organizationName: membership.organization.name,
    // Role sesi berlaku untuk organisasi aktif sesi; bila otorisasi
    // dialihkan ke organisasi dokumen, pakai role di organisasi itu.
    role: opts?.organizationId ? (membership.role?.name ?? u.role) : u.role,
    isSuperAdmin: dbUser.isSuperAdmin,
  };
}

/** Kunci permission milik user pada organisasi aktif (sumber: database). */
export async function getUserPermissions(ctx: AuthContext): Promise<Set<string>> {
  if (ctx.isSuperAdmin) return new Set(['*']);
  const membership = await prisma.membership.findFirst({
    where: { userId: ctx.userId, organizationId: ctx.organizationId, status: 'ACTIVE' },
    include: { role: { include: { permissions: { include: { permission: true } } } } },
  });
  return new Set(membership?.role.permissions.map((rp) => rp.permission.key) ?? []);
}

/**
 * Pastikan modul paket aktif untuk kantor pemanggil (Fase 2 RBAC).
 * Administrator Pusat bypass. Daftar modul kosong / tidak diset = semua aktif
 * (grandfathering: tenant lama tanpa pembatasan tidak pernah terkunci).
 */
export async function requireModule(ctx: AuthContext, moduleKey: ModuleKey): Promise<void> {
  if (ctx.isSuperAdmin) return;
  const org = await prisma.organization.findUnique({
    where: { id: ctx.organizationId },
    select: { modules: true },
  });
  const active = parseOrgModules(org?.modules);
  if (active.length > 0 && !active.includes(moduleKey)) {
    const label = AVAILABLE_MODULES.find((m) => m.key === moduleKey)?.label ?? moduleKey;
    throw apiErr(`Modul ${label} tidak aktif untuk kantor ini.`, 403);
  }
}

const MODULE_OF_PERMISSION = new Map(PERMISSION_CATALOG.map((p) => [p.key, p.module]));

/**
 * Inti pemeriksaan permission untuk sebuah AuthContext yang sudah
 * terverifikasi (keanggotaan + status user sudah dicek pemanggil).
 * Dipakai requirePermission (sesi) dan requirePermissionForUser (tanpa
 * sesi, mis. bot WhatsApp) agar aturannya identik.
 */
async function assertPermission(
  ctx: AuthContext,
  permission: PermissionKey,
  req?: Request
): Promise<void> {
  if (ctx.isSuperAdmin) {
    // Akses global eksplisit & tercatat
    audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'SUPERADMIN_ACCESS',
      module: 'AUTH',
      description: `Administrator Pusat mengakses ${permission}`,
      ipAddress: req ? getClientIp(req) : undefined,
    }).catch(() => {});
    return;
  }
  const keys = await getUserPermissions(ctx);
  if (!keys.has(permission)) {
    audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'ACCESS_DENIED',
      module: 'AUTH',
      description: `Ditolak: membutuhkan ${permission}`,
      ipAddress: req ? getClientIp(req) : undefined,
    }).catch(() => {});
    throw apiErr('Anda tidak memiliki akses untuk tindakan ini.', 403);
  }
  // Batasan modul paket: permission modul fitur ditolak bila modulnya nonaktif.
  const catalogModule = MODULE_OF_PERMISSION.get(permission);
  const moduleKey = catalogModule ? MODULE_BY_CATALOG_MODULE[catalogModule] : undefined;
  if (moduleKey) await requireModule(ctx, moduleKey);
  // Batasan trial: tulis diblokir bila trial habis; Bot nonaktif selama trial.
  if (isWritePermission(permission)) {
    const trial = await getTrialStatus(ctx.organizationId);
    if (trial.readOnly) {
      throw apiErr('Masa trial 14 hari telah berakhir. Upgrade paket untuk melanjutkan.', 403);
    }
    if (trial.isTrial && permission === 'BOT_MANAGE') {
      throw apiErr('Fitur Bot tidak tersedia pada paket Trial. Upgrade untuk mengaktifkan.', 403);
    }
  }
}

/**
 * Pastikan user punya permission; 403 bila tidak.
 * Administrator Pusat memiliki akses global eksplisit (dicatat di audit).
 * Deny by default: hanya permission di database yang berlaku.
 * Fase 2: permission modul fitur juga dibatasi modul paket kantor.
 * opts.organizationId mengalihkan otorisasi ke organisasi tersebut
 * (modul gate + trial ikut memakai organisasi itu) — lihat AuthOptions.
 */
export async function requirePermission(
  permission: PermissionKey,
  req?: Request,
  opts?: AuthOptions
): Promise<AuthContext> {
  const ctx = await requireAuth(opts);
  await assertPermission(ctx, permission, req);
  return ctx;
}

/**
 * Otorisasi TANPA sesi login (dipakai bot WhatsApp E-Sign).
 * Memverifikasi hal yang sama seperti requireAuth + requirePermission,
 * tapi identitas user berasal dari nomor WhatsApp yang sudah dicocokkan
 * ke User (bukan dari cookie sesi): user ACTIVE + membership ACTIVE di
 * organisasi yang dimaksud + role punya permission + module gate + trial.
 * Pesan error disamakan dengan jalur sesi. Dipakai SEBELUM executeSign.
 */
export async function requirePermissionForUser(
  userId: string,
  permission: PermissionKey,
  organizationId: string,
  req?: Request
): Promise<AuthContext> {
  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { status: true, isSuperAdmin: true, email: true, name: true },
  });
  if (!dbUser || dbUser.status !== 'ACTIVE') {
    throw apiErr('Akun Anda dinonaktifkan. Hubungi administrator.', 401);
  }
  const membership = await prisma.membership.findFirst({
    where: { userId, organizationId },
    include: {
      organization: { select: { isActive: true, name: true } },
      role: { select: { name: true } },
    },
  });
  if (!membership || membership.status !== 'ACTIVE') {
    throw apiErr(
      'Anda bukan anggota aktif kantor pemilik dokumen ini, jadi Anda tidak dapat memproses dokumen ini.',
      403
    );
  }
  if (!membership.organization.isActive && !dbUser.isSuperAdmin) {
    throw apiErr('Kantor ini sedang dinonaktifkan.', 403);
  }
  const ctx: AuthContext = {
    userId,
    email: dbUser.email,
    name: dbUser.name,
    organizationId,
    organizationName: membership.organization.name,
    role: membership.role?.name ?? '',
    isSuperAdmin: dbUser.isSuperAdmin,
  };
  await assertPermission(ctx, permission, req);
  return ctx;
}

/** Pastikan pemanggil adalah Administrator Pusat; 403 bila bukan. */
export async function requireSuperAdmin(req?: Request): Promise<AuthContext> {
  const ctx = await requireAuth();
  if (!ctx.isSuperAdmin) {
    audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'ACCESS_DENIED',
      module: 'AUTH',
      description: 'Ditolak: membutuhkan Administrator Pusat',
      ipAddress: req ? getClientIp(req) : undefined,
    }).catch(() => {});
    throw apiErr('Hanya Administrator Pusat yang dapat melakukan tindakan ini.', 403);
  }
  return ctx;
}

/**
 * Kunci permission platform milik user (sumber: penugasan role platform).
 * Terpisah dari permission tenant: role platform HARUS ber-organizationId null;
 * penugasan yang menunjuk role tenant diabaikan.
 */
export async function getUserPlatformPermissions(ctx: AuthContext): Promise<Set<string>> {
  if (ctx.isSuperAdmin) return new Set(['*']);
  const assigns = await prisma.platformRoleAssignment.findMany({
    where: { userId: ctx.userId },
    include: { role: { include: { permissions: { include: { permission: true } } } } },
  });
  const keys = new Set<string>();
  for (const a of assigns) {
    if (a.role.organizationId !== null) continue;
    for (const rp of a.role.permissions) keys.add(rp.permission.key);
  }
  return keys;
}

/**
 * Pastikan user punya permission platform (Admin WOORK); 403 bila tidak.
 * Administrator Pusat bypass penuh (tercatat). Berbeda dari requirePermission:
 * guard ini TIDAK membaca role tenant — Admin WOORK tidak mendapat akses
 * platform dari keanggotaan tenant apa pun, dan sebaliknya.
 */
export async function requirePlatformPermission(
  permission: PermissionKey,
  req?: Request
): Promise<AuthContext> {
  const ctx = await requireAuth();
  if (ctx.isSuperAdmin) {
    audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'SUPERADMIN_ACCESS',
      module: 'AUTH',
      description: `Administrator Pusat mengakses platform ${permission}`,
      ipAddress: req ? getClientIp(req) : undefined,
    }).catch(() => {});
    return ctx;
  }
  const keys = await getUserPlatformPermissions(ctx);
  if (!keys.has(permission)) {
    audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'ACCESS_DENIED',
      module: 'AUTH',
      description: `Ditolak: membutuhkan permission platform ${permission}`,
      ipAddress: req ? getClientIp(req) : undefined,
    }).catch(() => {});
    throw apiErr('Anda tidak memiliki akses platform untuk tindakan ini.', 403);
  }
  return ctx;
}

/**
 * Validasi anti-eskalasi: pemberi role tidak boleh memberikan permission
 * yang tidak dimilikinya sendiri.
 */
export function assertCanGrant(granterKeys: Set<string>, targetKeys: string[]): void {
  if (granterKeys.has('*')) return; // Administrator Pusat
  const missing = targetKeys.filter((k) => !granterKeys.has(k));
  if (missing.length > 0) {
    throw apiErr(
      `Anda tidak dapat memberikan permission yang tidak Anda miliki: ${missing.join(', ')}`,
      403
    );
  }
}

/** Untuk Server Components: null bila belum login. */
export async function getAuthContext(): Promise<AuthContext | null> {
  try {
    return await requireAuth();
  } catch {
    return null;
  }
}
