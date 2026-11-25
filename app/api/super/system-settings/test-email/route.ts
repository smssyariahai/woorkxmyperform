import { requireSuperAdmin } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { isSmtpConfigured, sendTestEmail } from '@/lib/mailer';
import { masterPrisma } from '@/lib/tenant/master';

export const dynamic = 'force-dynamic';

/** POST /api/super/system-settings/test-email — kirim email uji SMTP ke akun admin sendiri. */
export async function POST(req: Request) {
  try {
    const ctx = await requireSuperAdmin(req);
    if (!(await isSmtpConfigured())) {
      return apiErr(
        'SMTP belum dikonfigurasi. Isi Host, User, dan Password SMTP di atas lalu simpan.',
        400
      );
    }
    const admin = await masterPrisma.platformUser.findUnique({
      where: { id: ctx.userId },
      select: { email: true },
    });
    if (!admin?.email) {
      return apiErr('Alamat email akun admin tidak ditemukan.', 400);
    }
    const res = await sendTestEmail(admin.email);
    if (!res.ok) {
      return apiErr(res.error ?? 'Gagal mengirim email uji.', 500);
    }
    return apiOk({ ok: true, to: admin.email });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal mengirim email uji.', 500);
  }
}
