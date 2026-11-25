import { requirePlatformPermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { masterPrisma } from '@/lib/tenant/master';
import {
  bodyCatalogStatus,
  bodyInt,
  bodyString,
  isUniqueViolation,
  readJsonBody,
  recordPackageAudit,
  summarizeModulePrice,
} from '@/lib/pricing-catalog';
import type { Prisma } from '@prisma/master-client';

export const dynamic = 'force-dynamic';

/** PATCH /api/super/pricing/modules/[id] — edit harga/nama modul (row DELETED tidak bisa diedit). */
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const ctx = await requirePlatformPermission('PLATFORM_PACKAGES_MANAGE', req);
    const existing = await masterPrisma.packageModulePrice.findUnique({
      where: { id: params.id },
    });
    if (!existing) return apiErr('Harga modul tidak ditemukan.', 404);
    if (existing.status === 'DELETED') {
      return apiErr('Modul yang sudah dihapus tidak bisa diedit.', 409);
    }

    const body = await readJsonBody(req);
    const data: Prisma.PackageModulePriceUpdateInput = {};

    if (body.moduleKey !== undefined) {
      const moduleKeyRaw = bodyString(body.moduleKey, 'Kunci modul', { maxLength: 50 })!;
      const moduleKey = moduleKeyRaw.toLowerCase();
      if (!/^[a-z0-9][a-z0-9_-]*$/.test(moduleKey)) {
        throw apiErr(
          'Kunci modul hanya boleh huruf kecil, angka, "-" dan "_".',
          400,
        );
      }
      data.moduleKey = moduleKey;
    }
    const name = bodyString(body.name, 'Nama modul', { maxLength: 100 });
    if (name !== undefined) data.name = name;
    if (body.monthlyPrice !== undefined) {
      const v = bodyInt(body.monthlyPrice, 'Harga bulanan');
      if (v === null || v === undefined) {
        throw apiErr('Harga bulanan wajib diisi.', 400);
      }
      data.monthlyPrice = v;
    }
    if (body.yearlyPrice !== undefined) {
      const v = bodyInt(body.yearlyPrice, 'Harga tahunan');
      if (v === null || v === undefined) {
        throw apiErr('Harga tahunan wajib diisi.', 400);
      }
      data.yearlyPrice = v;
    }
    if (body.sortOrder !== undefined) {
      data.sortOrder = bodyInt(body.sortOrder, 'Urutan tampil') ?? 0;
    }
    const status = bodyCatalogStatus(body.status);
    if (status !== undefined) data.status = status;

    if (Object.keys(data).length === 0) {
      return apiErr('Tidak ada perubahan yang dikirim.', 400);
    }

    const before = summarizeModulePrice(existing);
    const updated = await masterPrisma.packageModulePrice.update({
      where: { id: params.id },
      data,
    });
    await recordPackageAudit(ctx.userId, 'PACKAGE_MODULE_PRICE_UPDATED', {
      before,
      after: summarizeModulePrice(updated),
    });
    return apiOk(updated);
  } catch (e: any) {
    if (e instanceof Response) return e;
    if (isUniqueViolation(e)) return apiErr('Kunci modul sudah dipakai.', 409);
    return apiErr('Gagal mengubah harga modul.', 500);
  }
}

/** DELETE /api/super/pricing/modules/[id] — soft-delete (status DELETED, terminal). */
export async function DELETE(
  req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const ctx = await requirePlatformPermission('PLATFORM_PACKAGES_MANAGE', req);
    const existing = await masterPrisma.packageModulePrice.findUnique({
      where: { id: params.id },
    });
    if (!existing) return apiErr('Harga modul tidak ditemukan.', 404);
    if (existing.status === 'DELETED') {
      return apiErr('Modul sudah dihapus.', 409);
    }
    const updated = await masterPrisma.packageModulePrice.update({
      where: { id: params.id },
      data: { status: 'DELETED' },
    });
    await recordPackageAudit(ctx.userId, 'PACKAGE_MODULE_PRICE_DELETED', {
      before: summarizeModulePrice(existing),
      after: summarizeModulePrice(updated),
    });
    return apiOk(updated);
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menghapus harga modul.', 500);
  }
}
