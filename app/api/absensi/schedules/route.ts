// /api/absensi/schedules — CRUD jadwal kerja mingguan (GET: semua anggota;
// POST/PUT/DELETE: ATTENDANCE_MANAGE). daysOfWeek = {"0": shiftId|null,
// ..., "6": shiftId} (0=Minggu, null=libur). Hanya satu isDefault per org.
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';
import { parseDateKey } from '@/lib/attendance/http';

export const dynamic = 'force-dynamic';

const daysSchema = z
  .record(z.string().nullable())
  .refine(
    (v) => Object.keys(v).every((k) => ['0', '1', '2', '3', '4', '5', '6'].includes(k)),
    'daysOfWeek hanya boleh berisi kunci 0–6 (0=Minggu).'
  )
  .default({});

const schema = z
  .object({
    name: z.string().trim().min(1, 'Nama jadwal wajib diisi.').max(200),
    userId: z.string().nullable().optional(),
    departmentId: z.string().nullable().optional(),
    daysOfWeek: daysSchema,
    isDefault: z.boolean().optional().default(false),
    isActive: z.boolean().optional().default(true),
    effectiveFrom: z.string().nullable().optional(),
    effectiveTo: z.string().nullable().optional(),
  })
  .superRefine((d, ctx) => {
    if (d.effectiveFrom && !parseDateKey(d.effectiveFrom)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['effectiveFrom'], message: 'effectiveFrom harus format YYYY-MM-DD.' });
    }
    if (d.effectiveTo && !parseDateKey(d.effectiveTo)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['effectiveTo'], message: 'effectiveTo harus format YYYY-MM-DD.' });
    }
    if (d.effectiveFrom && d.effectiveTo && d.effectiveFrom > d.effectiveTo) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['effectiveTo'], message: 'effectiveTo tidak boleh sebelum effectiveFrom.' });
    }
    if (d.userId && d.departmentId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['departmentId'], message: 'Jadwal personal (userId) tidak boleh sekaligus jadwal departemen.' });
    }
  });

function serialize(row: any) {
  return {
    id: row.id,
    name: row.name,
    userId: row.userId,
    userName: row.user?.name ?? null,
    departmentId: row.departmentId,
    departmentName: row.department?.name ?? null,
    daysOfWeek: row.daysOfWeek,
    isDefault: row.isDefault,
    isActive: row.isActive,
    effectiveFrom: row.effectiveFrom ? row.effectiveFrom.toISOString().slice(0, 10) : null,
    effectiveTo: row.effectiveTo ? row.effectiveTo.toISOString().slice(0, 10) : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const include = {
  department: { select: { name: true } },
} as const;

/**
 * Gabungkan user ke baris WorkSchedule (Lapisan F). WorkSchedule TIDAK punya
 * relasi `user` di tenant client — nama diambil dari mirror User.
 */
async function attachScheduleUsers<T extends { userId: string | null }>(rows: T[]) {
  const ids = [...new Set(rows.map((r) => r.userId).filter((id): id is string => !!id))];
  const users = ids.length
    ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
    : [];
  const byId = new Map(users.map((u) => [u.id, u]));
  return rows.map((r) => ({ ...r, user: r.userId ? byId.get(r.userId) ?? null : null }));
}

async function validateRefs(ctx: { organizationId: string }, d: z.infer<typeof schema>) {
  // Shift yang dirujuk harus ada di org ini.
  const shiftIds = [...new Set(Object.values(d.daysOfWeek).filter((v): v is string => !!v))];
  if (shiftIds.length > 0) {
    const found = await prisma.shift.findMany({
      where: { id: { in: shiftIds }, organizationId: ctx.organizationId },
      select: { id: true },
    });
    if (found.length !== shiftIds.length) {
      return 'Ada shift di daysOfWeek yang tidak ditemukan di kantor ini.';
    }
  }
  if (d.userId) {
    const m = await prisma.membership.findFirst({
      where: { organizationId: ctx.organizationId, userId: d.userId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!m) return 'Pengguna jadwal personal bukan anggota aktif kantor ini.';
  }
  if (d.departmentId) {
    const dept = await prisma.department.findFirst({
      where: { id: d.departmentId, organizationId: ctx.organizationId },
      select: { id: true },
    });
    if (!dept) return 'Departemen tidak ditemukan di kantor ini.';
  }
  return null;
}

export async function GET(req: Request) {
  try {
    const ctx = await requirePermission('ATTENDANCE_VIEW', req);
    const rows = await prisma.workSchedule.findMany({
      where: { organizationId: ctx.organizationId },
      include,
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
    return apiOk({ schedules: (await attachScheduleUsers(rows)).map(serialize) });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('[absensi/schedules GET]', e);
    return apiErr('Gagal memuat jadwal.', 500);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requirePermission('ATTENDANCE_MANAGE', req);
    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body ?? {});
    if (!parsed.success) {
      return apiErr(parsed.error.errors[0]?.message ?? 'Data jadwal tidak valid.', 400, parsed.error.errors);
    }
    const d = parsed.data;
    const refErr = await validateRefs(ctx, d);
    if (refErr) return apiErr(refErr, 400);
    const created = await prisma.$transaction(async (tx) => {
      if (d.isDefault) {
        await tx.workSchedule.updateMany({
          where: { organizationId: ctx.organizationId, isDefault: true },
          data: { isDefault: false },
        });
      }
      return tx.workSchedule.create({
        data: {
          organizationId: ctx.organizationId,
          name: d.name,
          userId: d.userId ?? null,
          departmentId: d.departmentId ?? null,
          daysOfWeek: d.daysOfWeek,
          isDefault: d.isDefault,
          isActive: d.isActive,
          effectiveFrom: d.effectiveFrom ? new Date(`${d.effectiveFrom}T00:00:00Z`) : null,
          effectiveTo: d.effectiveTo ? new Date(`${d.effectiveTo}T00:00:00Z`) : null,
        },
        include,
      });
    });
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'ATTENDANCE_CREATE_SCHEDULE',
      module: 'ATTENDANCE',
      description: `Membuat jadwal kerja: ${d.name}`,
      ipAddress: getClientIp(req),
    });
    return apiOk({ schedule: serialize((await attachScheduleUsers([created]))[0]) }, 201);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('[absensi/schedules POST]', e);
    return apiErr('Gagal membuat jadwal.', 500);
  }
}

export async function PUT(req: Request) {
  try {
    const ctx = await requirePermission('ATTENDANCE_MANAGE', req);
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return apiErr('Parameter id wajib diisi.', 400);
    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body ?? {});
    if (!parsed.success) {
      return apiErr(parsed.error.errors[0]?.message ?? 'Data jadwal tidak valid.', 400, parsed.error.errors);
    }
    const existing = await prisma.workSchedule.findFirst({ where: { id, organizationId: ctx.organizationId } });
    if (!existing) return apiErr('Jadwal tidak ditemukan.', 404);
    const d = parsed.data;
    const refErr = await validateRefs(ctx, d);
    if (refErr) return apiErr(refErr, 400);
    const updated = await prisma.$transaction(async (tx) => {
      if (d.isDefault) {
        await tx.workSchedule.updateMany({
          where: { organizationId: ctx.organizationId, isDefault: true, id: { not: id } },
          data: { isDefault: false },
        });
      }
      return tx.workSchedule.update({
        where: { id },
        data: {
          name: d.name,
          userId: d.userId ?? null,
          departmentId: d.departmentId ?? null,
          daysOfWeek: d.daysOfWeek,
          isDefault: d.isDefault,
          isActive: d.isActive,
          effectiveFrom: d.effectiveFrom ? new Date(`${d.effectiveFrom}T00:00:00Z`) : null,
          effectiveTo: d.effectiveTo ? new Date(`${d.effectiveTo}T00:00:00Z`) : null,
        },
        include,
      });
    });
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'ATTENDANCE_UPDATE_SCHEDULE',
      module: 'ATTENDANCE',
      description: `Mengubah jadwal kerja: ${d.name}`,
      ipAddress: getClientIp(req),
    });
    return apiOk({ schedule: serialize((await attachScheduleUsers([updated]))[0]) });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('[absensi/schedules PUT]', e);
    return apiErr('Gagal mengubah jadwal.', 500);
  }
}

export async function DELETE(req: Request) {
  try {
    const ctx = await requirePermission('ATTENDANCE_MANAGE', req);
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return apiErr('Parameter id wajib diisi.', 400);
    const existing = await prisma.workSchedule.findFirst({ where: { id, organizationId: ctx.organizationId } });
    if (!existing) return apiErr('Jadwal tidak ditemukan.', 404);
    await prisma.workSchedule.delete({ where: { id } });
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'ATTENDANCE_DELETE_SCHEDULE',
      module: 'ATTENDANCE',
      description: `Menghapus jadwal kerja: ${existing.name}`,
      ipAddress: getClientIp(req),
    });
    return apiOk({ deleted: true });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('[absensi/schedules DELETE]', e);
    return apiErr('Gagal menghapus jadwal.', 500);
  }
}
