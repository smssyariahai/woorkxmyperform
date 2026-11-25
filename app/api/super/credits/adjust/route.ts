// Rute super-admin / platform (P2-2 Phase 4): baca data platform dan legacy eksplisit.
// JANGAN pakai proxy `prisma` — rapuh bila super admin suatu hari punya sesi tenant.
import { legacyPrisma as prisma } from '@/lib/db';
import { requirePlatformPermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';
import { addCredit, getBalance } from '@/lib/bot/credits';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const schema = z.object({
  organizationId: z.string().min(1),
  amount: z.number().int().min(1).max(100_000_000),
  note: z.string().max(500).optional(),
});

/**
 * POST /api/super/credits/adjust — tambah/koreksi kredit owner (HANYA Administrator Pusat).
 * Dipakai untuk top up manual setelah pembayaran terverifikasi.
 */
export async function POST(req: Request) {
  try {
    const ctx = await requirePlatformPermission('PLATFORM_MASTER_MANAGE', req);
    const body = await req.json().catch(() => ({}));
    const p = schema.safeParse(body);
    if (!p.success) return apiErr('Data tidak valid.', 422);

    const org = await prisma.organization.findUnique({
      where: { id: p.data.organizationId },
      select: { id: true, name: true },
    });
    if (!org) return apiErr('Kantor tidak ditemukan.', 404);

    // Top up manual = distribusi dari Saldo Master (Master berkurang, tenant bertambah)
    let balance: number;
    try {
      balance = await addCredit({
        organizationId: org.id,
        amount: p.data.amount,
        type: 'TOPUP',
        description: p.data.note || 'Top up manual oleh Administrator Pusat',
        createdById: ctx.userId,
        fromMaster: true,
      });
    } catch (e: any) {
      if (e.message === 'INSUFFICIENT_MASTER_BALANCE' || e.message === 'MASTER_MIN_BALANCE_BLOCKED') {
        return apiErr(
          'Saldo Master tidak mencukupi untuk top up ini (atau akan turun di bawah batas minimum). Tambah Saldo Master dulu di menu Saldo Master.',
          422,
        );
      }
      throw e;
    }

    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'CREDIT_TOPUP',
      module: 'BOT',
      description: `Top up Rp${p.data.amount.toLocaleString('id-ID')} untuk "${org.name}" (didebet dari Saldo Master)${p.data.note ? ` — ${p.data.note}` : ''}`,
      ipAddress: getClientIp(req),
    });
    return apiOk({ balance, organizationName: org.name });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr(e.message || 'Gagal menambah kredit.', 500);
  }
}
