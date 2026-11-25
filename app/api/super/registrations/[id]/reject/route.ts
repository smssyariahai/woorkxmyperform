import { requirePlatformPermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { rejectRegistration } from '@/lib/tenant/registration-review';
import { RegistrationError } from '@/lib/tenant/tenant-registration';

export const dynamic = 'force-dynamic';

/**
 * POST /api/super/registrations/[id]/reject — tolak pendaftaran
 * (guard MANAGE). Body { reason } (wajib ≥10 karakter). Terminal.
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const ctx = await requirePlatformPermission(
      'PLATFORM_REGISTRATIONS_MANAGE',
      req,
    );
    const body = (await req.json().catch(() => null)) as {
      reason?: unknown;
    } | null;
    const reason = typeof body?.reason === 'string' ? body.reason : '';
    await rejectRegistration(params.id, ctx.userId, reason);
    return apiOk({ id: params.id, status: 'REJECTED' });
  } catch (e: any) {
    if (e instanceof Response) return e;
    if (e instanceof RegistrationError) {
      return apiErr(e.message, e.status);
    }
    console.error('[super/registrations/[id]/reject] POST gagal:', e);
    return apiErr('Penolakan gagal diproses. Silakan coba lagi.', 500);
  }
}
