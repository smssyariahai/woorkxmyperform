'use client';

import Link from 'next/link';
import { Card } from '@/components/ui/primitives';
import {
  Scale,
  Coins,
  Table,
  Percent,
  Settings,
  Banknote,
  Smartphone,
  ArrowRight,
} from 'lucide-react';

// Hub Modul Emas — porting dari backup src/pages/SimulasiEmas.tsx
// (grup Kalkulator + Pengaturan), diperluas ke semua 7 halaman emas.
// Tanpa gating per-submodul: akses modul Emas adalah gerbangnya
// (layout (dashboard) sudah menangani auth + modul).
// Catatan: halaman PKE, Simulasi Emas, Tabel Harga Emas, Gadai Elektronik
// dan Pengaturan URL JSON belum di-porting (gelombang lain); kartunya
// tetap ditautkan ke route /emas/* yang sudah didaftarkan di Sidebar.

interface MenuCard {
  href: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
}

interface Group {
  title: string;
  cards: MenuCard[];
}

const GROUPS: Group[] = [
  {
    title: 'Kalkulator',
    cards: [
      {
        href: '/emas/kalkulator-gadai-emas',
        label: 'Kalkulator Gadai Emas',
        description: 'Simulasi dan perhitungan pembiayaan gadai emas',
        icon: Scale,
      },
      {
        href: '/emas/pke',
        label: 'PKE',
        description: 'Simulasi cicilan dan kepemilikan emas',
        icon: Coins,
      },
      {
        href: '/emas/kalkulator-pelunasan-emas',
        label: 'Kalkulator Pelunasan Emas',
        description: 'Perhitungan diskon ujrah dan pelunasan awal',
        icon: Banknote,
      },
      {
        href: '/emas/simulasi-emas',
        label: 'Simulasi Emas',
        description: 'Simulasi gadai & kepemilikan emas, tarif, dan tabel harga',
        icon: Percent,
      },
      {
        href: '/emas/calculator',
        label: 'Gadai Elektronik',
        description: 'Simulasi gadai perangkat elektronik',
        icon: Smartphone,
      },
    ],
  },
  {
    title: 'Pengaturan',
    cards: [
      {
        href: '/emas/tabel-harga-emas',
        label: 'Tabel Harga Emas',
        description: 'Daftar harga taksir harian & harga pasar 18 sumber',
        icon: Table,
      },
      {
        href: '/emas/simulasi-emas/pengaturan-url',
        label: 'Pengaturan URL JSON',
        description: 'Daftar URL server tujuan kirim JSON Gadai Emas & PKE',
        icon: Settings,
      },
    ],
  },
];

export default function EmasHubPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-bold text-ink">Emas</h1>
        <p className="text-sm text-muted">
          Simulasi gadai emas dan kepemilikan emas, tarif, tabel harga &amp; taksir, serta pengaturan URL kirim JSON.
        </p>
      </div>
      <div className="space-y-6">
        {GROUPS.map((g) => (
          <section key={g.title}>
            <h2 className="mb-3 text-sm font-bold text-ink">{g.title}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {g.cards.map((c) => {
                const Icon = c.icon;
                return (
                  <Link key={c.href} href={c.href} className="block">
                    <Card className="!p-5 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 h-full">
                      <div className="flex items-start justify-between gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                          <Icon size={20} />
                        </span>
                        <ArrowRight className="h-4 w-4 text-muted mt-3" />
                      </div>
                      <p className="mt-4 text-[15px] font-bold text-ink">{c.label}</p>
                      <p className="mt-1 text-[13px] text-muted leading-relaxed">{c.description}</p>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
