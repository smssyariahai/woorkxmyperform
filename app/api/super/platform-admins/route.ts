// Rute super-admin / platform (P2-2 Phase 4): baca data platform dan legacy eksplisit.
// JANGAN pakai proxy `prisma` — rapuh bila super admin suatu hari punya sesi tenant.
import { legacyPrisma as prisma } from '@/lib/db';
import { requireSuperAdmin } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/** GET /api/super/platform-admins — daftar penugasan Admin WOORK. */
export async function GET(req: Request) {
  try {
    await requireSuperAdmin(req);
    const assigns = await prisma.platformRoleAssignment.findMany({
      include: {
        user: { select: { id: true, name: true, email: true, status: true } },
        role: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    // Hanya penugasan role platform yang sah; penugasan role tenant (bila ada) disembunyikan.
    const valid = assigns.filter((a) => a.role);
    return apiOk(
      valid.map((a) => ({
        userId: a.user.id,
        userName: a.user.name,
        userEmail: a.user.email,
        userStatus: a.user.status,
        roleId: a.role.id,
        roleName: a.role.name,
        createdAt: a.createdAt,
      }))
    );
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat Admin WOORK.', 500);
  }
}

/**
 * POST /api/super/platform-admins — tugaskan role platform ke pengguna.
 * Body: { userId, roleId }. Hanya Administrator Pusat. Tidak menyentuh flag
 * super admin maupun membership tenant pengguna.
 */
export async function POST(req: Request) {
  try {
    const ctx = await requireSuperAdmin(req);
    const body = await req.json();
    const userId = String(body?.userId || '');
    const roleId = String(body?.roleId || '');
    if (!userId || !roleId) return apiErr('userId dan roleId wajib diisi.', 422);
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, status: true, email: true } });
    if (!user) return apiErr('Pengguna tidak ditemukan.', 404);
    if (user.status !== 'ACTIVE') return apiErr('Pengguna tidak aktif.', 422);
    const role = await prisma.role.findFirst({ where: { id: roleId, organizationId: null } });
    if (!role) return apiErr('Role platform tidak ditemukan.', 422);
    const existing = await prisma.platformRoleAssignment.findUnique({
      where: { userId_roleId: { userId, roleId } },
    });
    if (existing) return apiErr('Pengguna sudah memegang role platform tersebut.', 409);
    const created = await prisma.platformRoleAssignment.create({ data: { userId, roleId } });
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'PLATFORM_ADMIN_ASSIGN',
      module: 'PLATFORM',
      description: `Menugaskan role platform "${role.name}" ke ${user.email}`,
      ipAddress: getClientIp(req),
    }).catch(() => {});
    return apiOk({ id: created.id, userId, roleId });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menugaskan role platform.', 500);
  }
}

/**
 * DELETE /api/super/platform-admins?userId=&roleId= — cabut penugasan.
 * Pencabutan langsung berlaku: permission platform dicek ke database tiap request.
 */
export async function DELETE(req: Request) {
  try {
    const ctx = await requireSuperAdmin(req);
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId') ?? '';
    const roleId = searchParams.get('roleId') ?? '';
    if (!userId || !roleId) return apiErr('userId dan roleId wajib diisi.', 422);
    const existing = await prisma.platformRoleAssignment.findUnique({
      where: { userId_roleId: { userId, roleId } },
    });
    if (!existing) return apiErr('Penugasan tidak ditemukan.', 404);
    await prisma.platformRoleAssignment.delete({
      where: { userId_roleId: { userId, roleId } },
    });
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'PLATFORM_ADMIN_REVOKE',
      module: 'PLATFORM',
      description: `Mencabut role platform ${roleId} dari pengguna ${userId}`,
      ipAddress: getClientIp(req),
    }).catch(() => {});
    return apiOk({ userId, roleId });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal mencabut penugasan.', 500);
  }
}
