import { requireAuth } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import {
  LifecycleError,
  resolveOwnSubscription,
  transitionSubscription,
} from '@/lib/tenant/subscription-lifecycle';

export const dynamic = 'force-dynamic';

/** POST /api/tenant/subscription/request-stop — Client Admin (OWNER) minta
 *  berhenti berlangganan (Bab 7.5). Tenant masih ACTIVE saat meminta.
 *  Lifecycle -> NONAKTIF + retensi 60 hari. 403 bila bukan OWNER. */
export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    // OWNER saja. Sesi tenant: role JWT (= roleReference) sudah cukup,
    // tapi sesi legacy (tanpa tenantCode) organisasi sesinya adalah org
    // legacy — karena itu tenant + peran dibaca ulang dari master.
    let tenantId = ctx.organizationId;
    let isOwner = ctx.role === 'OWNER';
    if (!ctx.tenantCode) {
      const own = await resolveOwnSubscription({
        id: ctx.userId,
        email: ctx.email,
      });
      if (!own) {
        return apiErr('Tenant tidak ditemukan.', 404);
      }
      tenantId = own.tenant.id;
      isOwner = own.isOwner;
    }
    if (!isOwner) {
      return apiErr(
        'Hanya admin kantor (OWNER) yang bisa meminta berhenti berlangganan.',
        403,
      );
    }
    const body = await req.json().catch(() => null);
    const reason = typeof body?.reason === 'string' ? body.reason : '';
    const result = await transitionSubscription(tenantId, 'NONAKTIF', {
      reason,
      actorId: ctx.userId,
    });
    return apiOk({
      lifecycleStatus: result.to,
      retentionStartsAt: result.subscription.retentionStartsAt,
      retentionEndsAt: result.subscription.retentionEndsAt,
    });
  } catch (e: any) {
    if (e instanceof Response) return e;
    if (e instanceof LifecycleError) return apiErr(e.message, e.status);
    return apiErr('Gagal memproses permintaan berhenti berlangganan.', 500);
  }
}
