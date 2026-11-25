import { apiOk, apiErr } from '@/lib/utils';
import { getRegistrationStatusByToken } from '@/lib/tenant/tenant-registration';

export const dynamic = 'force-dynamic';

/**
 * GET /api/public/registrations/[id]?token=... — status ringkas pendaftaran.
 * Token salah → 404 generik (jangan bocorkan alasan).
 */
export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const token = new URL(req.url).searchParams.get('token') ?? '';
    const status = await getRegistrationStatusByToken(params.id, token);
    if (!status) {
      return apiErr('Pendaftaran tidak ditemukan.', 404);
    }
    return apiOk(status);
  } catch {
    return apiErr('Gagal memuat status pendaftaran.', 500);
  }
}
