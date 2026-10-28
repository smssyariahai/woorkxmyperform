import { requireSuperAdmin } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { PERMISSION_CATALOG } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

/** GET /api/super/platform-permissions — katalog permission platform (khusus super admin). */
export async function GET(req: Request) {
  try {
    await requireSuperAdmin(req);
    const catalog = PERMISSION_CATALOG.filter((p) => p.key.startsWith('PLATFORM_'));
    return apiOk({ catalog, modules: { Platform: catalog } });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat katalog permission platform.', 500);
  }
}
