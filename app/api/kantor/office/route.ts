// GET /api/kantor/office — snapshot Kantor Virtual kantor ini
// (station per agent + ringkasan HUD). Read-only.
//
// Diadaptasi dari Ruang (yugienugraha/ruang v0.2.0, MIT © 2026 yugienugraha):
// state station diturunkan di server dari Agent + AgentTask + AgentActivity,
// frontend hanya menampilkan. Sumber data: PostgreSQL WOORK, bukan CLI hermes.
// Guard: auth + modul 'kantor' (tidak ada permission KANTOR_* di v1).
import { prisma } from '@/lib/db';
import type { PrismaClient as TenantPrismaClient } from '@prisma/tenant-client';
import { requireAuth, requireModule } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import {
  KANTOR_KANBAN_MAP,
  type KantorIdlePlacement,
  type KantorOfficeSnapshot,
  type KantorStation,
  type KantorTaskStatus,
} from '@/lib/kantor/types';
import { createLayout, execRoomForZone, IDLE_STOP_MS, idlePlan } from '@/components/kantor/scene/office3d-layout';
import { computeSleepers, getRestingAgents } from '@/lib/kantor/rest';
import { getSceneTheme } from '@/lib/kantor/theme';
import { getPrayerState } from '@/lib/kantor/prayer-session';
import { getBriefingState } from '@/lib/kantor/briefing-session';
import { markBriefingArrivals, markPrayerArrivals } from '@/lib/kantor/session-arrival';

export const dynamic = 'force-dynamic';

/** Client tenant (tipe dari skema tenant) — dipakai untuk field Fase 3
 *  (Agent.departmentId + relasi department) yang tidak ada di skema legacy.
 *  Pola yang sama dengan /api/admin/departments (Fase 3a). */
const tprisma = prisma as unknown as TenantPrismaClient;

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

    const [agents, activeTasks, activities, runningTasks, pendingApprovals, prayerState, briefingState, resting] = await Promise.all([
      tprisma.agent.findMany({
        where: { organizationId: ctx.organizationId, isEnabled: true },
        orderBy: { name: 'asc' },
        // Divisi agent (Fase 3b): dipakai memetakan room/roomPosition +
        // placement meja divisi di scene (klaster L2 / ruangan L3).
        include: { department: { select: { id: true, name: true, floor: true, zone: true } } },
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
      // State sesi Musala + Morning Briefing (in-memory dulu, DB bila kosong
      // — pola yang sama dengan sleep/theme; dipakai snapshot + override
      // station peserta di bawah).
      getPrayerState(ctx.organizationId),
      getBriefingState(ctx.organizationId),
      // Sesi istirahat yang sedang berjalan (Fase 5b — pengganti boolean
      // org-wide lib/kantor/sleep.ts): per-agent, dari DB tenant.
      getRestingAgents(tprisma),
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
      // Ruangan kerja dari divisi (Fase 3b): divisi lantai 2 → klaster Tech;
      // divisi lantai 3 → ruangan eksekutif dari zone; divisi lantai 1 /
      // tanpa divisi → Workspace seperti sebelumnya. Idle tetap Lounge
      // (placement idle dihitung server dari idlePlan, bukan dari divisi).
      // Override sesi (salat/briefing) di bawah tetap didahulukan.
      const dept = agent.department ?? null;
      const execRoom = dept?.floor === 3 ? execRoomForZone(dept.zone) : null;
      return {
        id: agent.id,
        name: agent.name,
        role: agent.role,
        avatarColor: agent.avatarColor,
        room: state === 'Idle' ? 'Lounge' : dept?.floor === 2 ? 'Tech Cluster' : execRoom ?? 'Workspace',
        roomPosition: state === 'Idle' ? 'lounge-seat' : dept?.floor === 2 ? 'tech-desk' : execRoom ? 'exec-desk' : 'desk',
        seat: i + 1,
        state,
        currentTask,
        recentActivity,
        activity: recentActivity,
        skills: parseStringArray(agent.skills),
        tools: parseStringArray(agent.tools),
        description: agent.description || null,
        systemInstructions: agent.systemInstructions || null,
        department: dept ? { id: dept.id, name: dept.name, floor: dept.floor, zone: dept.zone } : null,
      };
    });

    // Override station peserta sesi yang sedang berjalan (Musala / Morning
    // Briefing): state diturunkan di atas dari currentStatus + tugas TIDAK
    // mengenal sesi — jadi peserta sesi harus dipaksa ke state + ruangan
    // sesi di sini, supaya scene menaruh mereka di saf / meja rapat.
    // Selesai sesi, snapshot berikutnya kembali menurunkan state normal
    // (agent "kembali" ke meja/lounge lewat walkPath3). Salat dan
    // briefing tidak pernah aktif bersamaan (guard backend) — salat
    // didahulukan bila keduanya aktif. Briefing hanya mengikat peserta
    // selama PREPARING s.d. CLOSING; saat RETURNING mereka sudah berjalan
    // pulang (state normal), jadi tidak di-override.
    const [prayerParts, briefingParts] = await Promise.all([
      prayerState.active && prayerState.sessionId
        ? prisma.prayerSessionParticipant.findMany({
            where: { sessionId: prayerState.sessionId, status: { not: 'SKIPPED' } },
            select: { agentId: true },
          })
        : Promise.resolve([] as { agentId: string }[]),
      briefingState.active && briefingState.sessionId && ['PREPARING', 'AGENTS_MOVING', 'GATHERING', 'IN_PROGRESS', 'CLOSING'].includes(briefingState.phase ?? '')
        ? prisma.briefingParticipant.findMany({
            where: { sessionId: briefingState.sessionId, status: { not: 'SKIPPED' } },
            select: { agentId: true },
          })
        : Promise.resolve([] as { agentId: string }[]),
    ]);
    const prayerIds = new Set(prayerParts.map((p) => p.agentId));
    const briefingIds = new Set(briefingParts.map((p) => p.agentId));
    if (prayerIds.size > 0) {
      for (const station of stations) {
        if (!prayerIds.has(station.id)) continue;
        station.state = 'Praying';
        station.room = 'Musala';
        station.roomPosition = 'musala-saf';
        station.activity = `Salat ${prayerState.prayerLabel ?? ''}`.trim();
      }
    } else if (briefingIds.size > 0) {
      for (const station of stations) {
        if (!briefingIds.has(station.id)) continue;
        station.state = 'Briefing';
        station.room = 'Meeting Room';
        station.roomPosition = 'meeting-area';
        station.activity = 'Morning Briefing';
      }
    }

    // Fase 8 (3.0) — catat kedatangan peserta sesi (gap `arrivedAt` NULL
    // yang ditemukan observasi Fase 6: peserta INVITED → COMPLETED tanpa
    // pernah mencatat kedatangan, karena tidak ada kode yang menulis
    // `arrivedAt` maupun menaikkan status INVITED → WALKING/PRAYING atau
    // INVITED → MOVING/SEATED). Saat snapshot pertama menempatkan agent
    // di musala / ruang meeting, isi `arrivedAt` + naikkan status untuk
    // peserta yang `arrivedAt`-nya masih NULL (lib/kantor/session-arrival).
    // Ini jujur: yang dicatat adalah saat server pertama kali menempatkan
    // agent di ruangan sesi (bukan klaim animasi jalan 3D sudah selesai).
    // Idempotent — hanya baris NULL yang disentuh; bila tulis gagal,
    // snapshot tetap dikembalikan (kedatangan dicoba lagi di snapshot
    // berikutnya).
    try {
      if (prayerIds.size > 0 && prayerState.sessionId) {
        await markPrayerArrivals(prisma, prayerState.sessionId);
      } else if (briefingIds.size > 0 && briefingState.sessionId) {
        await markBriefingArrivals(prisma, briefingState.sessionId);
      }
    } catch {
      // Kedatangan gagal dicatat — bukan alasan menggagalkan snapshot.
    }

    // Placement idle otoritatif dari jam SERVER (Wave 10 — sinkronisasi
    // realtime). Dulu tiap browser menghitung `idlePlan(Date.now())` dari
    // jam lokalnya sendiri, sehingga agent Idle yang sama terlihat di
    // tempat berbeda antar layar. Sekarang satu `idlePlan` dihitung di
    // sini (jam server) dan placement-nya ikut di snapshot (`station.idle`),
    // jadi semua client menaruh agent Idle di spot yang sama.
    //
    // Tidur (Fase 5b) dihitung di sini dari sesi RESTING per-agent di DB
    // (`computeSleepers`): agent Idle yang punya sesi berjalan ke kasur
    // assignment-nya di mess (stop 'tidur', pose 'lie', placement kasur
    // ikut di `station.idle`); agent tanpa assignment fallback ke rest
    // spot Creative Lounge; agent WORKING tidak diganggu (ia menyelesaikan
    // tugas dulu, lalu ke mess saat menjadi Idle). State tombol Tidur
    // (`sleep`) = ada sesi MANUAL yang RESTING. Dulu boolean org-wide
    // in-memory (`isSleeping`) yang menaruh SEMUA agent Idle di lounge.
    const nowMs = Date.now();
    const { sleepers, sleeperBeds, sleep: sleeping } = computeSleepers(stations, resting);
    const layout = createLayout(stations);
    const idleSeats = stations
      .filter((s) => s.state === 'Idle' && s.room === 'Lounge')
      .map((s) => s.seat);
    const plan = idlePlan(idleSeats, nowMs, layout, sleepers, sleeperBeds);
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
      theme: getSceneTheme(ctx.organizationId),
      prayer: prayerState,
      briefing: briefingState,
    };
    return apiOk(snapshot);
  } catch (e: unknown) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat snapshot Kantor Virtual.', 500);
  }
}
