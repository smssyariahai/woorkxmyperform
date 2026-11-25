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
  summarizeUserTier,
} from '@/lib/pricing-catalog';
import type { Prisma } from '@prisma/master-client';

export const dynamic = 'force-dynamic';

/** PATCH /api/super/pricing/user-tiers/[id] — edit tier (row DELETED tidak bisa diedit). */
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const ctx = await requirePlatformPermission('PLATFORM_PACKAGES_MANAGE', req);
    const existing = await masterPrisma.packageUserTier.findUnique({
      where: { id: params.id },
    });
    if (!existing) return apiErr('Tier pengguna tidak ditemukan.', 404);
    if (existing.status === 'DELETED') {
      return apiErr('Tier yang sudah dihapus tidak bisa diedit.', 409);
    }

    const body = await readJsonBody(req);
    const data: Prisma.PackageUserTierUpdateInput = {};

    const name = bodyString(body.name, 'Nama tier', { maxLength: 100 });
    if (name !== undefined) data.name = name;
    if (body.maxUsers !== undefined) {
      data.maxUsers = bodyInt(body.maxUsers, 'Batas pengguna', { min: 1 }) ?? null;
    }
    if (body.monthlyPrice !== undefined) {
      data.monthlyPrice = bodyInt(body.monthlyPrice, 'Harga bulanan') ?? null;
    }
    if (body.yearlyPrice !== undefined) {
      data.yearlyPrice = bodyInt(body.yearlyPrice, 'Harga tahunan') ?? null;
    }
    if (body.isCustomPrice !== undefined) {
      if (typeof body.isCustomPrice !== 'boolean') {
        throw apiErr('Harga khusus harus true atau false.', 400);
      }
      data.isCustomPrice = body.isCustomPrice;
    }
    if (body.minStorageGb !== undefined) {
      data.minStorageGb = bodyInt(body.minStorageGb, 'Storage minimum', {
        required: true,
      })!;
    }
    if (body.sortOrder !== undefined) {
      data.sortOrder = bodyInt(body.sortOrder, 'Urutan tampil') ?? 0;
    }
    const status = bodyCatalogStatus(body.status);
    if (status !== undefined) data.status = status;

    if (Object.keys(data).length === 0) {
      return apiErr('Tidak ada perubahan yang dikirim.', 400);
    }

    // Harga wajib terisi bila bukan harga khusus (gabungkan dengan nilai lama).
    const effectiveCustom =
      typeof data.isCustomPrice === 'boolean'
        ? data.isCustomPrice
        : existing.isCustomPrice;
    const effectiveMonthly =
      data.monthlyPrice !== undefined ? data.monthlyPrice : existing.monthlyPrice;
    const effectiveYearly =
      data.yearlyPrice !== undefined ? data.yearlyPrice : existing.yearlyPrice;
    if (!effectiveCustom && (effectiveMonthly === null || effectiveMonthly === undefined)) {
      throw apiErr('Harga bulanan wajib diisi kecuali harga khusus.', 400);
    }
    if (!effectiveCustom && (effectiveYearly === null || effectiveYearly === undefined)) {
      throw apiErr('Harga tahunan wajib diisi kecuali harga khusus.', 400);
    }

    const before = summarizeUserTier(existing);
    const updated = await masterPrisma.packageUserTier.update({
      where: { id: params.id },
      data,
    });
    await recordPackageAudit(ctx.userId, 'PACKAGE_USER_TIER_UPDATED', {
      before,
      after: summarizeUserTier(updated),
    });
    return apiOk(updated);
  } catch (e: any) {
    if (e instanceof Response) return e;
    if (isUniqueViolation(e)) return apiErr('Nama tier sudah dipakai.', 409);
    return apiErr('Gagal mengubah tier pengguna.', 500);
  }
}

/** DELETE /api/super/pricing/user-tiers/[id] — soft-delete (status DELETED, terminal). */
export async function DELETE(
  req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const ctx = await requirePlatformPermission('PLATFORM_PACKAGES_MANAGE', req);
    const existing = await masterPrisma.packageUserTier.findUnique({
      where: { id: params.id },
    });
    if (!existing) return apiErr('Tier pengguna tidak ditemukan.', 404);
    if (existing.status === 'DELETED') {
      return apiErr('Tier sudah dihapus.', 409);
    }
    const updated = await masterPrisma.packageUserTier.update({
      where: { id: params.id },
      data: { status: 'DELETED' },
    });
    await recordPackageAudit(ctx.userId, 'PACKAGE_USER_TIER_DELETED', {
      before: summarizeUserTier(existing),
      after: summarizeUserTier(updated),
    });
    return apiOk(updated);
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menghapus tier pengguna.', 500);
  }
}
