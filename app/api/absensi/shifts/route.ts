// /api/absensi/shifts — CRUD shift kerja (GET: semua anggota;
// POST/PUT/DELETE: ATTENDANCE_MANAGE). isNightShift otomatis bila
// endTime < startTime (shift malam lintas hari).
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';
import { parseHHMM, hhmmToMinutes } from '@/lib/attendance/calc';

export const dynamic = 'force-dynamic';

const hhmm = z
  .string()
  .refine((v) => parseHHMM(v) !== null, 'Jam harus format HH:MM (00:00–23:59).');

const schema = z
  .object({
    name: z.string().trim().min(1, 'Nama shift wajib diisi.').max(200),
    startTime: hhmm,
    endTime: hhmm,
    breakMinutes: z.number().int().min(0).max(480).default(60),
    graceLateMinutes: z.number().int().min(0).max(120).default(15),
    color: z.string().trim().max(16).nullable().optional(),
    isActive: z.boolean().optional().default(true),
  })
  .superRefine((d, ctx) => {
    if (d.startTime === d.endTime) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endTime'], message: 'Jam selesai tidak boleh sama dengan jam mulai.' });
    }
    const dur = ((hhmmToMinutes(d.endTime)! - hhmmToMinutes(d.startTime)! + 24 * 60) % (24 * 60)) || 24 * 60;
    if (d.breakMinutes >= dur) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['breakMinutes'], message: 'Istirahat tidak boleh melebihi durasi shift.' });
    }
  });

function serialize(row: any) {
  return {
    id: row.id,
    name: row.name,
    startTime: row.startTime,
    endTime: row.endTime,
    isNightShift: row.isNightShift,
    breakMinutes: row.breakMinutes,
    graceLateMinutes: row.graceLateMinutes,
    color: row.color,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function GET(req: Request) {
  try {
    const ctx = await requirePermission('ATTENDANCE_VIEW', req);
    const rows = await prisma.shift.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { name: 'asc' },
    });
    return apiOk({ shifts: rows.map(serialize) });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('[absensi/shifts GET]', e);
    return apiErr('Gagal memuat shift.', 500);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requirePermission('ATTENDANCE_MANAGE', req);
    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body ?? {});
    if (!parsed.success) {
      return apiErr(parsed.error.errors[0]?.message ?? 'Data shift tidak valid.', 400, parsed.error.errors);
    }
    const d = parsed.data;
    const created = await prisma.shift.create({
      data: {
        organizationId: ctx.organizationId,
        ...d,
        isNightShift: hhmmToMinutes(d.endTime)! < hhmmToMinutes(d.startTime)!,
      },
    });
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'ATTENDANCE_CREATE_SHIFT',
      module: 'ATTENDANCE',
      description: `Membuat shift: ${d.name} (${d.startTime}–${d.endTime})`,
      ipAddress: getClientIp(req),
    });
    return apiOk({ shift: serialize(created) }, 201);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('[absensi/shifts POST]', e);
    return apiErr('Gagal membuat shift.', 500);
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
      return apiErr(parsed.error.errors[0]?.message ?? 'Data shift tidak valid.', 400, parsed.error.errors);
    }
    const existing = await prisma.shift.findFirst({ where: { id, organizationId: ctx.organizationId } });
    if (!existing) return apiErr('Shift tidak ditemukan.', 404);
    const d = parsed.data;
    const updated = await prisma.shift.update({
      where: { id },
      data: { ...d, isNightShift: hhmmToMinutes(d.endTime)! < hhmmToMinutes(d.startTime)! },
    });
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'ATTENDANCE_UPDATE_SHIFT',
      module: 'ATTENDANCE',
      description: `Mengubah shift: ${d.name} (${d.startTime}–${d.endTime})`,
      ipAddress: getClientIp(req),
    });
    return apiOk({ shift: serialize(updated) });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('[absensi/shifts PUT]', e);
    return apiErr('Gagal mengubah shift.', 500);
  }
}

export async function DELETE(req: Request) {
  try {
    const ctx = await requirePermission('ATTENDANCE_MANAGE', req);
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return apiErr('Parameter id wajib diisi.', 400);
    const existing = await prisma.shift.findFirst({ where: { id, organizationId: ctx.organizationId } });
    if (!existing) return apiErr('Shift tidak ditemukan.', 404);
    // Tolak bila masih dipakai jadwal aktif (shiftId tersimpan di daysOfWeek Json).
    const usedBy = await prisma.workSchedule.findMany({
      where: { organizationId: ctx.organizationId, isActive: true },
      select: { id: true, name: true, daysOfWeek: true },
    });
    const inUse = usedBy.find((s) => {
      const days = s.daysOfWeek as Record<string, unknown>;
      return days && Object.values(days).includes(id);
    });
    if (inUse) {
      return apiErr(`Shift masih dipakai jadwal "${inUse.name}". Ubah jadwal dulu sebelum menghapus shift.`, 409);
    }
    await prisma.shift.delete({ where: { id } });
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'ATTENDANCE_DELETE_SHIFT',
      module: 'ATTENDANCE',
      description: `Menghapus shift: ${existing.name}`,
      ipAddress: getClientIp(req),
    });
    return apiOk({ deleted: true });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('[absensi/shifts DELETE]', e);
    return apiErr('Gagal menghapus shift.', 500);
  }
}
