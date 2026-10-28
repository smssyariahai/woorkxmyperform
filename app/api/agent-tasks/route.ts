import { prisma } from '@/lib/db';
import { requirePermission, requireModule } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';
import { parseCommand } from '@/lib/agents/intent';
import { ensureAgents, enqueueTask, cancelTask, retryTask } from '@/lib/agents/scheduler';
import { publishAgentEvent } from '@/lib/agents/events';

export const dynamic = 'force-dynamic';

/** GET /api/agent-tasks — daftar tugas agent */
export async function GET(req: Request) {
  try {
    const ctx = await requirePermission('INBOX_VIEW');
    await requireModule(ctx, 'kantor');
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const agentId = searchParams.get('agentId');
    const where: any = { organizationId: ctx.organizationId };
    if (status) where.status = status;
    if (agentId) where.agentId = agentId;
    const items = await prisma.agentTask.findMany({
      where,
      include: {
        agent: { select: { id: true, name: true, avatarColor: true } },
        events: { orderBy: { createdAt: 'desc' }, take: 1, select: { eventType: true, message: true, createdAt: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    const data = items.map((t: any) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      priority: t.priority,
      status: t.status,
      progress: t.progress,
      errorMessage: t.errorMessage,
      resultPayload: t.resultPayload,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      agent: t.agent,
      inputPayload: t.inputPayload || '{}',
      latestEvent: t.events?.[0]
        ? { eventType: t.events[0].eventType, message: t.events[0].message, createdAt: t.events[0].createdAt }
        : null,
    }));
    return apiOk(data);
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat tugas.', 500);
  }
}

/** POST /api/agent-tasks — kirim perintah via command bar */
export async function POST(req: Request) {
  try {
    const ctx = await requirePermission('INBOX_REPLY');
    await requireModule(ctx, 'kantor');
    const body = await req.json();
    const command = String(body.command || '').trim();
    if (!command) return apiErr('Perintah tidak boleh kosong.', 422);

    await ensureAgents(ctx.organizationId);
    const intent = parseCommand(command);

    // --- perintah kontrol ---
    if (intent.kind === 'control') {
      if (intent.control === 'cancel') {
        const active = await prisma.agentTask.findFirst({
          where: { organizationId: ctx.organizationId, status: { in: ['QUEUED', 'RUNNING', 'WAITING_APPROVAL'] } },
          orderBy: { createdAt: 'desc' },
        });
        if (!active) return apiOk({ reply: 'Tidak ada tugas yang sedang berjalan.' });
        await cancelTask(ctx.organizationId, active.id, ctx.userId);
        await audit({ organizationId: ctx.organizationId, userId: ctx.userId, action: 'CANCEL_AGENT_TASK', module: 'KANTOR', description: `${ctx.name} membatalkan tugas "${active.title}"`, ipAddress: getClientIp(req) });
        return apiOk({ reply: `Tugas "${active.title}" dihentikan.` });
      }
      if (intent.control === 'retry') {
        const pending = await prisma.agentTask.findFirst({
          where: { organizationId: ctx.organizationId, status: { in: ['FAILED', 'CANCELLED'] } },
          orderBy: { createdAt: 'desc' },
        });
        if (!pending) return apiOk({ reply: 'Tidak ada tugas tertunda untuk dilanjutkan.' });
        await retryTask(ctx.organizationId, pending.id);
        return apiOk({ reply: `Tugas "${pending.title}" dilanjutkan kembali.`, taskId: pending.id });
      }
      if (intent.control === 'approve') {
        return apiOk({ reply: 'Silakan pilih pengajuan pada panel Persetujuan lalu tekan Setujui/Tolak.', needReview: true });
      }
    }

    // --- buat tugas baru ---
    const agent = await prisma.agent.findFirst({
      where: { organizationId: ctx.organizationId, name: { equals: intent.agentName, mode: 'insensitive' } },
    });
    if (!agent) return apiErr(`Agent ${intent.agentName} tidak ditemukan.`, 404);
    if (!agent.isEnabled) return apiErr(`Agent ${agent.name} sedang nonaktif.`, 422);

    const task = await prisma.agentTask.create({
      data: {
        organizationId: ctx.organizationId,
        title: intent.title,
        description: intent.description,
        agentId: agent.id,
        createdById: ctx.userId,
        priority: intent.priority,
        status: 'QUEUED',
        requiresApproval: intent.requiresApproval,
        inputPayload: JSON.stringify({ toolKey: intent.toolKey, toolArgs: intent.toolArgs, command }),
      },
      include: { agent: { select: { id: true, name: true, avatarColor: true } } },
    });

    await publishAgentEvent(ctx.organizationId, 'task.created', {
      taskId: task.id, title: task.title, agentName: agent.name,
    });
    await enqueueTask(ctx.organizationId, task.id);

    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'CREATE_AGENT_TASK',
      module: 'KANTOR',
      description: `${ctx.name} memerintah ${agent.name}: ${intent.title}`,
      ipAddress: getClientIp(req),
    });

    return apiOk({ reply: intent.reply, taskId: task.id, agent: task.agent }, 201);
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memproses perintah.', 500);
  }
}
