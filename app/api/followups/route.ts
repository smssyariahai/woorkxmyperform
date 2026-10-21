import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';
import { followUpSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/** GET /api/followups — daftar follow up */
export async function GET(req: Request) {
  try {
    const ctx = await requirePermission('CRM_VIEW');
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') ?? '';
    const mine = searchParams.get('mine') === '1';

    const where: any = { organizationId: ctx.organizationId };
    if (status) where.status = status;
    if (mine) where.assignedToId = ctx.userId;

    const items = await prisma.followUp.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        assignedTo: { select: { id: true, name: true } },
      },
      orderBy: { scheduledAt: 'asc' },
      take: 100,
    });
    return apiOk(items);
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat follow up.', 500);
  }
}

/** POST /api/followups — jadwalkan follow up */
export async function POST(req: Request) {
  try {
    const ctx = await requirePermission('CRM_EDIT');
    const body = await req.json();
    const parsed = followUpSchema.safeParse(body);
    if (!parsed.success) return apiErr('Data tidak valid.', 422, parsed.error.flatten().fieldErrors);

    const customer = await prisma.customer.findFirst({
      where: { id: parsed.data.customerId, organizationId: ctx.organizationId },
    });
    if (!customer) return apiErr('Pelanggan tidak ditemukan.', 404);

    const fu = await prisma.followUp.create({
      data: {
        organizationId: ctx.organizationId,
        customerId: customer.id,
        assignedToId: parsed.data.assignedToId || ctx.userId,
        scheduledAt: new Date(parsed.data.scheduledAt),
        notes: parsed.data.notes || null,
      },
      include: {
        customer: { select: { id: true, name: true } },
        assignedTo: { select: { id: true, name: true } },
      },
    });

    await prisma.customer.update({
      where: { id: customer.id },
      data: { nextFollowUp: fu.scheduledAt },
    });
    await prisma.notification.create({
      data: {
        organizationId: ctx.organizationId,
        userId: fu.assignedToId!,
        type: 'FOLLOWUP',
        title: 'Follow up dijadwalkan',
        body: `${customer.name} — ${fu.scheduledAt.toLocaleString('id-ID')}`,
      },
    });
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'CREATE_FOLLOWUP',
      module: 'CRM',
      description: `Menjadwalkan follow up ${customer.name}`,
      ipAddress: getClientIp(req),
    });
    return apiOk(fu, 201);
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal membuat follow up.', 500);
  }
}
