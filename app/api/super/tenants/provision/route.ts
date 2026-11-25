import { requirePlatformPermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { createTenantRecord, runProvisioningSteps } from '@/lib/tenant/provisioning';

export const dynamic = 'force-dynamic';

/**
 * POST /api/super/tenants/provision — buat tenant baru (database-per-tenant).
 * Body: { companyName, slug, adminName, adminEmail, adminPassword }
 * Membuat record Tenant + job di master, lalu menjalankan provisioning
 * secara ASYNC (tidak ditunggu) dan mengembalikan 202 segera.
 * Status provisioning bisa dipantau lewat GET /api/super/tenants.
 */
export async function POST(req: Request) {
  try {
    await requirePlatformPermission('PLATFORM_TENANTS_MANAGE', req);
    const body = await req.json();
    const input = {
      companyName: String(body?.companyName ?? '').trim(),
      slug: String(body?.slug ?? '').trim(),
      adminName: String(body?.adminName ?? '').trim(),
      adminEmail: String(body?.adminEmail ?? '').trim(),
      adminPassword: String(body?.adminPassword ?? ''),
    };
    if (!input.companyName || !input.slug || !input.adminName || !input.adminEmail || !input.adminPassword) {
      return apiErr('companyName, slug, adminName, adminEmail, dan adminPassword wajib diisi.', 400);
    }
    // Validasi + buat Tenant/Job. Error validasi (slug bentrok, email
    // terdaftar, password pendek) dilempar di sini -> 400, sebelum
    // provisioning async dimulai.
    let record;
    try {
      record = await createTenantRecord(input);
    } catch (e: any) {
      return apiErr(e?.message ?? 'Validasi provisioning gagal.', 400);
    }
    const { tenant, job, adminPasswordHash } = record;
    setImmediate(() => {
      runProvisioningSteps(tenant, job, {
        adminEmail: input.adminEmail.toLowerCase(),
        adminName: input.adminName,
        adminPasswordHash,
      }).catch(() => {
        // Gagal sudah dicatat di job + audit log oleh runProvisioningSteps.
      });
    });
    return apiOk(
      {
        tenantId: tenant.id,
        tenantCode: tenant.tenantCode,
        jobId: job.id,
        status: 'PROVISIONING',
      },
      202,
    );
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memulai provisioning tenant.', 500);
  }
}
