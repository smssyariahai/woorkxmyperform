import { prisma } from '@/lib/db';
import { requireAuth, requireModularAccess } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { dispatchTalNotification } from '@/lib/tal/notify';

export const dynamic = 'force-dynamic';

/**
 * POST /api/tal/preferences/test — kirim notifikasi uji TAL_TEST ke diri
 * sendiri. Satu-satunya kategori yang menembus dndMode (persis backup
 * sendTalTestNotification). Dipakai tombol "Uji Notifikasi" di /tal/preferences.
 */
export async function POST() {
  try {
    const ctx = await requireAuth();
    await requireModularAccess(ctx, 'tal', 'WRITE');
    const sent = await dispatchTalNotification(prisma, {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      category: 'test',
      title: 'Notifikasi Uji TAL',
      body: 'Ini adalah notifikasi uji dari pengaturan TAL. Bila Anda melihat pesan ini di bell, notifikasi TAL berfungsi.',
    });
    return apiOk({ sent });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal mengirim notifikasi uji TAL.', 500);
  }
}
