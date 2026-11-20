// GET /api/koperasi/cabang — daftar cabang dari KoperasiSetting key
// 'cabang' bila ada, fallback ke daftar default backup
// (CABANG_OPTIONS, src/components/koperasi/cabang.ts).
import { requireAuth } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { getCabangList } from '@/lib/koperasi/server';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request) {
  try {
    const ctx = await requireAuth();
    const cabang = await getCabangList(ctx.organizationId);
    return apiOk({ cabang });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat daftar cabang.', 500);
  }
}
