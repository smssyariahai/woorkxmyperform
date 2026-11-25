import { requirePlatformPermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { masterPrisma } from '@/lib/tenant/master';
import { retryProvisioning } from '@/lib/tenant/provisioning';

export const dynamic = 'force-dynamic';

/**
 * POST /api/super/tenants/[id]/retry — ulangi provisioning tenant yang gagal.
 * Guard: PLATFORM_TENANTS_MANAGE. 404 bila tenant tidak ada, 409 bila tenant
 * sudah ACTIVE (tidak perlu retry). Menjalankan retry secara fire-and-forget
 * dan mengembalikan 202 segera; job terbaru bisa dilihat via
 * GET /api/super/tenants.
 *
 * CATATAN PENYIMPANGAN dari spes awal: spes awal meminta field `jobId` di
 * respons 202, tetapi `retryProvisioning` membuat job BARU secara asinkron di
 * dalam proses background, sehingga jobId belum diketahui saat respons
 * dikirim. Respons ini sengaja TIDAK menyertakan jobId; job terbaru untuk
 * tenant tersebut bisa dilihat via GET /api/super/tenants.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    await requirePlatformPermission('PLATFORM_TENANTS_MANAGE', req);
    const tenant = await masterPrisma.tenant.findUnique({ where: { id: params.id } });
    if (!tenant) {
      return apiErr('Tenant tidak ditemukan.', 404);
    }
    if (tenant.tenantStatus === 'ACTIVE') {
      return apiErr('Tenant sudah aktif, tidak perlu retry provisioning.', 409);
    }
    // Fire-and-forget: kegagalan sudah dicatat di job + audit log oleh
    // engine provisioning sendiri (retryProvisioning / runProvisioningSteps).
    void retryProvisioning(tenant.id).catch(() => {});
    return apiOk(
      {
        tenantId: tenant.id,
        tenantCode: tenant.tenantCode,
        status: 'PROVISIONING',
      },
      202,
    );
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memulai ulang provisioning.', 500);
  }
}
