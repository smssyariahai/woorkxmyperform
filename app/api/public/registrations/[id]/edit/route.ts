import { apiOk, apiErr } from '@/lib/utils';
import { getRegistrationEditData } from '@/lib/tenant/registration-review';

export const dynamic = 'force-dynamic';

/**
 * GET /api/public/registrations/[id]/edit?token=... — data lengkap untuk
 * prefill form kirim ulang (tanpa login). Token salah / status bukan
 * NEEDS_REVISION → 404 generik.
 */
export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const token = new URL(req.url).searchParams.get('token');
    const data = await getRegistrationEditData(params.id, token);
    if (!data) {
      return apiErr('Pendaftaran tidak ditemukan.', 404);
    }
    return apiOk(data);
  } catch (e) {
    console.error('[public/registrations/[id]/edit] GET gagal:', e);
    return apiErr('Gagal memuat data pendaftaran.', 500);
  }
}
