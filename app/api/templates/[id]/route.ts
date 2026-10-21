import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';
import { templateSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/** PUT /api/templates/:id — ubah template */
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('INBOX_REPLY');
    const body = await req.json();
    const parsed = templateSchema.safeParse(body);
    if (!parsed.success) return apiErr('Data tidak valid.', 422, parsed.error.flatten().fieldErrors);

    const existing = await prisma.replyTemplate.findFirst({
      where: { id: params.id, organizationId: ctx.organizationId },
    });
    if (!existing) return apiErr('Template tidak ditemukan.', 404);

    const tpl = await prisma.replyTemplate.update({
      where: { id: params.id },
      data: {
        name: parsed.data.name.trim(),
        category: parsed.data.category.trim() || 'Umum',
        body: parsed.data.body.trim(),
        isActive: parsed.data.isActive ?? existing.isActive,
      },
      include: { createdBy: { select: { id: true, name: true } } },
    });

    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'UPDATE_TEMPLATE',
      module: 'INBOX',
      description: `${ctx.name} mengubah template balasan "${tpl.name}"`,
      ipAddress: getClientIp(req),
    });

    return apiOk(tpl);
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal mengubah template.', 500);
  }
}

/** DELETE /api/templates/:id — hapus template */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('INBOX_REPLY');
    const existing = await prisma.replyTemplate.findFirst({
      where: { id: params.id, organizationId: ctx.organizationId },
    });
    if (!existing) return apiErr('Template tidak ditemukan.', 404);

    await prisma.replyTemplate.delete({ where: { id: params.id } });

    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'DELETE_TEMPLATE',
      module: 'INBOX',
      description: `${ctx.name} menghapus template balasan "${existing.name}"`,
      ipAddress: getClientIp(req),
    });

    return apiOk({ id: params.id });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menghapus template.', 500);
  }
}
