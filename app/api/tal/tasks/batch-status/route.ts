import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const STATUSES = ['todo', 'pending', 'on_progress', 'done'];

/** POST /api/tal/tasks/batch-status — ubah status banyak task milik sendiri. */
export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    const body = await req.json().catch(() => ({}));
    const ids: string[] = Array.isArray(body.ids) ? body.ids.filter((x: unknown) => typeof x === 'string') : [];
    if (ids.length === 0) return apiErr('Tidak ada task yang dipilih.', 400);
    if (!STATUSES.includes(body.status)) return apiErr('status tidak dikenal.', 400);
    if (body.status === 'pending' && !body.blockerCategory) {
      return apiErr('Kategori blocker wajib diisi bila status pending.', 400);
    }
    const data: Record<string, any> = { status: body.status };
    if (body.status === 'pending') {
      data.blockerCategory = body.blockerCategory;
      data.blockerDescription = typeof body.blockerDescription === 'string' ? body.blockerDescription : null;
      data.blockerReportedAt = new Date();
    } else {
      data.blockerCategory = null;
      data.blockerDescription = null;
      data.blockerReportedAt = null;
    }
    const res = await prisma.talTask.updateMany({
      where: { organizationId: ctx.organizationId, userId: ctx.userId, id: { in: ids } },
      data,
    });
    return apiOk({ ok: true, updated: res.count });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal mengubah status task TAL.', 500);
  }
}
