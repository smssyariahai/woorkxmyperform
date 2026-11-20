import { requireAuth } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { getSingleHadits } from '@/lib/islami/hadits';

export const dynamic = 'force-dynamic';

/** GET /api/hadits/[kitabId]/[nomor] — satu hadits */
export async function GET(
  _req: Request,
  { params }: { params: { kitabId: string; nomor: string } }
) {
  try {
    await requireAuth();
    const item = getSingleHadits(params.kitabId, Number(params.nomor));
    if (!item) return apiErr('Hadits tidak ditemukan.', 404);
    return apiOk(item);
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat hadits.', 500);
  }
}
