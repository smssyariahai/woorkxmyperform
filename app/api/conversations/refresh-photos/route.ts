import { requirePermission } from '@/lib/auth-helpers';
import { refreshOrgCustomerPhotos } from '@/lib/wa/manager';
import { apiOk, apiErr } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/**
 * POST /api/conversations/refresh-photos — perbarui foto profil WA
 * pelanggan yang belum ada / sudah lewat 7 hari (maks 25 per panggilan).
 * Memakai sesi WA kantor yang sedang open; bila WA belum terhubung,
 * mengembalikan error jujur (bukan diam-diam kosong).
 */
export async function POST() {
  try {
    const ctx = await requirePermission('INBOX_VIEW');
    const r = await refreshOrgCustomerPhotos(ctx.organizationId);
    if (!r.ok) return apiErr(r.error, 409);
    return apiOk({ checked: r.checked, updated: r.updated, unavailable: r.unavailable });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memperbarui foto profil.', 500);
  }
}
