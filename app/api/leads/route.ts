import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/** GET /api/leads — kanban data */
export async function GET(req: Request) {
  try {
    const ctx = await requirePermission('CRM_VIEW');
    const { searchParams } = new URL(req.url);
    const ownerId = searchParams.get('ownerId') ?? '';

    const stages = await prisma.leadStage.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { order: 'asc' },
      include: {
        leads: {
          where: ownerId ? { ownerId } : undefined,
          include: {
            customer: { select: { id: true, name: true, company: true, phone: true } },
          },
          orderBy: { updatedAt: 'desc' },
        },
      },
    });
    // Lead TIDAK punya relasi `owner` di tenant client — ambil dari mirror
    // User (Lapisan F).
    const ownerIds = [...new Set(stages.flatMap((s) => s.leads.map((l) => l.ownerId)).filter((id): id is string => !!id))];
    const owners = ownerIds.length
      ? await prisma.user.findMany({ where: { id: { in: ownerIds } }, select: { id: true, name: true } })
      : [];
    const byId = new Map(owners.map((u) => [u.id, u]));
    const stagesWithOwners = stages.map((s) => ({
      ...s,
      leads: s.leads.map((l) => ({ ...l, owner: l.ownerId ? byId.get(l.ownerId) ?? null : null })),
    }));
    return apiOk(stagesWithOwners);
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat leads.', 500);
  }
}

/** POST /api/leads — buat lead dari customer */
export async function POST(req: Request) {
  try {
    const ctx = await requirePermission('CRM_EDIT');
    const body = await req.json();
    const { customerId, stageId, value, ownerId } = body;
    if (!customerId) return apiErr('customerId wajib diisi.', 422);

    const customer = await prisma.customer.findFirst({
      where: { id: customerId, organizationId: ctx.organizationId },
    });
    if (!customer) return apiErr('Pelanggan tidak ditemukan.', 404);

    const existing = await prisma.lead.findUnique({ where: { customerId } });
    if (existing) return apiErr('Pelanggan sudah menjadi lead.', 409);

    const stage =
      (stageId &&
        (await prisma.leadStage.findFirst({
          where: { id: stageId, organizationId: ctx.organizationId },
        }))) ||
      (await prisma.leadStage.findFirst({
        where: { organizationId: ctx.organizationId },
        orderBy: { order: 'asc' },
      }));
    if (!stage) return apiErr('Stage lead belum dikonfigurasi.', 500);

    const lead = await prisma.lead.create({
      data: {
        organizationId: ctx.organizationId,
        customerId,
        stageId: stage.id,
        ownerId: ownerId || ctx.userId,
        value: value ? Number(value) : null,
      },
      include: { stage: true, customer: true },
    });

    await prisma.activity.create({
      data: {
        organizationId: ctx.organizationId,
        customerId,
        actorId: ctx.userId,
        type: 'LEAD_CREATED',
        title: 'Lead dibuat',
        description: `${customer.name} masuk tahap ${stage.name}`,
      },
    });
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'CREATE_LEAD',
      module: 'CRM',
      description: `Membuat lead ${customer.name} (tahap ${stage.name})`,
      ipAddress: getClientIp(req),
    });
    return apiOk(lead, 201);
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal membuat lead.', 500);
  }
}
