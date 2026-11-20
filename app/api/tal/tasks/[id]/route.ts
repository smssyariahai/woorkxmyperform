import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import {
  isMonthLockedForUser,
  isTaskPlanLocked,
  mapTalTask,
  parseTaskInput,
} from '@/lib/tal/server';
import { dispatchTalNotification } from '@/lib/tal/notify';

export const dynamic = 'force-dynamic';

async function ownTask(ctx: { organizationId: string; userId: string }, id: string) {
  return prisma.talTask.findFirst({
    where: { organizationId: ctx.organizationId, userId: ctx.userId, id },
  });
}

/** GET /api/tal/tasks/[id] — satu task milik sendiri. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireAuth();
    const row = await ownTask(ctx, params.id);
    if (!row) return apiErr('Task tidak ditemukan.', 404);
    return apiOk({ task: mapTalTask(row) });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat task TAL.', 500);
  }
}

/** PATCH /api/tal/tasks/[id] — ubah task milik sendiri (tolak bila plan/bulan terkunci). */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireAuth();
    const row = await ownTask(ctx, params.id);
    if (!row) return apiErr('Task tidak ditemukan.', 404);

    if (await isTaskPlanLocked(ctx.organizationId, ctx.userId, row)) {
      return apiErr('Rencana periode ini sudah terkunci — task tidak bisa diubah.', 403);
    }
    if (row.month && row.year && (await isMonthLockedForUser(ctx.organizationId, ctx.userId, row.year, row.month))) {
      return apiErr('Bulan ini sudah terkunci — task tidak bisa diubah.', 403);
    }

    const body = await req.json().catch(() => ({}));
    const { data, error } = parseTaskInput(body, { isCreate: false });
    if (error || !data) return apiErr(error ?? 'Data task tidak valid.', 400);
    // Bila status pending tanpa blocker di body DAN di baris lama, tolak.
    if (data.status === 'pending' && !data.blockerCategory && !row.blockerCategory) {
      return apiErr('Kategori blocker wajib diisi bila status pending.', 400);
    }

    const updated = await prisma.talTask.update({ where: { id: row.id }, data });
    if (data.status === 'pending' && (data.blockerCategory ?? row.blockerCategory)) {
      await dispatchTalNotification(prisma, {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        category: 'blocker_alert',
        title: `Blocker dilaporkan: ${row.title}`,
        body: `Kategori: ${data.blockerCategory ?? row.blockerCategory}. ${data.blockerDescription ?? row.blockerDescription ?? ''}`.trim(),
      }).catch(() => {});
    }
    return apiOk({ task: mapTalTask(updated) });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal mengubah task TAL.', 500);
  }
}

/** DELETE /api/tal/tasks/[id] — hapus task milik sendiri (tolak bila plan/bulan terkunci). */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireAuth();
    const row = await ownTask(ctx, params.id);
    if (!row) return apiErr('Task tidak ditemukan.', 404);
    if (await isTaskPlanLocked(ctx.organizationId, ctx.userId, row)) {
      return apiErr('Rencana periode ini sudah terkunci — task tidak bisa dihapus.', 403);
    }
    if (row.month && row.year && (await isMonthLockedForUser(ctx.organizationId, ctx.userId, row.year, row.month))) {
      return apiErr('Bulan ini sudah terkunci — task tidak bisa dihapus.', 403);
    }
    await prisma.talTask.delete({ where: { id: row.id } });
    return apiOk({ ok: true });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menghapus task TAL.', 500);
  }
}
