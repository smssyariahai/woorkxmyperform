// /api/absensi/corrections — pengajuan koreksi absensi.
// GET: milik sendiri (MANAGE = semua + filter status).
// POST: ajukan koreksi untuk record sendiri (MANAGE boleh untuk record siapa pun).
// PUT: setujui/tolak (MANAGE) — bila disetujui, terapkan requestedValue ke
// record + hitung ulang + audit + notifikasi pemohon. TIDAK ada perubahan
// record langsung tanpa persetujuan.
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requirePermission, getUserPermissions } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';
import { parseDateKey, parsePagination, getManageScope } from '@/lib/attendance/http';
import { recalcRecord, notifyUser, notifyManagers, AttendanceError } from '@/lib/attendance/service';
import { parseHHMM } from '@/lib/attendance/calc';

export const dynamic = 'force-dynamic';

const TYPES = ['CHECK_IN', 'CHECK_OUT', 'STATUS', 'DATE'] as const;
const CORRECTABLE_STATUSES = ['PRESENT', 'LATE', 'EARLY_LEAVE', 'INCOMPLETE'];

const postSchema = z
  .object({
    recordId: z.string().min(1, 'recordId wajib diisi.'),
    type: z.enum(TYPES),
    reason: z.string().trim().min(1, 'Alasan koreksi wajib diisi.').max(1000),
    requestedValue: z.record(z.unknown()),
  })
  .superRefine((d, ctx) => {
    const v = d.requestedValue as Record<string, unknown>;
    if (d.type === 'CHECK_IN' || d.type === 'CHECK_OUT') {
      const key = d.type === 'CHECK_IN' ? 'checkInAt' : 'checkOutAt';
      const raw = v[key];
      if (typeof raw !== 'string' || Number.isNaN(new Date(raw).getTime())) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['requestedValue', key], message: `${key} harus tanggal-waktu ISO yang valid.` });
      }
    }
    if (d.type === 'STATUS') {
      if (typeof v.status !== 'string' || !CORRECTABLE_STATUSES.includes(v.status)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['requestedValue', 'status'], message: `Status hanya boleh: ${CORRECTABLE_STATUSES.join(', ')}.` });
      }
    }
    if (d.type === 'DATE') {
      if (typeof v.date !== 'string' || !parseDateKey(v.date)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['requestedValue', 'date'], message: 'date harus format YYYY-MM-DD.' });
      }
    }
  });

function serialize(row: any) {
  return {
    id: row.id,
    recordId: row.recordId,
    recordDate: row.record?.date ? row.record.date.toISOString().slice(0, 10) : null,
    requestedById: row.requestedById,
    requestedByName: row.requestedBy?.name ?? null,
    type: row.type,
    reason: row.reason,
    requestedValue: row.requestedValue,
    status: row.status,
    reviewedById: row.reviewedById,
    reviewedByName: row.reviewedBy?.name ?? null,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    reviewNote: row.reviewNote,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const include = {
  record: { select: { date: true } },
  requestedBy: { select: { name: true } },
  reviewedBy: { select: { name: true } },
} as const;

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
    const where: Prisma.AttendanceCorrectionWhereInput = {
      organizationId: ctx.organizationId,
      ...(status ? { status } : {}),
    };
    if (!canManage) {
      where.requestedById = ctx.userId;
    } else {
      const scope = await getManageScope(ctx);
      if (!scope.orgWide && scope.departmentId) {
        where.requestedBy = {
          memberships: { some: { organizationId: ctx.organizationId, departmentId: scope.departmentId } },
        };
      }
      const userId = sp.get('userId');
      if (userId) where.requestedById = userId;
    }
    const [total, rows] = await Promise.all([
      prisma.attendanceCorrection.count({ where }),
      prisma.attendanceCorrection.findMany({
        where,
        include,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip,
      }),
    ]);
    return apiOk({ corrections: rows.map(serialize), total, page, limit });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('[absensi/corrections GET]', e);
    return apiErr('Gagal memuat pengajuan koreksi.', 500);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requirePermission('ATTENDANCE_VIEW', req);
    const body = await req.json().catch(() => null);
    const parsed = postSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return apiErr(parsed.error.errors[0]?.message ?? 'Data koreksi tidak valid.', 400, parsed.error.errors);
    }
    const d = parsed.data;
    const perms = await getUserPermissions(ctx);
    const canManage = perms.has('ATTENDANCE_MANAGE');
    const record = await prisma.attendanceRecord.findFirst({
      where: { id: d.recordId, organizationId: ctx.organizationId },
      select: { id: true, userId: true },
    });
    if (!record) return apiErr('Record absensi tidak ditemukan.', 404);
    if (!canManage && record.userId !== ctx.userId) {
      return apiErr('Anda hanya bisa mengajukan koreksi untuk absensi sendiri.', 403);
    }
    const dup = await prisma.attendanceCorrection.findFirst({
      where: { organizationId: ctx.organizationId, recordId: d.recordId, type: d.type, status: 'PENDING' },
      select: { id: true },
    });
    if (dup) return apiErr('Masih ada pengajuan koreksi yang sama dan belum diproses.', 409);
    const created = await prisma.attendanceCorrection.create({
      data: {
        organizationId: ctx.organizationId,
        recordId: d.recordId,
        requestedById: ctx.userId,
        type: d.type,
        reason: d.reason,
        requestedValue: d.requestedValue as Prisma.InputJsonObject,
      },
      include,
    });
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'ATTENDANCE_REQUEST_CORRECTION',
      module: 'ATTENDANCE',
      description: `Mengajukan koreksi ${d.type} untuk absensi ${record.id}: ${d.reason}`,
      ipAddress: getClientIp(req),
    });
    // Beri tahu pengelola agar segera ditinjau.
    await notifyManagers(
      ctx.organizationId,
      'Pengajuan koreksi absensi baru',
      `${ctx.name ?? 'Karyawan'} mengajukan koreksi ${d.type} (${d.reason}).`,
      ctx.userId
    );
    return apiOk({ correction: serialize(created) }, 201);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('[absensi/corrections POST]', e);
    return apiErr('Gagal mengajukan koreksi.', 500);
  }
}

const putSchema = z.object({
  id: z.string().min(1, 'id wajib diisi.'),
  action: z.enum(['approve', 'reject']),
  reviewNote: z.string().trim().max(1000).nullable().optional(),
});

export async function PUT(req: Request) {
  try {
    const ctx = await requirePermission('ATTENDANCE_MANAGE', req);
    const body = await req.json().catch(() => null);
    const parsed = putSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return apiErr(parsed.error.errors[0]?.message ?? 'Data tidak valid.', 400, parsed.error.errors);
    }
    const { id, action, reviewNote } = parsed.data;
    const correction = await prisma.attendanceCorrection.findFirst({
      where: { id, organizationId: ctx.organizationId },
      include: { record: true },
    });
    if (!correction) return apiErr('Pengajuan koreksi tidak ditemukan.', 404);
    if (correction.status !== 'PENDING') {
      return apiErr(`Pengajuan ini sudah ${correction.status === 'APPROVED' ? 'disetujui' : 'ditolak'}.`, 409);
    }
    const record = correction.record;
    if (action === 'approve') {
      const v = correction.requestedValue as Record<string, unknown>;
      const patch: Prisma.AttendanceRecordUpdateInput = {};
      if (correction.type === 'CHECK_IN' && typeof v.checkInAt === 'string') {
        patch.checkInAt = new Date(v.checkInAt);
        patch.checkInMethod = 'MANUAL';
        if (typeof v.note === 'string') patch.checkInNote = v.note;
      }
      if (correction.type === 'CHECK_OUT' && typeof v.checkOutAt === 'string') {
        patch.checkOutAt = new Date(v.checkOutAt);
        patch.checkOutMethod = 'MANUAL';
        if (typeof v.note === 'string') patch.checkOutNote = v.note;
      }
      if (correction.type === 'DATE' && typeof v.date === 'string') {
        const newDate = new Date(`${v.date}T00:00:00Z`);
        const clash = await prisma.attendanceRecord.findUnique({
          where: {
            organizationId_userId_date: {
              organizationId: ctx.organizationId,
              userId: record.userId,
              date: newDate,
            },
          },
          select: { id: true },
        });
        if (clash && clash.id !== record.id) {
          return apiErr('Sudah ada record absensi untuk pengguna itu pada tanggal tersebut.', 409);
        }
        patch.date = newDate;
      }
      // STATUS diterapkan setelah hitung ulang (recalc menimpa status dari
      // jam check in/out); bila koreksi STATUS murni, set langsung sesudahnya.
      await prisma.$transaction(async (tx) => {
        await tx.attendanceCorrection.update({
          where: { id },
          data: { status: 'APPROVED', reviewedById: ctx.userId, reviewedAt: new Date(), reviewNote: reviewNote ?? null },
        });
        await tx.attendanceRecord.update({ where: { id: record.id }, data: patch });
      });
      await recalcRecord(record.id);
      if (correction.type === 'STATUS' && typeof v.status === 'string') {
        await prisma.attendanceRecord.update({
          where: { id: record.id },
          data: { status: v.status },
        });
      }
    } else {
      await prisma.attendanceCorrection.update({
        where: { id },
        data: { status: 'REJECTED', reviewedById: ctx.userId, reviewedAt: new Date(), reviewNote: reviewNote ?? null },
      });
    }
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: action === 'approve' ? 'ATTENDANCE_APPROVE_CORRECTION' : 'ATTENDANCE_REJECT_CORRECTION',
      module: 'ATTENDANCE',
      description: `${action === 'approve' ? 'Menyetujui' : 'Menolak'} koreksi ${correction.type} (record ${record.id})${reviewNote ? `: ${reviewNote}` : ''}`,
      ipAddress: getClientIp(req),
    });
    await notifyUser(
      ctx.organizationId,
      correction.requestedById,
      action === 'approve' ? 'Koreksi absensi disetujui' : 'Koreksi absensi ditolak',
      `Pengajuan koreksi ${correction.type} Anda ${action === 'approve' ? 'disetujui' : 'ditolak'}${reviewNote ? `: ${reviewNote}` : '.'}`
    );
    const updated = await prisma.attendanceCorrection.findUnique({ where: { id }, include });
    return apiOk({ correction: updated ? serialize(updated) : null });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof AttendanceError) return apiErr(e.message, e.status);
    console.error('[absensi/corrections PUT]', e);
    return apiErr('Gagal memproses koreksi.', 500);
  }
}
