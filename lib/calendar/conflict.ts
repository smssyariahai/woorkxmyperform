// WOORK WORK CALENDAR — deteksi benturan jadwal.
//
// Hanya MELAPORKAN konflik (peringatan di response), tidak pernah menolak
// pembuatan/pengubahan event. Event CANCELLED/COMPLETED tidak dihitung.

import { prisma } from '../db';
import { expandRecurrence, isRecurring } from './recurrence';

export interface ConflictItem {
  eventId: string;
  title: string;
  startAt: Date;
  endAt: Date;
  /** 'hard' = dua event berwaktu tumpang tindih; 'info' = salah satu all-day. */
  severity: 'hard' | 'info';
  isRecurrenceInstance: boolean;
}

export async function findConflicts(
  orgId: string,
  userIds: string[],
  startAt: Date,
  endAt: Date,
  excludeEventId?: string | null,
  isAllDay?: boolean
): Promise<ConflictItem[]> {
  if (userIds.length === 0) return [];
  const candidates = await prisma.calendarEvent.findMany({
    where: {
      organizationId: orgId,
      status: 'SCHEDULED',
      ...(excludeEventId ? { id: { not: excludeEventId } } : {}),
      AND: [
        {
          OR: [
            { createdById: { in: userIds } },
            { attendees: { some: { userId: { in: userIds } } } },
          ],
        },
        {
          OR: [
            // Tumpang tindih langsung dengan range baru.
            { startAt: { lt: endAt }, endAt: { gt: startAt } },
            // Event berulang yang base-nya mulai sebelum akhir range baru
            // (occurrence-nya bisa jatuh di dalam range).
            { recurrenceRule: { not: null }, startAt: { lte: endAt } },
          ],
        },
      ],
    },
    select: {
      id: true,
      title: true,
      startAt: true,
      endAt: true,
      isAllDay: true,
      recurrenceRule: true,
    },
  });

  const recurringIds = candidates.filter((c) => isRecurring(c)).map((c) => c.id);
  // Exception (edit/batal satu instance) — occurrence yang dikecualikan
  // tidak dihitung sebagai benturan.
  const exceptionStarts = new Map<string, Set<number>>();
  if (recurringIds.length > 0) {
    const exceptions = await prisma.calendarEvent.findMany({
      where: { recurrenceParentId: { in: recurringIds } },
      select: { recurrenceParentId: true, recurrenceOriginalStartAt: true },
    });
    for (const ex of exceptions) {
      if (!ex.recurrenceParentId || !ex.recurrenceOriginalStartAt) continue;
      const set = exceptionStarts.get(ex.recurrenceParentId) ?? new Set<number>();
      set.add(ex.recurrenceOriginalStartAt.getTime());
      exceptionStarts.set(ex.recurrenceParentId, set);
    }
  }

  const out: ConflictItem[] = [];
  for (const c of candidates) {
    const severity: 'hard' | 'info' = isAllDay || c.isAllDay ? 'info' : 'hard';
    if (isRecurring(c)) {
      const occs = expandRecurrence(c, startAt, endAt, exceptionStarts.get(c.id));
      for (const o of occs) {
        out.push({
          eventId: c.id,
          title: c.title,
          startAt: o.startAt,
          endAt: o.endAt,
          severity,
          isRecurrenceInstance: true,
        });
      }
    } else {
      out.push({
        eventId: c.id,
        title: c.title,
        startAt: c.startAt,
        endAt: c.endAt,
        severity,
        isRecurrenceInstance: false,
      });
    }
  }
  return out;
}
