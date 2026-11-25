// AI Command Center — agregasi data nyata (Fase 7a1, SPEC §23).
// Satu-satunya sumber angka di panel Pusat Kendali: query tenant DB di
// bawah. TIDAK ADA angka dummy: metrik tanpa sumber data dikembalikan
// dengan available:false + alasan (UI menampilkan "Data belum tersedia").
//
// Batas hari memakai Asia/Jakarta (WIB = UTC+7, tanpa DST).
// Filter: departmentId mempersempit agent + utilisasi + tugas ke agent
// divisi itu; agentId mempersempit utilisasi + tugas ke satu agent.
// Meeting, kolaborasi, dan panggilan AI selalu org-wide (tidak punya
// departmentId) — dicatat di `scopeNote`.
import type { PrismaClient as TenantPrismaClient } from '@prisma/tenant-client';

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const ACTIVE_TASK_STATUSES = ['QUEUED', 'RUNNING', 'WAITING_APPROVAL'];

export interface CommandCenterFilters {
  departmentId?: string | null;
  agentId?: string | null;
}

export interface CommandCenterData {
  generatedAt: string;
  period: { todayStart: string; meetingsUntil: string; timezone: string };
  filters: { departmentId: string | null; agentId: string | null };
  scopeNote: string;
  departments: { id: string; name: string; floor: number | null }[];
  agents: {
    total: number;
    active: number;
    byDepartment: { departmentId: string | null; name: string; floor: number | null; count: number }[];
    statusCounts: { status: string; count: number }[];
  };
  tasks: {
    current: { id: string; title: string; status: string; priority: string; agentName: string | null; createdAt: string }[];
    today: { created: number; completed: number; failed: number };
  };
  utilization: {
    agentId: string;
    agentName: string;
    departmentName: string | null;
    currentStatus: string;
    activeTasks: number;
    tasksToday: { total: number; completed: number; failed: number };
  }[];
  collaborations: {
    total: number;
    items: { conversationId: string; participants: string[]; messageCount: number; lastAt: string; taskTitle: string | null }[];
  };
  meetings: { id: string; title: string; startsAt: string; endsAt: string | null; meetingType: string; status: string; hostName: string | null }[];
  aiUsage: { callsToday: number; byModel: { model: string; count: number }[] };
  tokenUsage: { available: false; reason: string };
  estimatedCost: { available: false; reason: string };
}

/** Awal hari ini (00:00) di Asia/Jakarta sebagai Date UTC. */
export function startOfTodayJakarta(now = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return new Date(Date.UTC(get('year'), get('month') - 1, get('day')) - WIB_OFFSET_MS);
}

export async function getCommandCenterData(
  tprisma: TenantPrismaClient,
  organizationId: string,
  filters: CommandCenterFilters = {},
): Promise<CommandCenterData> {
  const now = new Date();
  const todayStart = startOfTodayJakarta(now);
  const meetingsUntil = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const departmentId = filters.departmentId ?? null;
  const agentId = filters.agentId ?? null;

  const [departments, agents] = await Promise.all([
    tprisma.department.findMany({
      where: { organizationId },
      select: { id: true, name: true, floor: true },
      orderBy: [{ floor: 'asc' }, { name: 'asc' }],
    }),
    tprisma.agent.findMany({
      where: { organizationId },
      select: { id: true, name: true, role: true, currentStatus: true, isEnabled: true, departmentId: true, currentTaskId: true },
      orderBy: { name: 'asc' },
    }),
  ]);
  const deptById = new Map(departments.map((d) => [d.id, d]));
  const enabledAgents = agents.filter((a) => a.isEnabled);

  // Filter agent: satu agent, atau semua agent di satu divisi.
  const scopedAgentIds = new Set(
    enabledAgents
      .filter((a) => (agentId ? a.id === agentId : true) && (departmentId ? a.departmentId === departmentId : true))
      .map((a) => a.id),
  );

  const byDepartment = new Map<string | null, number>();
  for (const a of enabledAgents) byDepartment.set(a.departmentId, (byDepartment.get(a.departmentId) ?? 0) + 1);
  const statusCounts = new Map<string, number>();
  for (const a of enabledAgents) statusCounts.set(a.currentStatus, (statusCounts.get(a.currentStatus) ?? 0) + 1);

  const [currentTasks, todayTasks, todayCreated, meetings, messages, aiCalls] = await Promise.all([
    tprisma.agentTask.findMany({
      // Filter aktif tapi tidak ada agent dalam cakupan -> paksa hasil kosong
      // (bukan semua tugas org): `in: []` Prisma cocok dengan apa pun, jadi
      // pakai id yang mustahil cocok bila cakupan kosong.
      where: {
        organizationId,
        status: { in: ACTIVE_TASK_STATUSES },
        ...(departmentId || agentId
          ? { agentId: { in: scopedAgentIds.size ? [...scopedAgentIds] : ['__no_agent__'] } }
          : {}),
      },
      select: { id: true, title: true, status: true, priority: true, agentId: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    // Tugas yang SELESAI hari ini (completedAt hari ini) per status akhir.
    tprisma.agentTask.groupBy({
      by: ['status'],
      where: { organizationId, completedAt: { gte: todayStart }, status: { in: ['COMPLETED', 'FAILED'] } },
      _count: { _all: true },
    }),
    tprisma.agentTask.count({ where: { organizationId, createdAt: { gte: todayStart } } }),
    tprisma.meeting.findMany({
      where: { organizationId, status: { in: ['SCHEDULED', 'ONGOING'] }, startsAt: { gte: now, lt: meetingsUntil } },
      select: { id: true, title: true, startsAt: true, endsAt: true, meetingType: true, status: true, hostId: true },
      orderBy: { startsAt: 'asc' },
      take: 8,
    }),
    // Kolaborasi = percakapan antar-agent (AgentMessage) 24 jam terakhir.
    tprisma.agentMessage.findMany({
      where: { organizationId, createdAt: { gte: last24h } },
      select: { conversationId: true, senderAgentId: true, receiverAgentId: true, taskId: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 500,
    }),
    // Panggilan AI agent tercatat di BotUsage (messageId `kantor-ai-*`,
    // amount 0, tanpa tagih) — hitung panggilan, BUKAN token.
    tprisma.botUsage.findMany({
      where: { organizationId, messageId: { startsWith: 'kantor-ai-' }, createdAt: { gte: todayStart } },
      select: { model: true },
    }),
  ]);

  // Utilisasi per agent (hanya agent dalam cakupan filter).
  const scopedAgents = enabledAgents.filter((a) => scopedAgentIds.has(a.id));
  const [perAgentToday, perAgentActive] = await Promise.all([
    scopedAgents.length
      ? tprisma.agentTask.groupBy({
          by: ['agentId', 'status'],
          where: { organizationId, agentId: { in: scopedAgents.map((a) => a.id) }, createdAt: { gte: todayStart } },
          _count: { _all: true },
        })
      : [],
    scopedAgents.length
      ? tprisma.agentTask.groupBy({
          by: ['agentId'],
          where: { organizationId, agentId: { in: scopedAgents.map((a) => a.id) }, status: { in: ACTIVE_TASK_STATUSES } },
          _count: { _all: true },
        })
      : [],
  ]);
  const todayByAgent = new Map<string, { total: number; completed: number; failed: number }>();
  for (const g of perAgentToday) {
    const cur = todayByAgent.get(g.agentId ?? '') ?? { total: 0, completed: 0, failed: 0 };
    cur.total += g._count._all;
    if (g.status === 'COMPLETED') cur.completed += g._count._all;
    if (g.status === 'FAILED') cur.failed += g._count._all;
    todayByAgent.set(g.agentId ?? '', cur);
  }
  const activeByAgent = new Map(perAgentActive.map((g) => [g.agentId ?? '', g._count._all]));

  // Nama host meeting + nama agent peserta kolaborasi + judul tugas terkait.
  const agentById = new Map(agents.map((a) => [a.id, a.name]));
  const hostIds = [...new Set(meetings.map((m) => m.hostId))];
  const hosts = hostIds.length
    ? await tprisma.user.findMany({ where: { id: { in: hostIds } }, select: { id: true, name: true } })
    : [];
  const hostById = new Map(hosts.map((u) => [u.id, u.name]));
  const collabTaskIds = [...new Set(messages.map((m) => m.taskId).filter((x): x is string => !!x))];
  const collabTasks = collabTaskIds.length
    ? await tprisma.agentTask.findMany({ where: { id: { in: collabTaskIds } }, select: { id: true, title: true } })
    : [];
  const collabTaskById = new Map(collabTasks.map((t) => [t.id, t.title]));

  const convMap = new Map<string, { participants: Set<string>; count: number; lastAt: Date; taskId: string | null }>();
  for (const m of messages) {
    const cur = convMap.get(m.conversationId) ?? { participants: new Set<string>(), count: 0, lastAt: m.createdAt, taskId: null };
    cur.participants.add(m.senderAgentId);
    cur.participants.add(m.receiverAgentId);
    cur.count += 1;
    if (m.createdAt > cur.lastAt) cur.lastAt = m.createdAt;
    if (!cur.taskId && m.taskId) cur.taskId = m.taskId;
    convMap.set(m.conversationId, cur);
  }
  const collaborations = [...convMap.entries()]
    .map(([conversationId, c]) => ({
      conversationId,
      participants: [...c.participants].map((id) => agentById.get(id) ?? id).sort(),
      messageCount: c.count,
      lastAt: c.lastAt.toISOString(),
      taskTitle: c.taskId ? (collabTaskById.get(c.taskId) ?? null) : null,
    }))
    .sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1))
    .slice(0, 10);

  const aiByModel = new Map<string, number>();
  for (const u of aiCalls) aiByModel.set(u.model ?? 'tidak diketahui', (aiByModel.get(u.model ?? 'tidak diketahui') ?? 0) + 1);

  const completedToday = todayTasks.find((g) => g.status === 'COMPLETED')?._count._all ?? 0;
  const failedToday = todayTasks.find((g) => g.status === 'FAILED')?._count._all ?? 0;

  return {
    generatedAt: now.toISOString(),
    period: { todayStart: todayStart.toISOString(), meetingsUntil: meetingsUntil.toISOString(), timezone: 'Asia/Jakarta' },
    filters: { departmentId, agentId },
    scopeNote:
      'Filter divisi/agent mempersempit agent, utilisasi, dan tugas. Meeting, kolaborasi, dan panggilan AI selalu org-wide.',
    departments: departments.map((d) => ({ id: d.id, name: d.name, floor: d.floor })),
    agents: {
      total: enabledAgents.length,
      active: enabledAgents.filter((a) => a.currentTaskId !== null).length,
      byDepartment: [
        ...departments.map((d) => ({
          departmentId: d.id as string | null,
          name: d.name,
          floor: d.floor,
          count: byDepartment.get(d.id) ?? 0,
        })),
        { departmentId: null, name: 'Tanpa divisi', floor: null, count: byDepartment.get(null) ?? 0 },
      ].filter((g) => g.count > 0 || g.departmentId !== null),
      statusCounts: [...statusCounts.entries()].map(([status, count]) => ({ status, count })).sort((a, b) => b.count - a.count),
    },
    tasks: {
      current: currentTasks.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        agentName: t.agentId ? (agentById.get(t.agentId) ?? null) : null,
        createdAt: t.createdAt.toISOString(),
      })),
      today: { created: todayCreated, completed: completedToday, failed: failedToday },
    },
    utilization: scopedAgents.map((a) => {
      const t = todayByAgent.get(a.id) ?? { total: 0, completed: 0, failed: 0 };
      return {
        agentId: a.id,
        agentName: a.name,
        departmentName: a.departmentId ? (deptById.get(a.departmentId)?.name ?? null) : null,
        currentStatus: a.currentStatus,
        activeTasks: activeByAgent.get(a.id) ?? 0,
        tasksToday: t,
      };
    }),
    collaborations: { total: convMap.size, items: collaborations },
    meetings: meetings.map((m) => ({
      id: m.id,
      title: m.title,
      startsAt: m.startsAt.toISOString(),
      endsAt: m.endsAt ? m.endsAt.toISOString() : null,
      meetingType: m.meetingType,
      status: m.status,
      hostName: hostById.get(m.hostId) ?? null,
    })),
    aiUsage: {
      callsToday: aiCalls.length,
      byModel: [...aiByModel.entries()].map(([model, count]) => ({ model, count })).sort((a, b) => b.count - a.count),
    },
    tokenUsage: {
      available: false,
      reason: 'Belum ada pencatatan jumlah token per panggilan AI — BotUsage hanya mencatat jumlah panggilan dan model.',
    },
    estimatedCost: {
      available: false,
      reason: 'Belum ada tarif per model/token untuk menghitung estimasi biaya AI.',
    },
  };
}
