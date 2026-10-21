import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { getSessionInfo } from '@/lib/wa/manager';

export const dynamic = 'force-dynamic';

/** GET /api/channels/whatsapp/qr — status + QR untuk dipolling UI */
export async function GET() {
  try {
    const ctx = await requirePermission('SETTINGS_MANAGE');
    return apiOk(getSessionInfo(ctx.organizationId));
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat QR.', 500);
  }
}
