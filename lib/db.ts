import { PrismaClient } from '@prisma/client';
import { headers } from 'next/headers';
import { getCachedTenantClient, getCurrentTenantCode } from './tenant/resolver';
import { validateTenantCode } from './tenant/tenant-code';

/**
 * PENTING — import di file ini HARUS statis, JANGAN eval-require.
 * `eval('require')('./tenant/resolver')` memang membuat `next build`
 * lolos, tapi di bundle produksi webpack `require` hanya mengenal ID
 * modul numerik — path relatif './tenant/resolver' tidak ditemukan saat
 * runtime, sehingga SEMUA query lewat proxy `prisma` throw
 * MODULE_NOT_FOUND (terbukti live 2026-11-23: /api/customers gagal,
 * /api/public/vacancies 500). Static import aman di sini karena TIDAK
 * ADA komponen client yang (transitif, sebagai value) meng-import
 * lib/db.ts: rantai client terakhir (TalBadgeGallery → gamification)
 * sudah diputus dengan memindah tipe/konstanta murni ke
 * lib/tal/gamification-shared.ts; import `import type` terhapus saat
 * compile; server actions ditangani framework. Bila suatu hari ada
 * komponen client baru yang meng-import lib/db.ts, `next build` akan
 * gagal dengan jelas (UnhandledSchemeError node:*) — perbaiki rantai
 * import-nya, JANGAN kembalikan eval-require.
 */

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Klien legacy (woork_saas) mentah. Dipakai sebagai target/fallback proxy
 * `prisma` di bawah, dan diekspor apa adanya untuk jalur yang memang
 * legacy-only (verifikasi sesi legacy, permission platform, bot WA) agar
 * kebal terhadap tenant context yang sedang aktif.
 */
export const legacyPrisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = legacyPrisma;

/**
 * Kode tenant dari header request (`x-tenant-code`, ditulis middleware
 * dari JWT terverifikasi). `headers()` throw di luar request scope
 * (script tsx, cron, prerender statis, background job) → undefined.
 * Nilai header yang bukan format kode tenant yang valid diabaikan
 * (defense-in-depth bila ada rute di luar matcher middleware yang
 * menerima header kiriman client).
 */
function resolveHeaderCode(): string | undefined {
  try {
    const code = headers().get('x-tenant-code');
    if (code && validateTenantCode(code)) return code;
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Kode tenant untuk query ini (perbaikan blokir ALS — Opsi 2):
 * 1. ALS (`runWithTenant` / `enterTenantContext`) — konteks eksplisit,
 *    mis. script/CLI dan cek permission di `requirePermission`.
 * 2. Header `x-tenant-code` dari request — ditulis middleware dari JWT
 *    terverifikasi (dan dihapus bila tidak ada sesi tenant ACTIVE, jadi
 *    nilai kiriman client tidak pernah dipercaya). `headers()` bekerja
 *    di frame handler/page karena request store Next sendiri berbasis
 *    ALS yang membungkus seluruh eksekusi handler — inilah yang tidak
 *    bisa dilakukan `enterWith` dari dalam `requireAuth`.
 * 3. undefined → legacy (woork_saas).
 */
function resolveTenantCode(): string | undefined {
  return getCurrentTenantCode() ?? resolveHeaderCode();
}

/**
 * Client aktif untuk pemanggil saat ini.
 *
 * - Kode dari ALS: konteks eksplisit yang HANYA dimasuki setelah client
 *   ter-resolve (`requireAuth` / layout / `requirePermission`). Bila
 *   client belum ter-resolve → FAIL CLOSED (throw), jangan fallback
 *   diam-diam ke legacy.
 * - Kode dari header TAPI client belum ter-resolve: request ini belum
 *   melewati `requireAuth` (rute publik tanpa sesi, atau internals
 *   pra-auth seperti `auth()`) — konteksnya LEGACY by design, jadi
 *   fallback ke singleton legacy. Ini aman: rute publik memang membaca
 *   legacy, dan rute terproteksi selalu memanggil `requireAuth` dulu
 *   (yang me-resolve + meng-cache client) sebelum query apa pun.
 *   Tanpa fallback ini, setiap rute publik (E-Sign signing link, tamu
 *   MEET, halaman kantor /o, lowongan, webhook) akan 500 bila dibuka
 *   pengguna yang sedang login sebagai tenant.
 * - Tanpa kode → singleton legacy (perilaku lama).
 */
function activeClient(): PrismaClient {
  const alsCode = getCurrentTenantCode();
  if (alsCode) {
    const tenant = getCachedTenantClient(alsCode);
    if (!tenant) {
      throw new Error(
        `tenant client belum di-resolve untuk ${alsCode} — panggil getTenantClientForCode dulu`
      );
    }
    return tenant as unknown as PrismaClient;
  }
  const headerCode = resolveHeaderCode();
  if (!headerCode) return legacyPrisma;
  const cached = getCachedTenantClient(headerCode);
  if (cached) return cached as unknown as PrismaClient;
  return legacyPrisma;
}

/**
 * Proxy `prisma` (Lapisan F). Seluruh 298 importir tetap memakai nama
 * yang sama; routing terjadi per akses properti:
 * - delegate model (mis. `prisma.user`) dikembalikan apa adanya — method
 *   di dalamnya ter-bind ke delegate itu sendiri;
 * - fungsi `$...` (`$transaction`, `$queryRaw`, `$executeRaw`, `$connect`,
 *   `$disconnect`) di-bind ke client aktif.
 * Cast ke PrismaClient utama agar tipe 298 importir tidak berubah.
 */
export const prisma: PrismaClient = new Proxy(legacyPrisma, {
  get(_target, prop) {
    const client = activeClient();
    const value = (client as unknown as Record<string | symbol, unknown>)[prop];
    return typeof value === 'function' ? (value as (...args: never[]) => unknown).bind(client) : value;
  },
});
