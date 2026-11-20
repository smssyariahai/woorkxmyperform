import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/notifications/[id] — tandai SATU notifikasi dibaca.
 * Generik (bukan khusus TAL) agar modul lain bisa memakai; hanya notifikasi
 * milik sendiri di organisasi aktif yang bisa diubah (404 bila bukan miliknya).
 */
export async function PATCH(_req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireAuth();
    const row = await prisma.notification.findFirst({
      where: { organizationId: ctx.organizationId, userId: ctx.userId, id: params.id },
      select: { id: true, isRead: true },
    });
    if (!row) return apiErr('Notifikasi tidak ditemukan.', 404);
    if (!row.isRead) {
      await prisma.notification.update({ where: { id: row.id }, data: { isRead: true } });
    }
    return apiOk({ ok: true });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memperbarui notifikasi.', 500);
  }
}
