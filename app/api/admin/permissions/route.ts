import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { PERMISSION_CATALOG } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

/** GET /api/admin/permissions — katalog permission dikelompokkan per modul. */
export async function GET(req: Request) {
  try {
    await requirePermission('ROLES_VIEW', req);
    const modules: Record<string, typeof PERMISSION_CATALOG> = {};
    for (const p of PERMISSION_CATALOG) {
      (modules[p.module] ||= []).push(p);
    }
    return apiOk({ catalog: PERMISSION_CATALOG, modules });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat katalog permission.', 500);
  }
}
