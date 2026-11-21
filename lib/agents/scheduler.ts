import { prisma } from '@/lib/db';
import { getTool, allowedTools, type ToolDef } from './tools';
import { planWithAI, composeReportWithAI, type AgentAiProfile, type AgentAiToolInfo } from './ai';
import { formatBulanTahun } from './month';
import { generateTaskReport, type ReportFileInfo } from './reports';
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

/**
 * Wave 4 — profil agent untuk mesin AI (lib/agents/ai.ts), diambil dari
 * row Agent di DB. Tidak pernah berisi apiKey / rahasia apa pun.
 */
function buildAgentProfile(agent: any, organizationId: string): AgentAiProfile {
  let tools: string[] = [];
  try {
    const parsed = JSON.parse(agent.tools || '[]');
    if (Array.isArray(parsed)) tools = parsed.filter((t) => typeof t === 'string');
  } catch {
    tools = [];
  }
  return {
    name: agent.name,
    role: agent.role,
    systemInstructions: agent.systemInstructions ?? null,
    tools,
    organizationId,
  };
}

/** Petunjuk argumen per tool untuk perencanaan AI (bukan skema validasi). */
const TOOL_ARGS_HINT: Record<string, string> = {
  rekap_keuangan: '{ year: number (mis. 2026), month: number 1-12 }',
  daftar_tugas: '{ status?: string (QUEUED/RUNNING/COMPLETED/dll), agentName?: string }',
  delegasi_tugas: '{ agentName: string (nama agent tujuan), title: string, description?: string }',
};

/** Daftar tool yang boleh dipakai agent, dalam bentuk info untuk AI. */
function buildToolInfos(agent: any): AgentAiToolInfo[] {
  const allowed: ToolDef[] = allowedTools(agent.tools || '[]');
  return allowed.map((t) => ({
    key: t.key,
    name: t.name,
    description: t.description,
    args: TOOL_ARGS_HINT[t.key] ?? '{} (tanpa argumen)',
  }));
}

/**
 * P0-2 — sentinel penghentian eksekusi. Dilempar saat tugas ternyata sudah
 * bukan RUNNING lagi (mis. dibatalkan pengguna di tengah jalan) dan ditangkap
 * secara terpisah di `executeTask` — JANGAN masuk jalur retry/FAILED.
 */
export class TaskAbortedError extends Error {
  constructor(taskId: string) {
    super(`Tugas ${taskId} dibatalkan selama eksekusi.`);
    this.name = 'TaskAbortedError';
  }
}

/** P0-2 — true hanya bila status tugas di DB saat ini masih RUNNING. */
async function isStillRunning(taskId: string): Promise<boolean> {
  const t = await prisma.agentTask.findUnique({ where: { id: taskId }, select: { status: true } });
  return t?.status === 'RUNNING';
}

/** P0-2 — lempar TaskAbortedError bila tugas sudah bukan RUNNING lagi. */
async function assertStillRunning(taskId: string): Promise<void> {
  if (!(await isStillRunning(taskId))) throw new TaskAbortedError(taskId);
}

/**
 * P0-2 — bersih-bersih setelah abort: kembalikan agent ke IDLE + tutup
 * aktivitas terbuka HANYA bila agent itu masih menunjuk tugas ini
 * (baca ulang dulu — cancelTask mungkin sudah melakukannya).
 */
async function cleanupAfterAbort(organizationId: string, agentId: string, taskId: string, taskTitle: string) {
  const agent = await prisma.agent.findUnique({ where: { id: agentId }, select: { currentTaskId: true } });
  if (agent?.currentTaskId === taskId) {
    await setAgentStatus(organizationId, agentId, 'IDLE', null);
    await logActivity(organizationId, agentId, 'EXECUTING_TASK', taskTitle, true);
  }
}

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

  // P0-5 — klaim atomik: hanya satu pemicu yang berhasil mengubah
  // QUEUED -> RUNNING (sekaligus menaikkan attempts). Bila count 0,
  // tugas sudah diklaim pihak lain — jangan eksekusi.
  const claimed = await prisma.agentTask.updateMany({
    where: { id: task.id, status: 'QUEUED' },
    data: { status: 'RUNNING', startedAt: new Date(), attempts: { increment: 1 } },
  });
  if (claimed.count !== 1) return;

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

  // P0-5 — entry-check: tugas harus sudah RUNNING karena sudah diklaim
  // secara atomik di processQueue. P0-2(a) — bila status bukan RUNNING
  // (mis. sudah CANCELLED di antara klaim dan eksekusi), langsung return
  // tanpa mengubah apa pun.
  if (task.status !== 'RUNNING') return;

  // P0-5 — attempts SUDAH dinaikkan saat klaim di processQueue; jangan
  // naikkan dua kali. `attempt` di sini = nomor percobaan saat ini.
  const attempt = task.attempts;
  await setTask(organizationId, taskId, {
    status: 'RUNNING', startedAt: task.startedAt ?? new Date(), progress: 5,
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

    const payload = JSON.parse(task.inputPayload || '{}');
    const command: string = typeof payload.command === 'string' && payload.command.trim()
      ? payload.command
      : task.description || task.title;
    const useAi: boolean = payload.useAi === true;
    const agentProfile = buildAgentProfile(agent, organizationId);
    // Tool efektif: default dari intent (router kata kunci); bila AI
    // berhasil merencanakan, diganti hasil plan di bawah.
    let effectiveToolKey: string | null = payload.toolKey ?? null;
    let effectiveToolArgs: Record<string, any> = payload.toolArgs || {};
    // P0-3 — bila hasil parsial tool sudah tersimpan (approval di tengah),
    // JANGAN rencanakan ulang: pakai tool + hasil tersimpan itu.
    let storedResult: any = null;
    try { storedResult = JSON.parse(task.resultPayload || 'null'); } catch { storedResult = null; }
    const hasStoredToolResult =
      storedResult?.toolExecuted === true &&
      typeof storedResult?.toolKey === 'string' &&
      typeof storedResult?.summary === 'string';

    // --- fase 1: memahami perintah (~1,5 detik, TERLIHAT di UI) ---
    // Tool-nya memang query DB yang cepat (milisdetik); fase ini dibuat
    // terlihat supaya pengguna bisa mengikuti agent bekerja — hasil tool
    // tetap hasil asli, bukan dipalsukan. Progress ditulis ke DB tiap
    // langkah supaya polling UI bisa mengikutinya.
    await setAgentStatus(organizationId, agent.id, 'THINKING', taskId);
    await setTask(organizationId, taskId, { progress: 10 }, 'progress', 'Memahami perintah…');
    // Wave 4 — perencanaan AI (awal eksekusi, setelah klaim atomik,
    // sebelum memilih tool). planWithAI tidak pernah throw; null = AI
    // gagal/tidak tersedia -> fallback ke pemetaan intent seperti semula.
    // { toolKey: null } = AI menjawab "tidak ada tool yang cocok" -> jalan
    // tanpa tool, tapi tetap lanjut ke langkah compose supaya AI menjelaskan
    // dengan jujur apa yang ia pahami dan alternatifnya.
    if (useAi && !hasStoredToolResult) {
      const toolInfos = buildToolInfos(agent);
      const plan = await planWithAI(command, agentProfile, toolInfos);
      // P0-2 — batal selama AI merencanakan (bisa 10–30 detik) -> buang
      // hasil, jangan lanjut, jangan tulis COMPLETED.
      await assertStillRunning(taskId);
      if (plan) {
        if (plan.toolKey) {
          effectiveToolKey = plan.toolKey;
          effectiveToolArgs = plan.toolArgs || {};
        } else {
          effectiveToolKey = null;
          effectiveToolArgs = {};
        }
      }
    } else if (hasStoredToolResult) {
      effectiveToolKey = storedResult.toolKey;
    }
    await sleep(750);
    // P0-2(d) — batal di tengah jeda -> berhenti, jangan lanjut.
    await assertStillRunning(taskId);
    await setTask(organizationId, taskId, { progress: 20 });
    await sleep(750);
    await assertStillRunning(taskId);
    await setTask(organizationId, taskId, { progress: 30 });

    // --- jalankan tool utama ---
    let resultSummary = 'Tugas dicatat tanpa tool khusus.';
    let resultData: any = {};
    if (effectiveToolKey) {
      // P0-3 — approval di TENGAH: tool sudah jalan sebelum WAITING_APPROVAL
      // dan hasil parsial tersimpan (penanda toolExecuted + toolKey yang sama)
      // -> LEWATI tool.run() dan pakai hasil tersimpan.
      const alreadyExecuted =
        hasStoredToolResult && storedResult?.toolKey === effectiveToolKey;
      if (alreadyExecuted) {
        resultSummary = storedResult.summary;
        resultData = storedResult.data ?? {};
      } else {
        const tool = getTool(effectiveToolKey);
        if (!tool) throw new Error(`Tool "${effectiveToolKey}" tidak dikenal.`);
        const allowed: string[] = JSON.parse(agent.tools || '[]');
        if (!allowed.includes(tool.key)) throw new Error(`Agent ${agent.name} tidak diizinkan memakai tool ${tool.key}.`);
        await setAgentStatus(organizationId, agent.id, 'WORKING', taskId);
        // P0-2(b) — jangan jalankan tool sensitif bila tugas sudah dibatalkan.
        await assertStillRunning(taskId);
        const out = await tool.run(
          { organizationId, agentId: agent.id, agentName: agent.name, taskId },
          effectiveToolArgs || {}
        );
        // P0-2(c) — batal selama tool jalan -> berhenti sebelum memakai hasil.
        await assertStillRunning(taskId);
        resultSummary = out.summary;
        resultData = out.data;
        // tool sensitif yang butuh approval di tengah jalan
        if (tool.needsApproval && !task.requiresApproval) {
          await requestApproval(organizationId, task, agent, 'TOOL', `Tool "${tool.name}" membutuhkan persetujuan. ${resultSummary}`);
          await setTask(organizationId, taskId, {
            status: 'WAITING_APPROVAL', progress: 60,
            // P0-3 — penanda agar setelah approve tool TIDAK dijalankan lagi.
            resultPayload: JSON.stringify({ summary: resultSummary, data: resultData, toolExecuted: true, toolKey: tool.key }),
          }, 'waiting_approval', 'Hasil parsial siap — menunggu persetujuan untuk lanjut.');
          await setAgentStatus(organizationId, agent.id, 'WAITING_APPROVAL', taskId);
          return;
        }
      }
    }

    // --- fase 3: menyusun laporan detail (Wave 4) ---
    // (Jalur approval di tengah sudah return di atas; yang sampai sini
    // tidak butuh persetujuan atau sudah disetujui dengan hasil tersimpan —
    // termasuk jalur pasca-approve, karena compose dipanggil di sini dari
    // hasil tool yang sudah ada, bukan hanya di jalur normal.)
    // Bila AI tersedia, composeReportWithAI menyusun laporan DETAIL
    // (Markdown Bahasa Indonesia) dari hasil tool; bila null (AI gagal /
    // tidak tersedia) dipakai ringkasan tool lama — jujur, tanpa karangan.
    await setAgentStatus(organizationId, agent.id, 'WORKING', taskId);
    await setTask(organizationId, taskId, { progress: 60 }, 'progress', 'Hasil diperoleh — menyusun laporan detail…');
    let finalSummary = resultSummary;
    let aiReport = false;
    if (useAi) {
      let monthLabel: string | undefined;
      if (effectiveToolKey === 'rekap_keuangan') {
        const y = Number(effectiveToolArgs?.year);
        const m = Number(effectiveToolArgs?.month);
        if (y && m >= 1 && m <= 12) monthLabel = formatBulanTahun(y, m);
      }
      const aiText = await composeReportWithAI(
        agentProfile,
        command,
        effectiveToolKey,
        { summary: resultSummary, data: resultData },
        { monthLabel, organizationId }
      );
      // P0-2 — batal selama AI menyusun (bisa 10–30 detik) -> buang hasil,
      // jangan lanjut, jangan tulis COMPLETED.
      await assertStillRunning(taskId);
      if (aiText) {
        finalSummary = aiText;
        aiReport = true;
      }
    }
    await setTask(organizationId, taskId, { progress: 85 });
    await sleep(500);
    await assertStillRunning(taskId);

    // P0-2(e) — cek terakhir sebelum menulis COMPLETED.
    await assertStillRunning(taskId);
    // File laporan: dibuat di SINI (satu titik finalisasi) supaya jalur
    // normal maupun jalur approve (hasil parsial tersimpan + toolExecuted)
    // sama-sama mendapat file. Best-effort — gagal membuat file tidak
    // menggagalkan tugas (reportFile: null). Kontrak resultPayload:
    // { summary, data, reportFile: { path, name, mime, size } | null }.
    let reportFile: ReportFileInfo | null = null;
    try {
      reportFile = await generateTaskReport({
        organizationId,
        taskId,
        // Wave 4 — tool hasil plan AI (bukan intent) + summary teks AI
        // untuk file laporan; file keuangan tetap berbasis angka tool.
        toolKey: effectiveToolKey,
        title: task.title,
        agentName: agent.name,
        summary: finalSummary,
        data: resultData,
        // Wave 6 — format dari perintah (inputPayload.reportFormat);
        // bila tidak ada (tugas lama), default pdf di generateTaskReport.
        reportFormat: typeof payload.reportFormat === 'string' ? payload.reportFormat : undefined,
        aiReport,
      });
    } catch (e) {
      console.error('[agents] gagal membuat file laporan:', e);
    }
    // Batal selama pembuatan file -> jangan tulis COMPLETED.
    await assertStillRunning(taskId);
    await setTask(organizationId, taskId, {
      status: 'COMPLETED', progress: 100, completedAt: new Date(),
      // aiReport: true bila summary final adalah teks AI (UI merendernya
      // sebagai Markdown + menyembunyikan tabel mentah); false bila fallback
      // ringkasan tool — UI menampilkan pesan jujur "AI tidak tersedia".
      resultPayload: JSON.stringify({ summary: finalSummary, data: resultData, reportFile, aiReport }),
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
    // P0-2 — abort BUKAN kegagalan: jangan retry, jangan FAILED, jangan
    // timpa status akhir (CANCELLED). Bersihkan agent hanya bila masih
    // menunjuk tugas ini.
    if (e instanceof TaskAbortedError) {
      await cleanupAfterAbort(organizationId, agent.id, taskId, task.title).catch(() => {});
      return;
    }
    // P0-2 — sebelum retry/FAILED, baca ulang status: bila sudah CANCELLED
    // (mis. dibatalkan tepat saat error terjadi), jangan enqueue ulang
    // dan jangan timpa status final.
    const fresh = await prisma.agentTask.findUnique({ where: { id: taskId }, select: { status: true } });
    if (!fresh || fresh.status === 'CANCELLED') {
      await cleanupAfterAbort(organizationId, agent.id, taskId, task.title).catch(() => {});
      return;
    }
    const msg = e?.message || 'Kesalahan tidak dikenal.';
    await addEvent(organizationId, taskId, 'failed', `Gagal: ${msg}`);
    // error permanen (izin tool / tool tidak dikenal) tidak akan sembuh dengan retry
    const permanent = /tidak diizinkan memakai tool|tidak dikenal/.test(msg);
    if (!permanent && attempt < task.maxAttempts) {
      const backoff = Math.min(2000 * 2 ** (attempt - 1), 15000);
      await setTask(organizationId, taskId, { status: 'QUEUED', progress: 0, errorMessage: msg });
      await setAgentStatus(organizationId, agent.id, 'ERROR', taskId);
      await sleep(backoff);
      // P0-2 — baca ulang sebelum enqueue retry: bila dibatalkan selama
      // backoff, jangan enqueue ulang.
      const beforeRetry = await prisma.agentTask.findUnique({ where: { id: taskId }, select: { status: true } });
      if (beforeRetry?.status === 'CANCELLED') {
        await cleanupAfterAbort(organizationId, agent.id, taskId, task.title).catch(() => {});
        return;
      }
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
  // Wave 16 — riwayat per-user: hanya pemilik tugas yang bisa membatalkannya
  // (tugas lama tanpa createdById tetap bisa dibatalkan anggota kantor).
  if (task.createdById && task.createdById !== userId) throw new Error('Tugas tidak ditemukan.');
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
export async function retryTask(organizationId: string, taskId: string, userId?: string) {
  const task = await prisma.agentTask.findFirst({ where: { id: taskId, organizationId } });
  if (!task) throw new Error('Tugas tidak ditemukan.');
  // Wave 16 — riwayat per-user: hanya pemilik tugas yang bisa mengulangnya
  // (bila userId diberikan; tugas lama tanpa createdById tetap bisa).
  if (userId && task.createdById && task.createdById !== userId) throw new Error('Tugas tidak ditemukan.');
  if (!['FAILED', 'CANCELLED'].includes(task.status)) throw new Error('Hanya tugas gagal/dibatalkan yang bisa diulang.');
  // P0-3 — bersihkan resultPayload supaya tugas yang diulang menjalankan
  // tool segar dari awal (tanpa penanda toolExecuted dari percobaan lama).
  await setTask(organizationId, taskId, { status: 'QUEUED', progress: 0, errorMessage: null, attempts: 0, resultPayload: null });
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
    // P0-3 — JANGAN membersihkan resultPayload di sini: bila approval di
    // TENGAH (tool sudah jalan, hasil parsial + penanda toolExecuted
    // tersimpan), executeTask harus memakai hasil itu tanpa tool.run() lagi.
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

/**
 * P0-4 — Sapu tugas yatim saat server start (idempotent, aman dijalankan
 * dua kali): tugas yang masih RUNNING pasti terhenti oleh restart VM —
 * scheduler in-process tidak punya proses lain yang bisa melanjutkannya.
 * (a) RUNNING -> FAILED, (b) agent EXECUTING_TASK atas tugas itu -> IDLE,
 * (c) tutup AgentActivity EXECUTING_TASK yang masih terbuka milik agent itu.
 */
export async function sweepOrphanedTasks(): Promise<number> {
  const now = new Date();
  const orphaned = await prisma.agentTask.findMany({
    where: { status: 'RUNNING' },
    select: { id: true, organizationId: true, agentId: true, title: true },
  });
  // COMPLETED tertinggal: agent yang selesai ≤4 detik sebelum restart tidak
  // pernah sampai ke setTimeout IDLE — tanpa ini ia tampil "Bekerja"
  // selamanya di snapshot (pemetaan COMPLETED -> Working di /api/kantor/office).
  // Aman: COMPLETED + currentTaskId null hanya berarti "baru selesai".
  const stuckCompleted = await prisma.agent.updateMany({
    where: { currentStatus: 'COMPLETED', currentTaskId: null },
    data: { currentStatus: 'IDLE' },
  });
  if (stuckCompleted.count > 0) {
    console.log(`[agents] orphan sweep: ${stuckCompleted.count} agent COMPLETED tertinggal → IDLE`);
  }
  if (orphaned.length === 0) {
    console.log('[agents] orphan sweep: 0 tugas RUNNING → FAILED');
    return 0;
  }
  const orphanedIds = orphaned.map((t) => t.id);
  for (const t of orphaned) {
    await prisma.agentTask.update({
      where: { id: t.id },
      data: { status: 'FAILED', errorMessage: 'Tugas terhenti karena server restart.', completedAt: now },
    });
    await addEvent(t.organizationId, t.id, 'failed', 'Tugas terhenti karena server restart.').catch(() => {});
  }
  // (b) agent yang menunjuk tugas yang baru di-FAILED-kan -> IDLE
  const agents = await prisma.agent.findMany({
    where: { currentStatus: 'EXECUTING_TASK', currentTaskId: { in: orphanedIds } },
    select: { id: true },
  });
  const agentIds = agents.map((a) => a.id);
  if (agentIds.length > 0) {
    await prisma.agent.updateMany({
      where: { id: { in: agentIds } },
      data: { currentStatus: 'IDLE', currentTaskId: null },
    });
    // (c) tutup aktivitas EXECUTING_TASK yang masih terbuka milik agent itu
    await prisma.agentActivity.updateMany({
      where: { agentId: { in: agentIds }, activityType: 'EXECUTING_TASK', endedAt: null },
      data: { endedAt: now },
    });
  }
  console.log(`[agents] orphan sweep: ${orphaned.length} tugas RUNNING → FAILED`);
  return orphaned.length;
}

/**
 * Pastikan 5 agent bawaan ada untuk organisasi ini (idempotent).
 *
 * Wave 13 — CREATE-ONLY: agent yang sudah ada di DB TIDAK di-update.
 * Konfigurasi lewat UI Kelola Agent (/kantor/agents) adalah sumber
 * kebenaran; bila seed menimpa tiap perintah, semua edit pengguna
 * (termasuk nonaktifkan) akan hilang. Perubahan registry yang memang
 * harus dipaksakan ke DB dijalankan manual lewat
 * `npx tsx scripts/seed-agent-config.ts` (force-sync).
 */
export async function ensureAgents(organizationId: string) {
  const { AGENT_DEFINITIONS } = await import('./registry');
  for (const def of AGENT_DEFINITIONS) {
    const existing = await prisma.agent.findUnique({
      where: { organizationId_name: { organizationId, name: def.name } },
      select: { id: true },
    });
    if (existing) continue;
    await prisma.agent.create({
      data: {
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
