import { apiOk } from '@/lib/utils';
import { isGoogleLoginEnabled, getTurnstileKeys } from '@/lib/system-settings';

export const dynamic = 'force-dynamic';

/**
 * GET /api/public/auth-config — konfigurasi auth yang aman diekspos ke publik.
 * Hanya flag & site key (bukan secret). Dipakai halaman login/register
 * untuk menampilkan tombol Google dan widget Turnstile secara dinamis.
 */
export async function GET() {
  const [googleEnabled, { siteKey }] = await Promise.all([
    isGoogleLoginEnabled(),
    getTurnstileKeys(),
  ]);
  return apiOk({ googleEnabled, turnstileSiteKey: siteKey || null });
}
