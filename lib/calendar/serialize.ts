// WOORK WORK CALENDAR — serialisasi event untuk response API.
// Bentuk response dipakai semua route /api/calendar/* agar konsisten
// untuk subagent frontend.

import { prisma } from '../db';
import type { Prisma } from '@prisma/client';
import { categoryColor, categoryLabel, sourceUrl, SOURCE_MODULE_LABELS } from './constants';

export interface SerializedAttendee {
  userId: string;
  name: string | null;
  email: string | null;
  responseStatus: string;
  respondedAt: string | null;
}

export interface SerializedReminder {
  id: string;
  userId: string;
  minutesBefore: number;
  remindAt: string;
  deliveryStatus: string;
  sentAt: string | null;
}

export interface SerializedEvent {
  id: string;
  title: string;
  description: string | null;
  category: string;
  categoryLabel: string;
  categoryColor: string;
  startAt: string;
  endAt: string;
  timezone: string;
  isAllDay: boolean;
  location: string | null;
  meetingLink: string | null;
  visibility: string;
  status: string;
  recurrenceRule: string | null;
  isRecurring: boolean;
  isRecurrenceInstance: boolean;
  recurrenceParentId: string | null;
  originalStartAt: string | null;
  sourceModule: string | null;
  sourceModuleLabel: string | null;
  sourceRecordId: string | null;
  sourceUrl: string | null;
  createdById: string;
  createdByName: string | null;
  createdByEmail: string | null;
  metadata: Record<string, unknown>;
  attendees: SerializedAttendee[];
  reminders?: SerializedReminder[];
  createdAt: string;
  updatedAt: string;
}

type EventWithRelations = {
  id: string;
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
  recurrenceRule: string | null;
  recurrenceParentId: string | null;
  recurrenceOriginalStartAt: Date | null;
  sourceModule: string | null;
  sourceRecordId: string | null;
  createdById: string;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
  createdBy: { id: string; name: string | null; email: string | null };
  attendees: Array<{
    userId: string;
    responseStatus: string;
    respondedAt: Date | null;
    user: { id: string; name: string | null; email: string | null };
  }>;
  reminders?: Array<{
    id: string;
    userId: string;
    minutesBefore: number;
    remindAt: Date;
    deliveryStatus: string;
    sentAt: Date | null;
  }>;
};

export function serializeEvent(
  e: EventWithRelations,
  opts?: { includeReminders?: boolean }
): SerializedEvent {
  return {
    id: e.id,
    title: e.title,
    description: e.description,
    category: e.category,
    categoryLabel: categoryLabel(e.category),
    categoryColor: categoryColor(e.category),
    startAt: e.startAt.toISOString(),
    endAt: e.endAt.toISOString(),
    timezone: e.timezone,
    isAllDay: e.isAllDay,
    location: e.location,
    meetingLink: e.meetingLink,
    visibility: e.visibility,
    status: e.status,
    recurrenceRule: e.recurrenceRule,
    isRecurring: !!e.recurrenceRule,
    isRecurrenceInstance: !!e.recurrenceParentId,
    recurrenceParentId: e.recurrenceParentId,
    originalStartAt: e.recurrenceOriginalStartAt
      ? e.recurrenceOriginalStartAt.toISOString()
      : null,
    sourceModule: e.sourceModule,
    sourceModuleLabel: e.sourceModule
      ? SOURCE_MODULE_LABELS[e.sourceModule as keyof typeof SOURCE_MODULE_LABELS] ?? e.sourceModule
      : null,
    sourceRecordId: e.sourceRecordId,
    sourceUrl: sourceUrl(e.sourceModule, e.sourceRecordId),
    createdById: e.createdById,
    createdByName: e.createdBy?.name ?? null,
    createdByEmail: e.createdBy?.email ?? null,
    metadata: (e.metadata ?? {}) as Record<string, unknown>,
    attendees: (e.attendees ?? []).map((a) => ({
      userId: a.userId,
      name: a.user?.name ?? null,
      email: a.user?.email ?? null,
      responseStatus: a.responseStatus,
      respondedAt: a.respondedAt ? a.respondedAt.toISOString() : null,
    })),
    ...(opts?.includeReminders
      ? {
          reminders: (e.reminders ?? []).map((r) => ({
            id: r.id,
            userId: r.userId,
            minutesBefore: r.minutesBefore,
            remindAt: r.remindAt.toISOString(),
            deliveryStatus: r.deliveryStatus,
            sentAt: r.sentAt ? r.sentAt.toISOString() : null,
          })),
        }
      : {}),
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  };
}

/** Serialisasi satu occurrence dari event berulang (instance virtual). */
export function serializeOccurrence(
  parent: EventWithRelations,
  occ: { startAt: Date; endAt: Date; originalStartAt: Date }
): SerializedEvent {
  const base = serializeEvent(parent);
  return {
    ...base,
    id: `${parent.id}@${occ.originalStartAt.toISOString()}`,
    startAt: occ.startAt.toISOString(),
    endAt: occ.endAt.toISOString(),
    isRecurrenceInstance: true,
    recurrenceParentId: parent.id,
    originalStartAt: occ.originalStartAt.toISOString(),
  };
}

const eventInclude = {
  attendees: {
    orderBy: { createdAt: 'asc' as const },
  },
} as const;

/**
 * Gabungkan `createdBy` + `attendees[].user` dari mirror User (Lapisan F).
 * CalendarEvent TIDAK punya relasi `createdBy` dan CalendarAttendee TIDAK
 * punya relasi `user` di tenant client — keduanya ditempel dengan bentuk
 * yang sama seperti include lama (fallback nama/email null bila user tidak
 * ditemukan; `serializeEvent` sudah memakai `?.` untuk keduanya).
 */
async function attachEventUsers<T extends { createdById: string; attendees: Array<{ userId: string }> }>(
  rows: T[]
): Promise<
  Array<
    T & {
      createdBy: { id: string; name: string | null; email: string | null };
      attendees: Array<
        T['attendees'][number] & { user: { id: string; name: string | null; email: string | null } }
      >;
    }
  >
> {
  const userIds = [
    ...new Set([
      ...rows.map((e) => e.createdById),
      ...rows.flatMap((e) => e.attendees.map((a) => a.userId)),
    ]),
  ];
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const byId = new Map(users.map((u) => [u.id, u]));
  return rows.map((e) => ({
    ...e,
    createdBy: byId.get(e.createdById) ?? { id: e.createdById, name: null, email: null },
    attendees: e.attendees.map((a) => ({
      ...a,
      user: byId.get(a.userId) ?? { id: a.userId, name: null, email: null },
    })),
  }));
}

/** Ambil satu event + relasi untuk response. null bila bukan milik org. */
export async function loadEventForResponse(
  id: string,
  organizationId: string,
  includeReminders = false
): Promise<EventWithRelations | null> {
  const e = await prisma.calendarEvent.findFirst({
    where: { id, organizationId },
    include: {
      ...eventInclude,
      ...(includeReminders ? { reminders: { orderBy: { minutesBefore: 'asc' } } } : {}),
    },
  });
  if (!e) return null;
  const [withUsers] = await attachEventUsers([e]);
  return withUsers as unknown as EventWithRelations | null;
}

/** Ambil banyak event + relasi (untuk list/range). */
export async function loadEventsForResponse(
  where: Prisma.CalendarEventWhereInput,
  opts?: { take?: number; skip?: number; orderBy?: any }
): Promise<EventWithRelations[]> {
  const rows = await prisma.calendarEvent.findMany({
    where,
    include: eventInclude,
    take: opts?.take,
    skip: opts?.skip,
    orderBy: opts?.orderBy ?? { startAt: 'asc' },
  });
  const withUsers = await attachEventUsers(rows);
  return withUsers as unknown as EventWithRelations[];
}
