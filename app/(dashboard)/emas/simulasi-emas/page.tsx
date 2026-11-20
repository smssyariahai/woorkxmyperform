'use client';

import Link from 'next/link';
import { Scale, Coins, Table, Percent, Settings, Banknote } from 'lucide-react';

// Hub Modul Simulasi Emas — porting dari backup src/pages/SimulasiEmas.tsx.
// Perbedaan dari backup:
// - Tanpa gating per-submodul (canUserAccessModule): akses modul Emas adalah
//   gerbangnya; semua kartu tampil untuk siapa pun yang bisa membuka modul ini.
// - Route ditulis ulang ke /emas/*.
// - Kartu 'Tarif dan Harga' backup mengarah ke /settings — di WOORK tidak ada
//   halaman tarif tersendiri; kartu dipertahankan dan mengarah ke
//   /emas/tabel-harga-emas (tarif dikelola dari Tabel Harga Emas).
interface Card {
  id: string;
  route: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ size?: number | string }>;
}

interface Group {
  title: string;
  cards: Card[];
}

const GROUPS: Group[] = [
  {
    title: 'Kalkulator',
    cards: [
      {
        id: 'kalkulator-gadai-emas',
        route: '/emas/kalkulator-gadai-emas',
        label: 'Kalk Gadai Emas',
        description: 'Simulasi dan perhitungan pembiayaan gadai emas',
        icon: Scale,
      },
      {
        id: 'pke',
        route: '/emas/pke',
        label: 'PKE',
        description: 'Simulasi cicilan dan kepemilikan emas',
        icon: Coins,
      },
      {
        id: 'kalkulator-pelunasan-emas',
        route: '/emas/kalkulator-pelunasan-emas',
        label: 'Kalkulator Pelunasan Emas',
        description: 'Perhitungan diskon ujrah dan pelunasan awal',
        icon: Banknote,
      },
    ],
  },
  {
    title: 'Pengaturan',
    cards: [
      {
        id: 'settings',
        route: '/emas/tabel-harga-emas',
        label: 'Tarif dan Harga',
        description: 'Tarif biaya administrasi dan persentase jasa titip — dikelola dari Tabel Harga Emas',
        icon: Percent,
      },
      {
        id: 'tabel-harga-emas',
        route: '/emas/tabel-harga-emas',
        label: 'Tabel Harga Emas dan Taksir',
        description: 'Daftar harga taksir harian & harga pasar 18 sumber',
        icon: Table,
      },
      {
        id: 'simulasi-pengaturan-url',
        route: '/emas/simulasi-emas/pengaturan-url',
        label: 'Pengaturan URL Json',
        description: 'Daftar URL server tujuan kirim JSON Gadai Emas & PKE (dipakai bersama)',
        icon: Settings,
      },
    ],
  },
];

export default function SimulasiEmasPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-ink">Simulasi Emas</h1>
        <p className="text-xs text-muted">
          Simulasi gadai emas dan kepemilikan emas, tarif, tabel harga &amp; taksir, serta pengaturan URL kirim JSON.
        </p>
      </div>
      <div className="space-y-5">
        {GROUPS.map((g) => (
          <section key={g.title}>
            <h2 className="mb-2 text-sm font-bold text-ink">{g.title}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2.5 sm:gap-3">
              {g.cards.map((c) => {
                const Icon = c.icon;
                return (
                  <Link
                    key={c.id}
                    href={c.route}
                    className="group block bg-white rounded-xl border border-line p-3 sm:p-4 hover:border-amber-300 hover:shadow-sm transition-all"
                  >
                    <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center group-hover:bg-amber-600 group-hover:text-white transition-colors">
                      <Icon size={20} />
                    </div>
                    <h3 className="mt-2 sm:mt-3 text-xs sm:text-sm font-bold text-ink leading-tight">{c.label}</h3>
                    <p className="mt-0.5 text-[11px] sm:text-xs text-muted leading-tight">{c.description}</p>
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
