import Link from 'next/link';
import { Check, Crown, ArrowLeft } from 'lucide-react';
import { Card } from '@/components/ui/primitives';
import { Logo } from '@/components/ui/primitives';

export const metadata = { title: 'Upgrade Paket — WOORK' };

const PLANS = [
  {
    name: 'Starter',
    price: 'Rp 99rb/bln',
    features: ['1.000 kontak', '3 anggota tim', 'Broadcast tanpa batas harian', 'Bot automation aktif'],
  },
  {
    name: 'Professional',
    price: 'Rp 249rb/bln',
    highlight: true,
    features: ['10.000 kontak', '10 anggota tim', 'Broadcast tanpa batas', 'Bot automation + laporan'],
  },
  {
    name: 'Enterprise',
    price: 'Hubungi kami',
    features: ['Kontak tanpa batas', 'Tim tanpa batas', 'Dukungan prioritas', 'Kustomisasi khusus'],
  },
];

export default function UpgradePage() {
  return (
    <div className="min-h-screen bg-canvas">
      <div className="max-w-[1000px] mx-auto px-4 py-10">
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-muted hover:text-brand mb-8">
          <ArrowLeft className="h-4 w-4" /> Kembali ke dashboard
        </Link>
        <div className="text-center mb-10">
          <Logo />
          <h1 className="mt-6 text-[28px] font-bold text-ink flex items-center justify-center gap-2">
            <Crown className="h-7 w-7 text-amber-500" /> Upgrade Paket WOORK
          </h1>
          <p className="mt-2 text-muted max-w-[560px] mx-auto">
            Paket Trial dibatasi 14 hari dengan fitur terbatas. Upgrade untuk membuka
            semua fitur dan melanjutkan tanpa batas.
          </p>
        </div>
        <div className="grid sm:grid-cols-3 gap-5">
          {PLANS.map((p) => (
            <Card key={p.name} className={`!p-6 flex flex-col ${p.highlight ? 'ring-2 ring-brand' : ''}`}>
              {p.highlight && (
                <span className="self-start text-[11px] font-bold uppercase tracking-wide bg-brand text-white rounded-full px-3 py-1 mb-3">
                  Populer
                </span>
              )}
              <h2 className="text-[18px] font-bold text-ink">{p.name}</h2>
              <p className="mt-1 text-[22px] font-bold text-brand">{p.price}</p>
              <ul className="mt-4 space-y-2.5 flex-1">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-[13.5px] text-ink">
                    <Check className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" /> {f}
                  </li>
                ))}
              </ul>
              <a
                href="https://wa.me/6287777808021?text=Halo%20WOORK,%20saya%20ingin%20upgrade%20paket."
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary mt-6 w-full !py-2.5 text-center"
              >
                Pilih {p.name}
              </a>
            </Card>
          ))}
        </div>
        <p className="mt-8 text-center text-[13px] text-muted">
          Pembayaran via transfer bank / QRIS — tim kami akan mengaktifkan paket Anda setelah konfirmasi.
        </p>
      </div>
    </div>
  );
}
