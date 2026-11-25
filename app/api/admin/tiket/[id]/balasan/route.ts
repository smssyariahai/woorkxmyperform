import { prisma } from '@/lib/db';
import { requireSuperAdmin } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import {
  hydrateTicket,
  mapTicket,
  nextStatusAfterReply,
  notifyTicketReply,
  ticketDetailInclude,
} from '@/lib/tiket/server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/tiket/[id]/balasan — Administrator Pusat membalas tiket
 * kantor mana pun. Status berubah otomatis (lihat nextStatusAfterReply);
 * balasan mengirim notifikasi in-app ke pembuat tiket + admin kantor
 * (type 'TIKET').
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireSuperAdmin(req);
    const ticket = await prisma.ticket.findUnique({ where: { id: params.id } });
    if (!ticket) return apiErr('Tiket tidak ditemukan.', 404);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const content = String(body.content ?? '').trim();
    if (!content) return apiErr('Isi balasan wajib diisi.', 400);
    if (content.length > 5000) return apiErr('Isi balasan maksimal 5000 karakter.', 400);
    const nextStatus = nextStatusAfterReply(ticket, ctx.userId);
    // TicketReply TIDAK punya relasi `author` di tenant client — nama
    // penulis balasan adalah nama pengguna yang sedang login (ctx.name).
    const reply = await prisma.ticketReply.create({
      data: { ticketId: ticket.id, authorId: ctx.userId, content },
    });
    let fresh = ticket;
    if (nextStatus) {
      fresh = await prisma.ticket.update({
        where: { id: ticket.id },
        data: { status: nextStatus },
      });
    }
    await notifyTicketReply(fresh, ctx.userId, ctx.name).catch(() => {});
    const found = await prisma.ticket.findUnique({
      where: { id: ticket.id },
      include: ticketDetailInclude,
    });
    if (!found) return apiErr('Tiket tidak ditemukan.', 404);
    const detail = await hydrateTicket(found);
    return apiOk(
      {
        reply: {
          id: reply.id,
          ticketId: reply.ticketId,
          authorId: reply.authorId,
          authorName: ctx.name ?? 'Pengguna',
          content: reply.content,
          createdAt: reply.createdAt.toISOString(),
        },
        ticket: mapTicket(detail as never),
      },
      201
    );
  } catch (e: unknown) {
    if (e instanceof Response) return e;
    return apiErr('Gagal mengirim balasan.', 500);
  }
}
