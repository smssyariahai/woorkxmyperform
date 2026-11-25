// Sesi istirahat per-agent di DB tenant — Staff Residence Fase 5b.
//
// Pengganti state tidur org-wide in-memory (`lib/kantor/sleep.ts`, Wave 11 —
// DIHAPUS): tidur kini sesi per agent (`AgentRestSession`, status RESTING)
// dengan kasur assignment-nya sendiri (`AgentResidenceAssignment`).
// Dipakai tiga tempat: snapshot GET /api/kantor/office (computeSleepers),
// POST /api/kantor/sleep + perintah "tidur"/"bangun" di /api/agent-tasks
// (setManualRest). Semua state hidup di DB tenant — restart server /
// VM reset tidak menghilangkan sesi (5c: scheduler membaca dari sini).
import type { PrismaClient as TenantPrismaClient } from '@prisma/tenant-client';
import { residenceBeds, residenceBedSpot, type Placement } from '@/components/kantor/scene/office3d-layout';

/** Agent yang sedang beristirahat (sesi RESTING) + kasurnya. */
export interface RestingAgent {
  agentId: string;
  bedId: string;
  /** Kunci ke geometri `residenceBeds()` (0–15). */
  bedIndex: number;
  source: 'SCHEDULE' | 'MANUAL';
}

/** Agent yang dibuat/diakhiri sesinya (untuk respons API). */
export interface RestAgentRef {
  agentId: string;
  name: string;
  bedCode: string;
  sessionId: string;
}

/** Semua sesi RESTING di tenant ini (agentId -> sesi + bedIndex kasurnya). */
export async function getRestingAgents(client: TenantPrismaClient): Promise<Map<string, RestingAgent>> {
  const sessions = await client.agentRestSession.findMany({
    where: { status: 'RESTING' },
    select: { agentId: true, bedId: true, source: true, bed: { select: { bedIndex: true } } },
  });
  const map = new Map<string, RestingAgent>();
  for (const s of sessions) {
    map.set(s.agentId, {
      agentId: s.agentId,
      bedId: s.bedId,
      bedIndex: s.bed.bedIndex,
      source: s.source === 'MANUAL' ? 'MANUAL' : 'SCHEDULE',
    });
  }
  return map;
}

export interface SleepPlacement {
  /** Kursi (seat) agent Idle yang harus dikirim tidur. */
  sleepers: number[];
  /** Placement kasur mess per kursi (hanya sleeper yang punya assignment). */
  sleeperBeds: Map<number, Placement>;
  /** Ada ≥1 sesi MANUAL berstatus RESTING — state tombol Tidur di snapshot. */
  sleep: boolean;
}

/**
 * Turunkan sleepers + placement kasur dari daftar station snapshot.
 * Murni (tanpa DB) supaya bisa diuji langsung dari skrip verify.
 *
 * - Hanya station Idle di Lounge yang dikirim tidur: agent WORKING (tugas
 *   RUNNING/QUEUED) TIDAK diganggu — ia menyelesaikan tugas dulu, lalu
 *   berjalan ke mess saat menjadi Idle (§7 langkah 2–3). Station
 *   Praying/Briefing juga tidak masuk (override sesi didahulukan — state
 *   mereka bukan Idle).
 * - `sleep` dihitung dari SEMUA sesi MANUAL yang RESTING (bukan hanya yang
 *   Idle): tombol Tidur harus menyala selama rest manual aktif, termasuk
 *   saat agent yang bersangkutan masih menyelesaikan tugas.
 * - Sleeper tanpa kasur di map (tanpa assignment / bedIndex di luar
 *   jangkauan) TIDAK dapat placement kasur — idlePlan fallback ke restSpot
 *   lounge (degradasi anggun, bukan error).
 */
export function computeSleepers(
  stations: { id: string; seat: number; state: string; room: string }[],
  resting: Map<string, RestingAgent>,
): SleepPlacement {
  const beds = residenceBeds();
  const sleepers: number[] = [];
  const sleeperBeds = new Map<number, Placement>();
  const sleep = [...resting.values()].some((r) => r.source === 'MANUAL');
  for (const station of stations) {
    if (station.state !== 'Idle' || station.room !== 'Lounge') continue;
    const rest = resting.get(station.id);
    if (!rest) continue;
    sleepers.push(station.seat);
    const bed = beds[rest.bedIndex];
    if (bed) sleeperBeds.set(station.seat, residenceBedSpot(bed, 'Sleeping in the mess'));
  }
  return { sleepers, sleeperBeds, sleep };
}

/**
 * Nyalakan/matikan rest MANUAL untuk seluruh kantor (tombol Tidur +
 * perintah "tidur"/"bangun").
 *
 * - `wanted === true`: buat sesi MANUAL untuk semua agent yang punya
 *   assignment ACTIVE dan belum punya sesi RESTING (idempotent — panggilan
 *   kedua tidak membuat sesi ganda; partial unique index di DB juga
 *   menolaknya, P2002 ditangkap per agent). Agent tanpa assignment di-skip.
 * - `wanted === false`: akhiri (COMPLETED + endedAt) semua sesi MANUAL
 *   yang RESTING. Sesi SCHEDULE TIDAK disentuh (hanya scheduler 5c yang
 *   mengakhirinya).
 * - `wanted` kosong: toggle dari state DB (ada sesi MANUAL RESTING ->
 *   matikan, bila tidak -> nyalakan).
 */
export async function setManualRest(
  client: TenantPrismaClient,
  wanted?: boolean,
): Promise<{ sleeping: boolean; started: RestAgentRef[]; ended: RestAgentRef[] }> {
  const resting = await getRestingAgents(client);
  const hasManual = [...resting.values()].some((r) => r.source === 'MANUAL');
  const target = wanted ?? !hasManual;
  if (!target) {
    const manual = await client.agentRestSession.findMany({
      where: { status: 'RESTING', source: 'MANUAL' },
      select: { id: true, agentId: true, bed: { select: { bedCode: true } }, agent: { select: { name: true } } },
    });
    if (manual.length > 0) {
      await client.agentRestSession.updateMany({
        where: { id: { in: manual.map((m) => m.id) } },
        data: { status: 'COMPLETED', endedAt: new Date() },
      });
    }
    return {
      sleeping: false,
      started: [],
      ended: manual.map((m) => ({ agentId: m.agentId, name: m.agent.name, bedCode: m.bed.bedCode, sessionId: m.id })),
    };
  }
  const assignments = await client.agentResidenceAssignment.findMany({
    where: { status: 'ACTIVE' },
    select: { agentId: true, bedId: true, bed: { select: { bedCode: true } }, agent: { select: { name: true } } },
    orderBy: { agent: { name: 'asc' } },
  });
  const started: RestAgentRef[] = [];
  for (const a of assignments) {
    if (resting.has(a.agentId)) continue;
    try {
      const s = await client.agentRestSession.create({
        data: { agentId: a.agentId, bedId: a.bedId, status: 'RESTING', source: 'MANUAL' },
        select: { id: true },
      });
      started.push({ agentId: a.agentId, name: a.agent.name, bedCode: a.bed.bedCode, sessionId: s.id });
    } catch {
      // P2002 dari partial unique index: request lain membuat sesi duluan
      // (race) — agent itu sudah beristirahat, bukan kegagalan.
    }
  }
  return { sleeping: true, started, ended: [] };
}
