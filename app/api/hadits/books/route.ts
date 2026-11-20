import { requireAuth } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { getHaditsBooks } from '@/lib/islami/hadits';

export const dynamic = 'force-dynamic';

/** GET /api/hadits/books — daftar 14 kitab hadits beserta metadata */
export async function GET() {
  try {
    await requireAuth();
    return apiOk({ books: getHaditsBooks() });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat daftar kitab hadits.', 500);
  }
}
