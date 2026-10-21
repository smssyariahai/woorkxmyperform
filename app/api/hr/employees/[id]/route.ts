import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit } from '@/lib/audit';
import { hrEmployeeSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

async function findOne(ctx: { organizationId: string }, id: string) {
  return prisma.hrEmployee.findFirst({ where: { id, organizationId: ctx.organizationId } });
}

/** PUT /api/hr/employees/[id] */
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('HR_MANAGE');
    const cur = await findOne(ctx, params.id);
    if (!cur) return apiErr('Karyawan tidak ditemukan.', 404);
    const parsed = hrEmployeeSchema.safeParse(await req.json());
    if (!parsed.success) return apiErr('Data tidak valid.', 422, parsed.error.flatten().fieldErrors);
    const d = parsed.data;
    if (d.employeeNo.trim() !== cur.employeeNo) {
      const dup = await prisma.hrEmployee.findFirst({
        where: { organizationId: ctx.organizationId, employeeNo: d.employeeNo.trim(), NOT: { id: cur.id } },
      });
      if (dup) return apiErr('Nomor karyawan sudah dipakai.', 409);
    }
    const item = await prisma.hrEmployee.update({
      where: { id: cur.id },
      data: {
        employeeNo: d.employeeNo.trim(),
        name: d.name.trim(),
        nik: d.nik?.trim() || null,
        email: d.email?.trim() || null,
        phone: d.phone?.trim() || null,
        address: d.address?.trim() || null,
        birthDate: d.birthDate ? new Date(d.birthDate) : null,
        position: d.position.trim(),
        department: d.department?.trim() || null,
        joinDate: new Date(d.joinDate),
        status: d.status,
      },
    });
    await audit({
      organizationId: ctx.organizationId, userId: ctx.userId,
      action: 'UPDATE_EMPLOYEE', module: 'HR',
      description: `${ctx.name} memperbarui data karyawan "${item.name}"`,
    });
    return apiOk({ item });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memperbarui karyawan.', 500);
  }
}

/** DELETE /api/hr/employees/[id] */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('HR_MANAGE');
    const cur = await findOne(ctx, params.id);
    if (!cur) return apiErr('Karyawan tidak ditemukan.', 404);
    await prisma.hrEmployee.delete({ where: { id: cur.id } });
    await audit({
      organizationId: ctx.organizationId, userId: ctx.userId,
      action: 'DELETE_EMPLOYEE', module: 'HR',
      description: `${ctx.name} menghapus karyawan "${cur.name}"`,
    });
    return apiOk({ ok: true });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menghapus karyawan.', 500);
  }
}
