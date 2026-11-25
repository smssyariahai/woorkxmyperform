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
    const row = await prisma.customer.findFirst({
      where: { id: params.id, organizationId: ctx.organizationId },
      include: {
        tags: { include: { tag: true } },
        conversations: {
          include: {
            messages: { orderBy: { createdAt: 'asc' }, take: 200 },
            channel: true,
          },
          orderBy: { lastMessageAt: 'desc' },
        },
        notes: { orderBy: { createdAt: 'desc' } },
        lead: { include: { stage: true } },
        deals: { include: { stage: true }, orderBy: { createdAt: 'desc' } },
        followUps: {
          orderBy: { scheduledAt: 'asc' },
        },
        activities: { orderBy: { createdAt: 'desc' }, take: 30 },
      },
    });
    if (!row) return apiErr('Pelanggan tidak ditemukan.', 404);
    // Customer TIDAK punya relasi `owner`, Note TIDAK punya `author`, Lead
    // TIDAK punya `owner`, FollowUp TIDAK punya `assignedTo` di tenant
    // client — ambil dari mirror User (Lapisan F).
    const userIds = [
      ...new Set(
        [
          row.ownerId,
          ...row.notes.map((n) => n.authorId),
          row.lead?.ownerId,
          ...row.followUps.map((f) => f.assignedToId),
        ].filter((id): id is string => !!id)
      ),
    ];
    const users = userIds.length
      ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } })
      : [];
    const byId = new Map(users.map((u) => [u.id, u]));
    const pickName = (id: string | null | undefined) => {
      const u = id ? byId.get(id) : undefined;
      return u ? { id: u.id, name: u.name } : null;
    };
    const customer = {
      ...row,
      owner: row.ownerId
        ? byId.get(row.ownerId)
          ? { id: byId.get(row.ownerId)!.id, name: byId.get(row.ownerId)!.name, email: byId.get(row.ownerId)!.email }
          : null
        : null,
      notes: row.notes.map((n) => ({ ...n, author: pickName(n.authorId) })),
      lead: row.lead ? { ...row.lead, owner: pickName(row.lead.ownerId) } : null,
      followUps: row.followUps.map((f) => ({ ...f, assignedTo: pickName(f.assignedToId) })),
    };
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
