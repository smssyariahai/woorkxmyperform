import { apiOk, apiErr } from '@/lib/utils';
import { masterPrisma } from '@/lib/tenant/master';
import { validateTenantCode } from '@/lib/tenant/tenant-code';

export const dynamic = 'force-dynamic';

/**
 * GET /api/tenants/[code]/status — status provisioning publik untuk satu tenant.
 * Dipakai halaman /provisioning saat perusahaan baru dibuat.
 *
 * Mengembalikan HANYA { tenantCode, companyName, status, step } — tanpa
 * secret, email, atau detail internal/error teknis.
 *
 * Pemetaan status:
 * - tenant.tenantStatus === 'ACTIVE' -> 'ACTIVE' (walau job tidak ditemukan)
 * - job terakhir step DONE + status SUCCEEDED -> 'ACTIVE'
 * - job terakhir status FAILED -> 'FAILED'
 * - selain itu -> 'PROVISIONING'
 */
export async function GET(_req: Request, { params }: { params: { code: string } }) {
  try {
    const code = params.code;
    if (!validateTenantCode(code)) {
      return apiErr('Kode tenant tidak valid.', 400);
    }
    const tenant = await masterPrisma.tenant.findUnique({ where: { tenantCode: code } });
    if (!tenant) {
      return apiErr('Tenant tidak ditemukan.', 404);
    }
    const job = await masterPrisma.provisioningJob.findFirst({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: 'desc' },
    });

    let status: 'PROVISIONING' | 'ACTIVE' | 'FAILED' = 'PROVISIONING';
    if (tenant.tenantStatus === 'ACTIVE') {
      status = 'ACTIVE';
    } else if (job && job.step === 'DONE' && job.status === 'SUCCEEDED') {
      status = 'ACTIVE';
    } else if (job?.status === 'FAILED') {
      status = 'FAILED';
    }

    return apiOk({
      tenantCode: tenant.tenantCode,
      companyName: tenant.companyName,
      status,
      step: job?.step ?? '',
    });
  } catch {
    return apiErr('Gagal memuat status provisioning.', 500);
  }
}
