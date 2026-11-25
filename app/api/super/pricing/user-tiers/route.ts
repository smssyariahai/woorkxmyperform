import { requirePlatformPermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { masterPrisma } from '@/lib/tenant/master';
import {
  bodyInt,
  bodyString,
  isUniqueViolation,
  readJsonBody,
  recordPackageAudit,
  summarizeUserTier,
} from '@/lib/pricing-catalog';

export const dynamic = 'force-dynamic';

/** POST /api/super/pricing/user-tiers — tambah tier pengguna baru (status ACTIVE). */
export async function POST(req: Request) {
  try {
    const ctx = await requirePlatformPermission('PLATFORM_PACKAGES_MANAGE', req);
    const body = await readJsonBody(req);

    const name = bodyString(body.name, 'Nama tier', { required: true, maxLength: 100 })!;
    const maxUsers = bodyInt(body.maxUsers, 'Batas pengguna', { min: 1 });
    const isCustomPrice = body.isCustomPrice === true;
    const monthlyPrice = bodyInt(body.monthlyPrice, 'Harga bulanan');
    const yearlyPrice = bodyInt(body.yearlyPrice, 'Harga tahunan');
    if (!isCustomPrice && (monthlyPrice === undefined || monthlyPrice === null)) {
      throw apiErr('Harga bulanan wajib diisi kecuali harga khusus.', 400);
    }
    if (!isCustomPrice && (yearlyPrice === undefined || yearlyPrice === null)) {
      throw apiErr('Harga tahunan wajib diisi kecuali harga khusus.', 400);
    }
    const minStorageGb = bodyInt(body.minStorageGb, 'Storage minimum', { required: true })!;
    const sortOrder = bodyInt(body.sortOrder, 'Urutan tampil') ?? 0;

    const created = await masterPrisma.packageUserTier.create({
      data: {
        name,
        maxUsers: maxUsers ?? null,
        monthlyPrice: monthlyPrice ?? null,
        yearlyPrice: yearlyPrice ?? null,
        isCustomPrice,
        minStorageGb,
        sortOrder,
      },
    });
    await recordPackageAudit(ctx.userId, 'PACKAGE_USER_TIER_CREATED', {
      after: summarizeUserTier(created),
    });
    return apiOk(created, 201);
  } catch (e: any) {
    if (e instanceof Response) return e;
    if (isUniqueViolation(e)) return apiErr('Nama tier sudah dipakai.', 409);
    return apiErr('Gagal membuat tier pengguna.', 500);
  }
}
