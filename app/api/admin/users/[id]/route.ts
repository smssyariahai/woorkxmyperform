import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/** PATCH /api/admin/users/:id — edit data pengguna (nama, telepon, divisi, jabatan). */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('USERS_UPDATE', req);
    const membership = await prisma.membership.findFirst({
      where: { id: params.id, organizationId: ctx.organizationId },
      include: { user: true, role: true },
    });
    if (!membership) return apiErr('Pengguna tidak ditemukan.', 404);
    // Tidak boleh mengubah diri sendiri lewat endpoint ini untuk hal sensitif;
    // data dasar boleh.
    const body = await req.json();

    const departmentId = body?.departmentId ? String(body.departmentId) : null;
    if (departmentId) {
      const dept = await prisma.department.findFirst({
        where: { id: departmentId, organizationId: ctx.organizationId },
      });
      if (!dept) return apiErr('Divisi tidak ditemukan di kantor ini.', 404);
    }

    const userData: any = {};
    if (body?.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) return apiErr('Nama tidak boleh kosong.', 422);
      userData.name = name;
    }
    if (body?.phone !== undefined) userData.phone = String(body.phone).trim() || null;

    await prisma.$transaction([
      ...(Object.keys(userData).length > 0
        ? [prisma.user.update({ where: { id: membership.userId }, data: userData })]
        : []),
      prisma.membership.update({
        where: { id: membership.id },
        data: {
          departmentId,
          jobTitle: body?.jobTitle !== undefined ? String(body.jobTitle).trim() || null : undefined,
        },
      }),
    ]);

    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'UPDATE_USER',
      module: 'USERS',
      description: `Mengedit pengguna ${membership.user.name} (${membership.user.email})`,
      ipAddress: getClientIp(req),
    });
    return apiOk({ id: membership.id });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal mengedit pengguna.', 500);
  }
}
