import { requireAuth } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { queryHaditsList } from '@/lib/islami/hadits';

export const dynamic = 'force-dynamic';

/** GET /api/hadits/list?kitabId&grup&search&q&nomor&page&limit */
export async function GET(req: Request) {
  try {
    await requireAuth();
    const { searchParams } = new URL(req.url);
    const result = queryHaditsList({
      kitabId: searchParams.get('kitabId') ?? undefined,
      grup: searchParams.get('grup') ?? undefined,
      search: searchParams.get('search') ?? searchParams.get('q') ?? undefined,
      nomor: searchParams.get('nomor') ? Number(searchParams.get('nomor')) : undefined,
      page: searchParams.get('page') ? Number(searchParams.get('page')) : 1,
      limit: searchParams.get('limit') ? Number(searchParams.get('limit')) : 20,
    });
    return apiOk(result);
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal mencari hadits.', 500);
  }
}
