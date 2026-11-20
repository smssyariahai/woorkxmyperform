import { prisma } from '@/lib/db';
import { requireSuperAdmin } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import {
  mapTicket,
  ticketInclude,
  TICKET_STATUSES,
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
} from '@/lib/tiket/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/tiket — semua tiket semua kantor (Administrator Pusat).
 * Filter: organizationId, status, kategori, prioritas, pencarian.
 * Mengembalikan juga daftar kantor untuk dropdown filter halaman.
 */
export async function GET(req: Request) {
  try {
    await requireSuperAdmin(req);
    const url = new URL(req.url);
    const organizationId = url.searchParams.get('organizationId') || undefined;
    const status = url.searchParams.get('status') || undefined;
    const category = url.searchParams.get('category') || undefined;
    const priority = url.searchParams.get('priority') || undefined;
    const q = (url.searchParams.get('q') || '').trim();
    const limitRaw = Number(url.searchParams.get('limit') || 50);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 50;
    const where: Record<string, unknown> = {};
    if (organizationId) where.organizationId = organizationId;
    if (status && (TICKET_STATUSES as readonly string[]).includes(status)) where.status = status;
    if (category && (TICKET_CATEGORIES as readonly string[]).includes(category)) where.category = category;
    if (priority && (TICKET_PRIORITIES as readonly string[]).includes(priority)) where.priority = priority;
    if (q) {
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
      ];
    }
    const [rows, organizations] = await Promise.all([
      prisma.ticket.findMany({
        where: where as never,
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: ticketInclude,
      }),
      prisma.organization.findMany({
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      }),
    ]);
    return apiOk({ tickets: rows.map((r) => mapTicket(r as never)), organizations });
  } catch (e: unknown) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat tiket.', 500);
  }
}
