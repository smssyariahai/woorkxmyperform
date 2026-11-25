// GET /api/daily/tasks — daftar TalTask milik sendiri (filter + pagination).
// PUT /api/daily/tasks?id= — ubah status tugas. Perubahan status memakai
// logika TAL yang sama (lib/tal/server: parseTaskInput + kunci plan/bulan)
// + audit log. TIDAK ada model tugas baru.
import { prisma } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';
import {
  getUserTimezone,
  dateKeyInTz,
  addDaysToKey,
  serializeTask,
} from '@/lib/daily/helpers';
import {
  isTaskPlanLocked,
  isMonthLockedForUser,
  parseTaskInput,
} from '@/lib/tal/server';

export const dynamic = 'force-dynamic';

const FILTERS = ['today', 'overdue', 'upcoming', 'all'] as const;

export async function GET(req: Request) {
  try {
    const ctx = await requirePermission('DAILY_VIEW', req);
    const tz = await getUserTimezone(ctx.organizationId, ctx.userId);
    const todayKey = dateKeyInTz(new Date(), tz);
    const sp = new URL(req.url).searchParams;
    const filter = sp.get('filter') ?? 'today';
    if (!(FILTERS as readonly string[]).includes(filter)) {
      return apiErr(`Filter tidak valid: ${filter}.`, 400);
    }
    const status = sp.get('status')?.trim();
    if (status && !['todo', 'pending', 'on_progress', 'done'].includes(status)) {
      return apiErr(`Status tidak valid: ${status}.`, 400);
    }
    const limit = Math.min(Math.max(parseInt(sp.get('limit') ?? '50', 10) || 50, 1), 200);
    const offset = Math.max(parseInt(sp.get('offset') ?? '0', 10) || 0, 0);

    const todayDate = new Date(`${todayKey}T00:00:00.000Z`);
    const in7Date = new Date(`${addDaysToKey(todayKey, 7)}T00:00:00.000Z`);
    const where: Prisma.TalTaskWhereInput = {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      ...(status ? { status } : {}),
      ...(filter === 'today'
        ? { taskDate: { equals: todayDate } }
        : filter === 'overdue'
          ? { taskDate: { lt: todayDate }, status: { not: 'done' } }
          : filter === 'upcoming'
            ? { taskDate: { gt: todayDate, lte: in7Date }, status: { not: 'done' } }
            : {}),
    };

    const [total, rows] = await Promise.all([
      prisma.talTask.count({ where }),
      prisma.talTask.findMany({
        where,
        orderBy: [{ taskDate: 'asc' }, { createdAt: 'desc' }],
        take: limit,
        skip: offset,
      }),
    ]);
    return apiOk({
      tasks: rows.map((r) => serializeTask(r, todayKey)),
      total,
      limit,
      offset,
      filter,
      today: todayKey,
      timezone: tz,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('[daily/tasks GET]', e);
    return apiErr('Gagal memuat tugas.', 500);
  }
}

export async function PUT(req: Request) {
  try {
    const ctx = await requirePermission('DAILY_VIEW', req);
    const sp = new URL(req.url).searchParams;
    const id = sp.get('id')?.trim();
    if (!id) return apiErr('Parameter id wajib diisi.', 400);

    const row = await prisma.talTask.findFirst({
      where: { organizationId: ctx.organizationId, userId: ctx.userId, id },
    });
    if (!row) return apiErr('Task tidak ditemukan.', 404);

    // Aturan kunci TAL yang sama seperti PATCH /api/tal/tasks/[id].
    if (await isTaskPlanLocked(ctx.organizationId, ctx.userId, row)) {
      return apiErr('Rencana periode ini sudah terkunci — task tidak bisa diubah.', 403);
    }
    if (row.month && row.year && (await isMonthLockedForUser(ctx.organizationId, ctx.userId, row.year, row.month))) {
      return apiErr('Bulan ini sudah terkunci — task tidak bisa diubah.', 403);
    }

    const body = await req.json().catch(() => ({}));
    const { data, error } = parseTaskInput(body ?? {}, { isCreate: false });
    if (error || !data) return apiErr(error ?? 'Data task tidak valid.', 400);
    if (data.status === 'pending' && !data.blockerCategory && !row.blockerCategory) {
      return apiErr('Kategori blocker wajib diisi bila status pending.', 400);
    }
    // Hanya status (+ blocker) yang boleh diubah lewat workspace.
    const allowed: Record<string, unknown> = {};
    for (const k of ['status', 'blockerCategory', 'blockerDescription', 'blockerReportedAt']) {
      if (k in data) allowed[k] = data[k];
    }
    if (!('status' in allowed)) {
      return apiErr('Field status wajib diisi.', 400);
    }

    const updated = await prisma.talTask.update({ where: { id: row.id }, data: allowed });
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'DAILY_UPDATE_TASK_STATUS',
      module: 'DAILY',
      description: `Mengubah status tugas "${row.title}" dari ${row.status} menjadi ${updated.status} (Daily Workspace)`,
      ipAddress: getClientIp(req),
    });
    const tz = await getUserTimezone(ctx.organizationId, ctx.userId);
    const todayKey = dateKeyInTz(new Date(), tz);
    return apiOk({ task: serializeTask(updated, todayKey) });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('[daily/tasks PUT]', e);
    return apiErr('Gagal mengubah status tugas.', 500);
  }
}
