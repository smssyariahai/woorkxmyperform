import { requireSuperAdmin } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';
import { getSystemSettings, setSystemSettings, SETTING_KEYS } from '@/lib/system-settings';

export const dynamic = 'force-dynamic';

/** GET /api/super/system-settings — baca pengaturan global (Administrator Pusat). */
export async function GET(req: Request) {
  try {
    await requireSuperAdmin(req);
    const settings = await getSystemSettings();
    const data: Record<string, string> = {};
    for (const k of SETTING_KEYS) data[k] = settings[k] ?? '';
    return apiOk(data);
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat pengaturan.', 500);
  }
}

/** PUT /api/super/system-settings — simpan pengaturan global (Administrator Pusat). */
export async function PUT(req: Request) {
  try {
    const ctx = await requireSuperAdmin(req);
    const body = await req.json();
    const values: Record<string, string> = {};
    for (const k of SETTING_KEYS) {
      if (typeof body[k] === 'string') values[k] = body[k];
    }
    // Validasi ringan: bila salah satu pasangan diisi, pasangannya wajib ada
    const gid = values.google_client_id ?? '';
    const gsec = values.google_client_secret ?? '';
    if (!!gid !== !!gsec) {
      return apiErr('Google Client ID dan Client Secret harus diisi keduanya atau dikosongkan keduanya.');
    }
    if (gid && !/\.apps\.googleusercontent\.com$/.test(gid)) {
      return apiErr('Google Client ID tidak valid — harus berakhiran .apps.googleusercontent.com. Sepertinya Anda menempel Client Secret di kolom yang salah.');
    }
    if (gsec && /\.apps\.googleusercontent\.com$/.test(gsec)) {
      return apiErr('Google Client Secret tidak valid — sepertinya Anda menempel Client ID di kolom Secret.');
    }
    const tSite = values.turnstile_site_key ?? '';
    const tSec = values.turnstile_secret_key ?? '';
    if (!!tSite !== !!tSec) {
      return apiErr('Turnstile Site Key dan Secret Key harus diisi keduanya atau dikosongkan keduanya.');
    }
    await setSystemSettings(values as any);
    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'UPDATE_SYSTEM_SETTINGS',
      module: 'SETTINGS',
      description: 'Administrator Pusat memperbarui pengaturan sistem (Google OAuth / Turnstile)',
      ipAddress: getClientIp(req),
    });
    return apiOk({ ok: true });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menyimpan pengaturan.', 500);
  }
}
