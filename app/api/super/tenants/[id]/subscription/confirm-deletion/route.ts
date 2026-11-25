import { requirePlatformPermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import {
  LifecycleError,
  confirmDeletion,
} from '@/lib/tenant/subscription-lifecycle';

export const dynamic = 'force-dynamic';

/** POST /api/super/tenants/[id]/subscription/confirm-deletion — hapus
 *  permanen setelah retensi. Guard: PLATFORM_TENANTS_MANAGE.
 *  Body { reason, confirmCode }. Syarat: NONAKTIF + retensi sudah lewat +
 *  confirmCode === kode tenant persis. Menghapus DB + role + file backup;
 *  baris Tenant + Subscription tetap sebagai tombstone. */
export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const ctx = await requirePlatformPermission('PLATFORM_TENANTS_MANAGE', req);
    const body = await req.json().catch(() => null);
    const reason = typeof body?.reason === 'string' ? body.reason : '';
    const confirmCode =
      typeof body?.confirmCode === 'string' ? body.confirmCode : '';
    const result = await confirmDeletion(params.id, {
      reason,
      confirmCode,
      actorId: ctx.userId,
    });
    return apiOk(result);
  } catch (e: any) {
    if (e instanceof Response) return e;
    if (e instanceof LifecycleError) return apiErr(e.message, e.status);
    return apiErr('Gagal menghapus tenant.', 500);
  }
}
