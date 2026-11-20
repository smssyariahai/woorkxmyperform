// GET /api/kantor/activity — aktivitas terbaru kantor: gabungan AgentActivity
// + TaskEvent, terurut waktu desc (maks 50). Read-only.
// Guard: auth + modul 'kantor' (tidak ada permission KANTOR_* di v1).
import { prisma } from '@/lib/db';
import { requireAuth, requireModule } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';

export const dynamic = 'force-dynamic';

interface KantorActivityItem {
  id: string;
  kind: 'activity' | 'event';
  agentId: string | null;
  agentName: string | null;
  taskId: string | null;
  type: string;
  message: string;
  at: string;
}

export async function GET() {
  try {
    const ctx = await requireAuth();
    await requireModule(ctx, 'kantor');
    const [activities, events] = await Promise.all([
      prisma.agentActivity.findMany({
        where: { organizationId: ctx.organizationId },
        orderBy: { startedAt: 'desc' },
        take: 30,
        include: { agent: { select: { id: true, name: true } } },
      }),
      prisma.taskEvent.findMany({
        where: { organizationId: ctx.organizationId },
        orderBy: { createdAt: 'desc' },
        take: 30,
        include: {
          task: { select: { id: true, agentId: true, agent: { select: { name: true } } } },
        },
      }),
    ]);

    const items: KantorActivityItem[] = [
      ...activities.map((a) => ({
        id: a.id,
        kind: 'activity' as const,
        agentId: a.agentId,
        agentName: a.agent?.name ?? null,
        taskId: null,
        type: a.activityType,
        message: a.description,
        at: a.startedAt.toISOString(),
      })),
      ...events.map((e) => ({
        id: e.id,
        kind: 'event' as const,
        agentId: e.task.agentId,
        agentName: e.task.agent?.name ?? null,
        taskId: e.taskId,
        type: e.eventType,
        message: e.message,
        at: e.createdAt.toISOString(),
      })),
    ];
    items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    return apiOk({ activity: items.slice(0, 50) });
  } catch (e: unknown) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat aktivitas kantor.', 500);
  }
}
