import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/**
 * POST /api/pengumuman/[id]/baca — tandai pengumuman dibaca untuk user login.
 * Model Notification WOORK tidak punya tautan ke Announcement, jadi yang
 * ditandai adalah baris Notification milik user ini (type PENGUMUMAN) yang
 * judulnya sama dengan pengumuman ini. Dipanggil otomatis saat halaman
 * detail dibuka. Bila tidak ada baris notifikasi yang cocok (mis. user
 * bukan penerima saat publish), tetap sukses.
 */
export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const ctx = await requireAuth();
    const row = await prisma.announcement.findFirst({
      where: { id: params.id, organizationId: ctx.organizationId },
      select: { id: true, title: true },
    });
    if (!row) return apiErr('Pengumuman tidak ditemukan.', 404);
    const marked = await prisma.notification.updateMany({
      where: {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        type: 'PENGUMUMAN',
        title: row.title,
        isRead: false,
      },
      data: { isRead: true },
    });
    return apiOk({ ok: true, marked: marked.count });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menandai pengumuman dibaca.', 500);
  }
}
