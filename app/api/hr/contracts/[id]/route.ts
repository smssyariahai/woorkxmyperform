import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit } from '@/lib/audit';
import { hrContractSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

async function findOne(ctx: { organizationId: string }, id: string) {
  return prisma.hrContract.findFirst({
    where: { id, organizationId: ctx.organizationId },
    include: { employee: { select: { id: true, name: true } } },
  });
}

/** PUT /api/hr/contracts/[id] */
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('HR_MANAGE');
    const cur = await findOne(ctx, params.id);
    if (!cur) return apiErr('Kontrak tidak ditemukan.', 404);
    const parsed = hrContractSchema.safeParse(await req.json());
    if (!parsed.success) return apiErr('Data tidak valid.', 422, parsed.error.flatten().fieldErrors);
    const d = parsed.data;
    if (d.contractNo.trim() !== cur.contractNo) {
      const dup = await prisma.hrContract.findFirst({
        where: { organizationId: ctx.organizationId, contractNo: d.contractNo.trim(), NOT: { id: cur.id } },
      });
      if (dup) return apiErr('Nomor kontrak sudah dipakai.', 409);
    }
    const item = await prisma.hrContract.update({
      where: { id: cur.id },
      data: {
        contractNo: d.contractNo.trim(),
        type: d.type,
        startDate: new Date(d.startDate),
        endDate: d.endDate ? new Date(d.endDate) : null,
        probationEnd: d.probationEnd ? new Date(d.probationEnd) : null,
        salary: d.salary ?? null,
        position: d.position.trim(),
        status: d.status,
        notes: d.notes?.trim() || null,
      },
      include: { employee: { select: { id: true, name: true, employeeNo: true } } },
    });
    await audit({
      organizationId: ctx.organizationId, userId: ctx.userId,
      action: 'UPDATE_CONTRACT', module: 'HR',
      description: `${ctx.name} memperbarui kontrak ${item.contractNo} ("${cur.employee.name}")`,
    });
    return apiOk({ item });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memperbarui kontrak.', 500);
  }
}

/** DELETE /api/hr/contracts/[id] */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('HR_MANAGE');
    const cur = await findOne(ctx, params.id);
    if (!cur) return apiErr('Kontrak tidak ditemukan.', 404);
    await prisma.hrContract.delete({ where: { id: cur.id } });
    await audit({
      organizationId: ctx.organizationId, userId: ctx.userId,
      action: 'DELETE_CONTRACT', module: 'HR',
      description: `${ctx.name} menghapus kontrak ${cur.contractNo} ("${cur.employee.name}")`,
    });
    return apiOk({ ok: true });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menghapus kontrak.', 500);
  }
}
