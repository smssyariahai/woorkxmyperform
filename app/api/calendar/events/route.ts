// GET /api/calendar/events — daftar event dalam range + ekspansi recurring.
// POST /api/calendar/events — buat event manual.
//
// Otorisasi: orgId selalu dari sesi (requirePermission), bukan dari request.
// Visibilitas diterapkan di backend (canSeeEvent) sebelum response dikirim.
import { z } from 'zod';
import { prisma } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import { requirePermission, getUserPermissions } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';
import {
  EVENT_CATEGORY_KEYS,
  EVENT_VISIBILITIES,
  MAX_RANGE_DAYS,
} from '@/lib/calendar/constants';
import {
  canSeeEvent,
  getViewerDepartmentId,
  getCreatorDepartmentIds,
  hasCalendarManage,
} from '@/lib/calendar/visibility';
import { parseRRule, expandRecurrence } from '@/lib/calendar/recurrence';
import { findConflicts } from '@/lib/calendar/conflict';
import {
  serializeEvent,
  serializeOccurrence,
  loadEventsForResponse,
  loadEventForResponse,
} from '@/lib/calendar/serialize';

export const dynamic = 'force-dynamic';

const CATEGORY_KEYS = EVENT_CATEGORY_KEYS;

function parseRange(searchParams: URLSearchParams): { from: Date; to: Date } | { error: string } {
  const fromRaw = searchParams.get('from');
  const toRaw = searchParams.get('to');
  if (!fromRaw || !toRaw) return { error: 'Parameter from dan to wajib diisi (ISO 8601).' };
  const from = new Date(fromRaw);
  const to = new Date(toRaw);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return { error: 'Format tanggal from/to tidak valid.' };
  }
  if (from > to) return { error: 'from tidak boleh lebih besar dari to.' };
  const days = (to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000);
  if (days > MAX_RANGE_DAYS) {
    return { error: `Rentang maksimal ${MAX_RANGE_DAYS} hari.` };
  }
  return { from, to };
}

export async function GET(req: Request) {
  try {
    const ctx = await requirePermission('CALENDAR_VIEW', req);
    const sp = new URL(req.url).searchParams;
    const range = parseRange(sp);
    if ('error' in range) return apiErr(range.error, 400);
    const { from, to } = range;

    const category = sp.get('category');
    const sourceModule = sp.get('sourceModule');
    const visibility = sp.get('visibility');
    const status = sp.get('status');
    const search = sp.get('search')?.trim();
    if (category && !CATEGORY_KEYS.includes(category)) {
      return apiErr(`Kategori tidak valid: ${category}.`, 400);
    }
    if (visibility && !(EVENT_VISIBILITIES as readonly string[]).includes(visibility)) {
      return apiErr(`Visibility tidak valid: ${visibility}.`, 400);
    }
    if (status && !['SCHEDULED', 'COMPLETED', 'CANCELLED'].includes(status)) {
      return apiErr(`Status tidak valid: ${status}.`, 400);
    }
    const limit = Math.min(Math.max(parseInt(sp.get('limit') ?? '100', 10) || 100, 1), 500);
    const offset = Math.max(parseInt(sp.get('offset') ?? '0', 10) || 0, 0);

    const where: Prisma.CalendarEventWhereInput = {
      organizationId: ctx.organizationId,
      ...(category ? { category } : {}),
      ...(sourceModule ? { sourceModule } : {}),
      ...(visibility ? { visibility } : {}),
      ...(status ? { status } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
      AND: [
        {
          OR: [
            // Tumpang tindih langsung dengan range.
            { startAt: { lte: to }, endAt: { gte: from } },
            // Event berulang yang mulai sebelum akhir range (occurrence-nya
            // bisa jatuh di dalam range walau base-nya di luar).
            { recurrenceRule: { not: null }, startAt: { lte: to } },
          ],
        },
      ],
    };

    const total = await prisma.calendarEvent.count({ where });
    const events = await loadEventsForResponse(where, {
      take: limit,
      skip: offset,
      orderBy: { startAt: 'asc' },
    });

    // Visibilitas backend: butuh departemen viewer + para pembuat + attendee.
    const viewerDepartmentId = await getViewerDepartmentId(ctx.userId, ctx.organizationId);
    const creatorDept = await getCreatorDepartmentIds(
      ctx.organizationId,
      events.map((e) => e.createdById)
    );
    const visible = events.filter((e) =>
      canSeeEvent(
        { id: ctx.userId, departmentId: viewerDepartmentId },
        {
          createdById: e.createdById,
          visibility: e.visibility,
          attendeeIds: e.attendees.map((a) => a.userId),
        },
        creatorDept.get(e.createdById) ?? null
      )
    );

    // Ekspansi recurring: kumpulkan exception per parent sekali jalan.
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

    const out = [];
    for (const e of visible) {
      // Induk berulang dikembalikan apa adanya.
      out.push(serializeEvent(e));
      if (e.recurrenceRule) {
        const occs = expandRecurrence(e, from, to, exceptionStarts.get(e.id));
        for (const o of occs) out.push(serializeOccurrence(e, o));
      }
    }
    // Urutkan gabungan induk + occurrence berdasarkan startAt.
    out.sort((a, b) => a.startAt.localeCompare(b.startAt));

    return apiOk({ events: out, total, limit, offset, from: from.toISOString(), to: to.toISOString() });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('[calendar/events GET]', e);
    return apiErr('Gagal memuat event kalender.', 500);
  }
}

const createSchema = z
  .object({
    title: z.string().trim().min(1, 'Judul event wajib diisi.').max(300),
    description: z.string().trim().max(5000).nullable().optional(),
    category: z
      .string()
      .refine((v) => CATEGORY_KEYS.includes(v), 'Kategori tidak valid.')
      .default('other'),
    startAt: z.string().min(1, 'Tanggal mulai wajib diisi.'),
    endAt: z.string().nullable().optional(),
    isAllDay: z.boolean().optional().default(false),
    timezone: z.string().trim().max(64).optional().default('Asia/Jakarta'),
    location: z.string().trim().max(300).nullable().optional(),
    meetingLink: z.string().trim().max(500).nullable().optional(),
    visibility: z
      .string()
      .refine((v) => (EVENT_VISIBILITIES as readonly string[]).includes(v), 'Visibility tidak valid.')
      .default('COMPANY'),
    recurrenceRule: z.string().trim().nullable().optional(),
    reminders: z.array(z.number().int().min(0).max(43200)).max(5).optional().default([]),
    attendeeIds: z.array(z.string().min(1)).max(200).optional().default([]),
  })
  .superRefine((data, ctx) => {
    const start = new Date(data.startAt);
    if (Number.isNaN(start.getTime())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['startAt'], message: 'Tanggal mulai tidak valid.' });
      return;
    }
    if (data.endAt) {
      const end = new Date(data.endAt);
      if (Number.isNaN(end.getTime())) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endAt'], message: 'Tanggal selesai tidak valid.' });
        return;
      }
      if (end <= start) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['endAt'],
          message: 'Waktu selesai harus lebih lambat dari waktu mulai.',
        });
      }
    }
    if (data.recurrenceRule && !parseRRule(data.recurrenceRule)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['recurrenceRule'],
        message: 'Aturan pengulangan (RRULE) tidak valid.',
      });
    }
  });

export async function POST(req: Request) {
  try {
    const ctx = await requirePermission('CALENDAR_CREATE', req);
    const body = await req.json().catch(() => null);
    const parsed = createSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return apiErr(parsed.error.errors[0]?.message ?? 'Data event tidak valid.', 400, parsed.error.errors);
    }
    const d = parsed.data;
    const startAt = new Date(d.startAt);
    // endAt opsional: all-day -> +1 hari; berwaktu -> +1 jam.
    const endAt = d.endAt
      ? new Date(d.endAt)
      : new Date(startAt.getTime() + (d.isAllDay ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000));
    if (endAt <= startAt) return apiErr('Waktu selesai harus lebih lambat dari waktu mulai.', 400);

    // Attendee harus anggota organisasi yang sama.
    const attendeeIds = [...new Set(d.attendeeIds.filter((id) => id !== ctx.userId))];
    if (attendeeIds.length > 0) {
      const members = await prisma.membership.findMany({
        where: { organizationId: ctx.organizationId, userId: { in: attendeeIds }, status: 'ACTIVE' },
        select: { userId: true },
      });
      const memberIds = new Set(members.map((m) => m.userId));
      const invalid = attendeeIds.filter((id) => !memberIds.has(id));
      if (invalid.length > 0) {
        return apiErr('Ada peserta yang bukan anggota kantor ini.', 400);
      }
    }

    // Cek benturan (peringatan saja, bukan error).
    const perms = await getUserPermissions(ctx);
    const conflicts = await findConflicts(
      ctx.organizationId,
      [ctx.userId, ...attendeeIds],
      startAt,
      endAt,
      null,
      d.isAllDay
    );

    const event = await prisma.$transaction(async (tx) => {
      const created = await tx.calendarEvent.create({
        data: {
          organizationId: ctx.organizationId,
          createdById: ctx.userId,
          sourceModule: null,
          sourceRecordId: null,
          title: d.title,
          description: d.description ?? null,
          category: d.category,
          startAt,
          endAt,
          timezone: d.timezone,
          isAllDay: d.isAllDay,
          location: d.location ?? null,
          meetingLink: d.meetingLink ?? null,
          visibility: d.visibility,
          status: 'SCHEDULED',
          recurrenceRule: d.recurrenceRule ?? null,
          metadata: {},
        },
      });
      for (const userId of attendeeIds) {
        await tx.calendarAttendee.create({
          data: { eventId: created.id, userId, responseStatus: 'PENDING' },
        });
      }
      for (const minutes of d.reminders) {
        await tx.calendarReminder.create({
          data: {
            eventId: created.id,
            userId: ctx.userId,
            minutesBefore: minutes,
            remindAt: new Date(startAt.getTime() - minutes * 60 * 1000),
            deliveryStatus: 'PENDING',
          },
        });
      }
      return created;
    });

    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'CALENDAR_CREATE_EVENT',
      module: 'CALENDAR',
      description: `Membuat event kalender: ${d.title}`,
      ipAddress: getClientIp(req),
    });

    const full = await loadEventForResponse(event.id, ctx.organizationId, true);
    return apiOk({ event: full ? serializeEvent(full, { includeReminders: true }) : null, conflicts }, 201);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('[calendar/events POST]', e);
    return apiErr('Gagal membuat event kalender.', 500);
  }
}
