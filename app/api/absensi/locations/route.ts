// /api/absensi/locations — CRUD lokasi geofence (GET: semua anggota;
// POST/PUT/DELETE: ATTENDANCE_MANAGE).
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const schema = z.object({
  name: z.string().trim().min(1, 'Nama lokasi wajib diisi.').max(200),
  address: z.string().trim().max(500).nullable().optional(),
  latitude: z.number().min(-90, 'Latitude tidak valid.').max(90, 'Latitude tidak valid.'),
  longitude: z.number().min(-180, 'Longitude tidak valid.').max(180, 'Longitude tidak valid.'),
  radiusMeters: z.number().int().min(10, 'Radius minimal 10 meter.').max(5000, 'Radius maksimal 5000 meter.').default(100),
  isDefault: z.boolean().optional().default(false),
  isActive: z.boolean().optional().default(true),
});

function serialize(row: any) {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
    radiusMeters: row.radiusMeters,
    isDefault: row.isDefault,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function GET(req: Request) {
  try {
    const ctx = await requirePermission('ATTENDANCE_VIEW', req);
    const rows = await prisma.attendanceLocation.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
    return apiOk({ locations: rows.map(serialize) });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('[absensi/locations GET]', e);
    return apiErr('Gagal memuat lokasi.', 500);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requirePermission('ATTENDANCE_MANAGE', req);
    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body ?? {});
    if (!parsed.success) {
      return apiErr(parsed.error.errors[0]?.message ?? 'Data lokasi tidak valid.', 400, parsed.error.errors);
    }
    const d = parsed.data;
    const created = await prisma.$transaction(async (tx) => {
      if (d.isDefault) {
        await tx.attendanceLocation.updateMany({
          where: { organizationId: ctx.organizationId, isDefault: true },
          data: { isDefault: false },
        });
      }
      return tx.attendanceLocation.create({
        data: { organizationId: ctx.organizationId, ...d },
      });
    });
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'ATTENDANCE_CREATE_LOCATION',
      module: 'ATTENDANCE',
      description: `Membuat lokasi absensi: ${d.name}`,
      ipAddress: getClientIp(req),
    });
    return apiOk({ location: serialize(created) }, 201);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('[absensi/locations POST]', e);
    return apiErr('Gagal membuat lokasi.', 500);
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
      return apiErr(parsed.error.errors[0]?.message ?? 'Data lokasi tidak valid.', 400, parsed.error.errors);
    }
    const existing = await prisma.attendanceLocation.findFirst({
      where: { id, organizationId: ctx.organizationId },
    });
    if (!existing) return apiErr('Lokasi tidak ditemukan.', 404);
    const d = parsed.data;
    const updated = await prisma.$transaction(async (tx) => {
      if (d.isDefault) {
        await tx.attendanceLocation.updateMany({
          where: { organizationId: ctx.organizationId, isDefault: true, id: { not: id } },
          data: { isDefault: false },
        });
      }
      return tx.attendanceLocation.update({ where: { id }, data: d });
    });
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'ATTENDANCE_UPDATE_LOCATION',
      module: 'ATTENDANCE',
      description: `Mengubah lokasi absensi: ${d.name}`,
      ipAddress: getClientIp(req),
    });
    return apiOk({ location: serialize(updated) });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('[absensi/locations PUT]', e);
    return apiErr('Gagal mengubah lokasi.', 500);
  }
}

export async function DELETE(req: Request) {
  try {
    const ctx = await requirePermission('ATTENDANCE_MANAGE', req);
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return apiErr('Parameter id wajib diisi.', 400);
    const existing = await prisma.attendanceLocation.findFirst({
      where: { id, organizationId: ctx.organizationId },
    });
    if (!existing) return apiErr('Lokasi tidak ditemukan.', 404);
    await prisma.attendanceLocation.delete({ where: { id } });
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'ATTENDANCE_DELETE_LOCATION',
      module: 'ATTENDANCE',
      description: `Menghapus lokasi absensi: ${existing.name}`,
      ipAddress: getClientIp(req),
    });
    return apiOk({ deleted: true });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('[absensi/locations DELETE]', e);
    return apiErr('Gagal menghapus lokasi.', 500);
  }
}
