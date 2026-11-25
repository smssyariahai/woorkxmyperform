import { requirePlatformPermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { approveRegistration } from '@/lib/tenant/registration-review';
import { RegistrationError } from '@/lib/tenant/tenant-registration';

export const dynamic = 'force-dynamic';

/**
 * POST /api/super/registrations/[id]/approve — setujui pendaftaran
 * (guard MANAGE). Membuat tenant + admin pertama via registerCompany,
 * menimpa Subscription dengan paket pendaftaran.
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
    const result = await approveRegistration(params.id, ctx.userId);
    return apiOk({
      ...result,
      invitationNote: `Akun Client Admin ${result.adminEmail} dibuat tanpa password. Email undangan belum bisa dikirim otomatis — minta admin mengatur password lewat /forgot-password.`,
    });
  } catch (e: any) {
    if (e instanceof Response) return e;
    if (e instanceof RegistrationError) {
      return apiErr(e.message, e.status);
    }
    console.error('[super/registrations/[id]/approve] POST gagal:', e);
    return apiErr('Persetujuan gagal diproses. Silakan coba lagi.', 500);
  }
}
