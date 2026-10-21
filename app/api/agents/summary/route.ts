import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { ensureAgents } from '@/lib/agents/scheduler';
import { opStatusOf } from '@/lib/agents/display-status';

export const dynamic = 'force-dynamic';

/**
 * GET /api/agents/summary — ringkasan Kantor Virtual untuk HUD dashboard.
 * Semua angka dari data backend asli (DB), bukan dummy.
 */
export async function GET() {
  try {
    const ctx = await requirePermission('INBOX_VIEW');
    const orgId = ctx.organizationId;
    await ensureAgents(orgId);

    const agents = await prisma.agent.findMany({
      where: { organizationId: orgId },
      select: { id: true, name: true, isEnabled: true, currentStatus: true, currentTaskId: true },
    });
    const taskIds = agents.map((a) => a.currentTaskId).filter((x): x is string => !!x);
    const ctasks = taskIds.length
      ? await prisma.agentTask.findMany({ where: { id: { in: taskIds } }, select: { id: true, status: true } })
      : [];
    const ctaskMap = new Map(ctasks.map((t) => [t.id, t.status]));

    const byOp: Record<string, number> = { ONLINE: 0, WORKING: 0, IDLE: 0, ERROR: 0, OFFLINE: 0 };
    for (const a of agents) {
      const op = opStatusOf({
        isEnabled: a.isEnabled,
        currentStatus: a.currentStatus,
        currentTask: a.currentTaskId ? { status: ctaskMap.get(a.currentTaskId) ?? '' } : null,
      });
      byOp[op] = (byOp[op] ?? 0) + 1;
      if (op === 'IDLE') byOp.ONLINE += 1;
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [taskCounts, recentActivities, botCfg, todayUsage] = await Promise.all([
      prisma.agentTask.groupBy({
        by: ['status'],
        where: { organizationId: orgId },
        _count: { status: true },
      }),
      prisma.agentActivity.findMany({
        where: { organizationId: orgId },
        orderBy: { startedAt: 'desc' },
        take: 8,
        include: { agent: { select: { name: true, avatarColor: true } } },
      }),
      prisma.botConfig.findUnique({
        where: { organizationId: orgId },
        select: { creditBalance: true, isEnabled: true },
      }),
      prisma.botUsage.aggregate({
        where: { organizationId: orgId, createdAt: { gte: startOfDay }, status: 'CHARGED' },
        _sum: { amount: true },
        _count: { id: true },
      }),
    ]);

    const tasks: Record<string, number> = {};
    for (const g of taskCounts) tasks[g.status] = g._count.status;

    return apiOk({
      agents: {
        total: agents.length,
        online: byOp.ONLINE,
        working: byOp.WORKING,
        idle: byOp.IDLE,
        error: byOp.ERROR,
        offline: byOp.OFFLINE,
      },
      tasks: {
        running: tasks.RUNNING ?? 0,
        queued: tasks.QUEUED ?? 0,
        waitingApproval: tasks.WAITING_APPROVAL ?? 0,
        completed: tasks.COMPLETED ?? 0,
        failed: tasks.FAILED ?? 0,
      },
      activities: recentActivities.map((a) => ({
        id: a.id,
        agentName: a.agent.name,
        avatarColor: a.agent.avatarColor,
        type: a.activityType,
        description: a.description,
        startedAt: a.startedAt,
      })),
      credit: {
        balance: botCfg?.creditBalance ?? 0,
        botEnabled: botCfg?.isEnabled ?? false,
        usedToday: todayUsage._sum.amount ?? 0,
        repliesToday: todayUsage._count.id ?? 0,
      },
    });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat ringkasan.', 500);
  }
}
