// Laporan TAL satu anggota tim — porting src/pages/TalTimSayaLaporan.tsx.
// Read-only bila bukan milik sendiri (server mengembalikan 403 bila target
// tidak terlihat).
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Eye } from 'lucide-react';
import { TalTimReport } from '@/components/tal/TalTimReport';
import type { TalTimReportData } from '@/lib/tal/team';

interface MemberReport extends TalTimReportData {
  member: { id: string; email: string; nama: string; divisi: string; posisi: string; role: string };
  isSelf: boolean;
  readOnly: boolean;
}

export default function TalTimSayaLaporanPage() {
  const params = useParams();
  const userId = String(params.userId || '');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState<MemberReport | null>(null);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/tal/team/${encodeURIComponent(userId)}`);
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j?.error || j?.message || `Gagal memuat laporan (${res.status})`);
        // Respons API dibungkus { success, data } (apiOk) — buka bungkusnya dulu.
        setData(j.data ?? j);
      } catch (e: any) {
        setError(e?.message || 'Gagal memuat laporan TAL karyawan.');
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  if (loading) return <div className="p-6 text-sm text-slate-500">Memuat laporan TAL...</div>;

  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
      <div className="border-b border-slate-200 px-5 py-4">
        <Link
          href="/tal/tal-tim-saya"
          className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline mb-2"
        >
          <ArrowLeft size={14} /> Kembali ke Daftar Tim
        </Link>
        {error ? (
          <div className="text-sm text-red-600">{error}</div>
        ) : data ? (
          <>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-bold text-slate-900">Laporan TAL — {data.member.nama}</h1>
              {data.readOnly && (
                <span className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                  <Eye size={12} /> HANYA LIHAT
                </span>
              )}
              {data.isSelf && (
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                  Saya
                </span>
              )}
            </div>
            <p className="text-sm text-slate-500 mt-1">
              {data.member.divisi || data.member.posisi || data.member.role} · {data.member.email}
            </p>
          </>
        ) : null}
      </div>
      {data && !error && (
        <div className="px-5 py-4">
          <TalTimReport report={data} readOnly={data.readOnly} />
        </div>
      )}
    </div>
  );
}
