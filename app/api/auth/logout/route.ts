import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { legacyPrisma as prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Logout PASTI (server-side) — dipakai tombol "Keluar" di Sidebar.
// Masalah yang diperbaiki: logout client-side (next-auth `signOut`) hanya
// menghapus SATU nama cookie lewat fetch; bila fetch gagal/terputus, atau
// browser menyimpan cookie sesi dengan nama lain, sesi lama tetap hidup
// dan user masih dianggap login ("nyangkut").
// Rute ini, dalam SATU respons redirect:
//   1. menghapus SEMUA baris sesi legacy user ini di database;
//   2. menghapus cookie sesi secara eksplisit dengan Max-Age=0 — KEDUA
//      nama yang mungkin ada di browser:
//      - `__Secure-authjs.session-token` (login lewat HTTPS — jalur normal)
//      - `authjs.session-token` (login lewat HTTP / localhost)
//      - `authjs.callback-url` (sisa alur sign-in)
//   3. redirect PENUH (303) ke pintu login yang benar, dengan
//      Cache-Control no-store supaya browser tidak menampilkan halaman
//      lama dari cache saat tombol Back ditekan.
// JWT bersifat stateless: begitu cookie terhapus, sesi hilang — tidak ada
// lagi yang bisa "nyangkut".
const SESSION_COOKIE_NAMES = [
  '__Secure-authjs.session-token',
  'authjs.session-token',
  'authjs.callback-url',
] as const;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const door = url.searchParams.get('door') === 'admin' ? 'admin' : 'office';
  const loginPath = door === 'admin' ? '/admin' : '/login';

  // Hapus semua baris sesi legacy user ini (bukan cuma 60 detik terakhir).
  try {
    const session = await auth();
    const userId = (session?.user as any)?.id as string | undefined;
    if (userId) {
      await prisma.session.deleteMany({ where: { userId } });
    }
  } catch {
    /* abaikan — penghapusan cookie di bawah tetap jalan */
  }

  // Redirect RELATIF (bukan absolut dari req.url): origin internal server
  // adalah http://localhost:3000, jadi URL absolut dari req.url akan
  // mengarahkan browser user ke localhost (rusak). Location relatif
  // di-resolve browser terhadap situs yang sedang dibuka — benar di
  // semua host (staging, localhost dev, domain lain).
  const res = new NextResponse(null, {
    status: 303,
    headers: { Location: loginPath },
  });
  for (const name of SESSION_COOKIE_NAMES) {
    // Cookie `__Secure-` wajib Secure; yang non-secure tanpa Secure —
    // atribut harus cocok dengan saat cookie dipasang supaya browser
    // benar-benar menghapusnya.
    res.cookies.set(name, '', {
      maxAge: 0,
      expires: new Date(0),
      path: '/',
      httpOnly: true,
      secure: name.startsWith('__Secure-'),
      sameSite: 'lax',
    });
  }
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  return res;
}
