import { prisma } from '@/lib/db';
import { requirePermission, requireModule } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { ensureAgents } from '@/lib/agents/scheduler';
import { opStatusOf } from '@/lib/agents/display-status';

export const dynamic = 'force-dynamic';

/** GET /api/agents — daftar agent virtual organisasi */
export async function GET() {
  try {
    const ctx = await requirePermission('INBOX_VIEW');
    await requireModule(ctx, 'kantor');
    await ensureAgents(ctx.organizationId);
    const agents = await prisma.agent.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { name: 'asc' },
    });
    // ambil tugas aktif tiap agent untuk ditampilkan di denah
    const taskIds = agents.map((a) => a.currentTaskId).filter((x): x is string => !!x);
    const ctasks = taskIds.length
      ? await prisma.agentTask.findMany({
          where: { id: { in: taskIds } },
          select: { id: true, title: true, status: true, progress: true },
        })
      : [];
    const ctaskMap = new Map(ctasks.map((t) => [t.id, t]));
    const data = agents.map((a) => ({
      id: a.id,
      name: a.name,
      role: a.role,
      description: a.description,
      avatarColor: a.avatarColor,
      skills: safeJson(a.skills),
      tools: safeJson(a.tools),
      currentStatus: a.currentStatus,
      currentTaskId: a.currentTaskId,
      currentTask: a.currentTaskId ? ctaskMap.get(a.currentTaskId) ?? null : null,
      isEnabled: a.isEnabled,
      opStatus: opStatusOf({
        isEnabled: a.isEnabled,
        currentStatus: a.currentStatus,
        currentTask: a.currentTaskId ? ctaskMap.get(a.currentTaskId) ?? null : null,
      }),
    }));
    return apiOk(data);
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat agent.', 500);
  }
}

function safeJson(s: string): string[] {
  try {
    const v = JSON.parse(s || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
