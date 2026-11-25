import { auth } from '@/lib/auth';
import { apiOk, apiErr } from '@/lib/utils';
import {
  resolveOwnSubscription,
  toStatusPayload,
} from '@/lib/tenant/subscription-lifecycle';

export const dynamic = 'force-dynamic';

/** GET /api/tenant/subscription/status — status langganan milik pemanggil.
 *  TANPA tenant context: tenant DITANGGUHKAN/NONAKTIF tidak punya context,
 *  jadi identitas dibaca dari sesi (auth()) lalu TenantMembership di
 *  master (resolveOwnSubscription). 404 bila tidak ada tenant. */
export async function GET() {
  try {
    const session = await auth();
    const u = session?.user as any;
    if (!u?.id && !u?.email) {
      return apiErr('Belum login. Silakan masuk kembali.', 401);
    }
    const own = await resolveOwnSubscription({ id: u.id, email: u.email });
    if (!own) {
      return apiErr('Tenant tidak ditemukan.', 404);
    }
    return apiOk(toStatusPayload(own));
  } catch {
    return apiErr('Gagal memuat status langganan.', 500);
  }
}
