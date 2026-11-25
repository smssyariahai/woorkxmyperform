import { requirePlatformPermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { masterPrisma } from '@/lib/tenant/master';
import {
  bodyInt,
  bodyString,
  isUniqueViolation,
  readJsonBody,
  recordPackageAudit,
  summarizeModulePrice,
} from '@/lib/pricing-catalog';

export const dynamic = 'force-dynamic';

/** POST /api/super/pricing/modules — tambah harga modul berbayar baru (status ACTIVE). */
export async function POST(req: Request) {
  try {
    const ctx = await requirePlatformPermission('PLATFORM_PACKAGES_MANAGE', req);
    const body = await readJsonBody(req);

    const moduleKeyRaw = bodyString(body.moduleKey, 'Kunci modul', {
      required: true,
      maxLength: 50,
    })!;
    const moduleKey = moduleKeyRaw.toLowerCase();
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(moduleKey)) {
      throw apiErr(
        'Kunci modul hanya boleh huruf kecil, angka, "-" dan "_".',
        400,
      );
    }
    const name = bodyString(body.name, 'Nama modul', { required: true, maxLength: 100 })!;
    const monthlyPrice = bodyInt(body.monthlyPrice, 'Harga bulanan', { required: true })!;
    const yearlyPrice = bodyInt(body.yearlyPrice, 'Harga tahunan', { required: true })!;
    const sortOrder = bodyInt(body.sortOrder, 'Urutan tampil') ?? 0;

    const created = await masterPrisma.packageModulePrice.create({
      data: { moduleKey, name, monthlyPrice, yearlyPrice, sortOrder },
    });
    await recordPackageAudit(ctx.userId, 'PACKAGE_MODULE_PRICE_CREATED', {
      after: summarizeModulePrice(created),
    });
    return apiOk(created, 201);
  } catch (e: any) {
    if (e instanceof Response) return e;
    if (isUniqueViolation(e)) return apiErr('Kunci modul sudah dipakai.', 409);
    return apiErr('Gagal membuat harga modul.', 500);
  }
}
