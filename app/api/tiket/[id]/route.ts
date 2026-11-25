import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import {
  hydrateTicket,
  listTicketMembers,
  mapTicket,
  parseTicketUpdate,
  ticketDetailInclude,
  ticketVisibilityWhere,
  userCanManageTicket,
} from '@/lib/tiket/server';

export const dynamic = 'force-dynamic';

/** GET /api/tiket/[id] — detail tiket + balasan (sesuai visibilitas user). */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('TIKET_VIEW', req);
    const canManage = await userCanManageTicket(ctx);
    const found = await prisma.ticket.findFirst({
      where: { id: params.id, ...(ticketVisibilityWhere(ctx, canManage) as object) },
      include: ticketDetailInclude,
    });
    if (!found) return apiErr('Tiket tidak ditemukan.', 404);
    const row = await hydrateTicket(found);
    const members = canManage ? await listTicketMembers(ctx.organizationId) : undefined;
    return apiOk({ ticket: mapTicket(row as never), canManage, members });
  } catch (e: unknown) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat tiket.', 500);
  }
}

/**
 * PATCH /api/tiket/[id] — ubah status / prioritas / kategori / judul /
 * deskripsi / penugasan. Butuh TIKET_MANAGE (admin kantor).
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('TIKET_MANAGE', req);
    const row = await prisma.ticket.findFirst({
      where: { id: params.id, organizationId: ctx.organizationId },
    });
    if (!row) return apiErr('Tiket tidak ditemukan.', 404);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const parsed = parseTicketUpdate(body);
    if (parsed.error) return apiErr(parsed.error, 400);
    const d = parsed.data!;
    if (d.hasAssignee && d.assignedToId) {
      const member = await prisma.membership.findFirst({
        where: { userId: d.assignedToId, organizationId: ctx.organizationId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!member) return apiErr('Pengguna yang ditugaskan bukan anggota aktif kantor ini.', 400);
    }
    const updated = await hydrateTicket(
      await prisma.ticket.update({
        where: { id: row.id },
        data: {
          ...(d.status !== undefined ? { status: d.status } : {}),
          ...(d.priority !== undefined ? { priority: d.priority } : {}),
          ...(d.category !== undefined ? { category: d.category } : {}),
          ...(d.title !== undefined ? { title: d.title } : {}),
          ...(d.description !== undefined ? { description: d.description } : {}),
          ...(d.hasAssignee ? { assignedToId: d.assignedToId } : {}),
        },
        include: ticketDetailInclude,
      })
    );
    return apiOk(mapTicket(updated as never));
  } catch (e: unknown) {
    if (e instanceof Response) return e;
    return apiErr('Gagal mengubah tiket.', 500);
  }
}
