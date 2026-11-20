// TAL Tim Saya — porting src/pages/TalTimSaya.tsx.
// Daftar anggota tim yang terlihat (hierarki + grant) + ringkasan TAL
// mereka hari ini + laporan agregat tim. TAL anggota hanya LIHAT.
'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Users, ChevronRight, Settings2, Eye } from 'lucide-react';
import { TalTimReport } from '@/components/tal/TalTimReport';
import type { TalTimReportData } from '@/lib/tal/team';

interface TeamMember {
  id: string;
  email: string;
  nama: string;
  divisi: string;
  posisi: string;
  role: string;
  isSelf: boolean;
  via: string;
  todayTotal: number;
  todayFinish: number;
}

async function apiJson(path: string) {
  const res = await fetch(path);
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.error || j?.message || `Permintaan ${path} gagal (${res.status})`);
  // Respons API dibungkus { success, data } (apiOk) — buka bungkusnya dulu.
  return j.data ?? j;
}

export default function TalTimSayaPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [teamReport, setTeamReport] = useState<(TalTimReportData & { memberCount: number }) | null>(null);

  const load = useCallback(async () => {
    const t = await apiJson('/api/tal/team');
    setMembers(t.members || []);
    setCanManage(!!t.canManage);
    try {
      const r = await apiJson('/api/tal/team?report=team');
      setTeamReport(r);
    } catch {
      setTeamReport(null);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        await load();
      } catch (e: any) {
        setError(e?.message || 'Gagal memuat TAL Tim Saya.');
      } finally {
        setLoading(false);
      }
    })();
  }, [load]);

  if (loading) return <div className="p-6 text-sm text-slate-500">Memuat TAL Tim Saya...</div>;
  if (error) return <div className="p-6 text-sm text-red-600">{error}</div>;

  const viaLabel = (m: TeamMember) =>
    m.isSelf ? 'Saya' : m.via === 'hierarchy' ? 'Tim (bawahan)' : 'Akses kustom';

  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
      <div className="border-b border-slate-200 px-4 py-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Users size={20} className="text-blue-600 shrink-0" />
            <h1 className="text-lg font-bold text-slate-900">TAL Tim Saya</h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Lihat TAL diri sendiri dan tim Anda. TAL anggota tim hanya bisa dilihat (HANYA LIHAT), tidak bisa diubah
            dari sini.
          </p>
        </div>
        {canManage && (
          <Link
            href="/tal/tal-tim-saya/pengaturan"
            className="shrink-0 flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
          >
            <Settings2 size={14} /> Pengaturan
          </Link>
        )}
      </div>

      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-bold text-slate-900 mb-2">Daftar Tim</h2>
        {members.length <= 1 && (
          <div className="text-sm text-slate-500 border border-slate-200 rounded-lg px-3 py-2 mb-2">
            Tim Anda saat ini hanya Anda sendiri.{' '}
            {canManage
              ? 'Atur atasan langsung tiap karyawan lewat tombol Pengaturan di kanan atas, maka tim akan terbentuk otomatis.'
              : 'Minta Administrator mengatur atasan langsung Anda dan tim, atau memberi akses kustom.'}
          </div>
        )}
        <div className="divide-y divide-slate-100">
          {members.map((m) => (
            <Link
              key={m.id}
              href={`/tal/tal-tim-saya/laporan/${m.id}`}
              className="w-full flex items-center justify-between gap-3 py-2 text-left hover:bg-slate-50 rounded px-1"
            >
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-900 truncate">{m.nama}</span>
                  <span
                    className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                      m.isSelf ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {viaLabel(m)}
                  </span>
                </span>
                <span className="block text-xs text-slate-500 truncate">
                  {m.divisi || m.posisi || m.role} · {m.email}
                </span>
              </span>
              <span className="shrink-0 flex items-center gap-2 text-xs text-slate-500">
                <span>
                  Hari ini: {m.todayFinish}/{m.todayTotal}
                </span>
                <Eye size={14} className="text-slate-400" />
                <ChevronRight size={16} className="text-slate-400" />
              </span>
            </Link>
          ))}
        </div>
      </div>

      <div className="px-4 py-3">
        <h2 className="text-sm font-bold text-slate-900 mb-1">Laporan TAL Tim</h2>
        <p className="text-xs text-slate-500 mb-3">
          Rekap gabungan {teamReport?.memberCount ?? members.length} anggota tim yang terlihat oleh Anda (satu task
          yang sama dihitung sekali).
        </p>
        {teamReport ? (
          <TalTimReport report={teamReport} />
        ) : (
          <div className="text-sm text-slate-400">Belum ada laporan tim.</div>
        )}
      </div>
    </div>
  );
}
