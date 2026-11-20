// app/(dashboard)/koperasi/page.tsx — hub modul Koperasi.
// Port dari backup MyPerform (src/pages/KoperasiKeanggotaan.tsx, 128 baris):
// kartu navigasi ke anggota / anggota-baru / simpanan-baru /
// pembiayaan-baru / pengaturan. Statistik jumlah anggota dari
// GET /api/koperasi/anggota (total).
'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Banknote, Landmark, Loader2, Settings, UserPlus, Users } from 'lucide-react';
import { fetchKoperasiAnggota } from '@/lib/koperasi/client';

const CARDS = [
  {
    id: 'koperasi-anggota',
    route: '/koperasi/anggota',
    label: 'List Anggota',
    description: 'Cari, filter, urutkan, dan kelola data anggota koperasi.',
    icon: Users,
  },
  {
    id: 'koperasi-anggota-baru',
    route: '/koperasi/anggota-baru',
    label: 'Form Tambah Anggota Baru',
    description: 'Pendaftaran anggota baru: identitas, KYC, dokumen, dan tanda tangan.',
    icon: UserPlus,
  },
  {
    id: 'koperasi-simpanan',
    route: '/koperasi/simpanan-baru',
    label: 'Form Buka Rek. Simpanan',
    description: 'Pembukaan rekening simpanan untuk anggota terdaftar.',
    icon: Landmark,
    soon: true,
  },
  {
    id: 'koperasi-pembiayaan',
    route: '/koperasi/pembiayaan-baru',
    label: 'Form Pengajuan Pembiayaan',
    description: 'Pengajuan pembiayaan/pinjaman untuk anggota terdaftar.',
    icon: Banknote,
    soon: true,
  },
  {
    id: 'koperasi-pengaturan',
    route: '/koperasi/pengaturan',
    label: 'Pengaturan Kirim JSON',
    description: 'Atur cabang dan URL server tujuan pengiriman JSON.',
    icon: Settings,
  },
];

export default function KoperasiHubPage() {
  const [total, setTotal] = useState<number | null>(null);
  const [statsError, setStatsError] = useState('');

  useEffect(() => {
    fetchKoperasiAnggota({ page: 1, pageSize: 1 })
      .then((r) => setTotal(r.total))
      .catch((e: any) => setStatsError(e?.message || 'Gagal memuat statistik.'));
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-slate-800">Form Keanggotaan Koperasi</h1>
        <p className="text-xs text-slate-500">
          Kelola keanggotaan koperasi: pendaftaran anggota baru, daftar anggota, rekening simpanan, dan pembiayaan.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
          <Users size={20} />
        </div>
        <div>
          <p className="text-xs text-slate-500">Total Anggota Terdaftar</p>
          {total === null ? (
            <p className="text-sm font-bold text-slate-800">
              {statsError ? (
                <span className="text-red-600 font-medium text-xs">{statsError}</span>
              ) : (
                <Loader2 size={16} className="animate-spin inline" />
              )}
            </p>
          ) : (
            <p className="text-lg font-bold text-slate-800">{total.toLocaleString('id-ID')} anggota</p>
          )}
        </div>
        <Link
          href="/koperasi/anggota"
          className="ml-auto px-3 py-2 rounded-xl bg-emerald-600 text-xs font-semibold text-white hover:bg-emerald-700"
        >
          Lihat Daftar
        </Link>
      </div>

      <div className="space-y-3 sm:hidden">
        {CARDS.map((c) => {
          const Icon = c.icon;
          return (
            <Link
              key={c.id}
              href={c.route}
              className="group block bg-white rounded-xl border border-slate-200 p-4 hover:border-emerald-300 hover:shadow-sm transition-all"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                  <Icon size={20} />
                </div>
                {c.soon && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[11px] font-semibold">
                    Soon
                  </span>
                )}
              </div>
              <h2 className="mt-3 text-sm font-bold text-slate-800">{c.label}</h2>
              <p className="mt-0.5 text-xs text-slate-500">{c.description}</p>
            </Link>
          );
        })}
      </div>
      <div className="hidden sm:grid sm:grid-cols-2 gap-3">
        {CARDS.map((c) => {
          const Icon = c.icon;
          return (
            <Link
              key={c.id}
              href={c.route}
              className="group block bg-white rounded-xl border border-slate-200 p-4 hover:border-emerald-300 hover:shadow-sm transition-all"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                  <Icon size={20} />
                </div>
                {c.soon && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[11px] font-semibold">
                    Soon
                  </span>
                )}
              </div>
              <h2 className="mt-3 text-sm font-bold text-slate-800">{c.label}</h2>
              <p className="mt-0.5 text-xs text-slate-500">{c.description}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
