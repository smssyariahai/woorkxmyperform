import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const schema = z.object({
  amount: z.number().int().min(10000).max(100_000_000),
  note: z.string().max(300).optional(),
});

/**
 * POST /api/bot/ai/topup — owner mengajukan permintaan top up.
 * Kredit BARU bertambah setelah Administrator Pusat menyetujui.
 */
export async function POST(req: Request) {
  try {
    const ctx = await requirePermission('BOT_MANAGE', req);
    const body = await req.json().catch(() => ({}));
    const p = schema.safeParse(body);
    if (!p.success) return apiErr('Nominal minimal Rp10.000.', 422);

    const tr = await prisma.topUpRequest.create({
      data: {
        organizationId: ctx.organizationId,
        amount: p.data.amount,
        note: p.data.note?.trim() || null,
        requestedById: ctx.userId,
      },
    });

    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'TOPUP_REQUEST',
      module: 'BOT',
      description: `Mengajukan top up Rp${p.data.amount.toLocaleString('id-ID')}`,
      ipAddress: getClientIp(req),
    });
    return apiOk({ id: tr.id, status: tr.status });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal mengajukan top up.', 500);
  }
}

/** GET /api/bot/ai/topup — daftar pengajuan milik owner */
export async function GET(req: Request) {
  try {
    const ctx = await requirePermission('BOT_MANAGE', req);
    const items = await prisma.topUpRequest.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return apiOk({ items });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat pengajuan.', 500);
  }
}
