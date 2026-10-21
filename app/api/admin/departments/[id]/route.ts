import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/** PATCH /api/admin/departments/:id — edit divisi. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('DEPARTMENTS_MANAGE', req);
    const dept = await prisma.department.findFirst({
      where: { id: params.id, organizationId: ctx.organizationId },
    });
    if (!dept) return apiErr('Divisi tidak ditemukan.', 404);
    const body = await req.json();
    const data: any = {};
    if (body?.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) return apiErr('Nama divisi tidak boleh kosong.', 422);
      data.name = name;
    }
    if (body?.description !== undefined) {
      data.description = String(body.description).trim() || null;
    }
    const updated = await prisma.department.update({ where: { id: dept.id }, data });
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'UPDATE_DEPARTMENT',
      module: 'DEPARTMENTS',
      description: `Mengedit divisi "${dept.name}"`,
      ipAddress: getClientIp(req),
    });
    return apiOk(updated);
  } catch (e: any) {
    if (e instanceof Response) return e;
    if ((e as any)?.code === 'P2002') return apiErr('Divisi dengan nama tersebut sudah ada.', 409);
    return apiErr('Gagal mengedit divisi.', 500);
  }
}

/** DELETE /api/admin/departments/:id — hapus divisi (anggota dilepas dari divisi). */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('DEPARTMENTS_MANAGE', req);
    const dept = await prisma.department.findFirst({
      where: { id: params.id, organizationId: ctx.organizationId },
      include: { _count: { select: { memberships: true } } },
    });
    if (!dept) return apiErr('Divisi tidak ditemukan.', 404);
    await prisma.$transaction([
      prisma.membership.updateMany({
        where: { departmentId: dept.id },
        data: { departmentId: null },
      }),
      prisma.department.delete({ where: { id: dept.id } }),
    ]);
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'DELETE_DEPARTMENT',
      module: 'DEPARTMENTS',
      description: `Menghapus divisi "${dept.name}" (${dept._count.memberships} anggota dilepas)`,
      ipAddress: getClientIp(req),
    });
    return apiOk({ id: dept.id });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menghapus divisi.', 500);
  }
}
