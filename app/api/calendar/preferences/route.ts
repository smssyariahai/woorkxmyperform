// GET/PUT /api/calendar/preferences — preferensi tampilan kalender per user.
// Upsert per (userId, organizationId). Default: month, Asia/Jakarta, Senin.
import { z } from 'zod';
import { prisma } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { CALENDAR_VIEWS, DEFAULT_TIMEZONE } from '@/lib/calendar/constants';

export const dynamic = 'force-dynamic';

const DEFAULTS = {
  defaultView: 'month',
  timezone: DEFAULT_TIMEZONE,
  firstDayOfWeek: 1,
  workingHours: {},
  notificationPreferences: {},
  visibleCalendars: [],
} as const;

function serialize(p: {
  defaultView: string;
  timezone: string;
  firstDayOfWeek: number;
  workingHours: unknown;
  notificationPreferences: unknown;
  visibleCalendars: unknown;
  updatedAt: Date;
}) {
  return {
    defaultView: p.defaultView,
    timezone: p.timezone,
    firstDayOfWeek: p.firstDayOfWeek,
    workingHours: p.workingHours ?? {},
    notificationPreferences: p.notificationPreferences ?? {},
    visibleCalendars: p.visibleCalendars ?? [],
    updatedAt: p.updatedAt.toISOString(),
  };
}

export async function GET(req: Request) {
  try {
    const ctx = await requirePermission('CALENDAR_VIEW', req);
    const pref = await prisma.calendarUserPreference.findUnique({
      where: { userId_organizationId: { userId: ctx.userId, organizationId: ctx.organizationId } },
    });
    if (!pref) return apiOk({ preferences: { ...DEFAULTS } });
    return apiOk({ preferences: serialize(pref) });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('[calendar/preferences GET]', e);
    return apiErr('Gagal memuat preferensi kalender.', 500);
  }
}

const prefSchema = z.object({
  defaultView: z
    .string()
    .refine((v) => (CALENDAR_VIEWS as readonly string[]).includes(v), 'defaultView tidak valid.')
    .optional(),
  timezone: z.string().trim().min(1).max(64).optional(),
  firstDayOfWeek: z.number().int().min(0).max(1).optional(),
  workingHours: z.record(z.unknown()).optional(),
  notificationPreferences: z.record(z.unknown()).optional(),
  visibleCalendars: z.array(z.string()).max(50).optional(),
});

export async function PUT(req: Request) {
  try {
    const ctx = await requirePermission('CALENDAR_VIEW', req);
    const body = await req.json().catch(() => null);
    const parsed = prefSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return apiErr(parsed.error.errors[0]?.message ?? 'Preferensi tidak valid.', 400, parsed.error.errors);
    }
    const d = parsed.data;
    const data: Prisma.CalendarUserPreferenceUpdateInput = {};
    if (d.defaultView !== undefined) data.defaultView = d.defaultView;
    if (d.timezone !== undefined) data.timezone = d.timezone;
    if (d.firstDayOfWeek !== undefined) data.firstDayOfWeek = d.firstDayOfWeek;
    if (d.workingHours !== undefined) data.workingHours = d.workingHours as Prisma.InputJsonValue;
    if (d.notificationPreferences !== undefined) {
      data.notificationPreferences = d.notificationPreferences as Prisma.InputJsonValue;
    }
    if (d.visibleCalendars !== undefined) data.visibleCalendars = d.visibleCalendars as Prisma.InputJsonValue;
    if (Object.keys(data).length === 0) {
      return apiErr('Tidak ada preferensi yang diubah.', 400);
    }
    const saved = await prisma.calendarUserPreference.upsert({
      where: { userId_organizationId: { userId: ctx.userId, organizationId: ctx.organizationId } },
      update: data,
      create: {
        userId: ctx.userId,
        organizationId: ctx.organizationId,
        defaultView: (d.defaultView as string | undefined) ?? DEFAULTS.defaultView,
        timezone: d.timezone ?? DEFAULTS.timezone,
        firstDayOfWeek: d.firstDayOfWeek ?? DEFAULTS.firstDayOfWeek,
        workingHours: (d.workingHours ?? {}) as Prisma.InputJsonValue,
        notificationPreferences: (d.notificationPreferences ?? {}) as Prisma.InputJsonValue,
        visibleCalendars: (d.visibleCalendars ?? []) as Prisma.InputJsonValue,
      },
    });
    return apiOk({ preferences: serialize(saved) });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('[calendar/preferences PUT]', e);
    return apiErr('Gagal menyimpan preferensi kalender.', 500);
  }
}
