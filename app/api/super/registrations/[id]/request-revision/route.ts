import { requirePlatformPermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { requestRegistrationRevision } from '@/lib/tenant/registration-review';
import { RegistrationError } from '@/lib/tenant/tenant-registration';

export const dynamic = 'force-dynamic';

/**
 * POST /api/super/registrations/[id]/request-revision — minta perbaikan
 * (guard MANAGE). Body { reason } (wajib ≥10 karakter).
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
    await requestRegistrationRevision(params.id, ctx.userId, reason);
    return apiOk({ id: params.id, status: 'NEEDS_REVISION' });
  } catch (e: any) {
    if (e instanceof Response) return e;
    if (e instanceof RegistrationError) {
      return apiErr(e.message, e.status);
    }
    console.error(
      '[super/registrations/[id]/request-revision] POST gagal:',
      e,
    );
    return apiErr('Permintaan perbaikan gagal diproses. Silakan coba lagi.', 500);
  }
}
