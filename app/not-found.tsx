import Link from 'next/link';
import { Logo } from '@/components/ui/primitives';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center p-6">
      <div className="text-center">
        <Logo />
        <h1 className="mt-6 text-[64px] font-extrabold text-ink leading-none">404</h1>
        <p className="mt-3 text-[16px] font-semibold text-ink">Halaman tidak ditemukan</p>
        <p className="mt-1 text-sm text-muted">Alamat yang Anda tuju tidak tersedia.</p>
        <Link href="/dashboard" className="btn-primary mt-6 inline-flex">
          Kembali ke Dashboard
        </Link>
      </div>
    </div>
  );
}
