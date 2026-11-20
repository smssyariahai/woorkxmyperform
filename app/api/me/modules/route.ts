import { getAuthContext } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { activeModulesOf, getSubscription, getUserModuleLevels } from '@/lib/subscription';

export const dynamic = 'force-dynamic';

/**
 * GET /api/me/modules — level akses modul + modul aktif kantor untuk user
 * yang sedang login. Ringan (3 query kecil), dipakai AppShell untuk
 * mengecek berkala apakah hak akses modul user berubah (mis. admin mengubah
 * Hak Akses Modul ke "Tidak ada") — supaya sidebar langsung terupdate tanpa
 * refresh browser, walau koneksi SSE /api/realtime sedang putus.
 */
export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx) return apiErr('Belum login.', 401);
  try {
    const [moduleLevels, subscription] = await Promise.all([
      getUserModuleLevels(ctx.userId, ctx.organizationId),
      getSubscription(ctx.organizationId),
    ]);
    return apiOk({ activeModules: activeModulesOf(subscription), moduleLevels });
  } catch {
    return apiErr('Gagal memuat modul.', 500);
  }
}
