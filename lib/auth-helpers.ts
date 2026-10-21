import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { apiErr } from '@/lib/utils';
import type { PermissionKey } from '@/lib/permissions';
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

/**
 * Ambil sesi aktif; kembalikan 401 bila belum login.
 * Memverifikasi ke database setiap panggilan: user nonaktif / membership
 * dicabut / kantor dinonaktifkan langsung kehilangan akses (deny by default).
 */
export async function requireAuth(): Promise<AuthContext> {
  const session = await auth();
  const u = session?.user as any;
  if (!u?.id || !u?.organizationId) {
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
    where: { userId: u.id as string, organizationId: u.organizationId as string },
    include: { organization: { select: { isActive: true, name: true } } },
  });
  if (!membership || membership.status !== 'ACTIVE') {
    throw apiErr('Akses Anda ke kantor ini telah dicabut.', 403);
  }
  if (!membership.organization.isActive && !dbUser.isSuperAdmin) {
    throw apiErr('Kantor ini sedang dinonaktifkan.', 403);
  }
  return {
    userId: u.id,
    email: u.email,
    name: u.name,
    organizationId: u.organizationId,
    organizationName: membership.organization.name,
    role: u.role,
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
 * Pastikan user punya permission; 403 bila tidak.
 * Administrator Pusat memiliki akses global eksplisit (dicatat di audit).
 * Deny by default: hanya permission di database yang berlaku.
 */
export async function requirePermission(
  permission: PermissionKey,
  req?: Request
): Promise<AuthContext> {
  const ctx = await requireAuth();
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
    return ctx;
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
