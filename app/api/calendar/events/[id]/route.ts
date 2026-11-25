// GET /api/calendar/events/[id] — detail event.
// PUT — edit event (scope=series|instance|following).
// DELETE — hapus event (scope=series|instance|following).
//
// Event dari modul sumber TIDAK bisa diedit/dihapus dari kalender
// (403 + pesan jelas) — ubah lewat modul sumbernya.
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requirePermission, getUserPermissions } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';
import { EVENT_CATEGORY_KEYS, EVENT_VISIBILITIES } from '@/lib/calendar/constants';
import {
  canSeeEvent,
  canEditEvent,
  canDeleteEvent,
  getViewerDepartmentId,
  getCreatorDepartmentIds,
  hasCalendarManage,
} from '@/lib/calendar/visibility';
import {
  parseRRule,
  parseRRuleParts,
  expandRecurrence,
  isRecurring,
  rebuildRRuleForFollowing,
  truncateRRule,
} from '@/lib/calendar/recurrence';
import { findConflicts } from '@/lib/calendar/conflict';
import { serializeEvent, loadEventForResponse } from '@/lib/calendar/serialize';

export const dynamic = 'force-dynamic';

const CATEGORY_KEYS = EVENT_CATEGORY_KEYS;

type Scope = 'series' | 'instance' | 'following';

function parseScope(sp: URLSearchParams): Scope | null {
  const s = sp.get('scope') ?? 'series';
  return s === 'series' || s === 'instance' || s === 'following' ? s : null;
}

/** Cari occurrence event berulang pada tanggal instanceStart (toleransi ±1 hari). */
function findOccurrence(
  event: { startAt: Date; endAt: Date; recurrenceRule: string | null },
  instanceStart: Date
): { startAt: Date; endAt: Date } | null {
  const day = 24 * 60 * 60 * 1000;
  const occs = expandRecurrence(
    event,
    new Date(instanceStart.getTime() - day),
    new Date(instanceStart.getTime() + day)
  );
  const hit = occs.find((o) => o.startAt.getTime() === instanceStart.getTime());
  return hit ? { startAt: hit.startAt, endAt: hit.endAt } : null;
}

async function loadVisibleEvent(
  id: string,
  ctx: { userId: string; organizationId: string }
) {
  const event = await loadEventForResponse(id, ctx.organizationId, true);
  if (!event) return null;
  const viewerDepartmentId = await getViewerDepartmentId(ctx.userId, ctx.organizationId);
  const creatorDept = await getCreatorDepartmentIds(ctx.organizationId, [event.createdById]);
  const visible = canSeeEvent(
    { id: ctx.userId, departmentId: viewerDepartmentId },
    {
      createdById: event.createdById,
      visibility: event.visibility,
      attendeeIds: event.attendees.map((a) => a.userId),
    },
    creatorDept.get(event.createdById) ?? null
  );
  return visible ? event : null;
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('CALENDAR_VIEW', req);
    const event = await loadVisibleEvent(params.id, ctx);
    if (!event) return apiErr('Event tidak ditemukan.', 404);
    return apiOk({ event: serializeEvent(event, { includeReminders: true }) });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('[calendar/events/[id] GET]', e);
    return apiErr('Gagal memuat detail event.', 500);
  }
}

const updateSchema = z
  .object({
    title: z.string().trim().min(1, 'Judul event wajib diisi.').max(300).optional(),
    description: z.string().trim().max(5000).nullable().optional(),
    category: z
      .string()
      .refine((v) => CATEGORY_KEYS.includes(v), 'Kategori tidak valid.')
      .optional(),
    startAt: z.string().optional(),
    endAt: z.string().nullable().optional(),
    isAllDay: z.boolean().optional(),
    timezone: z.string().trim().max(64).optional(),
    location: z.string().trim().max(300).nullable().optional(),
    meetingLink: z.string().trim().max(500).nullable().optional(),
    visibility: z
      .string()
      .refine((v) => (EVENT_VISIBILITIES as readonly string[]).includes(v), 'Visibility tidak valid.')
      .optional(),
    status: z.enum(['SCHEDULED', 'COMPLETED', 'CANCELLED']).optional(),
    recurrenceRule: z.string().trim().nullable().optional(),
    reminders: z.array(z.number().int().min(0).max(43200)).max(5).optional(),
    attendeeIds: z.array(z.string().min(1)).max(200).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.startAt && Number.isNaN(new Date(data.startAt).getTime())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['startAt'], message: 'Tanggal mulai tidak valid.' });
    }
    if (data.endAt && Number.isNaN(new Date(data.endAt).getTime())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endAt'], message: 'Tanggal selesai tidak valid.' });
    }
    if (data.recurrenceRule && !parseRRule(data.recurrenceRule)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['recurrenceRule'],
        message: 'Aturan pengulangan (RRULE) tidak valid.',
      });
    }
  });

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('CALENDAR_CREATE', req);
    const sp = new URL(req.url).searchParams;
    const scope = parseScope(sp);
    if (!scope) return apiErr('scope harus series, instance, atau following.', 400);

    const event = await loadVisibleEvent(params.id, ctx);
    if (!event) return apiErr('Event tidak ditemukan.', 404);
    const perms = await getUserPermissions(ctx);
    const manage = hasCalendarManage(perms);
    const editCheck = canEditEvent(ctx.userId, event, manage);
    if (!editCheck.allowed) return apiErr(editCheck.reason ?? 'Tidak diizinkan.', 403);

    const body = await req.json().catch(() => null);
    const parsed = updateSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return apiErr(parsed.error.errors[0]?.message ?? 'Data event tidak valid.', 400, parsed.error.errors);
    }
    const d = parsed.data;

    // Validasi endAt > startAt bila keduanya (baru) diketahui.
    const newStart = d.startAt ? new Date(d.startAt) : event.startAt;
    const newEnd = d.endAt ? new Date(d.endAt) : d.endAt === null ? null : event.endAt;
    if (newEnd && newEnd <= newStart) {
      return apiErr('Waktu selesai harus lebih lambat dari waktu mulai.', 400);
    }

    // Attendee baru harus anggota org yang sama.
    let attendeeIds: string[] | undefined;
    if (d.attendeeIds) {
      attendeeIds = [...new Set(d.attendeeIds.filter((id) => id !== ctx.userId))];
      if (attendeeIds.length > 0) {
        const members = await prisma.membership.findMany({
          where: { organizationId: ctx.organizationId, userId: { in: attendeeIds }, status: 'ACTIVE' },
          select: { userId: true },
        });
        const memberIds = new Set(members.map((m) => m.userId));
        if (attendeeIds.some((id) => !memberIds.has(id))) {
          return apiErr('Ada peserta yang bukan anggota kantor ini.', 400);
        }
      }
    }

    const patch: Record<string, unknown> = {};
    if (d.title !== undefined) patch.title = d.title;
    if (d.description !== undefined) patch.description = d.description;
    if (d.category !== undefined) patch.category = d.category;
    if (d.isAllDay !== undefined) patch.isAllDay = d.isAllDay;
    if (d.timezone !== undefined) patch.timezone = d.timezone;
    if (d.location !== undefined) patch.location = d.location;
    if (d.meetingLink !== undefined) patch.meetingLink = d.meetingLink;
    if (d.visibility !== undefined) patch.visibility = d.visibility;
    if (d.status !== undefined) patch.status = d.status;
    if (d.recurrenceRule !== undefined) patch.recurrenceRule = d.recurrenceRule;

    // ---- scope=series: ubah event itu sendiri (atau exception itu sendiri).
    if (scope === 'series' || !isRecurring(event) || event.recurrenceParentId) {
      if (d.startAt !== undefined) patch.startAt = newStart;
      if (d.endAt !== undefined) patch.endAt = newEnd;
      const updated = await prisma.$transaction(async (tx) => {
        const row = await tx.calendarEvent.update({ where: { id: event.id }, data: patch });
        if (attendeeIds !== undefined) {
          await tx.calendarAttendee.deleteMany({ where: { eventId: event.id } });
          for (const userId of attendeeIds) {
            await tx.calendarAttendee.create({
              data: { eventId: event.id, userId, responseStatus: 'PENDING' },
            });
          }
        }
        if (d.reminders !== undefined) {
          await tx.calendarReminder.deleteMany({
            where: { eventId: event.id, userId: ctx.userId, deliveryStatus: 'PENDING' },
          });
          const startForReminder = (patch.startAt as Date | undefined) ?? event.startAt;
          for (const minutes of d.reminders) {
            await tx.calendarReminder.create({
              data: {
                eventId: event.id,
                userId: ctx.userId,
                minutesBefore: minutes,
                remindAt: new Date(startForReminder.getTime() - minutes * 60 * 1000),
                deliveryStatus: 'PENDING',
              },
            });
          }
        }
        return row;
      });
      const conflicts = await findConflicts(
        ctx.organizationId,
        [ctx.userId, ...(attendeeIds ?? event.attendees.map((a) => a.userId))],
        (patch.startAt as Date | undefined) ?? event.startAt,
        (patch.endAt as Date | undefined) ?? event.endAt,
        event.id,
        (patch.isAllDay as boolean | undefined) ?? event.isAllDay
      );
      await audit({
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        action: 'CALENDAR_UPDATE_EVENT',
        module: 'CALENDAR',
        description: `Mengubah event kalender: ${event.title}`,
        ipAddress: getClientIp(req),
      });
      const full = await loadEventForResponse(updated.id, ctx.organizationId, true);
      return apiOk({
        event: full ? serializeEvent(full, { includeReminders: true }) : null,
        conflicts,
      });
    }

    // ---- scope=instance / following: butuh instanceStart.
    const instanceRaw = sp.get('instanceStart');
    if (!instanceRaw) {
      return apiErr('Parameter instanceStart (ISO 8601) wajib untuk scope instance/following.', 400);
    }
    const instanceStart = new Date(instanceRaw);
    if (Number.isNaN(instanceStart.getTime())) {
      return apiErr('instanceStart tidak valid.', 400);
    }
    const occ = findOccurrence(event, instanceStart);
    if (!occ) return apiErr('Instance event pada tanggal tersebut tidak ditemukan.', 400);

    if (scope === 'instance') {
      // Buat exception: event tersendiri yang menunjuk ke induk.
      // Waktu baru dari body bila ada, kalau tidak pakai waktu occurrence.
      const excStart = d.startAt ? new Date(d.startAt) : occ.startAt;
      const excEnd = d.endAt ? new Date(d.endAt) : occ.endAt;
      if (excEnd <= excStart) return apiErr('Waktu selesai harus lebih lambat dari waktu mulai.', 400);
      const created = await prisma.calendarEvent.create({
        data: {
          organizationId: ctx.organizationId,
          createdById: event.createdById,
          sourceModule: null,
          sourceRecordId: null,
          title: (patch.title as string | undefined) ?? event.title,
          description:
            patch.description !== undefined ? (patch.description as string | null) : event.description,
          category: (patch.category as string | undefined) ?? event.category,
          startAt: excStart,
          endAt: excEnd,
          timezone: (patch.timezone as string | undefined) ?? event.timezone,
          isAllDay: (patch.isAllDay as boolean | undefined) ?? event.isAllDay,
          location: patch.location !== undefined ? (patch.location as string | null) : event.location,
          meetingLink:
            patch.meetingLink !== undefined ? (patch.meetingLink as string | null) : event.meetingLink,
          visibility: (patch.visibility as string | undefined) ?? event.visibility,
          status: (patch.status as string | undefined) ?? event.status,
          recurrenceRule: null,
          recurrenceParentId: event.id,
          recurrenceOriginalStartAt: instanceStart,
          metadata: (event.metadata ?? {}) as object,
        },
      });
      await audit({
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        action: 'CALENDAR_UPDATE_EVENT',
        module: 'CALENDAR',
        description: `Mengubah satu instance event kalender: ${event.title} (${instanceStart.toISOString()})`,
        ipAddress: getClientIp(req),
      });
      const full = await loadEventForResponse(created.id, ctx.organizationId, true);
      return apiOk({ event: full ? serializeEvent(full, { includeReminders: true }) : null, conflicts: [] });
    }

    // ---- scope=following: potong RRULE lama + buat rangkaian baru.
    if (!event.recurrenceRule || !parseRRule(event.recurrenceRule)) {
      return apiErr('Event ini tidak berulang.', 400);
    }
    const until = new Date(instanceStart.getTime() - 1000);
    const truncatedRule = truncateRRule(event.recurrenceRule, event.startAt, until);
    const followStart = d.startAt ? new Date(d.startAt) : occ.startAt;
    const followEnd = d.endAt ? new Date(d.endAt) : occ.endAt;
    if (followEnd <= followStart) return apiErr('Waktu selesai harus lebih lambat dari waktu mulai.', 400);
    // Sisa hitungan rangkaian baru: COUNT lama dikurangi occurrence yang
    // sudah lewat sebelum instance ini (agar rangkaian baru berhenti di
    // akhir rangkaian lama, bukan berulang selamanya).
    const oldParts = parseRRuleParts(event.recurrenceRule);
    let remainingCount: number | undefined;
    if (oldParts?.count) {
      const consumed = expandRecurrence(
        event,
        event.startAt,
        new Date(instanceStart.getTime() - 1)
      ).length;
      remainingCount = Math.max(1, oldParts.count - consumed);
    }
    const newRule =
      (patch.recurrenceRule as string | null | undefined) ??
      rebuildRRuleForFollowing(event.recurrenceRule, followStart, remainingCount);
    const created = await prisma.$transaction(async (tx) => {
      await tx.calendarEvent.update({
        where: { id: event.id },
        data: { recurrenceRule: truncatedRule },
      });
      const row = await tx.calendarEvent.create({
        data: {
          organizationId: ctx.organizationId,
          createdById: event.createdById,
          sourceModule: null,
          sourceRecordId: null,
          title: (patch.title as string | undefined) ?? event.title,
          description:
            patch.description !== undefined ? (patch.description as string | null) : event.description,
          category: (patch.category as string | undefined) ?? event.category,
          startAt: followStart,
          endAt: followEnd,
          timezone: (patch.timezone as string | undefined) ?? event.timezone,
          isAllDay: (patch.isAllDay as boolean | undefined) ?? event.isAllDay,
          location: patch.location !== undefined ? (patch.location as string | null) : event.location,
          meetingLink:
            patch.meetingLink !== undefined ? (patch.meetingLink as string | null) : event.meetingLink,
          visibility: (patch.visibility as string | undefined) ?? event.visibility,
          status: (patch.status as string | undefined) ?? event.status,
          recurrenceRule: newRule,
          metadata: (event.metadata ?? {}) as object,
        },
      });
      return row;
    });
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'CALENDAR_UPDATE_EVENT',
      module: 'CALENDAR',
      description: `Mengubah event kalender mulai instance ${instanceStart.toISOString()}: ${event.title}`,
      ipAddress: getClientIp(req),
    });
    const full = await loadEventForResponse(created.id, ctx.organizationId, true);
    return apiOk({ event: full ? serializeEvent(full, { includeReminders: true }) : null, conflicts: [] });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('[calendar/events/[id] PUT]', e);
    return apiErr('Gagal mengubah event kalender.', 500);
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission('CALENDAR_CREATE', req);
    const sp = new URL(req.url).searchParams;
    const scope = parseScope(sp);
    if (!scope) return apiErr('scope harus series, instance, atau following.', 400);

    const event = await loadVisibleEvent(params.id, ctx);
    if (!event) return apiErr('Event tidak ditemukan.', 404);
    const perms = await getUserPermissions(ctx);
    const manage = hasCalendarManage(perms);
    const delCheck = canDeleteEvent(ctx.userId, event, manage);
    if (!delCheck.allowed) return apiErr(delCheck.reason ?? 'Tidak diizinkan.', 403);

    if (scope === 'series' || !isRecurring(event) || event.recurrenceParentId) {
      await prisma.calendarEvent.delete({ where: { id: event.id } });
      await audit({
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        action: 'CALENDAR_DELETE_EVENT',
        module: 'CALENDAR',
        description: `Menghapus event kalender: ${event.title}`,
        ipAddress: getClientIp(req),
      });
      return apiOk({ deleted: true, scope: 'series' });
    }

    const instanceRaw = sp.get('instanceStart');
    if (!instanceRaw) {
      return apiErr('Parameter instanceStart (ISO 8601) wajib untuk scope instance/following.', 400);
    }
    const instanceStart = new Date(instanceRaw);
    if (Number.isNaN(instanceStart.getTime())) {
      return apiErr('instanceStart tidak valid.', 400);
    }
    const occ = findOccurrence(event, instanceStart);
    if (!occ) return apiErr('Instance event pada tanggal tersebut tidak ditemukan.', 400);

    if (scope === 'instance') {
      // Batalkan satu instance: buat exception berstatus CANCELLED.
      await prisma.calendarEvent.create({
        data: {
          organizationId: ctx.organizationId,
          createdById: event.createdById,
          sourceModule: null,
          sourceRecordId: null,
          title: event.title,
          description: event.description,
          category: event.category,
          startAt: occ.startAt,
          endAt: occ.endAt,
          timezone: event.timezone,
          isAllDay: event.isAllDay,
          location: event.location,
          meetingLink: event.meetingLink,
          visibility: event.visibility,
          status: 'CANCELLED',
          recurrenceRule: null,
          recurrenceParentId: event.id,
          recurrenceOriginalStartAt: instanceStart,
          metadata: (event.metadata ?? {}) as object,
        },
      });
      await audit({
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        action: 'CALENDAR_DELETE_EVENT',
        module: 'CALENDAR',
        description: `Membatalkan satu instance event kalender: ${event.title} (${instanceStart.toISOString()})`,
        ipAddress: getClientIp(req),
      });
      return apiOk({ deleted: true, scope: 'instance' });
    }

    // scope=following: potong RRULE lama (tanpa membuat rangkaian baru).
    if (!event.recurrenceRule || !parseRRule(event.recurrenceRule)) {
      return apiErr('Event ini tidak berulang.', 400);
    }
    const until = new Date(instanceStart.getTime() - 1000);
    const truncatedRule = truncateRRule(event.recurrenceRule, event.startAt, until);
    await prisma.calendarEvent.update({
      where: { id: event.id },
      data: { recurrenceRule: truncatedRule },
    });
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'CALENDAR_DELETE_EVENT',
      module: 'CALENDAR',
      description: `Menghapus event kalender mulai instance ${instanceStart.toISOString()}: ${event.title}`,
      ipAddress: getClientIp(req),
    });
    return apiOk({ deleted: true, scope: 'following' });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('[calendar/events/[id] DELETE]', e);
    return apiErr('Gagal menghapus event kalender.', 500);
  }
}
