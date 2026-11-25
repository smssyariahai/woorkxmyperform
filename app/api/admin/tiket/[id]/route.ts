import { prisma } from '@/lib/db';
import { requireSuperAdmin } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { hydrateTicket, mapTicket, listTicketMembers, parseTicketUpdate, ticketDetailInclude } from '@/lib/tiket/server';

export const dynamic = 'force-dynamic';

/** GET /api/admin/tiket/[id] — detail tiket lintas kantor + balasan. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    await requireSuperAdmin(req);
    const found = await prisma.ticket.findUnique({
      where: { id: params.id },
      include: ticketDetailInclude,
    });
    if (!found) return apiErr('Tiket tidak ditemukan.', 404);
    const row = await hydrateTicket(found);
    const members = await listTicketMembers(row.organizationId);
    return apiOk({ ticket: mapTicket(row as never), members });
  } catch (e: unknown) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat tiket.', 500);
  }
}

/**
 * PATCH /api/admin/tiket/[id] — ubah status / prioritas / kategori /
 * penugasan tiket kantor mana pun (Administrator Pusat).
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    await requireSuperAdmin(req);
    const row = await prisma.ticket.findUnique({ where: { id: params.id } });
    if (!row) return apiErr('Tiket tidak ditemukan.', 404);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const parsed = parseTicketUpdate(body);
    if (parsed.error) return apiErr(parsed.error, 400);
    const d = parsed.data!;
    if (d.hasAssignee && d.assignedToId) {
      const member = await prisma.membership.findFirst({
        where: { userId: d.assignedToId, organizationId: row.organizationId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!member) return apiErr('Pengguna yang ditugaskan bukan anggota aktif kantor pemilik tiket.', 400);
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
