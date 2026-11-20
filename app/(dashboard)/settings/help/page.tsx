import Link from 'next/link';
import { Card, CardTitle } from '@/components/ui/primitives';
import { ArrowRight } from 'lucide-react';

const LINKS = [
  { href: '/settings', label: 'Pengaturan Umum', desc: 'Workspace, profil, keamanan' },
  { href: '/settings/team', label: 'Tim & Role', desc: 'Anggota, undangan, permission' },
  { href: '/channels', label: 'Saluran', desc: 'Koneksi WhatsApp, Instagram, Facebook' },
  { href: '/audit', label: 'Audit Log', desc: 'Riwayat aktivitas sistem' },
];

export default function HelpPage() {
  return (
    <div className="max-w-[900px] mx-auto space-y-5">
      <div>
        <h1 className="text-[22px] font-bold text-ink">Bantuan</h1>
        <p className="text-sm text-muted">Panduan singkat menggunakan WOORK.</p>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href}>
            <Card className="hover:shadow-pop hover:border-brand/40 transition-all h-full">
              <div className="flex items-center justify-between">
                <CardTitle>{l.label}</CardTitle>
                <ArrowRight className="h-4 w-4 text-muted" />
              </div>
              <p className="mt-1.5 text-[13px] text-muted">{l.desc}</p>
            </Card>
          </Link>
        ))}
      </div>
      <Card>
        <CardTitle className="mb-3">Pertanyaan Umum</CardTitle>
        <div className="space-y-3 text-[13.5px]">
          <details className="rounded-xl border border-line p-4">
            <summary className="font-semibold text-ink cursor-pointer">Bagaimana cara menghubungkan WhatsApp?</summary>
            <p className="mt-2 text-muted">Buka menu Saluran, klik Hubungkan pada kartu WhatsApp, lalu ikuti panduan webhook untuk akun Meta Anda.</p>
          </details>
          <details className="rounded-xl border border-line p-4">
            <summary className="font-semibold text-ink cursor-pointer">Apa itu Woo?</summary>
            <p className="mt-2 text-muted">Woo adalah asisten otomatis yang menyapa pelanggan baru, menjawab pertanyaan umum, dan mengkualifikasi lead sebelum diserahkan ke tim.</p>
          </details>
          <details className="rounded-xl border border-line p-4">
            <summary className="font-semibold text-ink cursor-pointer">Bagaimana menambah anggota tim?</summary>
            <p className="mt-2 text-muted">Buka Pengaturan → Tim, klik Undang Anggota, masukkan email dan pilih role (Admin, Supervisor, Agent, Viewer).</p>
          </details>
        </div>
      </Card>
    </div>
  );
}
