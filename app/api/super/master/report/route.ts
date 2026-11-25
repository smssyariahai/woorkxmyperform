// Rute super-admin / platform (P2-2 Phase 4): baca data platform dan legacy eksplisit.
// JANGAN pakai proxy `prisma` — rapuh bila super admin suatu hari punya sesi tenant.
import { legacyPrisma as prisma } from '@/lib/db';
import { requirePlatformPermission } from '@/lib/auth-helpers';
import { apiErr } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** GET /api/super/master/report — unduh laporan transaksi Saldo Master (CSV) */
export async function GET(req: Request) {
  try {
    await requirePlatformPermission('PLATFORM_MASTER_VIEW', req);
    const rows = await prisma.masterLedger.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5000,
      include: { organization: { select: { name: true } } },
    });
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [
      'Tanggal,ID Transaksi,Jenis,Tenant,Keterangan,Saldo Sebelum,Masuk,Keluar,Saldo Sesudah,Referensi',
      ...rows.map((r) =>
        [
          r.createdAt.toISOString(),
          r.seq,
          r.type,
          r.organization?.name ?? '',
          r.description ?? '',
          r.balanceAfter - r.amount,
          r.amount > 0 ? r.amount : 0,
          r.amount < 0 ? Math.abs(r.amount) : 0,
          r.balanceAfter,
          r.reference,
        ]
          .map(esc)
          .join(','),
      ),
    ];
    return new Response('\uFEFF' + lines.join('\n'), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="saldo-master-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal membuat laporan.', 500);
  }
}
