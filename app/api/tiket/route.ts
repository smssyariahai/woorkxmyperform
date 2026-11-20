import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import {
  mapTicket,
  notifyTicketCreated,
  parseTicketInput,
  ticketInclude,
  ticketVisibilityWhere,
  userCanManageTicket,
  TICKET_STATUSES,
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
} from '@/lib/tiket/server';

export const dynamic = 'force-dynamic';

/** GET /api/tiket — daftar tiket kantor (filter status/kategori/prioritas/pencarian). */
export async function GET(req: Request) {
  try {
    const ctx = await requirePermission('TIKET_VIEW', req);
    const canManage = await userCanManageTicket(ctx);
    const url = new URL(req.url);
    const status = url.searchParams.get('status') || undefined;
    const category = url.searchParams.get('category') || undefined;
    const priority = url.searchParams.get('priority') || undefined;
    const q = (url.searchParams.get('q') || '').trim();
    const limitRaw = Number(url.searchParams.get('limit') || 50);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 50;
    const where: Record<string, unknown> = ticketVisibilityWhere(ctx, canManage);
    if (status && (TICKET_STATUSES as readonly string[]).includes(status)) where.status = status;
    if (category && (TICKET_CATEGORIES as readonly string[]).includes(category)) where.category = category;
    if (priority && (TICKET_PRIORITIES as readonly string[]).includes(priority)) where.priority = priority;
    if (q) {
      // Pencarian judul/deskripsi HARUS tetap menghormati visibilitas:
      // gabungkan OR pencarian ke dalam AND bersama filter visibilitas.
      const searchOr = [
        { title: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
      ];
      const visOr = (where as { OR?: unknown }).OR;
      if (visOr) {
        delete (where as Record<string, unknown>).OR;
        (where as Record<string, unknown>).AND = [{ OR: visOr }, { OR: searchOr }];
      } else {
        where.OR = searchOr;
      }
    }
    const rows = await prisma.ticket.findMany({
      where: where as never,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: ticketInclude,
    });
    return apiOk({ tickets: rows.map((r) => mapTicket(r as never)), canManage });
  } catch (e: unknown) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat tiket.', 500);
  }
}

/** POST /api/tiket — buat tiket baru (lalu beri tahu admin kantor). */
export async function POST(req: Request) {
  try {
    const ctx = await requirePermission('TIKET_CREATE', req);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const parsed = parseTicketInput(body);
    if (parsed.error) return apiErr(parsed.error, 400);
    const d = parsed.data!;
    const saved = await prisma.ticket.create({
      data: {
        organizationId: ctx.organizationId,
        createdById: ctx.userId,
        title: d.title,
        category: d.category,
        priority: d.priority,
        description: d.description,
      },
      include: ticketInclude,
    });
    await notifyTicketCreated(saved).catch(() => {});
    return apiOk(mapTicket(saved as never), 201);
  } catch (e: unknown) {
    if (e instanceof Response) return e;
    return apiErr('Gagal membuat tiket.', 500);
  }
}
