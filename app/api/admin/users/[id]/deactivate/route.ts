import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/** POST /api/admin/users/:id/deactivate — nonaktifkan / aktifkan akun. Body: { active: boolean } */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('USERS_DEACTIVATE', req);
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
    if (membership.userId === ctx.userId) {
      return apiErr('Anda tidak dapat menonaktifkan akun sendiri.', 409);
    }

    const body = await req.json();
    const active = body?.active !== false;
    const status = active ? 'ACTIVE' : 'INACTIVE';

    // Jangan nonaktifkan OWNER terakhir yang aktif
    if (!active && membership.role.name === 'OWNER') {
      const activeOwners = await prisma.membership.count({
        where: {
          organizationId: ctx.organizationId,
          status: 'ACTIVE',
          role: { name: 'OWNER' },
          NOT: { id: membership.id },
        },
      });
      if (activeOwners === 0) {
        return apiErr('Tidak dapat menonaktifkan OWNER terakhir di kantor ini.', 409);
      }
    }

    await prisma.membership.update({ where: { id: membership.id }, data: { status } });

    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: active ? 'ACTIVATE_USER' : 'DEACTIVATE_USER',
      module: 'USERS',
      description: `${active ? 'Mengaktifkan' : 'Menonaktifkan'} pengguna ${membership.user.name} (${membership.user.email})`,
      ipAddress: getClientIp(req),
    });
    return apiOk({ id: membership.id, status });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal mengubah status pengguna.', 500);
  }
}
