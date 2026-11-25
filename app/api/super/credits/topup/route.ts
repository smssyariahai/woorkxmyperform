// Rute super-admin / platform (P2-2 Phase 4): baca data platform dan legacy eksplisit.
// JANGAN pakai proxy `prisma` — rapuh bila super admin suatu hari punya sesi tenant.
import { legacyPrisma as prisma } from '@/lib/db';
import { requirePlatformPermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';
import { addCredit } from '@/lib/bot/credits';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

/** GET /api/super/credits/topup — daftar pengajuan top up (filter status) */
export async function GET(req: Request) {
  try {
    await requirePlatformPermission('PLATFORM_MASTER_VIEW', req);
    const url = new URL(req.url);
    const status = url.searchParams.get('status') || 'PENDING';
    const items = await prisma.topUpRequest.findMany({
      where: { status },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { organization: { select: { name: true } } },
    });
    return apiOk({ items });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat pengajuan.', 500);
  }
}

const schema = z.object({
  id: z.string().min(1),
  action: z.enum(['APPROVE', 'REJECT']),
  note: z.string().max(300).optional(),
});

/**
 * POST /api/super/credits/topup — setujui/tolak pengajuan.
 * APPROVE menambah kredit (idempoten: pengajuan hanya bisa diproses sekali).
 */
export async function POST(req: Request) {
  try {
    const ctx = await requirePlatformPermission('PLATFORM_MASTER_MANAGE', req);
    const body = await req.json().catch(() => ({}));
    const p = schema.safeParse(body);
    if (!p.success) return apiErr('Data tidak valid.', 422);

    const tr = await prisma.topUpRequest.findUnique({ where: { id: p.data.id } });
    if (!tr) return apiErr('Pengajuan tidak ditemukan.', 404);
    if (tr.status !== 'PENDING') return apiErr('Pengajuan sudah diproses sebelumnya.', 409);

    if (p.data.action === 'REJECT') {
      await prisma.topUpRequest.update({
        where: { id: tr.id },
        data: { status: 'REJECTED', handledById: ctx.userId, handledAt: new Date(), note: p.data.note ?? tr.note },
      });
      await audit({
        organizationId: ctx.organizationId, userId: ctx.userId, action: 'TOPUP_REJECT',
        module: 'BOT', description: `Menolak top up Rp${tr.amount.toLocaleString('id-ID')} (${tr.id.slice(0, 8)})`,
        ipAddress: getClientIp(req),
      });
      return apiOk({ status: 'REJECTED' });
    }

    // APPROVE — distribusi dari Saldo Master ke tenant (idempoten, anti double)
    let balance: number;
    try {
      balance = await addCredit({
        organizationId: tr.organizationId,
        amount: tr.amount,
        type: 'TOPUP',
        description: `Top up disetujui${p.data.note ? ` — ${p.data.note}` : ''}`,
        createdById: ctx.userId,
        reference: `topup_${tr.id}`,
        fromMaster: true,
      });
    } catch (e: any) {
      if (e.message === 'INSUFFICIENT_MASTER_BALANCE' || e.message === 'MASTER_MIN_BALANCE_BLOCKED') {
        return apiErr(
          'Saldo Master tidak mencukupi untuk distribusi ini (atau akan turun di bawah batas minimum). Tambah Saldo Master dulu.',
          422,
        );
      }
      throw e;
    }
    await prisma.topUpRequest.update({
      where: { id: tr.id },
      data: { status: 'APPROVED', handledById: ctx.userId, handledAt: new Date() },
    });
    await audit({
      organizationId: ctx.organizationId, userId: ctx.userId, action: 'TOPUP_APPROVE',
      module: 'BOT', description: `Menyetujui top up Rp${tr.amount.toLocaleString('id-ID')} (${tr.id.slice(0, 8)})`,
      ipAddress: getClientIp(req),
    });
    return apiOk({ status: 'APPROVED', balance });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr(e.message || 'Gagal memproses pengajuan.', 500);
  }
}
