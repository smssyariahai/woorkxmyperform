// Rekapitulasi HR — porting src/pages/TalRekapitulasiHr.tsx.
// Rekap KINERJA TAL semua karyawan (bukan rekrutmen). GATE server §5.2:
// hanya isSuperAdmin / OWNER / ADMIN (route /api/tal/hr-rekap mengembalikan
// 403 untuk user lain). Filter 'perusahaan' backup DIBUANG (satu organisasi
// aktif). Level backup (numerik 1-5) dipetakan ke UserEmployment.jobLevel
// (String) — dicocokkan persis, tidak disamakan mentah.
'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import * as XLSX from 'xlsx';
import {
  BarChart3, Download, Filter, Users, ChevronDown, ChevronRight, Search, X,
} from 'lucide-react';

type Period = 'daily' | 'weekly' | 'monthly' | 'yearly';

interface HrUser {
  id: string; email: string; nama: string; divisi: string; posisi: string;
  jobLevel: string; cabang: string;
  obligation: { daily: boolean; weekly: boolean; monthly: boolean } | null;
}

interface HrGroup {
  groupId: string;
  label: string;
  avgGroupTal?: number;
  tasksCount?: number;
  rows: Record<string, any>[];
}

const PERIOD_LABELS: { id: Period; label: string }[] = [
  { id: 'daily', label: 'Harian' },
  { id: 'weekly', label: 'Mingguan' },
  { id: 'monthly', label: 'Bulanan' },
  { id: 'yearly', label: 'Tahunan' },
];

function scoreBadge(score: number) {
  if (score >= 85) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (score >= 70) return 'bg-blue-50 text-blue-700 border-blue-200';
  if (score >= 50) return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-red-50 text-red-700 border-red-200';
}

export default function TalRekapitulasiHrPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [period, setPeriod] = useState<Period>('daily');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [users, setUsers] = useState<HrUser[]>([]);
  const [groups, setGroups] = useState<HrGroup[]>([]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // Filter
  const [cabang, setCabang] = useState('');
  const [divisi, setDivisi] = useState('');
  const [posisi, setPosisi] = useState('');
  const [level, setLevel] = useState('');
  const [userId, setUserId] = useState('');
  const [search, setSearch] = useState('');

  // Rentang periode
  const [dailyStart, setDailyStart] = useState(today);
  const [dailyEnd, setDailyEnd] = useState(today);
  const nowY = new Date().getFullYear();
  const nowM = new Date().getMonth() + 1;
  const [startYear, setStartYear] = useState(nowY);
  const [startMonth, setStartMonth] = useState(nowM);
  const [endYear, setEndYear] = useState(nowY);
  const [endMonth, setEndMonth] = useState(nowM);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const q = new URLSearchParams({ period });
      if (cabang) q.set('cabang', cabang);
      if (divisi) q.set('divisi', divisi);
      if (posisi) q.set('posisi', posisi);
      if (level) q.set('level', level);
      if (userId) q.set('userId', userId);
      if (period === 'daily') {
        q.set('start', dailyStart);
        q.set('end', dailyEnd);
      } else if (period === 'yearly') {
        q.set('startYear', String(startYear));
        q.set('endYear', String(endYear));
      } else {
        q.set('startYear', String(startYear));
        q.set('startMonth', String(startMonth));
        q.set('endYear', String(endYear));
        q.set('endMonth', String(endMonth));
      }
      const res = await fetch(`/api/tal/hr-rekap?${q.toString()}`);
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || j?.message || `Gagal memuat rekap (${res.status})`);
      // Respons API dibungkus { success, data } (apiOk) — buka bungkusnya dulu.
      const d = j.data ?? j;
      setUsers(d.users || []);
      setGroups(d.groups || []);
    } catch (e: any) {
      setError(e?.message || 'Gagal memuat rekap HR.');
    } finally {
      setLoading(false);
    }
  }, [period, cabang, divisi, posisi, level, userId, dailyStart, dailyEnd, startYear, startMonth, endYear, endMonth]);

  useEffect(() => {
    load();
  }, [load]);

  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const visibleUsers = useMemo(
    () =>
      users.filter(
        (u) =>
          !search ||
          u.nama.toLowerCase().includes(search.toLowerCase()) ||
          u.email.toLowerCase().includes(search.toLowerCase()),
      ),
    [users, search],
  );

  const filterOptions = useMemo(() => {
    const uniq = (key: keyof HrUser) =>
      [...new Set(users.map((u) => u[key]).filter(Boolean))].sort() as string[];
    return { cabang: uniq('cabang'), divisi: uniq('divisi'), posisi: uniq('posisi'), level: uniq('jobLevel') };
  }, [users]);

  const resetFilters = () => {
    setCabang('');
    setDivisi('');
    setPosisi('');
    setLevel('');
    setUserId('');
    setSearch('');
  };

  const exportXlsx = () => {
    const rows: Record<string, any>[] = [];
    for (const g of groups) {
      for (const r of g.rows) {
        const u = userById.get(r.userId);
        if (!u) continue;
        const base: Record<string, any> = {
          Periode: g.label,
          Nama: u.nama,
          Email: u.email,
          Divisi: u.divisi,
          Posisi: u.posisi,
          Cabang: u.cabang,
          Level: u.jobLevel,
        };
        if (period === 'daily') {
          Object.assign(base, {
            'Total Task': r.totalTasks, Selesai: r.doneTasks,
            'Skor Realisasi': r.realisasiScore, 'Skor Laporan': r.reportScore,
            Dilaporkan: r.isReported ? 'Ya' : 'Tidak',
          });
        } else if (period === 'weekly') {
          Object.assign(base, {
            'Skor Plan': r.weeklyPlanScore, 'Skor Realisasi': r.weeklyRealisasiScore,
            'Skor Laporan': r.weeklyReportScore, 'Nilai Task Mingguan': r.nilaiTaskMingguan,
            'Nilai Task Harian': r.nilaiTaskHarian, 'Nilai TAL Mingguan': r.nilaiTalMingguan,
          });
        } else if (period === 'monthly') {
          Object.assign(base, {
            'Skor Plan': r.monthlyPlanScore, 'Skor Realisasi': r.monthlyRealisasiScore,
            'Skor Laporan': r.monthlyReportScore, 'Nilai TAL Bulanan': r.nilaiTalBulanan,
            'Task Bulanan': r.tasksCount, 'Task Harian': `${r.dailyDone}/${r.dailyTotal}`,
          });
        } else {
          Object.assign(base, {
            'Rata-rata Skor Bulanan': r.avgMonthlyScore,
            'Bulan Berdata': r.monthsWithData, 'Total Task': r.totalTasks, Selesai: r.doneTasks,
          });
        }
        rows.push(base);
      }
    }
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Rekap HR');
    XLSX.writeFile(wb, `rekap-hr-tal-${period}-${today}.xlsx`);
  };

  const mainScore = (r: Record<string, any>) =>
    period === 'daily'
      ? r.realisasiScore
      : period === 'weekly'
        ? r.nilaiTalMingguan
        : period === 'monthly'
          ? r.nilaiTalBulanan
          : r.avgMonthlyScore;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center gap-2">
          <BarChart3 size={20} className="text-blue-600 shrink-0" />
          <h1 className="text-lg font-bold text-slate-900">Rekapitulasi HR — Kinerja TAL</h1>
        </div>
        <p className="text-sm text-slate-500 mt-1">
          Rekap penyelesaian tugas TAL semua karyawan per periode. Hanya Administrator (OWNER / ADMIN / Super Admin)
          yang bisa membuka halaman ini. Ini rekap kinerja — bukan rekrutmen.
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : (
        <>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {PERIOD_LABELS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPeriod(p.id)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-lg border ${
                    period === p.id
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {p.label}
                </button>
              ))}
              <button
                onClick={exportXlsx}
                disabled={!groups.length}
                className="ml-auto flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-600 text-white disabled:opacity-50"
              >
                <Download size={14} /> Export XLSX
              </button>
            </div>

            {period === 'daily' && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <label className="text-xs font-semibold text-slate-600">Tanggal awal</label>
                <input type="date" value={dailyStart} onChange={(e) => setDailyStart(e.target.value)} className="text-sm border border-slate-200 rounded-lg px-2 py-1.5" />
                <label className="text-xs font-semibold text-slate-600">Tanggal akhir</label>
                <input type="date" value={dailyEnd} onChange={(e) => setDailyEnd(e.target.value)} className="text-sm border border-slate-200 rounded-lg px-2 py-1.5" />
              </div>
            )}
            {(period === 'weekly' || period === 'monthly') && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <label className="text-xs font-semibold text-slate-600">Bulan awal</label>
                <input type="number" min={2000} max={2100} value={startYear} onChange={(e) => setStartYear(Number(e.target.value) || nowY)} className="w-20 text-sm border border-slate-200 rounded-lg px-2 py-1.5" />
                <input type="number" min={1} max={12} value={startMonth} onChange={(e) => setStartMonth(Number(e.target.value) || 1)} className="w-16 text-sm border border-slate-200 rounded-lg px-2 py-1.5" />
                <label className="text-xs font-semibold text-slate-600">Bulan akhir</label>
                <input type="number" min={2000} max={2100} value={endYear} onChange={(e) => setEndYear(Number(e.target.value) || nowY)} className="w-20 text-sm border border-slate-200 rounded-lg px-2 py-1.5" />
                <input type="number" min={1} max={12} value={endMonth} onChange={(e) => setEndMonth(Number(e.target.value) || 1)} className="w-16 text-sm border border-slate-200 rounded-lg px-2 py-1.5" />
              </div>
            )}
            {period === 'yearly' && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <label className="text-xs font-semibold text-slate-600">Tahun awal</label>
                <input type="number" min={2000} max={2100} value={startYear} onChange={(e) => setStartYear(Number(e.target.value) || nowY)} className="w-20 text-sm border border-slate-200 rounded-lg px-2 py-1.5" />
                <label className="text-xs font-semibold text-slate-600">Tahun akhir</label>
                <input type="number" min={2000} max={2100} value={endYear} onChange={(e) => setEndYear(Number(e.target.value) || nowY)} className="w-20 text-sm border border-slate-200 rounded-lg px-2 py-1.5" />
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Filter size={14} className="text-slate-400" />
              {(
                [
                  ['Cabang', cabang, setCabang, filterOptions.cabang],
                  ['Divisi', divisi, setDivisi, filterOptions.divisi],
                  ['Posisi', posisi, setPosisi, filterOptions.posisi],
                  ['Level', level, setLevel, filterOptions.level],
                ] as const
              ).map(([label, value, setValue, options]) => (
                <select
                  key={label}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white"
                >
                  <option value="">{label}: Semua</option>
                  {options.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ))}
              <select
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white max-w-[220px]"
              >
                <option value="">User: Semua</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nama}
                  </option>
                ))}
              </select>
              <div className="relative">
                <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cari nama / email..."
                  className="text-sm border border-slate-200 rounded-lg pl-7 pr-2 py-1.5"
                />
              </div>
              {(cabang || divisi || posisi || level || userId || search) && (
                <button onClick={resetFilters} className="flex items-center gap-1 text-xs font-semibold text-slate-600 hover:underline">
                  <X size={13} /> Reset filter
                </button>
              )}
            </div>
            <p className="text-xs text-slate-500 flex items-center gap-1">
              <Users size={13} /> {visibleUsers.length} karyawan cocok dengan filter.
            </p>
          </div>

          {loading ? (
            <div className="p-6 text-sm text-slate-500">Memuat rekap...</div>
          ) : groups.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-400 text-center">
              Belum ada data pada rentang periode ini.
            </div>
          ) : (
            <div className="space-y-3">
              {groups.map((g) => {
                const isOpen = !collapsed[g.groupId];
                const rows = g.rows.filter((r) => visibleUsers.some((u) => u.id === r.userId));
                return (
                  <div key={g.groupId} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                    <button
                      onClick={() => setCollapsed((c) => ({ ...c, [g.groupId]: !c[g.groupId] }))}
                      className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50"
                    >
                      <span className="flex items-center gap-2 text-sm font-bold text-slate-900">
                        {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        {g.label}
                        <span className="text-xs font-medium text-slate-500">
                          · {rows.filter((r) => (r.totalTasks ?? r.tasksCount ?? 0) > 0).length} karyawan berdata
                        </span>
                      </span>
                      {typeof g.avgGroupTal === 'number' && (
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${scoreBadge(g.avgGroupTal)}`}>
                          Rata-rata {g.avgGroupTal}
                        </span>
                      )}
                    </button>
                    {isOpen && (
                      <div className="border-t border-slate-100 overflow-x-auto">
                        <table className="w-full text-sm min-w-[640px]">
                          <thead>
                            <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                              <th className="px-4 py-2 font-semibold">Karyawan</th>
                              <th className="px-2 py-2 font-semibold">Divisi / Posisi</th>
                              <th className="px-2 py-2 font-semibold text-center">Task</th>
                              {period === 'daily' && (
                                <>
                                  <th className="px-2 py-2 font-semibold text-center">Skor Realisasi</th>
                                  <th className="px-2 py-2 font-semibold text-center">Skor Laporan</th>
                                  <th className="px-2 py-2 font-semibold text-center">Status</th>
                                </>
                              )}
                              {period === 'weekly' && (
                                <>
                                  <th className="px-2 py-2 font-semibold text-center">Plan / Realisasi / Laporan</th>
                                  <th className="px-2 py-2 font-semibold text-center">Nilai Mingguan</th>
                                  <th className="px-2 py-2 font-semibold text-center">Nilai Harian</th>
                                </>
                              )}
                              {period === 'monthly' && (
                                <>
                                  <th className="px-2 py-2 font-semibold text-center">Plan / Realisasi / Laporan</th>
                                  <th className="px-2 py-2 font-semibold text-center">Task Harian</th>
                                </>
                              )}
                              {period === 'yearly' && (
                                <>
                                  <th className="px-2 py-2 font-semibold text-center">Bulan Berdata</th>
                                </>
                              )}
                              <th className="px-2 py-2 font-semibold text-center">Nilai</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((r) => {
                              const u = userById.get(r.userId);
                              if (!u) return null;
                              const score = mainScore(r);
                              return (
                                <tr key={r.userId} className="border-b border-slate-50 last:border-0">
                                  <td className="px-4 py-2">
                                    <div className="font-medium text-slate-900">{u.nama}</div>
                                    <div className="text-xs text-slate-500">{u.email}</div>
                                  </td>
                                  <td className="px-2 py-2 text-xs text-slate-600">
                                    {u.divisi || '—'}
                                    <span className="block text-slate-400">{u.posisi || ''}</span>
                                  </td>
                                  <td className="px-2 py-2 text-center">
                                    {period === 'daily'
                                      ? `${r.doneTasks}/${r.totalTasks}`
                                      : period === 'yearly'
                                        ? `${r.doneTasks}/${r.totalTasks}`
                                        : r.tasksCount ?? '—'}
                                  </td>
                                  {period === 'daily' && (
                                    <>
                                      <td className="px-2 py-2 text-center">{r.realisasiScore}</td>
                                      <td className="px-2 py-2 text-center">{r.reportScore}</td>
                                      <td className="px-2 py-2 text-center">
                                        {r.isReported ? (
                                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Dilaporkan</span>
                                        ) : r.totalTasks > 0 ? (
                                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Belum lapor</span>
                                        ) : (
                                          <span className="text-[11px] text-slate-400">—</span>
                                        )}
                                      </td>
                                    </>
                                  )}
                                  {period === 'weekly' && (
                                    <>
                                      <td className="px-2 py-2 text-center text-xs">
                                        {r.weeklyPlanScore} / {r.weeklyRealisasiScore} / {r.weeklyReportScore}
                                      </td>
                                      <td className="px-2 py-2 text-center">{r.nilaiTaskMingguan}</td>
                                      <td className="px-2 py-2 text-center">{r.nilaiTaskHarian}</td>
                                    </>
                                  )}
                                  {period === 'monthly' && (
                                    <>
                                      <td className="px-2 py-2 text-center text-xs">
                                        {r.monthlyPlanScore} / {r.monthlyRealisasiScore} / {r.monthlyReportScore}
                                      </td>
                                      <td className="px-2 py-2 text-center">
                                        {r.dailyDone}/{r.dailyTotal}
                                      </td>
                                    </>
                                  )}
                                  {period === 'yearly' && (
                                    <td className="px-2 py-2 text-center">{r.monthsWithData} / 12</td>
                                  )}
                                  <td className="px-2 py-2 text-center">
                                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${scoreBadge(score)}`}>
                                      {score}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
