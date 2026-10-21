import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { ROLE_TEMPLATES } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

/** GET /api/admin/roles/templates — template role divisi (HR, Finance, IT Support, Manager, Karyawan). */
export async function GET(req: Request) {
  try {
    await requirePermission('ROLES_VIEW', req);
    return apiOk(ROLE_TEMPLATES);
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat template role.', 500);
  }
}
