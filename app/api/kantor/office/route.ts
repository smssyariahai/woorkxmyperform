// GET /api/kantor/office — snapshot Kantor Virtual kantor ini
// (station per agent + ringkasan HUD). Read-only.
//
// Diadaptasi dari Ruang (yugienugraha/ruang v0.2.0, MIT © 2026 yugienugraha):
// state station diturunkan di server dari Agent + AgentTask + AgentActivity,
// frontend hanya menampilkan. Sumber data: PostgreSQL WOORK, bukan CLI hermes.
// Guard: auth + modul 'kantor' (tidak ada permission KANTOR_* di v1).
import { prisma } from '@/lib/db';
import { requireAuth, requireModule } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import {
  KANTOR_KANBAN_MAP,
  type KantorIdlePlacement,
  type KantorOfficeSnapshot,
  type KantorStation,
  type KantorTaskStatus,
} from '@/lib/kantor/types';
import { createLayout, IDLE_STOP_MS, idlePlan } from '@/components/kantor/scene/office3d-layout';
import { isSleeping } from '@/lib/kantor/sleep';

export const dynamic = 'force-dynamic';

/** Parse kolom JSON String (skills/tools Agent) secara aman; rusak = []. */
function parseStringArray(raw: string): string[] {
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function kanbanStatus(status: string) {
  return KANTOR_KANBAN_MAP[status as KantorTaskStatus] ?? 'todo';
}

export async function GET() {
  try {
    const ctx = await requireAuth();
    await requireModule(ctx, 'kantor');

    const [agents, activeTasks, activities, runningTasks, pendingApprovals] = await Promise.all([
      prisma.agent.findMany({
        where: { organizationId: ctx.organizationId, isEnabled: true },
        orderBy: { name: 'asc' },
      }),
      prisma.agentTask.findMany({
        where: {
          organizationId: ctx.organizationId,
          status: { in: ['QUEUED', 'RUNNING', 'WAITING_APPROVAL'] },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.agentActivity.findMany({
        where: { organizationId: ctx.organizationId },
        orderBy: { startedAt: 'desc' },
        take: 100,
      }),
      prisma.agentTask.count({
        where: { organizationId: ctx.organizationId, status: 'RUNNING' },
      }),
      prisma.approval.count({
        where: { organizationId: ctx.organizationId, status: 'PENDING' },
      }),
    ]);

    // Tugas aktif terbaru per agent (QUEUED/RUNNING/WAITING_APPROVAL, terbaru dulu).
    const taskByAgent = new Map<string, (typeof activeTasks)[number]>();
    for (const t of activeTasks) {
      if (t.agentId && !taskByAgent.has(t.agentId)) taskByAgent.set(t.agentId, t);
    }
    // Aktivitas terbaru per agent.
    const activityByAgent = new Map<string, (typeof activities)[number]>();
    for (const a of activities) {
      if (!activityByAgent.has(a.agentId)) activityByAgent.set(a.agentId, a);
    }

    const stations: KantorStation[] = agents.map((agent, i) => {
      const task = taskByAgent.get(agent.id) ?? null;
      const activity = activityByAgent.get(agent.id) ?? null;
      // State diturunkan dari status agent DI DB + status tugas aktif.
      // Sebelumnya hanya tugas RUNNING yang dibaca, sehingga fase THINKING /
      // WORKING / COMPLETED (sesaat, ~4 detik setelah selesai) jatuh ke Idle
      // dan hampir tidak pernah tertangkap snapshot. QUEUED juga ikut:
      // agent sudah memegang tugas meski eksekusinya baru antre.
      const agentStatus = agent.currentStatus;
      const state: KantorStation['state'] =
        agentStatus === 'WAITING_APPROVAL' || task?.status === 'WAITING_APPROVAL'
          ? 'Reviewing'
          : agentStatus === 'EXECUTING_TASK' ||
              agentStatus === 'THINKING' ||
              agentStatus === 'WORKING' ||
              agentStatus === 'COMPLETED' ||
              task?.status === 'RUNNING' ||
              task?.status === 'QUEUED'
            ? 'Working'
            : 'Idle';
      const currentTask = task
        ? {
            id: task.id,
            title: task.title,
            status: task.status,
            kanbanStatus: kanbanStatus(task.status),
          }
        : null;
      const recentActivity = activity?.description || currentTask?.title || null;
      return {
        id: agent.id,
        name: agent.name,
        role: agent.role,
        avatarColor: agent.avatarColor,
        room: state === 'Idle' ? 'Lounge' : 'Workspace',
        roomPosition: state === 'Idle' ? 'lounge-seat' : 'desk',
        seat: i + 1,
        state,
        currentTask,
        recentActivity,
        activity: recentActivity,
        skills: parseStringArray(agent.skills),
        tools: parseStringArray(agent.tools),
        description: agent.description || null,
        systemInstructions: agent.systemInstructions || null,
      };
    });

    // Placement idle otoritatif dari jam SERVER (Wave 10 — sinkronisasi
    // realtime). Dulu tiap browser menghitung `idlePlan(Date.now())` dari
    // jam lokalnya sendiri, sehingga agent Idle yang sama terlihat di
    // tempat berbeda antar layar. Sekarang satu `idlePlan` dihitung di
    // sini (jam server) dan placement-nya ikut di snapshot (`station.idle`),
    // jadi semua client menaruh agent Idle di spot yang sama.
    //
    // Tidur (Wave 11) JUGA dihitung di sini, dari state bersama per kantor
    // (`isSleeping`): bila tidur, semua kursi idle dimasukkan sebagai
    // `sleepers` sehingga `idlePlan` menaruh mereka di tempat tidur
    // (stop 'tidur', pose 'lie') — placement tempat tidur ikut di
    // `station.idle`, jadi semua layar melihat agent tidur di tempat
    // tidur yang sama. Dulu override tidur dihitung lokal per browser
    // (localStorage `woork.kantorSleep`) — itu yang membuat layar DWI
    // (tidur) berbeda dari layar Eka (bangun).
    const nowMs = Date.now();
    const sleeping = isSleeping(ctx.organizationId);
    const layout = createLayout(Math.max(1, stations.length));
    const idleSeats = stations
      .filter((s) => s.state === 'Idle' && s.room === 'Lounge')
      .map((s) => s.seat);
    const plan = idlePlan(idleSeats, nowMs, layout, sleeping ? idleSeats : []);
    for (const station of stations) {
      if (station.state !== 'Idle') continue;
      const assignment = plan.get(station.seat);
      if (!assignment) continue;
      const idle: KantorIdlePlacement = {
        stopKey: assignment.stop.key,
        label: assignment.placement.label ?? assignment.stop.label,
        position: [...assignment.placement.position] as [number, number, number],
        facing: assignment.placement.facing,
        seated: assignment.placement.seated,
      };
      if (assignment.placement.pose) idle.pose = assignment.placement.pose;
      if (assignment.placement.height !== undefined) idle.height = assignment.placement.height;
      station.idle = idle;
    }

    const snapshot: KantorOfficeSnapshot = {
      stations,
      summary: {
        total: stations.length,
        active: stations.length,
        idle: stations.filter((s) => s.state === 'Idle').length,
        working: stations.filter((s) => s.state === 'Working').length,
        runningTasks,
        pendingApprovals,
      },
      fetchedAt: new Date(nowMs).toISOString(),
      sleep: sleeping,
    };
    return apiOk(snapshot);
  } catch (e: unknown) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat snapshot Kantor Virtual.', 500);
  }
}
