import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** GET /api/dashboard/stats — ringkasan dashboard */
export async function GET() {
  try {
    const ctx = await requireAuth();
    const orgId = ctx.organizationId;
    const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);

    const [
      totalCustomers,
      newLeads,
      openConversations,
      wonLeads,
      totalLeads,
      conversationsByDay,
      leadsByStage,
      recentActivities,
      topAgents,
      pendingFollowUps,
    ] = await Promise.all([
      prisma.customer.count({ where: { organizationId: orgId } }),
      prisma.lead.count({ where: { organizationId: orgId, createdAt: { gte: weekAgo } } }),
      prisma.conversation.count({
        where: { organizationId: orgId, status: { in: ['NEW', 'OPEN', 'WAITING'] } },
      }),
      prisma.lead.count({
        where: { organizationId: orgId, stage: { name: 'Menang' } },
      }),
      prisma.lead.count({ where: { organizationId: orgId } }),
      prisma.$queryRaw<Array<{ day: string; count: bigint }>>`
        SELECT to_char("createdAt", 'YYYY-MM-DD') AS day, COUNT(*)::bigint AS count
        FROM "ConversationMessage"
        WHERE "conversationId" IN (SELECT id FROM "Conversation" WHERE "organizationId" = ${orgId})
          AND "createdAt" >= ${weekAgo}
        GROUP BY 1 ORDER BY 1`,
      prisma.leadStage.findMany({
        where: { organizationId: orgId },
        orderBy: { order: 'asc' },
        include: { _count: { select: { leads: true } } },
      }),
      // Activity TIDAK punya relasi `actor` di tenant client — nama actor
      // diambil terpisah dari mirror User (bentuk hasil sama:
      // `actor: { name } | null`, `customer: { name } | null`).
      (async () => {
        const rows = await prisma.activity.findMany({
          where: { organizationId: orgId },
          include: { customer: { select: { name: true } } },
          orderBy: { createdAt: 'desc' },
          take: 8,
        });
        const actorIds = [
          ...new Set(rows.map((a) => a.actorId).filter((id): id is string => !!id)),
        ];
        const actors = actorIds.length
          ? await prisma.user.findMany({
              where: { id: { in: actorIds } },
              select: { id: true, name: true },
            })
          : [];
        const actorById = new Map(actors.map((u) => [u.id, u]));
        return rows.map((a) => ({
          ...a,
          actor: a.actorId ? (actorById.get(a.actorId) ?? null) : null,
        }));
      })(),
      // User mirror TIDAK punya relasi apa pun — filter `memberships` dan
      // `_count sentMessages/ownedLeads` diganti query terpisah. Di tenant
      // DB hanya ada satu org, jadi hitungan per senderId/ownerId sama
      // dengan hitungan relasi di legacy (tanpa filter org).
      (async () => {
        const memberRows = await prisma.membership.findMany({
          where: { organizationId: orgId, status: 'ACTIVE' },
          select: { userId: true },
          take: 5,
        });
        const ids = memberRows.map((m) => m.userId);
        if (ids.length === 0) return [];
        const [users, sent, owned] = await Promise.all([
          prisma.user.findMany({
            where: { id: { in: ids } },
            select: { id: true, name: true },
          }),
          prisma.conversationMessage.groupBy({
            by: ['senderId'],
            where: { senderId: { in: ids } },
            _count: { _all: true },
          }),
          prisma.lead.groupBy({
            by: ['ownerId'],
            where: { ownerId: { in: ids } },
            _count: { _all: true },
          }),
        ]);
        const userById = new Map(users.map((u) => [u.id, u]));
        const sentById = new Map(sent.map((r) => [r.senderId, r._count._all]));
        const ownedById = new Map(owned.map((r) => [r.ownerId, r._count._all]));
        return ids
          .map((id) => userById.get(id))
          .filter((u): u is { id: string; name: string } => !!u)
          .map((u) => ({
            id: u.id,
            name: u.name,
            _count: {
              sentMessages: sentById.get(u.id) ?? 0,
              ownedLeads: ownedById.get(u.id) ?? 0,
            },
          }));
      })(),
      prisma.followUp.count({
        where: {
          organizationId: orgId,
          status: 'PENDING',
          scheduledAt: { lte: new Date(Date.now() + 24 * 3600 * 1000) },
        },
      }),
    ]);

    return apiOk({
      cards: {
        totalCustomers,
        newLeads,
        openConversations,
        conversionRate: totalLeads ? Math.round((wonLeads / totalLeads) * 1000) / 10 : 0,
        pendingFollowUps,
      },
      conversationsByDay: conversationsByDay.map((r) => ({ day: r.day, count: Number(r.count) })),
      leadsByStage: leadsByStage.map((s) => ({ name: s.name, color: s.color, count: s._count.leads })),
      recentActivities,
      topAgents: topAgents.map((a) => ({
        id: a.id,
        name: a.name,
        messages: a._count.sentMessages,
        leads: a._count.ownedLeads,
      })),
    });
  } catch (e: any) {
    if (e instanceof Response) return e;
    console.error(e);
    return apiErr('Gagal memuat statistik.', 500);
  }
}
