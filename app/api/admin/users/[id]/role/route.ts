import { prisma } from '@/lib/db';
import { requirePermission, getUserPermissions, assertCanGrant } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/** POST /api/admin/users/:id/role — ubah role pengguna. Body: { roleId } */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('USERS_ASSIGN_ROLE', req);
    // Membership TIDAK punya relasi `user` di tenant client — user diambil
    // terpisah lalu digabung (bentuk hasil sama).
    const membershipRow = await prisma.membership.findFirst({
      where: { id: params.id, organizationId: ctx.organizationId },
      include: { role: true },
    });
    if (!membershipRow) return apiErr('Pengguna tidak ditemukan.', 404);
    const memberUser = await prisma.user.findUnique({ where: { id: membershipRow.userId } });
    if (!memberUser) return apiErr('Pengguna tidak ditemukan.', 404);
    const membership = { ...membershipRow, user: memberUser };

    const body = await req.json();
    const roleId = String(body?.roleId || '');
    if (!roleId) return apiErr('roleId wajib diisi.', 422);

    const role = await prisma.role.findFirst({
      where: { id: roleId, organizationId: ctx.organizationId },
      include: { permissions: { include: { permission: true } } },
    });
    if (!role) return apiErr('Role tidak ditemukan di kantor ini.', 404);

    // Anti-eskalasi: hanya boleh memberi role dengan permission yang dimiliki
    const granterKeys = await getUserPermissions(ctx);
    assertCanGrant(granterKeys, role.permissions.map((rp) => rp.permission.key));

    // Tidak boleh mengubah role sendiri (cegah lockout / eskalasi mandiri)
    if (membership.userId === ctx.userId) {
      return apiErr('Anda tidak dapat mengubah role akun sendiri.', 409);
    }

    // Jangan turunkan OWNER terakhir
    if (membership.role.name === 'OWNER' && role.name !== 'OWNER') {
      const otherOwners = await prisma.membership.count({
        where: {
          organizationId: ctx.organizationId,
          status: 'ACTIVE',
          role: { name: 'OWNER' },
          NOT: { id: membership.id },
        },
      });
      if (otherOwners === 0) {
        return apiErr('Tidak dapat menurunkan OWNER terakhir di kantor ini.', 409);
      }
    }

    await prisma.membership.update({ where: { id: membership.id }, data: { roleId: role.id } });

    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'ASSIGN_ROLE',
      module: 'USERS',
      description: `Mengubah role ${membership.user.name} (${membership.user.email}): ${membership.role.name} → ${role.name}`,
      ipAddress: getClientIp(req),
    });
    return apiOk({ id: membership.id, role: role.name });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal mengubah role.', 500);
  }
}
