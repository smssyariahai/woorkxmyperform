import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { getUserFormRefs } from '@/lib/user-detail';

export const dynamic = 'force-dynamic';

/** GET /api/admin/users/refs — referensi untuk form tambah pengguna. */
export async function GET(req: Request) {
  try {
    const ctx = await requirePermission('USERS_CREATE', req);
    const refs = await getUserFormRefs(ctx.organizationId);
    return apiOk(refs);
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat referensi.', 500);
  }
}
