import { requirePlatformPermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';
import { topUpMaster, getMasterBalance } from '@/lib/bot/master';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const schema = z.object({
  amount: z.number().int().min(1000).max(1_000_000_000),
  description: z.string().max(300).optional(),
  reference: z.string().max(100).optional(),
});

/** POST /api/super/master/topup — tambah Saldo Master (hanya Administrator Pusat) */
export async function POST(req: Request) {
  try {
    const ctx = await requirePlatformPermission('PLATFORM_MASTER_MANAGE', req);
    const body = await req.json().catch(() => ({}));
    const p = schema.safeParse(body);
    if (!p.success) return apiErr('Nominal tidak valid (min Rp1.000).', 422);

    const balance = await topUpMaster({
      amount: p.data.amount,
      description: p.data.description || 'Top up Saldo Master',
      createdById: ctx.userId,
      reference: p.data.reference,
    });
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'MASTER_TOPUP',
      module: 'BOT',
      description: `Top up Saldo Master Rp${p.data.amount.toLocaleString('id-ID')}`,
      ipAddress: getClientIp(req),
    });
    return apiOk({ balance });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr(e.message || 'Gagal menambah Saldo Master.', 500);
  }
}
