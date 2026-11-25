import NextAuth from 'next-auth';
import { getToken } from 'next-auth/jwt';
import { NextResponse } from 'next/server';
import { authConfig } from '@/lib/auth.config';

const { auth } = NextAuth(authConfig);

// Header yang membawa kode tenant dari middleware ke aplikasi. HANYA
// middleware yang boleh menulisnya: nilainya diambil dari JWT
// terverifikasi (bukan dari header kiriman client), dan dihapus bila
// tidak ada sesi tenant yang ACTIVE.
const TENANT_HEADER = 'x-tenant-code';

// Subdomain yang dicadangkan: tidak di-rewrite ke situs kantor.
const RESERVED_SUB = new Set([
  'www', 'api', 'admin', 'app', 'mail', 'ftp', 'blog', 'shop',
  'woork', 'router', 'karir', 'woork-saas',
]);

const PUBLIC_PATHS = [
  '/',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/pricing',
  '/features',
  '/jobs',
  '/o',
  '/esign/sign', // tautan tanda tangan: dicek kedaluwarsanya sebelum login
  '/meet/guest', // tautan undangan tamu WOORK MEET: dicek tokennya sebelum login
  '/meet/live', // room publik tamu WOORK MEET (?token=): tanpa login, dicek tokennya di halaman
];

// Halaman login admin (/admin) bersifat publik TAPI persis di path itu saja:
// '/admin/*' (area Administrator Pusat) tetap butuh login.
const PUBLIC_EXACT = new Set(['/admin']);

const innerAuth = auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;


  const isPublic =
    PUBLIC_EXACT.has(pathname) ||
    PUBLIC_PATHS.some(
      (p) => pathname === p || (p !== '/' && pathname.startsWith(p + '/'))
    );

  if (!isLoggedIn && !isPublic && !pathname.startsWith('/api/')) {
    const url = req.nextUrl.clone();
    // Area Administrator Pusat yang belum login -> pintu login admin (/admin),
    // area kantor -> pintu login kantor (/login).
    url.pathname = pathname.startsWith('/admin/') ? '/admin' : '/login';
    url.searchParams.set('callbackUrl', pathname);
    return Response.redirect(url);
  }

  // Pengalihan "sudah login" untuk /login & /admin TIDAK di sini: middleware
  // (edge) tidak bisa melihat peran (isSuperAdmin) dari token. Masing-masing
  // halaman login mengarahkan sendiri secara server-side (lihat
  // app/(auth)/login/page.tsx dan app/(auth)/admin/page.tsx).
  if (isLoggedIn && pathname === '/register') {
    const url = req.nextUrl.clone();
    url.pathname = '/dashboard';
    return Response.redirect(url);
  }
});

// Path API yang datanya publik (legacy) — jangan bawa header tenant.
const TENANT_HEADER_SKIP_API = [
  '/api/public/', // data publik lintas perusahaan (lowongan, dsb.)
  '/api/esign/sign/', // tautan tanda tangan publik (token)
  '/api/auth/', // endpoint auth — tidak query data tenant
  '/api/webhooks/', // webhook pihak ketiga — tanpa sesi tenant
];

/**
 * Path yang TIDAK boleh membawa header tenant: halaman/API publik
 * dibaca dari woork_saas (legacy). Bila header ikut terpasang saat
 * pengguna sedang login sebagai tenant, proxy mengarahkan query ke
 * tenant DB — dan query yang memakai relasi yang tidak ada di skema
 * tenant (mis. HrVacancy.organization, _count.candidates) 500.
 * Terbukti live 2026-11-23: /api/public/vacancies 500 dengan cookie
 * tenant, 200 tanpa cookie / dengan cookie legacy.
 */
function skipTenantHeader(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  if (
    PUBLIC_PATHS.some(
      (p) => pathname === p || (p !== '/' && pathname.startsWith(p + '/'))
    )
  ) {
    return true;
  }
  return TENANT_HEADER_SKIP_API.some((p) => pathname.startsWith(p));
}

/**
 * Header request untuk request ini: `x-tenant-code` di-set dari JWT
 * terverifikasi HANYA bila sesi membawa tenantCode DAN tenantStatus
 * ACTIVE — ATAU SUSPENDED bila pemegang sesi adalah OWNER tenant itu
 * (Fase 4: OWNER tetap boleh login saat ditangguhkan untuk melihat status
 * dan menghubungi Master). Bila tidak ada sesi tenant / tenant belum
 * ACTIVE / bukan OWNER yang ditangguhkan → header DIHAPUS (anti-spoofing:
 * apa pun yang dikirim client ditimpa).
 * Gagal decode (tanpa cookie / secret tidak ada) → fail-safe: header
 * dihapus, request jatuh ke legacy. Tanpa DB read di middleware —
 * JWT decode saja; status segar tetap diverifikasi `requireAuth`.
 */
async function tenantHeaders(req: any): Promise<Headers> {
  const modified = new Headers(req.headers);
  try {
    // getToken default secureCookie=false → mencari cookie
    // `authjs.session-token`, padahal aplikasi ini memakai cookie
    // `__Secure-authjs.session-token` (NEXTAUTH_URL https). Coba
    // keduanya agar tahan di semua environment.
    const token =
      (await getToken({ req, secret: process.env.AUTH_SECRET, secureCookie: true })) ??
      (await getToken({ req, secret: process.env.AUTH_SECRET, secureCookie: false }));
    const code = (token as any)?.tenantCode as string | undefined;
    const status = (token as any)?.tenantStatus as string | undefined;
    const role = (token as any)?.role as string | undefined;
    if (
      code &&
      (status === 'ACTIVE' || (status === 'SUSPENDED' && role === 'OWNER'))
    ) {
      modified.set(TENANT_HEADER, code);
    } else {
      modified.delete(TENANT_HEADER);
    }
  } catch {
    modified.delete(TENANT_HEADER);
  }
  return modified;
}

export default async function middleware(req: any) {
  // Subdomain kantor -> rewrite ke /o/<subdomain> SEBELUM logika auth.
  // Hanya string matching (edge-safe); validasi DB ada di halaman /o/[subdomain].
  // Jalur rewrite TIDAK disuntik header tenant: halaman /o bersifat
  // publik (tanpa sesi tenant) dan query-nya memakai jalur legacy.
  try {
    const host = String(req.headers.get('host') || '').split(':')[0].toLowerCase();
    const m = host.match(/^([a-z0-9][a-z0-9-]{0,61})\.xsramazys\.dev$/);
    if (m && !RESERVED_SUB.has(m[1])) {
      const p = req.nextUrl.pathname;
      // Jangan rewrite API routes & file statis Next — serve langsung.
      if (!p.startsWith('/api/') && !p.startsWith('/_next/')) {
        const prefix = `/o/${m[1]}`;
        // Hindari prefix ganda bila path sudah /o/<subdomain>/...
        const target = p === '/' ? prefix : (p === prefix || p.startsWith(prefix + '/') ? p : prefix + p);
        const dest = new URL(target, req.url);
        return NextResponse.rewrite(dest);
      }
    }
  } catch {
    // abaikan, lanjut ke auth
  }
  // Suntik header tenant dari JWT terverifikasi, lalu jalankan logika
  // auth. Bila auth mengembalikan redirect, pakai apa adanya (header
  // tidak relevan untuk redirect). Bila lanjut, teruskan request dengan
  // header yang sudah dimodifikasi — mutasi `req.headers` saja TIDAK
  // menembus ke handler, harus lewat `NextResponse.next({ request })`.
  // Path publik tidak membawa header tenant sama sekali (data publik =
  // legacy; lihat skipTenantHeader).
  const modified = skipTenantHeader(req.nextUrl.pathname)
    ? (() => {
        const h = new Headers(req.headers);
        h.delete(TENANT_HEADER);
        return h;
      })()
    : await tenantHeaders(req);
  const res = await (innerAuth as any)(req);
  if (res && res.headers?.get('location')) return res;
  const next = NextResponse.next({ request: { headers: modified } });
  // Pertahankan cookie apa pun yang dipasang wrapper auth (defensif;
  // dengan authConfig edge-safe tanpa callback, normalnya tidak ada).
  try {
    const setCookies: string[] =
      typeof res?.headers?.getSetCookie === 'function'
        ? res.headers.getSetCookie()
        : res?.headers?.get('set-cookie')
          ? [res.headers.get('set-cookie') as string]
          : [];
    for (const c of setCookies) next.headers.append('set-cookie', c);
  } catch {
    // abaikan
  }
  return next;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
