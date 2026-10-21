import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';
import { customerSchema, noteSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/** GET /api/customers/:id — detail + relasi */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('CRM_VIEW');
    const customer = await prisma.customer.findFirst({
      where: { id: params.id, organizationId: ctx.organizationId },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        tags: { include: { tag: true } },
        conversations: {
          include: {
            messages: { orderBy: { createdAt: 'asc' }, take: 200 },
            channel: true,
          },
          orderBy: { lastMessageAt: 'desc' },
        },
        notes: { include: { author: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' } },
        lead: { include: { stage: true, owner: { select: { id: true, name: true } } } },
        deals: { include: { stage: true }, orderBy: { createdAt: 'desc' } },
        followUps: {
          include: { assignedTo: { select: { id: true, name: true } } },
          orderBy: { scheduledAt: 'asc' },
        },
        activities: { orderBy: { createdAt: 'desc' }, take: 30 },
      },
    });
    if (!customer) return apiErr('Pelanggan tidak ditemukan.', 404);
    return apiOk({ ...customer, tags: customer.tags.map((t) => t.tag) });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat detail pelanggan.', 500);
  }
}

/** PUT /api/customers/:id */
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('CRM_EDIT');
    const body = await req.json();
    const parsed = customerSchema.partial().safeParse(body);
    if (!parsed.success) return apiErr('Data tidak valid.', 422, parsed.error.flatten().fieldErrors);

    const existing = await prisma.customer.findFirst({
      where: { id: params.id, organizationId: ctx.organizationId },
    });
    if (!existing) return apiErr('Pelanggan tidak ditemukan.', 404);

    const d = parsed.data;
    const customer = await prisma.customer.update({
      where: { id: params.id },
      data: {
        name: d.name?.trim(),
        phone: d.phone?.trim() || null,
        email: d.email?.trim() || null,
        company: d.company?.trim() || null,
        industry: d.industry?.trim() || null,
        source: d.source?.trim() || null,
        stage: d.stage,
        score: d.score,
        business: d.business?.trim() || null,
        interest: d.interest?.trim() || null,
        budget: d.budget?.trim() || null,
        ownerId: d.ownerId || undefined,
      },
    });

    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'UPDATE_CUSTOMER',
      module: 'CRM',
      description: `Mengubah data ${customer.name}`,
      ipAddress: getClientIp(req),
    });
    return apiOk(customer);
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal mengubah pelanggan.', 500);
  }
}

/** DELETE /api/customers/:id */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('CRM_EDIT');
    const existing = await prisma.customer.findFirst({
      where: { id: params.id, organizationId: ctx.organizationId },
    });
    if (!existing) return apiErr('Pelanggan tidak ditemukan.', 404);
    await prisma.customer.delete({ where: { id: params.id } });
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'DELETE_CUSTOMER',
      module: 'CRM',
      description: `Menghapus pelanggan ${existing.name}`,
      ipAddress: getClientIp(req),
    });
    return apiOk({ deleted: true });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menghapus pelanggan.', 500);
  }
}
