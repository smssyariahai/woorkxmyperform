import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** GET /api/conversations — daftar percakapan + filter */
export async function GET(req: Request) {
  try {
    const ctx = await requirePermission('INBOX_VIEW');
    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q')?.trim() ?? '';
    const filter = searchParams.get('filter') ?? 'all'; // all|unread|new|in_progress|resolved
    const status = searchParams.get('status') ?? '';
    const channel = searchParams.get('channel') ?? '';

    const where: any = { organizationId: ctx.organizationId };
    if (filter === 'unread') where.customer = { unreadCount: { gt: 0 } };
    if (filter === 'new') where.status = 'NEW';
    if (filter === 'in_progress') where.status = 'IN_PROGRESS';
    if (filter === 'resolved') where.status = 'RESOLVED';
    if (status) where.status = status;
    if (channel) where.channelType = channel;
    if (q) {
      where.customer = {
        ...(where.customer ?? {}),
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { phone: { contains: q } },
        ],
      };
    }

    const items = await prisma.conversation.findMany({
      where,
      include: {
        customer: {
          select: {
            id: true, name: true, phone: true, photoUrl: true, stage: true, unreadCount: true,
            business: true, interest: true, budget: true, score: true, nextFollowUp: true,
          },
        },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { lastMessageAt: 'desc' },
      take: 100,
    });

    // Conversation TIDAK punya relasi `assignee` di tenant client
    // (Lapisan F: relasi ke User dihapus, userId hanya String) — ambil
    // nama assignee dari mirror User, seperti di [id]/route.ts.
    const assigneeIds = [...new Set(items.map((c) => c.assigneeId).filter((id): id is string => !!id))];
    const assignees = assigneeIds.length
      ? await prisma.user.findMany({ where: { id: { in: assigneeIds } }, select: { id: true, name: true } })
      : [];
    const byId = new Map(assignees.map((u) => [u.id, u]));

    return apiOk(
      items.map((c) => ({
        id: c.id,
        channelType: c.channelType,
        status: c.status,
        assignedTo: c.assignedTo,
        assignee: c.assigneeId ? (byId.get(c.assigneeId) ?? null) : null,
        lastMessageAt: c.lastMessageAt,
        customer: c.customer,
        lastMessage: c.messages[0] ?? null,
      }))
    );
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat percakapan.', 500);
  }
}
