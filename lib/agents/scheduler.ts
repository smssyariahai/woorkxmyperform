import { prisma } from '@/lib/db';
import { getTool } from './tools';
import { publishAgentEvent } from './events';
import type { AgentState } from './types';

/**
 * Scheduler in-process untuk tugas AI Agent (Master Prompt §3, §8).
 * Satu antrean per organisasi; eksekusi sekuensial per agent (tidak ada
 * pekerjaan bertentangan tanpa antrean). Retry exponential backoff.
 * Batasan jujur: berjalan dalam proses `next start`; untuk multi-instance
 * gunakan worker terpisah + Redis.
 */

const running = new Set<string>(); // taskId yang sedang diproses

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function setAgentStatus(orgId: string, agentId: string, status: AgentState, taskId: string | null = null) {
  await prisma.agent.update({
    where: { id: agentId },
    data: { currentStatus: status, currentTaskId: taskId },
  });
  const agent = await prisma.agent.findUnique({ where: { id: agentId }, select: { name: true } });
  await publishAgentEvent(orgId, 'agent.status_changed', {
    agentId, name: agent?.name, status, taskId,
  });
}

async function logActivity(orgId: string, agentId: string, type: string, description: string, end = false) {
  if (!end) {
    await prisma.agentActivity.create({
      data: { organizationId: orgId, agentId, activityType: type, description },
    });
  } else {
    // tutup aktivitas terbuka terakhir tipe tsb
    const open = await prisma.agentActivity.findFirst({
      where: { organizationId: orgId, agentId, activityType: type, endedAt: null },
      orderBy: { startedAt: 'desc' },
    });
    if (open) await prisma.agentActivity.update({ where: { id: open.id }, data: { endedAt: new Date() } });
  }
  const agent = await prisma.agent.findUnique({ where: { id: agentId }, select: { name: true } });
  await publishAgentEvent(orgId, 'agent.activity_updated', {
    agentId, name: agent?.name, activityType: type, description,
  });
}

async function addEvent(orgId: string, taskId: string, eventType: string, message: string, payload: any = {}) {
  const ev = await prisma.taskEvent.create({
    data: {
      organizationId: orgId, taskId, eventType, message,
      payload: JSON.stringify(payload),
    },
  });
  await publishAgentEvent(orgId, `task.${eventType}`, {
    taskId, message, payload, at: ev.createdAt.toISOString(),
  });
  return ev;
}

async function setTask(orgId: string, taskId: string, data: any, eventType?: string, eventMsg?: string) {
  const task = await prisma.agentTask.update({ where: { id: taskId }, data });
  if (eventType) await addEvent(orgId, taskId, eventType, eventMsg ?? '');
  await publishAgentEvent(orgId, 'task.progress', {
    taskId, status: task.status, progress: task.progress,
  });
  return task;
}

/** Masukkan tugas ke antrean dan picu worker. */
export async function enqueueTask(organizationId: string, taskId: string) {
  await addEvent(organizationId, taskId, 'queued', 'Tugas masuk antrean.');
  // picu pemrosesan async (tidak menahan request HTTP — Master Prompt §7)
  setImmediate(() => void processQueue(organizationId).catch((e) => console.error('[agents] queue error:', e)));
}

async function processQueue(organizationId: string) {
  // ambil 1 tugas QUEUED prioritas tertinggi yang agentnya tidak sibuk
  const task = await prisma.agentTask.findFirst({
    where: { organizationId, status: 'QUEUED' },
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    include: { agent: true },
  });
  if (!task || !task.agent || running.has(task.id)) return;
  if (!task.agent.isEnabled) {
    await setTask(organizationId, task.id, { status: 'CANCELLED' }, 'cancelled', 'Agent nonaktif — tugas dibatalkan.');
    return setImmediate(() => void processQueue(organizationId));
  }
  // agent sibuk? biarkan antre
  const busy = await prisma.agentTask.count({
    where: { agentId: task.agentId, status: 'RUNNING', id: { not: task.id } },
  });
  if (busy > 0) return;

  running.add(task.id);
  try {
    await executeTask(organizationId, task.id);
  } finally {
    running.delete(task.id);
    // lanjutkan antrean
    setImmediate(() => void processQueue(organizationId).catch(() => {}));
  }
}

async function executeTask(organizationId: string, taskId: string) {
  const task = await prisma.agentTask.findUnique({
    where: { id: taskId },
    include: { agent: true },
  });
  if (!task || !task.agent) return;
  const agent = task.agent;

  const attempt = task.attempts + 1;
  await setTask(organizationId, taskId, {
    status: 'RUNNING', startedAt: task.startedAt ?? new Date(), attempts: attempt, progress: 5,
  }, 'started', `${agent.name} mulai mengerjakan (percobaan ${attempt}).`);
  await setAgentStatus(organizationId, agent.id, 'EXECUTING_TASK', taskId);
  await logActivity(organizationId, agent.id, 'EXECUTING_TASK', task.title);

  try {
    // --- butuh persetujuan di awal? ---
    if (task.requiresApproval) {
      await requestApproval(organizationId, task, agent, 'GENERAL', task.description || task.title);
      await setTask(organizationId, taskId, { status: 'WAITING_APPROVAL', progress: 15 }, 'waiting_approval', 'Menunggu persetujuan pengguna.');
      await setAgentStatus(organizationId, agent.id, 'WAITING_APPROVAL', taskId);
      return;
    }

    await setAgentStatus(organizationId, agent.id, 'THINKING', taskId);
    await sleep(600);
    await setTask(organizationId, taskId, { progress: 30 });

    // --- jalankan tool utama ---
    let resultSummary = 'Tugas dicatat tanpa tool khusus.';
    let resultData: any = {};
    const payload = JSON.parse(task.inputPayload || '{}');
    if (payload.toolKey) {
      const tool = getTool(payload.toolKey);
      if (!tool) throw new Error(`Tool "${payload.toolKey}" tidak dikenal.`);
      const allowed: string[] = JSON.parse(agent.tools || '[]');
      if (!allowed.includes(tool.key)) throw new Error(`Agent ${agent.name} tidak diizinkan memakai tool ${tool.key}.`);
      await setAgentStatus(organizationId, agent.id, 'WORKING', taskId);
      const out = await tool.run(
        { organizationId, agentId: agent.id, agentName: agent.name, taskId },
        payload.toolArgs || {}
      );
      resultSummary = out.summary;
      resultData = out.data;
      // tool sensitif yang butuh approval di tengah jalan
      if (tool.needsApproval && !task.requiresApproval) {
        await requestApproval(organizationId, task, agent, 'TOOL', `Tool "${tool.name}" membutuhkan persetujuan. ${resultSummary}`);
        await setTask(organizationId, taskId, {
          status: 'WAITING_APPROVAL', progress: 60,
          resultPayload: JSON.stringify({ summary: resultSummary, data: resultData }),
        }, 'waiting_approval', 'Hasil parsial siap — menunggu persetujuan untuk lanjut.');
        await setAgentStatus(organizationId, agent.id, 'WAITING_APPROVAL', taskId);
        return;
      }
    }

    await setTask(organizationId, taskId, { progress: 85 });
    await sleep(400);

    const finalSummary = resultSummary;
    await setTask(organizationId, taskId, {
      status: 'COMPLETED', progress: 100, completedAt: new Date(),
      resultPayload: JSON.stringify({ summary: finalSummary, data: resultData }),
    }, 'completed', `${agent.name} menyelesaikan tugas.`);
    await setAgentStatus(organizationId, agent.id, 'COMPLETED', null);
    await logActivity(organizationId, agent.id, 'EXECUTING_TASK', task.title, true);
    await publishAgentEvent(organizationId, 'notification.created', {
      type: 'TASK_COMPLETED', title: 'Tugas selesai', message: `${agent.name}: ${task.title}`,
    });
    // kembali siaga setelah jeda singkat
    setTimeout(() => {
      setAgentStatus(organizationId, agent.id, 'IDLE', null).catch(() => {});
    }, 4000);
  } catch (e: any) {
    const msg = e?.message || 'Kesalahan tidak dikenal.';
    await addEvent(organizationId, taskId, 'failed', `Gagal: ${msg}`);
    // error permanen (izin tool / tool tidak dikenal) tidak akan sembuh dengan retry
    const permanent = /tidak diizinkan memakai tool|tidak dikenal/.test(msg);
    if (!permanent && attempt < task.maxAttempts) {
      const backoff = Math.min(2000 * 2 ** (attempt - 1), 15000);
      await setTask(organizationId, taskId, { status: 'QUEUED', progress: 0, errorMessage: msg });
      await setAgentStatus(organizationId, agent.id, 'ERROR', taskId);
      await sleep(backoff);
      await setAgentStatus(organizationId, agent.id, 'IDLE', null);
      await enqueueTask(organizationId, taskId); // retry via antrean
    } else {
      await setTask(organizationId, taskId, { status: 'FAILED', errorMessage: msg, completedAt: new Date() });
      await setAgentStatus(organizationId, agent.id, 'ERROR', taskId);
      await logActivity(organizationId, agent.id, 'EXECUTING_TASK', task.title, true);
      await publishAgentEvent(organizationId, 'notification.created', {
        type: 'TASK_FAILED', title: 'Tugas gagal', message: `${agent.name}: ${task.title} — ${msg}`,
      });
    }
  }
}

async function requestApproval(org: string, task: any, agent: any, type: string, description: string) {
  const ap = await prisma.approval.create({
    data: {
      organizationId: org, taskId: task.id,
      requestedByAgentId: agent.id, approvalType: type, description,
    },
  });
  await publishAgentEvent(org, 'task.waiting_approval', {
    taskId: task.id, approvalId: ap.id, agentName: agent.name, description,
  });
  await publishAgentEvent(org, 'notification.created', {
    type: 'APPROVAL_NEEDED', title: 'Butuh persetujuan',
    message: `${agent.name} meminta persetujuan: ${task.title}`,
  });
}

/** Batalkan tugas (RUNNING/QUEUED/WAITING_APPROVAL). */
export async function cancelTask(organizationId: string, taskId: string, userId: string) {
  const task = await prisma.agentTask.findFirst({ where: { id: taskId, organizationId }, include: { agent: true } });
  if (!task) throw new Error('Tugas tidak ditemukan.');
  if (!['QUEUED', 'RUNNING', 'WAITING_APPROVAL'].includes(task.status)) throw new Error('Tugas sudah final.');
  await setTask(organizationId, taskId, { status: 'CANCELLED', completedAt: new Date() }, 'cancelled', 'Tugas dibatalkan pengguna.');
  if (task.agentId) {
    await setAgentStatus(organizationId, task.agentId, 'IDLE', null);
    await logActivity(organizationId, task.agentId, 'EXECUTING_TASK', task.title, true);
    running.delete(taskId);
  }
  return taskId;
}

/** Ulangi tugas FAILED/CANCELLED. */
export async function retryTask(organizationId: string, taskId: string) {
  const task = await prisma.agentTask.findFirst({ where: { id: taskId, organizationId } });
  if (!task) throw new Error('Tugas tidak ditemukan.');
  if (!['FAILED', 'CANCELLED'].includes(task.status)) throw new Error('Hanya tugas gagal/dibatalkan yang bisa diulang.');
  await setTask(organizationId, taskId, { status: 'QUEUED', progress: 0, errorMessage: null, attempts: 0 });
  await enqueueTask(organizationId, taskId);
  return taskId;
}

/** Pengguna menyetujui / menolak approval. */
export async function reviewApproval(organizationId: string, approvalId: string, userId: string, approve: boolean) {
  const ap = await prisma.approval.findFirst({
    where: { id: approvalId, organizationId, status: 'PENDING' },
    include: { task: { include: { agent: true } } },
  });
  if (!ap) throw new Error('Pengajuan tidak ditemukan / sudah diproses.');
  await prisma.approval.update({
    where: { id: ap.id },
    data: { status: approve ? 'APPROVED' : 'REJECTED', reviewedById: userId, reviewedAt: new Date() },
  });
  const task = ap.task;
  if (approve) {
    await prisma.agentTask.update({ where: { id: task.id }, data: { requiresApproval: false } });
    await addEvent(organizationId, task.id, 'progress', 'Disetujui pengguna — lanjut eksekusi.');
    // lanjutkan: set QUEUED agar worker mengeksekusi ulang sisa langkah
    await setTask(organizationId, task.id, { status: 'QUEUED', progress: Math.max(task.progress, 60) });
    await enqueueTask(organizationId, task.id);
  } else {
    await setTask(organizationId, task.id, { status: 'CANCELLED', completedAt: new Date() }, 'cancelled', 'Ditolak pengguna pada tahap persetujuan.');
    if (task.agentId) {
      await setAgentStatus(organizationId, task.agentId, 'IDLE', null);
      await logActivity(organizationId, task.agentId, 'EXECUTING_TASK', task.title, true);
    }
  }
  await publishAgentEvent(organizationId, 'task.progress', { taskId: task.id, status: approve ? 'QUEUED' : 'CANCELLED' });
  return ap.id;
}

/** Pastikan 5 agent bawaan ada untuk organisasi ini (idempotent). */
export async function ensureAgents(organizationId: string) {
  const { AGENT_DEFINITIONS } = await import('./registry');
  for (const def of AGENT_DEFINITIONS) {
    await prisma.agent.upsert({
      where: { organizationId_name: { organizationId, name: def.name } },
      update: {
        role: def.role,
        description: def.description,
        avatarColor: def.avatarColor,
        skills: JSON.stringify(def.skills),
        systemInstructions: def.systemInstructions,
        tools: JSON.stringify(def.tools),
      },
      create: {
        organizationId,
        name: def.name,
        role: def.role,
        description: def.description,
        avatarColor: def.avatarColor,
        skills: JSON.stringify(def.skills),
        systemInstructions: def.systemInstructions,
        tools: JSON.stringify(def.tools),
      },
    });
  }
  const agents = await prisma.agent.findMany({ where: { organizationId }, select: { id: true, name: true } });
  for (const a of agents) {
    await publishAgentEvent(organizationId, 'agent.connected', { agentId: a.id, name: a.name });
  }
}
