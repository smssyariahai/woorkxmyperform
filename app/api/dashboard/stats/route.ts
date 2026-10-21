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
      prisma.activity.findMany({
        where: { organizationId: orgId },
        include: {
          actor: { select: { name: true } },
          customer: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 8,
      }),
      prisma.user.findMany({
        where: { memberships: { some: { organizationId: orgId, status: 'ACTIVE' } } },
        select: {
          id: true,
          name: true,
          _count: {
            select: {
              sentMessages: true,
              ownedLeads: true,
            },
          },
        },
        take: 5,
      }),
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
