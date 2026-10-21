import { apiOk, apiErr } from '@/lib/utils';
import { processDueCampaigns } from '@/lib/campaigns/sender';

export const dynamic = 'force-dynamic';

/**
 * POST /api/campaigns/process-due — dipanggil cron tiap beberapa menit.
 * Mengirim campaign terjadwal yang sudah jatuh tempo + memulihkan yang macet.
 * Diamankan dengan CRON_SECRET (header x-cron-secret).
 */
export async function POST(req: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    if (!secret) return apiErr('CRON_SECRET belum dikonfigurasi di server.', 500);
    const got = req.headers.get('x-cron-secret');
    if (got !== secret) return apiErr('Unauthorized.', 401);

    const result = await processDueCampaigns();
    return apiOk(result);
  } catch (e: any) {
    return apiErr('Gagal memproses campaign terjadwal.', 500);
  }
}
