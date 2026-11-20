// app/(dashboard)/koperasi/simpanan-baru/page.tsx — penanda "segera hadir".
// Port dari backup MyPerform (src/pages/KoperasiSoon.tsx): Form Buka
// Rekening Simpanan belum dibangun — halaman ini JELAS bertanda segera
// hadir dan tidak dibuat seolah sudah berfungsi.
'use client';

import Link from 'next/link';
import { Clock } from 'lucide-react';

export default function KoperasiSimpananBaruPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-slate-800">Form Buka Rek. Simpanan</h1>
        <p className="text-xs text-slate-500">Pembukaan rekening simpanan untuk anggota terdaftar.</p>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
        <Clock size={32} className="mx-auto text-amber-500" />
        <h2 className="mt-3 text-base font-bold text-slate-800">Segera Hadir</h2>
        <p className="mt-1 text-sm text-slate-500 max-w-md mx-auto">
          Fitur ini sedang disiapkan dan akan tersedia di pembaruan berikutnya. Sementara itu, pendaftaran anggota sudah bisa
          dilakukan lewat Form Tambah Anggota Baru.
        </p>
        <div className="mt-4 flex items-center justify-center gap-2">
          <Link
            href="/koperasi/anggota"
            className="px-4 py-2 rounded-xl bg-blue-600 text-xs font-semibold text-white hover:bg-blue-700"
          >
            Ke List Anggota
          </Link>
          <Link
            href="/koperasi"
            className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Kembali ke Modul
          </Link>
        </div>
      </div>
    </div>
  );
}
