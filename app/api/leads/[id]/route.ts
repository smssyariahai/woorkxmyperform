import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/** PUT /api/leads/:id — pindah stage / ubah lead */
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('CRM_EDIT');
    const body = await req.json();

    const lead = await prisma.lead.findFirst({
      where: { id: params.id, organizationId: ctx.organizationId },
      include: { stage: true, customer: true },
    });
    if (!lead) return apiErr('Lead tidak ditemukan.', 404);

    const data: any = {};
    if (body.value !== undefined) data.value = body.value ? Number(body.value) : null;
    if (body.ownerId !== undefined) data.ownerId = body.ownerId || null;
    if (body.score !== undefined) data.score = body.score || null;
    if (body.notes !== undefined) data.notes = body.notes || null;

    let stageChanged: string | null = null;
    if (body.stageId && body.stageId !== lead.stageId) {
      const stage = await prisma.leadStage.findFirst({
        where: { id: body.stageId, organizationId: ctx.organizationId },
      });
      if (!stage) return apiErr('Stage tidak valid.', 422);
      data.stageId = stage.id;
      stageChanged = `${lead.stage.name} → ${stage.name}`;
    }

    const updated = await prisma.lead.update({
      where: { id: lead.id },
      data,
      include: { stage: true, customer: true },
    });
    // Lead TIDAK punya relasi `owner` di tenant client — ambil dari
    // mirror User (pola baku Lapisan F).
    const owner = updated.ownerId
      ? await prisma.user.findUnique({ where: { id: updated.ownerId }, select: { id: true, name: true } })
      : null;

    if (stageChanged) {
      await prisma.activity.create({
        data: {
          organizationId: ctx.organizationId,
          customerId: lead.customerId,
          actorId: ctx.userId,
          type: 'LEAD_STAGE_CHANGED',
          title: 'Stage lead berubah',
          description: `${lead.customer.name}: ${stageChanged}`,
        },
      });
      await audit({
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        action: 'UPDATE_LEAD',
        module: 'CRM',
        description: `Mengubah ${lead.customer.name} dari ${stageChanged}`,
        ipAddress: getClientIp(req),
      });
    }

    return apiOk({ ...updated, owner: owner ?? null });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal mengubah lead.', 500);
  }
}

/** DELETE /api/leads/:id */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('CRM_EDIT');
    const lead = await prisma.lead.findFirst({
      where: { id: params.id, organizationId: ctx.organizationId },
    });
    if (!lead) return apiErr('Lead tidak ditemukan.', 404);
    await prisma.lead.delete({ where: { id: lead.id } });
    return apiOk({ deleted: true });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menghapus lead.', 500);
  }
}
