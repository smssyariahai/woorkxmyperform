import Link from 'next/link';
import { Menu } from 'lucide-react';
import { Logo } from '@/components/ui/primitives';

/**
 * Header situs publik — dipakai di landing page DAN halaman karir,
 * agar tampilannya persis sama. `anchorBase` membedakan link jangkar:
 * landing pakai '#produk', halaman lain pakai '/#produk'.
 */
export default function SiteHeader({ anchorBase = '' }: { anchorBase?: string }) {
  const NAV = [
    { label: 'Produk', href: `${anchorBase}#produk` },
    { label: 'Fitur', href: `${anchorBase}#fitur` },
    { label: 'Solusi', href: `${anchorBase}#solusi` },
    { label: 'Harga', href: `${anchorBase}#harga` },
    { label: 'Karir', href: '/karir' },
    { label: 'Tentang Kami', href: `${anchorBase}#tentang` },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-white/85 backdrop-blur-md dark:bg-slate-950/85">
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6" aria-label="Navigasi utama">
        <Link href="/" aria-label="WOORK — beranda">
          <Logo />
        </Link>
        <div className="hidden items-center gap-7 text-sm font-medium text-muted md:flex">
          {NAV.map((item) => (
            <a key={item.href} href={item.href} className="transition-colors hover:text-ink">
              {item.label}
            </a>
          ))}
        </div>
        <div className="hidden items-center gap-2 md:flex">
          <Link href="/login" className="btn-ghost px-4 py-2 text-sm">
            Masuk
          </Link>
          <Link href="/register" className="btn-primary px-4 py-2 text-sm">
            Mulai Sekarang
          </Link>
        </div>
        <details className="relative md:hidden">
          <summary
            className="flex cursor-pointer list-none items-center rounded-btn p-2 text-ink hover:bg-slate-100 [&::-webkit-details-marker]:hidden"
            aria-label="Buka menu navigasi"
          >
            <Menu className="h-5 w-5" />
          </summary>
          <div className="card absolute right-0 top-12 w-56 space-y-1 p-3 shadow-pop">
            {NAV.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="block rounded-btn px-3 py-2 text-sm font-medium text-ink hover:bg-slate-100"
              >
                {item.label}
              </a>
            ))}
            <div className="flex gap-2 border-t border-line pt-3">
              <Link href="/login" className="btn-ghost flex-1 px-3 py-2 text-sm">
                Masuk
              </Link>
              <Link href="/register" className="btn-primary flex-1 px-3 py-2 text-sm">
                Mulai
              </Link>
            </div>
          </div>
        </details>
      </nav>
    </header>
  );
}
