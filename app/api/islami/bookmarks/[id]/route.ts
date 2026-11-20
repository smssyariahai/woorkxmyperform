import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** DELETE /api/islami/bookmarks/[id] — hapus bookmark milik user */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireAuth();
    const row = await prisma.quranBookmark.findFirst({
      where: { id: params.id, organizationId: ctx.organizationId, userId: ctx.userId },
      select: { id: true },
    });
    if (!row) return apiErr('Bookmark tidak ditemukan.', 404);
    await prisma.quranBookmark.delete({ where: { id: row.id } });
    return apiOk({ success: true });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menghapus bookmark.', 500);
  }
}
