import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit } from '@/lib/audit';
import { hrVacancySchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

async function findOne(ctx: { organizationId: string }, id: string) {
  return prisma.hrVacancy.findFirst({ where: { id, organizationId: ctx.organizationId } });
}

/** PUT /api/hr/vacancies/[id] — ubah lowongan */
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('HR_MANAGE');
    const cur = await findOne(ctx, params.id);
    if (!cur) return apiErr('Lowongan tidak ditemukan.', 404);
    const parsed = hrVacancySchema.safeParse(await req.json());
    if (!parsed.success) return apiErr('Data tidak valid.', 422, parsed.error.flatten().fieldErrors);
    const d = parsed.data;
    const item = await prisma.hrVacancy.update({
      where: { id: cur.id },
      data: {
        title: d.title.trim(),
        department: d.department?.trim() || null,
        location: d.location?.trim() || null,
        employmentType: d.employmentType,
        quota: d.quota,
        status: d.status,
        description: d.description?.trim() || null,
        salaryMin: d.salaryMin ?? null,
        salaryMax: d.salaryMax ?? null,
        publishedAt: d.status === 'OPEN' && !cur.publishedAt ? new Date() : cur.publishedAt,
        closedAt: d.status === 'CLOSED' && !cur.closedAt ? new Date() : d.status === 'OPEN' ? null : cur.closedAt,
      },
    });
    await audit({
      organizationId: ctx.organizationId, userId: ctx.userId,
      action: 'UPDATE_VACANCY', module: 'HR',
      description: `${ctx.name} memperbarui lowongan "${item.title}"`,
    });
    return apiOk({ item });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memperbarui lowongan.', 500);
  }
}

/** DELETE /api/hr/vacancies/[id] — hapus lowongan */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('HR_MANAGE');
    const cur = await findOne(ctx, params.id);
    if (!cur) return apiErr('Lowongan tidak ditemukan.', 404);
    await prisma.hrVacancy.delete({ where: { id: cur.id } });
    await audit({
      organizationId: ctx.organizationId, userId: ctx.userId,
      action: 'DELETE_VACANCY', module: 'HR',
      description: `${ctx.name} menghapus lowongan "${cur.title}"`,
    });
    return apiOk({ ok: true });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menghapus lowongan.', 500);
  }
}
