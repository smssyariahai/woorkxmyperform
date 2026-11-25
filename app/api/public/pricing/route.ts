import { apiOk, apiErr } from '@/lib/utils';
import { getCatalogForRegistration } from '@/lib/pricing-catalog';

export const dynamic = 'force-dynamic';

/**
 * GET /api/public/pricing — katalog paket untuk formulir pendaftaran.
 * Tanpa auth (dipakai /register sebelum login).
 */
export async function GET() {
  try {
    const catalog = await getCatalogForRegistration();
    return apiOk(catalog);
  } catch {
    return apiErr('Gagal memuat katalog paket.', 500);
  }
}
