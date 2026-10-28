import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { PERMISSION_CATALOG } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

/** GET /api/admin/permissions — katalog permission tenant dikelompokkan per modul. */
export async function GET(req: Request) {
  try {
    await requirePermission('ROLES_VIEW', req);
    // Kunci platform (PLATFORM_*) tidak pernah ditawarkan ke role tenant.
    const tenantCatalog = PERMISSION_CATALOG.filter((p) => !p.key.startsWith('PLATFORM_'));
    const modules: Record<string, typeof PERMISSION_CATALOG> = {};
    for (const p of tenantCatalog) {
      (modules[p.module] ||= []).push(p);
    }
    return apiOk({ catalog: tenantCatalog, modules });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat katalog permission.', 500);
  }
}
