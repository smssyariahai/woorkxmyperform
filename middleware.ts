import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';
import { authConfig } from '@/lib/auth.config';

const { auth } = NextAuth(authConfig);

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

export default function middleware(req: any) {
  // Subdomain kantor -> rewrite ke /o/<subdomain> SEBELUM logika auth.
  // Hanya string matching (edge-safe); validasi DB ada di halaman /o/[subdomain].
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
  return (innerAuth as any)(req);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
