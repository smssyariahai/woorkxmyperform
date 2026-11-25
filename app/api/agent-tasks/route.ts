import { prisma } from '@/lib/db';
import { requirePermission, requireModule } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';
import { parseCommand } from '@/lib/agents/intent';
import { parseReportFormat } from '@/lib/agents/format';
import { getNineRouterConfig } from '@/lib/bot/ninerouter';
import { ensureAgents, enqueueTask, cancelTask, retryTask } from '@/lib/agents/scheduler';
import { publishAgentEvent } from '@/lib/agents/events';
import { setManualRest } from '@/lib/kantor/rest';
import type { PrismaClient as TenantPrismaClient } from '@prisma/tenant-client';

export const dynamic = 'force-dynamic';

/** GET /api/agent-tasks — daftar tugas agent */
export async function GET(req: Request) {
  try {
    const ctx = await requirePermission('INBOX_VIEW');
    await requireModule(ctx, 'kantor');
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const agentId = searchParams.get('agentId');
    // Wave 16 — riwayat chat per-user: `mine=1` hanya mengembalikan tugas
    // yang dibuat user yang sedang login (createdById = ctx.userId, diambil
    // dari sesi, bukan dari parameter — tidak bisa dipalsukan lewat URL).
    // Tanpa `mine`, perilaku lama dipertahankan (daftar org, mis. kanban).
    const mine = searchParams.get('mine') === '1';
    const where: any = { organizationId: ctx.organizationId };
    if (status) where.status = status;
    if (agentId) where.agentId = agentId;
    if (mine) where.createdById = ctx.userId;
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
      createdById: t.createdById,
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
    // Wave 13 fix — kirim nama SEMUA agent kantor (termasuk yang baru
    // dibuat lewat /kantor/agents) supaya parseCommand mengenalinya;
    // sebelumnya hanya 5 nama bawaan yang dikenali dan perintah ke agent
    // baru selalu jatuh ke Aria.
    const agentRows = await prisma.agent.findMany({
      where: { organizationId: ctx.organizationId },
      select: { name: true },
    });
    const intent = parseCommand(command, agentRows.map((r) => r.name));

    // --- perintah kontrol ---
    if (intent.control === 'wake' || intent.control === 'sleep') {
      const wantSleep = intent.control === 'sleep';
      // Fase 5b: "tidur"/"bangun" kini sesi MANUAL per-agent di DB tenant
      // (pengganti boolean org-wide in-memory) — agent berjalan ke kasur
      // mess-nya masing-masing; yang tanpa kasur tetap di tempatnya.
      const tprisma = prisma as unknown as TenantPrismaClient;
      const result = await setManualRest(tprisma, wantSleep);
      const sleeping = result.sleeping;
      await publishAgentEvent(ctx.organizationId, 'kantor.sleep_changed', { sleeping });
      await audit({
        organizationId: ctx.organizationId, userId: ctx.userId,
        action: sleeping ? 'KANTOR_SLEEP_ON' : 'KANTOR_SLEEP_OFF', module: 'KANTOR',
        description: `${ctx.name} ${sleeping ? 'menyalakan mode Tidur' : 'membangunkan agent'} lewat perintah "${command}"`,
        ipAddress: getClientIp(req),
      });
      return apiOk({
        reply: sleeping
          ? result.started.length > 0
            ? `Mode Tidur dinyalakan — ${result.started.length} agent berjalan ke mess untuk beristirahat.`
            : 'Mode Tidur sudah menyala — semua agent beristirahat.'
          : result.ended.length > 0
            ? intent.namedAgent
              ? `${intent.namedAgent} dibangunkan — semua agent ikut bangun (mode Tidur berlaku untuk seluruh kantor).`
              : 'Semua agent dibangunkan — mode Tidur dimatikan untuk seluruh kantor.'
            : 'Tidak ada agent yang sedang beristirahat.',
      });
    }
    if (intent.kind === 'control') {
      if (intent.control === 'cancel') {
        // Wave 16 — hanya tugas MILIK user yang bisa dibatalkan lewat
        // perintah "batalkan" (bukan tugas aktif user lain di kantor).
        const active = await prisma.agentTask.findFirst({
          where: { organizationId: ctx.organizationId, createdById: ctx.userId, status: { in: ['QUEUED', 'RUNNING', 'WAITING_APPROVAL'] } },
          orderBy: { createdAt: 'desc' },
        });
        if (!active) return apiOk({ reply: 'Tidak ada tugas yang sedang berjalan.' });
        await cancelTask(ctx.organizationId, active.id, ctx.userId);
        await audit({ organizationId: ctx.organizationId, userId: ctx.userId, action: 'CANCEL_AGENT_TASK', module: 'KANTOR', description: `${ctx.name} membatalkan tugas "${active.title}"`, ipAddress: getClientIp(req) });
        return apiOk({ reply: `Tugas "${active.title}" dihentikan.` });
      }
      if (intent.control === 'retry') {
        // Wave 16 — hanya tugas MILIK user yang bisa diulang lewat perintah
        // "ulangi" (bukan tugas gagal user lain di kantor).
        const pending = await prisma.agentTask.findFirst({
          where: { organizationId: ctx.organizationId, createdById: ctx.userId, status: { in: ['FAILED', 'CANCELLED'] } },
          orderBy: { createdAt: 'desc' },
        });
        if (!pending) return apiOk({ reply: 'Tidak ada tugas tertunda untuk dilanjutkan.' });
        await retryTask(ctx.organizationId, pending.id, ctx.userId);
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

    // Wave 4 — tandai tugas untuk AI: scheduler memakai planWithAI +
    // composeReportWithAI bila gateway 9Router aktif; bila nonaktif (atau
    // gagal dibaca) tugas berjalan dengan router kata kunci lama.
    let useAi = false;
    try {
      const cfg = await getNineRouterConfig();
      useAi = cfg.enabled && Boolean(cfg.baseUrl);
    } catch {
      useAi = false;
    }

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
        inputPayload: JSON.stringify({
          toolKey: intent.toolKey,
          toolArgs: intent.toolArgs,
          command,
          useAi,
          // Wave 6 — format file laporan yang diminta perintah
          // (pdf default; xlsx/docx/md hanya bila disebut eksplisit).
          reportFormat: parseReportFormat(command),
        }),
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
