import { requireSuperAdmin } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { getMasterStats } from '@/lib/bot/master';

export const dynamic = 'force-dynamic';

/** GET /api/super/master — ringkasan dashboard Saldo Master (hanya Administrator Pusat) */
export async function GET(req: Request) {
  try {
    await requireSuperAdmin(req);
    return apiOk(await getMasterStats());
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat Saldo Master.', 500);
  }
}
