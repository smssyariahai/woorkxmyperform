// WOORK DAILY WORKSPACE — loader agenda harian (CalendarEvent + Meeting).
// Meeting yang sudah tersinkron ke kalender tampil SEKALI (dikenali lewat
// sourceModule='meeting' + sourceRecordId). Visibilitas kalender diterapkan
// di backend (canSeeEvent) — event PRIVATE orang lain tidak pernah bocor.

import { prisma } from '../db';
import {
  canSeeEvent,
  getViewerDepartmentId,
  getCreatorDepartmentIds,
} from '../calendar/visibility';
import { categoryColor, categoryLabel } from '../calendar/constants';
import { expandRecurrence } from '../calendar/recurrence';
import {
  serializeEvent,
  serializeOccurrence,
  loadEventsForResponse,
  type SerializedEvent,
} from '../calendar/serialize';
import { dayBounds } from './helpers';

/**
 * Gabungkan host + user peserta ke daftar meeting (Lapisan F).
 * Meeting TIDAK punya relasi `host` dan MeetingParticipant TIDAK punya
 * relasi `user` di tenant client — keduanya diambil terpisah dari mirror
 * User lalu ditempel dengan bentuk yang sama (`host: {id, name, email}`,
 * `participants[].user: {id, name, email} | null`). Dipakai juga
 * `app/api/daily/meetings/route.ts`.
 */
export async function attachMeetingUsers<
  T extends { hostId: string; participants: Array<{ userId: string | null }> },
>(
  rows: T[]
): Promise<
  Array<
    Omit<T, 'participants'> & {
      host: { id: string; name: string; email: string };
      participants: Array<T['participants'][number] & { user: { id: string; name: string; email: string } | null }>;
    }
  >
> {
  const userIds = [
    ...new Set(
      [...rows.map((m) => m.hostId), ...rows.flatMap((m) => m.participants.map((p) => p.userId))].filter(
        (id): id is string => !!id
      )
    ),
  ];
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const byId = new Map(users.map((u) => [u.id, u]));
  return rows.map((m) => ({
    ...m,
    host: byId.get(m.hostId) ?? { id: m.hostId, name: 'Pengguna', email: '' },
    participants: m.participants.map((p) => ({
      ...p,
      user: p.userId ? (byId.get(p.userId) ?? null) : null,
    })),
  }));
}

export interface ScheduleItem {
  kind: 'event' | 'meeting';
  id: string;
  title: string;
  description: string | null;
  startAt: string;
  endAt: string;
  isAllDay: boolean;
  category: string;
  categoryLabel: string;
  categoryColor: string;
  location: string | null;
  meetingLink: string | null;
  joinActive: boolean;
  status: string;
  timeStatus: 'now' | 'upcoming' | 'completed' | 'cancelled';
  sourceModule: string | null;
  sourceModuleLabel: string | null;
  sourceUrl: string | null;
  ownerId: string | null;
  ownerName: string | null;
  attendeeNames: string[];
}

function timeStatusOf(
  startAt: Date,
  endAt: Date,
  status: string,
  now: Date
): ScheduleItem['timeStatus'] {
  if (status === 'CANCELLED') return 'cancelled';
  if (status === 'COMPLETED') return 'completed';
  if (now >= startAt && now <= endAt) return 'now';
  if (now > endAt) return 'completed';
  return 'upcoming';
}

function eventToItem(e: SerializedEvent, now: Date): ScheduleItem {
  const start = new Date(e.startAt);
  const end = new Date(e.endAt);
  return {
    kind: 'event',
    id: e.id,
    title: e.title,
    description: e.description,
    startAt: e.startAt,
    endAt: e.endAt,
    isAllDay: e.isAllDay,
    category: e.category,
    categoryLabel: e.categoryLabel,
    categoryColor: e.categoryColor,
    location: e.location,
    meetingLink: e.meetingLink,
    joinActive: !!e.meetingLink,
    status: e.status,
    timeStatus: timeStatusOf(start, end, e.status, now),
    sourceModule: e.sourceModule,
    sourceModuleLabel: e.sourceModuleLabel,
    sourceUrl: e.sourceUrl,
    ownerId: e.createdById,
    ownerName: e.createdByName,
    attendeeNames: e.attendees.map((a) => a.name).filter(Boolean) as string[],
  };
}

export interface DayScheduleOptions {
  organizationId: string;
  userId: string;
  dayKey: string;
  tz: string;
}

/** Agenda satu hari untuk satu pengguna (dipakai /api/daily/schedule). */
export async function loadDaySchedule(opts: DayScheduleOptions): Promise<ScheduleItem[]> {
  const { organizationId, userId, dayKey, tz } = opts;
  const { start, end } = dayBounds(dayKey, tz);
  const now = new Date();

  // --- 1. CalendarEvent yang tumpang tindih dengan hari itu ---
  const events = await loadEventsForResponse(
    {
      organizationId,
      AND: [
        {
          OR: [
            { startAt: { lte: end }, endAt: { gte: start } },
            { recurrenceRule: { not: null }, startAt: { lte: end } },
          ],
        },
      ],
    },
    { take: 500, orderBy: { startAt: 'asc' } }
  );

  const viewerDepartmentId = await getViewerDepartmentId(userId, organizationId);
  const creatorDept = await getCreatorDepartmentIds(
    organizationId,
    events.map((e) => e.createdById)
  );
  const visible = events.filter((e) =>
    canSeeEvent(
      { id: userId, departmentId: viewerDepartmentId },
      {
        createdById: e.createdById,
        visibility: e.visibility,
        attendeeIds: e.attendees.map((a) => a.userId),
      },
      creatorDept.get(e.createdById) ?? null
    )
  );

  // Ekspansi recurring di dalam hari itu (exception di-skip).
  const parentIds = visible.filter((e) => e.recurrenceRule).map((e) => e.id);
  const exceptionStarts = new Map<string, Set<number>>();
  if (parentIds.length > 0) {
    const exceptions = await prisma.calendarEvent.findMany({
      where: { recurrenceParentId: { in: parentIds } },
      select: { recurrenceParentId: true, recurrenceOriginalStartAt: true },
    });
    for (const ex of exceptions) {
      if (!ex.recurrenceParentId || !ex.recurrenceOriginalStartAt) continue;
      const set = exceptionStarts.get(ex.recurrenceParentId) ?? new Set<number>();
      set.add(ex.recurrenceOriginalStartAt.getTime());
      exceptionStarts.set(ex.recurrenceParentId, set);
    }
  }

  const items: ScheduleItem[] = [];
  const syncedMeetingIds = new Set<string>();
  for (const e of visible) {
    if (e.sourceModule === 'meeting' && e.sourceRecordId) {
      syncedMeetingIds.add(e.sourceRecordId);
    }
    if (e.recurrenceRule) {
      // Hanya occurrence di dalam hari itu (base start yang jatuh di hari
      // ini sudah termasuk sebagai occurrence pertama — jangan dobel).
      const occs = expandRecurrence(e, start, end, exceptionStarts.get(e.id));
      for (const o of occs) items.push(eventToItem(serializeOccurrence(e, o), now));
    } else {
      items.push(eventToItem(serializeEvent(e), now));
    }
  }

  // --- 2. Meeting yang BELUM tersinkron ke kalender ---
  const meetings = await attachMeetingUsers(
    await prisma.meeting.findMany({
      where: {
        organizationId,
        status: { not: 'DRAFT' },
        startsAt: { gte: start, lt: end },
        OR: [
          { hostId: userId },
          { participants: { some: { userId } } },
        ],
      },
      include: { participants: true },
      orderBy: { startsAt: 'asc' },
    })
  );

  for (const m of meetings) {
    if (syncedMeetingIds.has(m.id)) continue; // sudah tampil sebagai event kalender
    const mStart = new Date(m.startsAt);
    const mEnd = m.endsAt ? new Date(m.endsAt) : new Date(mStart.getTime() + 60 * 60 * 1000);
    items.push({
      kind: 'meeting',
      id: m.id,
      title: m.title,
      description: m.description ?? null,
      startAt: mStart.toISOString(),
      endAt: mEnd.toISOString(),
      isAllDay: false,
      category: 'meeting',
      categoryLabel: 'Meeting',
      categoryColor: categoryColor('meeting'),
      location: m.location ?? null,
      meetingLink: m.joinUrl ?? null,
      joinActive: !!(m.joinUrl || m.roomName),
      status: m.status,
      timeStatus: timeStatusOf(mStart, mEnd, m.status, now),
      sourceModule: 'meeting',
      sourceModuleLabel: 'WOORK MEET',
      sourceUrl: `/meet/${m.id}`,
      ownerId: m.hostId,
      ownerName: m.host?.name ?? null,
      attendeeNames: m.participants
        .map((p) => p.user?.name ?? p.guestName)
        .filter(Boolean) as string[],
    });
  }

  items.sort((a, b) => a.startAt.localeCompare(b.startAt));
  return items;
}

/** Agenda satu hari untuk anggota tim (dipakai /api/daily/team). */
export async function loadTeamDaySchedule(
  organizationId: string,
  managerId: string,
  memberIds: string[],
  dayKey: string,
  tz: string
): Promise<ScheduleItem[]> {
  const { start, end } = dayBounds(dayKey, tz);
  const now = new Date();
  const items: ScheduleItem[] = [];

  const events = await loadEventsForResponse(
    {
      organizationId,
      status: { not: 'CANCELLED' },
      OR: [
        { createdById: { in: memberIds } },
        { attendees: { some: { userId: { in: memberIds } } } },
      ],
      AND: [
        {
          OR: [
            { startAt: { lte: end }, endAt: { gte: start } },
            { recurrenceRule: { not: null }, startAt: { lte: end } },
          ],
        },
      ],
    },
    { take: 500, orderBy: { startAt: 'asc' } }
  );

  // Manager hanya boleh melihat event COMPANY/TEAM (+ yang ia buat/diundang).
  // Event PRIVATE anggota tim TIDAK tampil.
  const viewerDepartmentId = await getViewerDepartmentId(managerId, organizationId);
  const creatorDept = await getCreatorDepartmentIds(
    organizationId,
    events.map((e) => e.createdById)
  );
  const syncedMeetingIds = new Set<string>();
  for (const e of events) {
    if (e.visibility === 'PRIVATE' && e.createdById !== managerId) continue;
    if (e.visibility === 'CUSTOM' && e.createdById !== managerId) continue;
    const ok = canSeeEvent(
      { id: managerId, departmentId: viewerDepartmentId },
      {
        createdById: e.createdById,
        visibility: e.visibility,
        attendeeIds: e.attendees.map((a) => a.userId),
      },
      creatorDept.get(e.createdById) ?? null
    );
    if (!ok) continue;
    if (e.sourceModule === 'meeting' && e.sourceRecordId) {
      syncedMeetingIds.add(e.sourceRecordId);
    }
    if (e.recurrenceRule) {
      const occs = expandRecurrence(e, start, end);
      for (const o of occs) items.push(eventToItem(serializeOccurrence(e, o), now));
    } else {
      items.push(eventToItem(serializeEvent(e), now));
    }
  }

  const meetings = await attachMeetingUsers(
    await prisma.meeting.findMany({
      where: {
        organizationId,
        status: { not: 'DRAFT' },
        startsAt: { gte: start, lt: end },
        OR: [
          { hostId: { in: memberIds } },
          { participants: { some: { userId: { in: memberIds } } } },
        ],
      },
      include: { participants: true },
      orderBy: { startsAt: 'asc' },
    })
  );
  for (const m of meetings) {
    if (syncedMeetingIds.has(m.id)) continue;
    const mStart = new Date(m.startsAt);
    const mEnd = m.endsAt ? new Date(m.endsAt) : new Date(mStart.getTime() + 60 * 60 * 1000);
    items.push({
      kind: 'meeting',
      id: m.id,
      title: m.title,
      description: m.description ?? null,
      startAt: mStart.toISOString(),
      endAt: mEnd.toISOString(),
      isAllDay: false,
      category: 'meeting',
      categoryLabel: 'Meeting',
      categoryColor: categoryColor('meeting'),
      location: m.location ?? null,
      meetingLink: m.joinUrl ?? null,
      joinActive: !!(m.joinUrl || m.roomName),
      status: m.status,
      timeStatus: timeStatusOf(mStart, mEnd, m.status, now),
      sourceModule: 'meeting',
      sourceModuleLabel: 'WOORK MEET',
      sourceUrl: `/meet/${m.id}`,
      ownerId: m.hostId,
      ownerName: m.host?.name ?? null,
      attendeeNames: m.participants
        .map((p) => p.user?.name ?? p.guestName)
        .filter(Boolean) as string[],
    });
  }

  items.sort((a, b) => a.startAt.localeCompare(b.startAt));
  return items;
}
