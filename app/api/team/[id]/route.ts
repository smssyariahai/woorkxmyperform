import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/** PUT /api/team/:id — ubah role / status anggota */
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('TEAM_MANAGE');
    const body = await req.json();
    const membership = await prisma.membership.findFirst({
      where: { id: params.id, organizationId: ctx.organizationId },
      include: { user: true, role: true },
    });
    if (!membership) return apiErr('Anggota tidak ditemukan.', 404);
    if (membership.userId === ctx.userId) {
      return apiErr('Tidak dapat mengubah akun sendiri.', 409);
    }
    // Hanya owner yang boleh mengelola sesama owner
    if (membership.role.name === 'OWNER' && ctx.role !== 'OWNER') {
      return apiErr('Hanya owner yang dapat mengubah akun owner lain.', 403);
    }

    const data: any = {};
    if (body.role) {
      const role = await prisma.role.findFirst({
        where: { organizationId: ctx.organizationId, name: body.role },
      });
      if (!role) return apiErr('Role tidak valid.', 422);
      if (role.name === 'OWNER' && ctx.role !== 'OWNER') {
        return apiErr('Hanya owner yang dapat memberikan role owner.', 403);
      }
      if (membership.role.name === 'OWNER' && role.name !== 'OWNER') {
        const ownerCount = await prisma.membership.count({
          where: { organizationId: ctx.organizationId, role: { name: 'OWNER' }, status: 'ACTIVE' },
        });
        if (ownerCount <= 1) return apiErr('Workspace harus memiliki minimal 1 owner.', 409);
      }
      data.roleId = role.id;
    }
    if (body.status && ['ACTIVE', 'DISABLED'].includes(body.status)) {
      data.status = body.status;
      await prisma.user.update({ where: { id: membership.userId }, data: { status: body.status } });
    }

    const updated = await prisma.membership.update({
      where: { id: membership.id },
      data,
      include: { user: { select: { id: true, name: true, email: true } }, role: true },
    });
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'UPDATE_TEAM_MEMBER',
      module: 'TEAM',
      description: `Mengubah ${membership.user.name} (${JSON.stringify(body)})`,
      ipAddress: getClientIp(req),
    });
    return apiOk(updated);
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal mengubah anggota.', 500);
  }
}

/** DELETE /api/team/:id — hapus anggota */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('TEAM_MANAGE');
    const membership = await prisma.membership.findFirst({
      where: { id: params.id, organizationId: ctx.organizationId },
      include: { user: true, role: true },
    });
    if (!membership) return apiErr('Anggota tidak ditemukan.', 404);
    if (membership.userId === ctx.userId) return apiErr('Tidak dapat menghapus akun sendiri.', 409);
    if (membership.role.name === 'OWNER' && ctx.role !== 'OWNER') {
      return apiErr('Hanya owner yang dapat menghapus akun owner lain.', 403);
    }
    if (membership.role.name === 'OWNER') {
      const ownerCount = await prisma.membership.count({
        where: { organizationId: ctx.organizationId, role: { name: 'OWNER' }, status: 'ACTIVE' },
      });
      if (ownerCount <= 1) return apiErr('Workspace harus memiliki minimal 1 owner.', 409);
    }
    await prisma.membership.delete({ where: { id: membership.id } });
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'REMOVE_TEAM_MEMBER',
      module: 'TEAM',
      description: `Menghapus ${membership.user.name} dari workspace`,
      ipAddress: getClientIp(req),
    });
    return apiOk({ deleted: true });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menghapus anggota.', 500);
  }
}
