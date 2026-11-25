// /api/absensi/overtime — pengajuan lembur.
// GET: milik sendiri (MANAGE = semua + filter status).
// POST: ajukan lembur (satu pengajuan PENDING per pengguna per tanggal).
// PUT: setujui/tolak (MANAGE). Bila disetujui -> event lembur dibuat di
// Work Calendar via syncSourceEvent('attendance', id); bila ditolak setelah
// pernah disetujui -> event kalender dihapus oleh sync yang sama.
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requirePermission, getUserPermissions } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';
import { parseDateKey, parsePagination, getManageScope } from '@/lib/attendance/http';
import { parseHHMM, hhmmToMinutes } from '@/lib/attendance/calc';
import { notifyUser, notifyManagers } from '@/lib/attendance/service';
import { syncSourceEvent } from '@/lib/calendar/sync';

export const dynamic = 'force-dynamic';

const hhmm = z.string().refine((v) => parseHHMM(v) !== null, 'Jam harus format HH:MM (00:00–23:59).');

const postSchema = z
  .object({
    date: z.string().refine((v) => parseDateKey(v) !== null, 'date harus format YYYY-MM-DD.'),
    startTime: hhmm,
    endTime: hhmm,
    reason: z.string().trim().min(1, 'Alasan lembur wajib diisi.').max(1000),
  })
  .superRefine((d, ctx) => {
    if (d.startTime === d.endTime) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endTime'], message: 'Jam selesai tidak boleh sama dengan jam mulai.' });
    }
  });

function serialize(row: any) {
  return {
    id: row.id,
    userId: row.userId,
    userName: row.user?.name ?? null,
    date: row.date.toISOString().slice(0, 10),
    startTime: row.startTime,
    endTime: row.endTime,
    isNight: hhmmToMinutes(row.endTime)! <= hhmmToMinutes(row.startTime)!,
    durationMinutes:
      ((hhmmToMinutes(row.endTime)! - hhmmToMinutes(row.startTime)! + 24 * 60) % (24 * 60)) || 24 * 60,
    reason: row.reason,
    status: row.status,
    approvedById: row.approvedById,
    approvedByName: row.approvedBy?.name ?? null,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Gabungkan user ke baris OvertimeRequest (Lapisan F). OvertimeRequest TIDAK
 * punya relasi apa pun di tenant client — nama diambil dari mirror User.
 */
async function attachOvertimeUsers<T extends { userId: string; approvedById: string | null }>(
  rows: T[]
) {
  const ids = [...new Set(rows.flatMap((r) => [r.userId, r.approvedById]).filter((id): id is string => !!id))];
  const users = ids.length
    ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
    : [];
  const byId = new Map(users.map((u) => [u.id, u]));
  return rows.map((r) => ({
    ...r,
    user: byId.get(r.userId) ?? null,
    approvedBy: r.approvedById ? byId.get(r.approvedById) ?? null : null,
  }));
}

export async function GET(req: Request) {
  try {
    const ctx = await requirePermission('ATTENDANCE_VIEW', req);
    const sp = new URL(req.url).searchParams;
    const perms = await getUserPermissions(ctx);
    const canManage = perms.has('ATTENDANCE_MANAGE');
    const status = sp.get('status');
    if (status && !['PENDING', 'APPROVED', 'REJECTED'].includes(status)) {
      return apiErr(`Status tidak valid: ${status}.`, 400);
    }
    const { page, limit, skip } = parsePagination(sp);
    const where: Prisma.OvertimeRequestWhereInput = {
      organizationId: ctx.organizationId,
      ...(status ? { status } : {}),
    };
    if (!canManage) {
      where.userId = ctx.userId;
    } else {
      const scope = await getManageScope(ctx);
      const userId = sp.get('userId');
      // Filter departemen tidak bisa memakai relasi `user.memberships` pada
      // OvertimeRequest di tenant client — selesaikan dulu daftar anggota
      // departemen, lalu filter dengan `userId in [...]` (Lapisan F).
      let deptUserIds: string[] | null = null;
      if (!scope.orgWide && scope.departmentId) {
        const members = await prisma.membership.findMany({
          where: { organizationId: ctx.organizationId, departmentId: scope.departmentId, status: 'ACTIVE' },
          select: { userId: true },
        });
        deptUserIds = members.map((m) => m.userId);
      }
      const userIds = deptUserIds
        ? userId
          ? deptUserIds.filter((id) => id === userId)
          : deptUserIds
        : userId
          ? [userId]
          : null;
      if (userIds) where.userId = { in: userIds };
    }
    const [total, rows] = await Promise.all([
      prisma.overtimeRequest.count({ where }),
      prisma.overtimeRequest.findMany({
        where,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        take: limit,
        skip,
      }),
    ]);
    return apiOk({ overtime: (await attachOvertimeUsers(rows)).map(serialize), total, page, limit });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('[absensi/overtime GET]', e);
    return apiErr('Gagal memuat pengajuan lembur.', 500);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requirePermission('ATTENDANCE_VIEW', req);
    const body = await req.json().catch(() => null);
    const parsed = postSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return apiErr(parsed.error.errors[0]?.message ?? 'Data lembur tidak valid.', 400, parsed.error.errors);
    }
    const d = parsed.data;
    const dup = await prisma.overtimeRequest.findFirst({
      where: {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        date: new Date(`${d.date}T00:00:00Z`),
        status: 'PENDING',
      },
      select: { id: true },
    });
    if (dup) return apiErr('Masih ada pengajuan lembur yang belum diproses untuk tanggal tersebut.', 409);
    const created = await prisma.overtimeRequest.create({
      data: {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        date: new Date(`${d.date}T00:00:00Z`),
        startTime: d.startTime,
        endTime: d.endTime,
        reason: d.reason,
      },
    });
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'ATTENDANCE_REQUEST_OVERTIME',
      module: 'ATTENDANCE',
      description: `Mengajukan lembur ${d.date} ${d.startTime}–${d.endTime}: ${d.reason}`,
      ipAddress: getClientIp(req),
    });
    await notifyManagers(
      ctx.organizationId,
      'Pengajuan lembur baru',
      `${ctx.name ?? 'Karyawan'} mengajukan lembur ${d.date} ${d.startTime}–${d.endTime}.`,
      ctx.userId
    );
    return apiOk({ overtime: serialize((await attachOvertimeUsers([created]))[0]) }, 201);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('[absensi/overtime POST]', e);
    return apiErr('Gagal mengajukan lembur.', 500);
  }
}

const putSchema = z.object({
  id: z.string().min(1, 'id wajib diisi.'),
  action: z.enum(['approve', 'reject']),
});

export async function PUT(req: Request) {
  try {
    const ctx = await requirePermission('ATTENDANCE_MANAGE', req);
    const body = await req.json().catch(() => null);
    const parsed = putSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return apiErr(parsed.error.errors[0]?.message ?? 'Data tidak valid.', 400, parsed.error.errors);
    }
    const { id, action } = parsed.data;
    const existing = await prisma.overtimeRequest.findFirst({
      where: { id, organizationId: ctx.organizationId },
    });
    if (!existing) return apiErr('Pengajuan lembur tidak ditemukan.', 404);
    const nextStatus = action === 'approve' ? 'APPROVED' : 'REJECTED';
    if (existing.status === nextStatus) {
      return apiErr(`Pengajuan ini sudah ${nextStatus === 'APPROVED' ? 'disetujui' : 'ditolak'}.`, 409);
    }
    const updated = await prisma.overtimeRequest.update({
      where: { id },
      data: {
        status: nextStatus,
        approvedById: ctx.userId,
        approvedAt: new Date(),
      },
    });
    // Sinkronkan event kalender lembur (buat saat disetujui, hapus saat ditolak).
    const sync = await syncSourceEvent(ctx.organizationId, 'attendance', id);
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: action === 'approve' ? 'ATTENDANCE_APPROVE_OVERTIME' : 'ATTENDANCE_REJECT_OVERTIME',
      module: 'ATTENDANCE',
      description: `${action === 'approve' ? 'Menyetujui' : 'Menolak'} lembur ${existing.date.toISOString().slice(0, 10)} ${existing.startTime}–${existing.endTime} (event kalender: ${sync.action})`,
      ipAddress: getClientIp(req),
    });
    await notifyUser(
      ctx.organizationId,
      existing.userId,
      action === 'approve' ? 'Lembur disetujui' : 'Lembur ditolak',
      `Pengajuan lembur Anda ${existing.date.toISOString().slice(0, 10)} ${existing.startTime}–${existing.endTime} ${action === 'approve' ? 'disetujui' : 'ditolak'}.`
    );
    return apiOk({ overtime: serialize((await attachOvertimeUsers([updated]))[0]), calendarSync: sync.action });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('[absensi/overtime PUT]', e);
    return apiErr('Gagal memproses lembur.', 500);
  }
}
