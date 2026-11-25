// Helper admin Staff Residence (Fase 7) — logika tulis yang dipakai route
// API di app/api/admin/kantor/residence/* dan diuji langsung oleh
// scripts/verify-fase5-rest.ts (tanpa HTTP: route handler butuh sesi login,
// jadi logika dipisah ke sini supaya bisa diuji tanpa browser/server).
//
// Aturan yang ditegakkan di sini (desain FASE7 §0–§1):
//  - rename kamar: nama 1–50 karakter, unik per residence (P2002 -> 409)
//  - status kasur: MAINTENANCE hanya bila kasur kosong (berpenghuni -> 409)
//  - jadwal istirahat: HH:mm, mulai != selesai, agentId ATAU divisionId
//    terisi + referensi ada di kantor ini; tanpa constraint tambahan
//  - kapasitas kamar TIDAK bisa diedit (derived = jumlah kasur)
import type { PrismaClient as TenantPrismaClient } from '@prisma/tenant-client';

type TenantClient = TenantPrismaClient;

export class ResidenceAdminError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
export const SCHEDULE_TYPES = ['NIGHT', 'REST', 'BREAK'] as const;

function fail(status: number, message: string): never {
  throw new ResidenceAdminError(status, message);
}

/** Residence aktif di tenant ini (satu baris per tenant), atau null. */
export async function getResidence(client: TenantClient) {
  return client.residence.findFirst({
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, status: true },
  });
}

/** Aktifkan mess: buat Residence kosong (1 baris, 0 kamar). JANGAN seed
 *  kamar/kasur otomatis — geometri kamar milik WOORK.ID, bukan template
 *  umum (desain §1). Residence sudah ada -> 409. */
export async function activateResidence(client: TenantClient) {
  const existing = await getResidence(client);
  if (existing) fail(409, 'Mess sudah aktif untuk perusahaan ini.');
  return client.residence.create({
    data: { name: 'WOORK STAFF RESIDENCE', status: 'ACTIVE' },
    select: { id: true, name: true, status: true },
  });
}

/** Ubah nama + status Residence (salah satu wajib diisi). */
export async function updateResidence(
  client: TenantClient,
  residenceId: string,
  input: { name?: string; status?: string },
) {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const status = typeof input.status === 'string' ? input.status.trim() : '';
  if (!name && !status) fail(422, 'Nama atau status wajib diisi.');
  if (name && (name.length < 1 || name.length > 100)) fail(422, 'Nama mess 1–100 karakter.');
  if (status && status !== 'ACTIVE' && status !== 'INACTIVE') fail(422, 'Status harus ACTIVE atau INACTIVE.');
  const residence = await client.residence.findUnique({ where: { id: residenceId }, select: { id: true } });
  if (!residence) fail(404, 'Mess tidak ditemukan.');
  try {
    return await client.residence.update({
      where: { id: residenceId },
      data: { ...(name ? { name } : {}), ...(status ? { status } : {}) },
      select: { id: true, name: true, status: true },
    });
  } catch (e: any) {
    if (e?.code === 'P2025') fail(404, 'Mess tidak ditemukan.');
    throw e;
  }
}

/** Rename kamar (1–50 karakter, unik per residence). */
export async function renameResidenceRoom(client: TenantClient, roomId: string, name: string) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (trimmed.length < 1 || trimmed.length > 50) fail(422, 'Nama kamar 1–50 karakter.');
  const room = await client.residenceRoom.findUnique({ where: { id: roomId }, select: { id: true } });
  if (!room) fail(404, 'Kamar tidak ditemukan.');
  try {
    return await client.residenceRoom.update({
      where: { id: roomId },
      data: { name: trimmed },
      select: { id: true, name: true, floorNumber: true, capacity: true },
    });
  } catch (e: any) {
    if (e?.code === 'P2002') fail(409, `Nama "${trimmed}" sudah dipakai kamar lain.`);
    if (e?.code === 'P2025') fail(404, 'Kamar tidak ditemukan.');
    throw e;
  }
}

/** Ubah status kasur. MAINTENANCE hanya bila kasur kosong — kasur yang
 *  masih ditempati assignment ACTIVE -> 409 (agent harus dipindah dulu). */
export async function setResidenceBedStatus(client: TenantClient, bedId: string, status: string) {
  if (status !== 'AVAILABLE' && status !== 'MAINTENANCE') {
    fail(422, 'Status kasur harus AVAILABLE atau MAINTENANCE.');
  }
  const bed = await client.residenceBed.findUnique({
    where: { id: bedId },
    select: { id: true, bedCode: true, status: true },
  });
  if (!bed) fail(404, 'Kasur tidak ditemukan.');
  if (status === 'MAINTENANCE') {
    const occupying = await client.agentResidenceAssignment.findUnique({
      where: { bedId: bed.id },
      select: { agentId: true, status: true },
    });
    if (occupying?.status === 'ACTIVE') {
      const agent = await client.agent.findUnique({ where: { id: occupying.agentId }, select: { name: true } });
      fail(409, `Kasur ${bed.bedCode} masih ditempati ${agent?.name ?? 'agent'}. Pindahkan agent dulu.`);
    }
  }
  try {
    return await client.residenceBed.update({
      where: { id: bedId },
      data: { status },
      select: { id: true, bedCode: true, bedIndex: true, status: true },
    });
  } catch (e: any) {
    if (e?.code === 'P2025') fail(404, 'Kasur tidak ditemukan.');
    throw e;
  }
}

export type RestScheduleInput = {
  agentId?: string | null;
  divisionId?: string | null;
  startTime: string;
  endTime: string;
  scheduleType?: string;
  enabled?: boolean;
  timezone?: string;
};

function validateScheduleInput(input: RestScheduleInput) {
  const startTime = typeof input.startTime === 'string' ? input.startTime.trim() : '';
  const endTime = typeof input.endTime === 'string' ? input.endTime.trim() : '';
  if (!HHMM.test(startTime) || !HHMM.test(endTime)) {
    fail(422, 'Jam mulai dan selesai harus format HH:mm (00:00–23:59).');
  }
  if (startTime === endTime) fail(422, 'Jam mulai dan selesai tidak boleh sama.');
  const scheduleType =
    typeof input.scheduleType === 'string' && input.scheduleType.trim() !== ''
      ? input.scheduleType.trim()
      : 'NIGHT';
  if (!(SCHEDULE_TYPES as readonly string[]).includes(scheduleType)) {
    fail(422, 'Tipe jadwal harus NIGHT, REST, atau BREAK.');
  }
  const timezone =
    typeof input.timezone === 'string' && input.timezone.trim() !== '' ? input.timezone.trim() : 'Asia/Jakarta';
  return { startTime, endTime, scheduleType, timezone, enabled: input.enabled !== false };
}

async function validateScheduleTarget(
  client: TenantClient,
  organizationId: string,
  input: RestScheduleInput,
) {
  const agentId = typeof input.agentId === 'string' && input.agentId.trim() !== '' ? input.agentId.trim() : null;
  const divisionId =
    typeof input.divisionId === 'string' && input.divisionId.trim() !== '' ? input.divisionId.trim() : null;
  if (!agentId && !divisionId) fail(422, 'Jadwal harus untuk satu agent atau satu divisi.');
  if (agentId) {
    const agent = await client.agent.findFirst({
      where: { id: agentId, organizationId },
      select: { id: true },
    });
    if (!agent) fail(404, 'Agent tidak ditemukan di kantor ini.');
  }
  if (divisionId) {
    const division = await client.department.findFirst({
      where: { id: divisionId, organizationId },
      select: { id: true },
    });
    if (!division) fail(404, 'Divisi tidak ditemukan di kantor ini.');
  }
  return { agentId, divisionId };
}

/** Daftar jadwal + referensi untuk form (agent + divisi kantor ini). */
export async function listRestSchedules(client: TenantClient, organizationId: string) {
  const [schedules, agents, divisions] = await Promise.all([
    client.agentRestSchedule.findMany({
      orderBy: [{ scheduleType: 'asc' }, { startTime: 'asc' }],
      include: {
        agent: { select: { id: true, name: true } },
        division: { select: { id: true, name: true } },
      },
    }),
    client.agent.findMany({
      where: { organizationId, isEnabled: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    client.department.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  ]);
  return { schedules, agents, divisions };
}

export async function createRestSchedule(client: TenantClient, organizationId: string, input: RestScheduleInput) {
  const valid = validateScheduleInput(input);
  const target = await validateScheduleTarget(client, organizationId, input);
  return client.agentRestSchedule.create({
    data: { ...target, ...valid },
    include: {
      agent: { select: { id: true, name: true } },
      division: { select: { id: true, name: true } },
    },
  });
}

export async function updateRestSchedule(
  client: TenantClient,
  organizationId: string,
  id: string,
  input: Partial<RestScheduleInput>,
) {
  const existing = await client.agentRestSchedule.findUnique({
    where: { id },
    select: { id: true, agentId: true, divisionId: true, startTime: true, endTime: true, scheduleType: true, timezone: true, enabled: true },
  });
  if (!existing) fail(404, 'Jadwal tidak ditemukan.');
  const merged: RestScheduleInput = {
    agentId: input.agentId !== undefined ? input.agentId : existing.agentId,
    divisionId: input.divisionId !== undefined ? input.divisionId : existing.divisionId,
    startTime: input.startTime ?? existing.startTime,
    endTime: input.endTime ?? existing.endTime,
    scheduleType: input.scheduleType ?? existing.scheduleType,
    timezone: input.timezone ?? existing.timezone,
    enabled: input.enabled ?? existing.enabled,
  };
  const valid = validateScheduleInput(merged);
  const target = await validateScheduleTarget(client, organizationId, merged);
  try {
    return await client.agentRestSchedule.update({
      where: { id },
      data: { ...target, ...valid },
      include: {
        agent: { select: { id: true, name: true } },
        division: { select: { id: true, name: true } },
      },
    });
  } catch (e: any) {
    if (e?.code === 'P2025') fail(404, 'Jadwal tidak ditemukan.');
    throw e;
  }
}

export async function deleteRestSchedule(client: TenantClient, id: string) {
  const existing = await client.agentRestSchedule.findUnique({ where: { id }, select: { id: true } });
  if (!existing) fail(404, 'Jadwal tidak ditemukan.');
  await client.agentRestSchedule.delete({ where: { id } });
  return { id };
}

// --- Penempatan agent ke kasur (dipakai POST assign 5a + diuji Fase 7) ---

/** Pindahkan agent ke kasur (satu agent ↔ satu bed aktif; pindah = UPDATE
 *  baris assignment agent itu). Kasur MAINTENANCE -> 409; kasur ditempati
 *  agent lain -> 409; agent sudah di kasur itu -> { moved: false }
 *  (idempotent). Race unique agentId/bedId (P2002) dibiarkan naik ke
 *  pemanggil supaya dipetakan ke 409. */
export async function assignAgentToBed(
  client: TenantClient,
  organizationId: string,
  agentId: string,
  bedId: string,
) {
  const agent = await client.agent.findFirst({
    where: { id: agentId, organizationId },
    select: { id: true, name: true },
  });
  if (!agent) fail(404, 'Agent tidak ditemukan di kantor ini.');
  const bed = await client.residenceBed.findUnique({
    where: { id: bedId },
    select: { id: true, bedCode: true, roomId: true, status: true, room: { select: { residenceId: true, name: true } } },
  });
  if (!bed) fail(404, 'Kasur tidak ditemukan.');
  if (bed.status === 'MAINTENANCE') fail(409, `Kasur ${bed.bedCode} sedang maintenance.`);
  const occupying = await client.agentResidenceAssignment.findUnique({
    where: { bedId: bed.id },
    select: { agentId: true, status: true },
  });
  if (occupying && occupying.agentId !== agent.id && occupying.status === 'ACTIVE') {
    const other = await client.agent.findUnique({ where: { id: occupying.agentId }, select: { name: true } });
    fail(409, `Kasur ${bed.bedCode} sudah ditempati ${other?.name ?? 'agent lain'}.`);
  }
  const existing = await client.agentResidenceAssignment.findUnique({
    where: { agentId: agent.id },
    select: { id: true, bedId: true },
  });
  if (existing && existing.bedId === bed.id) {
    return {
      assignment: { id: existing.id, agentId: agent.id, agentName: agent.name, bedId: bed.id, bedCode: bed.bedCode, roomName: bed.room.name },
      moved: false,
    };
  }
  const assignment = existing
    ? await client.agentResidenceAssignment.update({
        where: { id: existing.id },
        data: { residenceId: bed.room.residenceId, roomId: bed.roomId, bedId: bed.id, assignedAt: new Date(), status: 'ACTIVE' },
        select: { id: true, agentId: true, bedId: true },
      })
    : await client.agentResidenceAssignment.create({
        data: { agentId: agent.id, residenceId: bed.room.residenceId, roomId: bed.roomId, bedId: bed.id, status: 'ACTIVE' },
        select: { id: true, agentId: true, bedId: true },
      });
  return {
    assignment: { ...assignment, agentName: agent.name, bedCode: bed.bedCode, roomName: bed.room.name },
    moved: true,
  };
}
