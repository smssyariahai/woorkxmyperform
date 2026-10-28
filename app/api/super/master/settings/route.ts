import { requirePlatformPermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';
import { setSystemSettings, invalidateSettingsCache } from '@/lib/system-settings';
import { getMasterLimits, getMasterBalance, masterStatusOf } from '@/lib/bot/master';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

/** GET /api/super/master/settings — batas saldo minimum & kritis */
export async function GET(req: Request) {
  try {
    await requirePlatformPermission('PLATFORM_MASTER_VIEW', req);
    const limits = await getMasterLimits();
    const balance = await getMasterBalance();
    return apiOk({ ...limits, balance, status: masterStatusOf(balance, limits.minBalance, limits.criticalBalance) });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat pengaturan.', 500);
  }
}

const schema = z.object({
  minBalance: z.number().int().min(0).max(1_000_000_000),
  criticalBalance: z.number().int().min(0).max(1_000_000_000),
});

/** PUT /api/super/master/settings — ubah batas saldo minimum & kritis */
export async function PUT(req: Request) {
  try {
    const ctx = await requirePlatformPermission('PLATFORM_MASTER_MANAGE', req);
    const body = await req.json().catch(() => ({}));
    const p = schema.safeParse(body);
    if (!p.success) return apiErr('Data tidak valid.', 422);
    if (p.data.criticalBalance > p.data.minBalance) {
      return apiErr('Saldo kritis harus lebih kecil dari saldo minimum.', 422);
    }
    await setSystemSettings({
      'master.minBalance': String(p.data.minBalance),
      'master.criticalBalance': String(p.data.criticalBalance),
    });
    invalidateSettingsCache();
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'MASTER_SETTINGS',
      module: 'BOT',
      description: `Ubah batas Saldo Master: min Rp${p.data.minBalance.toLocaleString('id-ID')}, kritis Rp${p.data.criticalBalance.toLocaleString('id-ID')}`,
      ipAddress: getClientIp(req),
    });
    return apiOk({ ok: true });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menyimpan pengaturan.', 500);
  }
}
