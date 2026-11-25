import { requirePlatformPermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { masterPrisma } from '@/lib/tenant/master';
import { restoreTenantDb } from '@/lib/tenant/backup';

export const dynamic = 'force-dynamic';

/** POST /api/super/tenants/[id]/restore — pulihkan database tenant dari
 *  file backup. Guard: PLATFORM_TENANTS_MANAGE. 404 bila tenant tidak ada.
 *  Body: { filename, confirmCode }. confirmCode harus sama persis dengan
 *  tenantCode, bila tidak 400. Dijalankan sinkron; mengembalikan ringkasan
 *  hasil restore. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePlatformPermission('PLATFORM_TENANTS_MANAGE', req);
    const tenant = await masterPrisma.tenant.findUnique({ where: { id: params.id } });
    if (!tenant) {
      return apiErr('Tenant tidak ditemukan.', 404);
    }
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      return apiErr('Body request harus JSON yang valid.', 400);
    }
    const filename = typeof body?.filename === 'string' ? body.filename : '';
    const confirmCode = typeof body?.confirmCode === 'string' ? body.confirmCode : '';
    if (!filename) {
      return apiErr('Nama file backup wajib diisi.', 400);
    }
    if (confirmCode !== tenant.tenantCode) {
      return apiErr(
        `Kode konfirmasi salah. Ketik persis kode tenant "${tenant.tenantCode}" untuk memulihkan database ini.`,
        400,
      );
    }
    const result = await restoreTenantDb(tenant.id, filename, ctx.userId);
    return apiOk(result);
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr(e?.message ? String(e.message).slice(0, 500) : 'Gagal memulihkan database tenant.', 500);
  }
}
