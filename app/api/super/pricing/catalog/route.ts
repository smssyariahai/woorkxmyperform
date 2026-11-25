import { requirePlatformPermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { getCatalogForRegistration } from '@/lib/pricing-catalog';

export const dynamic = 'force-dynamic';

/** GET /api/super/pricing/catalog — seluruh katalog aktif + pengaturan billing. */
export async function GET(req: Request) {
  try {
    await requirePlatformPermission('PLATFORM_PACKAGES_MANAGE', req);
    const catalog = await getCatalogForRegistration();
    return apiOk(catalog);
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat katalog paket & harga.', 500);
  }
}
