// WOORK WORK CALENDAR — integration engine (Phase 3).
//
// Setiap modul sumber tetap pemilik data bisnisnya. Engine ini hanya
// membaca record sumber lalu membuat/memperbarui CalendarEvent yang
// mereferensikannya (sourceModule + sourceRecordId, idempotent via
// @@unique). TIDAK ada event dummy — hanya sumber yang benar-benar ada.
//
// Kebijakan bila record sumber hilang (dihapus):
// - meeting, invoice  -> event ditandai CANCELLED (jejak jadwal tetap ada)
// - tal_task, tal_cuti, announcement, holiday -> event dihapus
// Kebijakan bila record sumber dibatalkan (status CANCELLED) -> event CANCELLED.
//
// PRIVASI: alasan cuti (TalCuti.reason) dan nominal invoice TIDAK PERNAH
// masuk ke event. Deskripsi event sumber dibiarkan kosong untuk keduanya.

import { prisma } from '../db';
import type { Prisma } from '@prisma/client';
import { isValidSourceModule, type SourceModule } from './constants';

export type SyncAction =
  | 'created'
  | 'updated'
  | 'unchanged'
  | 'cancelled'
  | 'deleted'
  | 'skipped'
  | 'failed';

export interface SyncResult {
  sourceModule: SourceModule;
  sourceRecordId: string;
  action: SyncAction;
  eventId?: string | null;
  error?: string;
}

export interface SyncSummary {
  created: number;
  updated: number;
  cancelled: number;
  deleted: number;
  failed: number;
  skipped: number;
  results: SyncResult[];
}

interface EventData {
  title: string;
  description: string | null;
  category: string;
  startAt: Date;
  endAt: Date;
  timezone: string;
  isAllDay: boolean;
  location: string | null;
  meetingLink: string | null;
  visibility: string;
  status: string;
  createdById: string;
  metadata?: Prisma.InputJsonObject;
  /** userId yang dijadikan attendee (upsert, jangan duplikasi). */
  attendeeUserIds?: string[];
  /** responseStatus default untuk attendee hasil sync (default PENDING). */
  attendeeStatus?: Record<string, string>;
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 24 * 60 * 60 * 1000);
}

function startOfDayUtc(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

/** createdById untuk sumber tanpa pemilik (invoice, holiday): OWNER kantor. */
async function getOrgOwnerUserId(organizationId: string): Promise<string | null> {
  const owner = await prisma.membership.findFirst({
    where: { organizationId, status: 'ACTIVE', role: { name: 'OWNER' } },
    select: { userId: true },
    orderBy: { joinedAt: 'asc' },
  });
  if (owner) return owner.userId;
  const any = await prisma.membership.findFirst({
    where: { organizationId, status: 'ACTIVE' },
    select: { userId: true },
    orderBy: { joinedAt: 'asc' },
  });
  return any?.userId ?? null;
}

async function writeSyncLog(
  organizationId: string,
  sourceModule: SourceModule,
  sourceRecordId: string,
  eventId: string | null,
  syncStatus: 'SYNCED' | 'FAILED',
  errorMessage?: string
): Promise<void> {
  try {
    let retryCount = 0;
    if (syncStatus === 'FAILED') {
      const last = await prisma.calendarSyncLog.findFirst({
        where: { organizationId, sourceModule, sourceRecordId },
        orderBy: { lastSyncedAt: 'desc' },
        select: { retryCount: true, syncStatus: true },
      });
      retryCount = last?.syncStatus === 'FAILED' ? last.retryCount + 1 : 1;
    }
    await prisma.calendarSyncLog.create({
      data: {
        organizationId,
        sourceModule,
        sourceRecordId,
        eventId,
        syncStatus,
        errorMessage: errorMessage ?? null,
        retryCount,
      },
    });
  } catch (e) {
    console.error('[calendar-sync] gagal tulis SyncLog:', (e as Error).message);
  }
}

function eventFieldsChanged(
  existing: {
    title: string;
    description: string | null;
    category: string;
    startAt: Date;
    endAt: Date;
    timezone: string;
    isAllDay: boolean;
    location: string | null;
    meetingLink: string | null;
    visibility: string;
    status: string;
  },
  next: EventData
): boolean {
  return (
    existing.title !== next.title ||
    (existing.description ?? null) !== (next.description ?? null) ||
    existing.category !== next.category ||
    existing.startAt.getTime() !== next.startAt.getTime() ||
    existing.endAt.getTime() !== next.endAt.getTime() ||
    existing.timezone !== next.timezone ||
    existing.isAllDay !== next.isAllDay ||
    (existing.location ?? null) !== (next.location ?? null) ||
    (existing.meetingLink ?? null) !== (next.meetingLink ?? null) ||
    existing.visibility !== next.visibility ||
    existing.status !== next.status
  );
}

async function syncAttendees(
  eventId: string,
  userIds: string[],
  statusMap?: Record<string, string>
): Promise<void> {
  const uniq = [...new Set(userIds.filter(Boolean))];
  for (const userId of uniq) {
    const status = statusMap?.[userId] ?? 'PENDING';
    await prisma.calendarAttendee.upsert({
      where: { eventId_userId: { eventId, userId } },
      update: { responseStatus: status },
      create: { eventId, userId, responseStatus: status },
    });
  }
}

/** Upsert event sumber. Mengembalikan {eventId, action}. */
async function upsertSourceEvent(
  organizationId: string,
  sourceModule: SourceModule,
  sourceRecordId: string,
  data: EventData
): Promise<{ eventId: string; action: 'created' | 'updated' | 'unchanged' }> {
  const existing = await prisma.calendarEvent.findUnique({
    where: { sourceModule_sourceRecordId: { sourceModule, sourceRecordId } },
  });
  const base = {
    organizationId,
    createdById: data.createdById,
    sourceModule,
    sourceRecordId,
    title: data.title,
    description: data.description,
    category: data.category,
    startAt: data.startAt,
    endAt: data.endAt,
    timezone: data.timezone,
    isAllDay: data.isAllDay,
    location: data.location,
    meetingLink: data.meetingLink,
    visibility: data.visibility,
    status: data.status,
    metadata: data.metadata ?? {},
  };
  if (!existing) {
    const created = await prisma.calendarEvent.create({ data: base });
    if (data.attendeeUserIds?.length) {
      await syncAttendees(created.id, data.attendeeUserIds, data.attendeeStatus);
    }
    return { eventId: created.id, action: 'created' };
  }
  // Jangan menimpa event yang sudah CANCELLED oleh penghapusan sumber bila
  // sumbernya muncul lagi dengan status yang sama — tetap perbarui, karena
  // sumber adalah kebenaran (mis. meeting dibuat ulang dengan id sama tidak
  // mungkin; ini hanya pengaman).
  const changed = eventFieldsChanged(existing, data);
  if (changed) {
    await prisma.calendarEvent.update({ where: { id: existing.id }, data: base });
  }
  if (data.attendeeUserIds?.length) {
    await syncAttendees(existing.id, data.attendeeUserIds, data.attendeeStatus);
  }
  return { eventId: existing.id, action: changed ? 'updated' : 'unchanged' };
}

// ---------------------------------------------------------------------------
// Mapping per sumber. Setiap fungsi mengembalikan EventData, atau null bila
// record ini TIDAK boleh masuk kalender (skip), atau { gone: true } bila
// record sudah tidak ada (dipakai syncSourceEvent).
// ---------------------------------------------------------------------------

async function mapMeeting(
  organizationId: string,
  m: {
    id: string;
    hostId: string;
    title: string;
    description: string | null;
    startsAt: Date;
    endsAt: Date | null;
    timezone: string;
    location: string | null;
    joinUrl: string | null;
    status: string;
    meetingType: string;
  }
): Promise<EventData | null> {
  const participants = await prisma.meetingParticipant.findMany({
    where: { meetingId: m.id },
    select: { userId: true, status: true, respondedAt: true },
  });
  const statusMap: Record<string, string> = {};
  const attendeeIds: string[] = [m.hostId];
  statusMap[m.hostId] = 'ACCEPTED';
  const partStatus: Record<string, string> = {
    INVITED: 'PENDING',
    ACCEPTED: 'ACCEPTED',
    DECLINED: 'DECLINED',
    TENTATIVE: 'TENTATIVE',
    ATTENDED: 'ACCEPTED',
    ABSENT: 'DECLINED',
  };
  for (const p of participants) {
    if (!p.userId) continue; // tamu eksternal tanpa akun — bukan attendee kalender
    attendeeIds.push(p.userId);
    statusMap[p.userId] = partStatus[p.status] ?? 'PENDING';
  }
  const status =
    m.status === 'CANCELLED' ? 'CANCELLED' : m.status === 'COMPLETED' ? 'COMPLETED' : 'SCHEDULED';
  return {
    title: m.title,
    description: m.description,
    category: 'meeting',
    startAt: m.startsAt,
    endAt: m.endsAt ?? new Date(m.startsAt.getTime() + 60 * 60 * 1000),
    timezone: m.timezone || 'Asia/Jakarta',
    isAllDay: false,
    location: m.location,
    meetingLink: m.joinUrl,
    visibility: 'COMPANY',
    status,
    createdById: m.hostId,
    metadata: { meetingType: m.meetingType },
    attendeeUserIds: attendeeIds,
    attendeeStatus: statusMap,
  };
}

function mapTalTask(t: {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  taskDate: Date | null;
  status: string;
}): EventData | null {
  if (!t.taskDate) return null; // tanpa tanggal = tidak masuk kalender
  const start = startOfDayUtc(new Date(t.taskDate));
  return {
    title: t.title,
    description: t.description,
    category: 'task',
    startAt: start,
    endAt: addDays(start, 1),
    timezone: 'Asia/Jakarta',
    isAllDay: true,
    location: null,
    meetingLink: null,
    visibility: 'TEAM',
    status: t.status === 'done' ? 'COMPLETED' : 'SCHEDULED',
    createdById: t.userId,
    // assignedUsers berbentuk Json bebas (tidak ada kontrak pasti) — hanya
    // pemilik tugas yang dijadikan attendee agar tidak mengarang user.
    attendeeUserIds: [t.userId],
    attendeeStatus: { [t.userId]: 'ACCEPTED' },
  };
}

function mapTalCuti(c: {
  id: string;
  userId: string;
  userName: string | null;
  cutiDate: Date;
}): EventData {
  const start = startOfDayUtc(new Date(c.cutiDate));
  return {
    // PENTING: reason TIDAK dimasukkan ke mana pun (privasi cuti).
    title: `Cuti — ${c.userName ?? 'Karyawan'}`,
    description: null,
    category: 'leave',
    startAt: start,
    endAt: addDays(start, 1),
    timezone: 'Asia/Jakarta',
    isAllDay: true,
    location: null,
    meetingLink: null,
    visibility: 'TEAM',
    status: 'SCHEDULED',
    createdById: c.userId,
    attendeeUserIds: [c.userId],
    attendeeStatus: { [c.userId]: 'ACCEPTED' },
  };
}

async function mapInvoice(
  organizationId: string,
  inv: { id: string; number: string; status: string; dueDate: Date }
): Promise<EventData | null> {
  const ownerId = await getOrgOwnerUserId(organizationId);
  if (!ownerId) return null;
  const start = startOfDayUtc(new Date(inv.dueDate));
  const status =
    inv.status === 'PAID' ? 'COMPLETED' : inv.status === 'CANCELLED' ? 'CANCELLED' : 'SCHEDULED';
  return {
    // PENTING: nominal/total TIDAK dimasukkan ke mana pun.
    title: `Jatuh tempo invoice ${inv.number ?? inv.id}`,
    description: null,
    category: 'finance',
    startAt: start,
    endAt: addDays(start, 1),
    timezone: 'Asia/Jakarta',
    isAllDay: true,
    location: null,
    meetingLink: null,
    visibility: 'COMPANY',
    status,
    createdById: ownerId,
    metadata: { invoiceNumber: inv.number },
  };
}

function mapAnnouncement(a: {
  id: string;
  authorId: string;
  title: string;
  summary: string;
  status: string;
  scheduledAt: Date | null;
  sentAt: Date | null;
  createdAt: Date;
}): EventData | null {
  if (a.status === 'draft') return null; // draft tidak tampil di kalender
  const start = a.scheduledAt ?? a.sentAt ?? a.createdAt;
  return {
    title: a.title,
    description: a.summary || null,
    category: 'company',
    startAt: start,
    endAt: new Date(start.getTime() + 60 * 60 * 1000),
    timezone: 'Asia/Jakarta',
    isAllDay: false,
    location: null,
    meetingLink: null,
    visibility: 'COMPANY',
    status: 'SCHEDULED',
    createdById: a.authorId,
  };
}

async function mapHoliday(
  organizationId: string,
  h: { id: string; name: string | null; holidayDate: Date; payload: unknown }
): Promise<EventData | null> {
  const ownerId = await getOrgOwnerUserId(organizationId);
  if (!ownerId) return null;
  const start = startOfDayUtc(new Date(h.holidayDate));
  const payload =
    h.payload && typeof h.payload === 'object' ? (h.payload as Record<string, unknown>) : {};
  return {
    title: h.name ?? 'Hari Libur',
    description: typeof payload.description === 'string' ? payload.description : null,
    category: 'company',
    startAt: start,
    endAt: addDays(start, 1),
    timezone: 'Asia/Jakarta',
    isAllDay: true,
    location: null,
    meetingLink: null,
    visibility: 'COMPANY',
    status: 'SCHEDULED',
    createdById: ownerId,
    metadata: {
      holidayCategory:
        typeof payload.category === 'string' ? payload.category : 'kantor',
    },
  };
}

/**
 * Lembur yang disetujui -> event kalender (kategori 'attendance').
 * Hanya APPROVED yang masuk kalender; PENDING/REJECTED mengembalikan null
 * sehingga syncSourceEvent menghapus event lama bila ada (lembur dibatalkan
 * / ditolak setelah disetujui). Alasan lembur TIDAK dimasukkan ke deskripsi.
 */
function mapOvertime(o: {
  id: string;
  userId: string;
  date: Date;
  startTime: string;
  endTime: string;
  status: string;
}): EventData | null {
  if (o.status !== 'APPROVED') return null;
  const parse = (v: string): number | null => {
    const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(v.trim());
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };
  const startMin = parse(o.startTime);
  const endMin = parse(o.endTime);
  if (startMin === null || endMin === null) return null;
  // Awal hari dalam Asia/Jakarta (UTC+7, tanpa DST).
  const day = new Date(o.date);
  const utcMidnight = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate());
  const startAt = new Date(utcMidnight - 7 * 60 * 60 * 1000 + startMin * 60 * 1000);
  let endAt = new Date(utcMidnight - 7 * 60 * 60 * 1000 + endMin * 60 * 1000);
  if (endAt.getTime() <= startAt.getTime()) endAt = new Date(endAt.getTime() + 24 * 60 * 60 * 1000);
  return {
    title: 'Lembur',
    description: null,
    category: 'attendance',
    startAt,
    endAt,
    timezone: 'Asia/Jakarta',
    isAllDay: false,
    location: null,
    meetingLink: null,
    visibility: 'TEAM',
    status: 'SCHEDULED',
    createdById: o.userId,
    metadata: { overtimeId: o.id },
    attendeeUserIds: [o.userId],
    attendeeStatus: { [o.userId]: 'ACCEPTED' },
  };
}

// ---------------------------------------------------------------------------
// Inti engine
// ---------------------------------------------------------------------------

/** Ambil record sumber mentah (tanpa mapping). null = record tidak ada. */
async function fetchSourceRecord(
  organizationId: string,
  sourceModule: SourceModule,
  sourceRecordId: string
): Promise<unknown | null> {
  switch (sourceModule) {
    case 'meeting':
      return prisma.meeting.findFirst({ where: { id: sourceRecordId, organizationId } });
    case 'tal_task':
      return prisma.talTask.findFirst({ where: { id: sourceRecordId, organizationId } });
    case 'tal_cuti':
      return prisma.talCuti.findFirst({ where: { id: sourceRecordId, organizationId } });
    case 'invoice':
      return prisma.invoice.findFirst({ where: { id: sourceRecordId, organizationId } });
    case 'announcement':
      return prisma.announcement.findFirst({ where: { id: sourceRecordId, organizationId } });
    case 'holiday':
      return prisma.talHoliday.findFirst({ where: { id: sourceRecordId, organizationId } });
    case 'attendance':
      // OvertimeRequest yang disetujui -> event lembur di kalender.
      return prisma.overtimeRequest.findFirst({ where: { id: sourceRecordId, organizationId } });
    default:
      return null;
  }
}

/** Mapping record mentah -> EventData (null = skip, jangan buat event). */
async function mapRecord(
  organizationId: string,
  sourceModule: SourceModule,
  record: any
): Promise<EventData | null> {
  switch (sourceModule) {
    case 'meeting':
      return mapMeeting(organizationId, record);
    case 'tal_task':
      return mapTalTask(record);
    case 'tal_cuti':
      return mapTalCuti(record);
    case 'invoice':
      return mapInvoice(organizationId, record);
    case 'announcement':
      return mapAnnouncement(record);
    case 'holiday':
      return mapHoliday(organizationId, record);
    case 'attendance':
      return mapOvertime(record);
    default:
      return null;
  }
}

/**
 * Kebijakan bila record sumber sudah tidak ada:
 * meeting/invoice -> event CANCELLED; sisanya -> event dihapus.
 */
async function handleMissingSource(
  organizationId: string,
  sourceModule: SourceModule,
  sourceRecordId: string
): Promise<SyncResult> {
  const existing = await prisma.calendarEvent.findUnique({
    where: { sourceModule_sourceRecordId: { sourceModule, sourceRecordId } },
    select: { id: true, organizationId: true },
  });
  if (!existing || existing.organizationId !== organizationId) {
    return { sourceModule, sourceRecordId, action: 'skipped', eventId: null };
  }
  if (sourceModule === 'meeting' || sourceModule === 'invoice') {
    await prisma.calendarEvent.update({
      where: { id: existing.id },
      data: { status: 'CANCELLED' },
    });
    await writeSyncLog(organizationId, sourceModule, sourceRecordId, existing.id, 'SYNCED');
    return { sourceModule, sourceRecordId, action: 'cancelled', eventId: existing.id };
  }
  await prisma.calendarEvent.delete({ where: { id: existing.id } });
  await writeSyncLog(organizationId, sourceModule, sourceRecordId, null, 'SYNCED');
  return { sourceModule, sourceRecordId, action: 'deleted', eventId: null };
}

/** Sinkronkan satu record sumber (idempotent). */
export async function syncSourceEvent(
  organizationId: string,
  sourceModule: string,
  sourceRecordId: string
): Promise<SyncResult> {
  if (!isValidSourceModule(sourceModule)) {
    return {
      sourceModule: sourceModule as SourceModule,
      sourceRecordId,
      action: 'failed',
      error: `sourceModule tidak valid: ${sourceModule}`,
    };
  }
  try {
    const record = await fetchSourceRecord(organizationId, sourceModule, sourceRecordId);
    if (!record) return handleMissingSource(organizationId, sourceModule, sourceRecordId);
    const data = await mapRecord(organizationId, sourceModule, record);
    if (!data) {
      // Sumber ada tapi tidak boleh masuk kalender (mis. announcement draft,
      // tugas tanpa tanggal). Hapus event lama bila ada agar tidak basi.
      const existing = await prisma.calendarEvent.findUnique({
        where: { sourceModule_sourceRecordId: { sourceModule, sourceRecordId } },
        select: { id: true },
      });
      if (existing) {
        await prisma.calendarEvent.delete({ where: { id: existing.id } });
        await writeSyncLog(organizationId, sourceModule, sourceRecordId, null, 'SYNCED');
        return { sourceModule, sourceRecordId, action: 'deleted', eventId: null };
      }
      return { sourceModule, sourceRecordId, action: 'skipped', eventId: null };
    }
    const { eventId, action } = await upsertSourceEvent(
      organizationId,
      sourceModule,
      sourceRecordId,
      data
    );
    if (action !== 'unchanged') {
      await writeSyncLog(organizationId, sourceModule, sourceRecordId, eventId, 'SYNCED');
    }
    return { sourceModule, sourceRecordId, action, eventId };
  } catch (e) {
    const msg = (e as Error).message;
    await writeSyncLog(organizationId, sourceModule, sourceRecordId, null, 'FAILED', msg);
    return { sourceModule, sourceRecordId, action: 'failed', error: msg };
  }
}

function emptySummary(): SyncSummary {
  return { created: 0, updated: 0, cancelled: 0, deleted: 0, failed: 0, skipped: 0, results: [] };
}

function tally(summary: SyncSummary, r: SyncResult): void {
  summary.results.push(r);
  switch (r.action) {
    case 'created':
      summary.created += 1;
      break;
    case 'updated':
      summary.updated += 1;
      break;
    case 'cancelled':
      summary.cancelled += 1;
      break;
    case 'deleted':
      summary.deleted += 1;
      break;
    case 'failed':
      summary.failed += 1;
      break;
    default:
      summary.skipped += 1;
      break;
  }
}

/** Sinkronkan SEMUA sumber di satu organisasi + sapu event yatim (orphan sweep). */
export async function syncAllSources(organizationId: string): Promise<SyncSummary> {
  const summary = emptySummary();
  const [meetings, tasks, cutis, invoices, announcements, holidays, overtimes] = await Promise.all([
    prisma.meeting.findMany({ where: { organizationId }, select: { id: true } }),
    prisma.talTask.findMany({
      where: { organizationId, taskDate: { not: null } },
      select: { id: true },
    }),
    prisma.talCuti.findMany({ where: { organizationId }, select: { id: true } }),
    prisma.invoice.findMany({ where: { organizationId }, select: { id: true } }),
    prisma.announcement.findMany({ where: { organizationId }, select: { id: true } }),
    prisma.talHoliday.findMany({ where: { organizationId }, select: { id: true } }),
    prisma.overtimeRequest.findMany({ where: { organizationId }, select: { id: true } }),
  ]);
  const jobs: Array<[SourceModule, string]> = [
    ...meetings.map((m): [SourceModule, string] => ['meeting', m.id]),
    ...tasks.map((t): [SourceModule, string] => ['tal_task', t.id]),
    ...cutis.map((c): [SourceModule, string] => ['tal_cuti', c.id]),
    ...invoices.map((i): [SourceModule, string] => ['invoice', i.id]),
    ...announcements.map((a): [SourceModule, string] => ['announcement', a.id]),
    ...holidays.map((h): [SourceModule, string] => ['holiday', h.id]),
    ...overtimes.map((o): [SourceModule, string] => ['attendance', o.id]),
  ];
  const liveIds = new Set(jobs.map(([m, id]) => `${m}:${id}`));
  for (const [mod, id] of jobs) {
    tally(summary, await syncSourceEvent(organizationId, mod, id));
  }
  // Orphan sweep: event sumber yang record-nya sudah tidak ada lagi.
  const syncedEvents = await prisma.calendarEvent.findMany({
    where: { organizationId, sourceModule: { not: null } },
    select: { id: true, sourceModule: true, sourceRecordId: true },
  });
  for (const ev of syncedEvents) {
    if (!ev.sourceModule || !ev.sourceRecordId) continue;
    if (liveIds.has(`${ev.sourceModule}:${ev.sourceRecordId}`)) continue;
    tally(summary, await handleMissingSource(organizationId, ev.sourceModule as SourceModule, ev.sourceRecordId));
  }
  return summary;
}
