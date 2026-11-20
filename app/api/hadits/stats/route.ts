import { requireAuth } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { getHaditsStats } from '@/lib/islami/hadits';

export const dynamic = 'force-dynamic';

/** GET /api/hadits/stats — statistik kitab & grup hadits */
export async function GET() {
  try {
    await requireAuth();
    return apiOk(getHaditsStats());
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat statistik hadits.', 500);
  }
}
