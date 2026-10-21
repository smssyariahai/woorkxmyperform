import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';
import { ensureAgents } from '@/lib/agents/scheduler';
import { opStatusOf } from '@/lib/agents/display-status';

export const dynamic = 'force-dynamic';

/** GET /api/agents/:id — detail agent + tugas + aktivitas + pesan */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('INBOX_VIEW');
    await ensureAgents(ctx.organizationId);
    const agent = await prisma.agent.findFirst({
      where: { id: params.id, organizationId: ctx.organizationId },
      include: {
        tasks: { orderBy: { createdAt: 'desc' }, take: 10 },
        activities: { orderBy: { startedAt: 'desc' }, take: 20 },
      },
    });
    if (!agent) return apiErr('Agent tidak ditemukan.', 404);
    const activeTask = agent.tasks.find((t) => ['QUEUED', 'RUNNING', 'WAITING_APPROVAL'].includes(t.status)) ?? null;
    return apiOk({
      opStatus: opStatusOf({
        isEnabled: agent.isEnabled,
        currentStatus: agent.currentStatus,
        currentTask: activeTask ? { status: activeTask.status } : null,
      }),
      id: agent.id,
      name: agent.name,
      role: agent.role,
      description: agent.description,
      avatarColor: agent.avatarColor,
      skills: safeJson(agent.skills),
      systemInstructions: agent.systemInstructions,
      tools: safeJson(agent.tools),
      currentStatus: agent.currentStatus,
      currentTaskId: agent.currentTaskId,
      isEnabled: agent.isEnabled,
      tasks: agent.tasks,
      activities: agent.activities,
    });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat detail agent.', 500);
  }
}

/** PUT /api/agents/:id — ubah konfigurasi agent (nama, peran, skill, tools, dsb) */
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('TEAM_MANAGE');
    const body = await req.json();
    const agent = await prisma.agent.findFirst({
      where: { id: params.id, organizationId: ctx.organizationId },
    });
    if (!agent) return apiErr('Agent tidak ditemukan.', 404);

    const data: any = {};
    if (typeof body.name === 'string' && body.name.trim()) data.name = body.name.trim().slice(0, 50);
    if (typeof body.role === 'string') data.role = body.role.slice(0, 100);
    if (typeof body.description === 'string') data.description = body.description.slice(0, 500);
    if (typeof body.avatarColor === 'string') data.avatarColor = body.avatarColor.slice(0, 20);
    if (Array.isArray(body.skills)) data.skills = JSON.stringify(body.skills.slice(0, 20).map(String));
    if (typeof body.systemInstructions === 'string') data.systemInstructions = body.systemInstructions.slice(0, 4000);
    if (Array.isArray(body.tools)) data.tools = JSON.stringify(body.tools.slice(0, 20).map(String));
    if (typeof body.isEnabled === 'boolean') data.isEnabled = body.isEnabled;

    const updated = await prisma.agent.update({ where: { id: agent.id }, data });

    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'UPDATE_AGENT',
      module: 'KANTOR',
      description: `${ctx.name} mengubah konfigurasi agent ${updated.name}`,
      ipAddress: getClientIp(req),
    });

    return apiOk({ id: updated.id, name: updated.name });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menyimpan konfigurasi agent.', 500);
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
