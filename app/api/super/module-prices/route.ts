// Rute super-admin / platform (P2-2 Phase 4): baca data platform dan legacy eksplisit.
// JANGAN pakai proxy `prisma` — rapuh bila super admin suatu hari punya sesi tenant.
import { legacyPrisma as prisma } from '@/lib/db';
import { requirePlatformPermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';
import { DEFAULT_MODULE_PRICES } from '@/lib/modular';

export const dynamic = 'force-dynamic';

const BILLABLE = ['chat', 'hris', 'audit'] as const;

/** GET /api/super/module-prices — harga per modul berbayar (per user). */
export async function GET(req: Request) {
  try {
    await requirePlatformPermission('PLATFORM_PACKAGES_MANAGE', req);
    const rows = await prisma.modulePrice.findMany();
    const byKey = new Map(rows.map((r) => [r.moduleKey, r]));
    return apiOk(
      BILLABLE.map((key) => {
        const r = byKey.get(key);
        const d = DEFAULT_MODULE_PRICES[key];
        return {
          moduleKey: key,
          monthlyPerUser: r?.monthlyPerUser ?? d.monthlyPerUser,
          yearlyPerUser: r?.yearlyPerUser ?? d.yearlyPerUser,
          isActive: r?.isActive ?? true,
          fromDb: !!r,
        };
      })
    );
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat harga modul.', 500);
  }
}

/**
 * POST /api/super/module-prices — ubah harga satu modul.
 * Body: { moduleKey, monthlyPerUser, yearlyPerUser }
 * Harga baru hanya berlaku untuk langganan/invoice baru (snapshot lama tetap).
 */
export async function POST(req: Request) {
  try {
    const ctx = await requirePlatformPermission('PLATFORM_PACKAGES_MANAGE', req);
    const body = await req.json();
    const moduleKey = String(body?.moduleKey || '');
    const monthlyPerUser = Number(body?.monthlyPerUser);
    const yearlyPerUser = Number(body?.yearlyPerUser);
    if (!(BILLABLE as readonly string[]).includes(moduleKey)) {
      return apiErr('Modul tidak dikenal (hanya chat, hris, audit).', 422);
    }
    if (!Number.isInteger(monthlyPerUser) || monthlyPerUser < 0) {
      return apiErr('Harga bulanan harus angka >= 0.', 422);
    }
    if (!Number.isInteger(yearlyPerUser) || yearlyPerUser < 0) {
      return apiErr('Harga tahunan harus angka >= 0.', 422);
    }
    const row = await prisma.modulePrice.upsert({
      where: { moduleKey },
      update: { monthlyPerUser, yearlyPerUser, isActive: true },
      create: { moduleKey, monthlyPerUser, yearlyPerUser, currency: 'IDR', isActive: true },
    });
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'UPDATE_MODULE_PRICE',
      module: 'BILLING',
      description: `Harga modul ${moduleKey} diubah: Rp${monthlyPerUser.toLocaleString('id-ID')}/user/bulan, Rp${yearlyPerUser.toLocaleString('id-ID')}/user/tahun`,
      ipAddress: getClientIp(req),
    });
    return apiOk(row);
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menyimpan harga modul.', 500);
  }
}
