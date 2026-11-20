// Kalender Kerja — porting src/pages/KalenderKerja.tsx.
// Tab: Kalender | Setting TAL | Database TAL (admin) | Manajemen Lencana.
// Kalender: libur (TalHoliday), cuti (TalCuti, modal inline porting
// TalCutiModal), deadline + task TAL. Tab Setting TAL berisi form deadline
// + Simulator Kalkulator Hari Kerja (addWorkingDays, libur aktif).
// Tab Database TAL adalah komponen TalAdminDatabaseTab
// (components/tal/TalAdminDatabaseTab.tsx, porting komponen backup) —
// kunci bulanan, kewajiban user, batch unlock/reset laporan kunci, audit
// log — semua dengan alasan wajib. Tab Lencana hanya pengantar ke
// /tal/badges (milik sub-tahap c — TalBadgeManagementTab TIDAK dibuat di sini).
'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Calendar as CalendarIcon, Sliders, Plus, RefreshCw, ChevronLeft, ChevronRight,
  Database, Award, AlertTriangle, Palmtree, X, Search, Calculator, Info,
} from 'lucide-react';
import { TalAdminDatabaseTab } from '@/components/tal/TalAdminDatabaseTab';
import { addWorkingDays } from '@/lib/tal/date';

const MONTHS_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];
const DAYS_SHORT = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

const pad2 = (n: number) => String(n).padStart(2, '0');
const dateKey = (y: number, m: number, d: number) => `${y}-${pad2(m)}-${pad2(d)}`;

interface Holiday { id: string; date: string; title: string; category: string; description: string; isRecurringYearly: boolean }
interface Cuti { id: string; date: string; userId: string; userName?: string; reason?: string }
interface TaskEv { id: string; title: string; status: string; date: string; type: string }

async function apiJson(path: string, init?: RequestInit) {
  const res = await fetch(path, init);
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.error || j?.message || `Permintaan ${path} gagal (${res.status})`);
  // Respons API dibungkus { success, data } (apiOk) — buka bungkusnya dulu.
  return j.data ?? j;
}

async function apiOptional(path: string) {
  try {
    return await apiJson(path);
  } catch {
    return null;
  }
}

const DEFAULT_DEADLINE_SETTINGS = {
  planLockWeeklyDays: 2, planLockWeeklyTime: '23:59',
  planLockMonthlyDays: 3, planLockMonthlyTime: '23:59',
  reportDailyDays: 1, reportDailyTime: '23:59',
  reportWeeklyDays: 2, reportWeeklyTime: '23:59',
  reportMonthlyDays: 3, reportMonthlyTime: '23:59',
  systemLockMonthlyDays: 5, systemLockMonthlyTime: '16:00',
  systemLockEnabled: true,
};

export default function KalenderKerjaPage() {
  const now = new Date();
  const [activeTab, setActiveTab] = useState<'calendar' | 'settings' | 'database' | 'badges'>('calendar');
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-11
  const [isAdmin, setIsAdmin] = useState(false);

  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [cuti, setCuti] = useState<Cuti[]>([]);
  const [tasks, setTasks] = useState<TaskEv[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');
  const [listSearch, setListSearch] = useState('');
  const [listCategory, setListCategory] = useState<'all' | 'nasional' | 'cuti_bersama' | 'kantor'>('all');

  // Modal libur
  const [holModal, setHolModal] = useState<null | { id?: string; date: string; title: string; category: 'nasional' | 'cuti_bersama' | 'kantor'; description: string; isRecurringYearly: boolean }>(null);
  const [holDeleting, setHolDeleting] = useState<Holiday | null>(null);
  const [savingHol, setSavingHol] = useState(false);

  // Modal cuti (porting TalCutiModal — inline)
  const [cutiModal, setCutiModal] = useState<null | { date: string; existing?: Cuti }>(null);
  const [cutiReason, setCutiReason] = useState('');
  const [savingCuti, setSavingCuti] = useState(false);

  // Setting deadline (route sub-tahap a — opsional)
  const [deadline, setDeadline] = useState<Record<string, any>>(DEFAULT_DEADLINE_SETTINGS);
  const [deadlineAvailable, setDeadlineAvailable] = useState(false);
  const [savingDeadline, setSavingDeadline] = useState(false);

  // Simulator kalkulator hari kerja (porting KalenderKerja backup)
  const [simStartDate, setSimStartDate] = useState(dateKey(now.getFullYear(), now.getMonth() + 1, now.getDate()));
  const [simDaysToAdd, setSimDaysToAdd] = useState(1);
  const [simResult, setSimResult] = useState<{ deadlineDateStr: string; skippedHolidays: string[] } | null>(null);

  useEffect(() => {
    if (simStartDate && simDaysToAdd >= 0) {
      const res = addWorkingDays(simStartDate, simDaysToAdd, holidays);
      setSimResult({ deadlineDateStr: res.deadlineDateStr, skippedHolidays: res.skippedHolidays });
    }
  }, [simStartDate, simDaysToAdd, holidays]);

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      const team = await apiOptional('/api/tal/team');
      setIsAdmin(!!team?.canManage);
      const [hol, cutiRes, tasksRes] = await Promise.all([
        apiOptional(`/api/tal/holidays?year=${year}`),
        apiOptional(`/api/tal/cuti?all=${team?.canManage ? 1 : 0}`),
        apiOptional(`/api/tal/tasks?type=daily&year=${year}&month=${month + 1}`),
      ]);
      setHolidays(hol?.holidays || []);
      setCuti(cutiRes?.cuti || []);
      const tlist = (tasksRes?.tasks || []) as any[];
      setTasks(
        tlist
          .map((t) => ({
            id: t.id, title: t.title, status: t.status, type: t.type,
            date: t.taskDate ? String(t.taskDate).slice(0, 10) : '',
          }))
          .filter((t) => t.date),
      );
      const dl = await apiOptional('/api/tal/deadline-settings');
      if (dl?.settings) {
        setDeadline({ ...DEFAULT_DEADLINE_SETTINGS, ...dl.settings });
        setDeadlineAvailable(true);
      }
    } catch (e: any) {
      setError(e?.message || 'Gagal memuat kalender kerja.');
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // ---- Kalender ----
  const holidayByDate = useMemo(() => {
    const map = new Map<string, Holiday>();
    for (const h of holidays) {
      map.set(h.date, h);
      if (h.isRecurringYearly) {
        const mmdd = h.date.slice(5);
        map.set(`${year}-${mmdd}`, h);
      }
    }
    return map;
  }, [holidays, year]);

  const cutiByDate = useMemo(() => {
    const map = new Map<string, Cuti[]>();
    for (const c of cuti) {
      if (!map.has(c.date)) map.set(c.date, []);
      map.get(c.date)!.push(c);
    }
    return map;
  }, [cuti]);

  const tasksByDate = useMemo(() => {
    const map = new Map<string, TaskEv[]>();
    for (const t of tasks) {
      if (!map.has(t.date)) map.set(t.date, []);
      map.get(t.date)!.push(t);
    }
    return map;
  }, [tasks]);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDowMon0 = (new Date(year, month, 1).getDay() + 6) % 7;
  const cells: (string | null)[] = [
    ...Array.from({ length: firstDowMon0 }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => dateKey(year, month + 1, i + 1)),
  ];

  const holidaysInYear = useMemo(() => {
    const list = holidays.filter((h) => {
      if (listCategory !== 'all' && h.category !== listCategory) return false;
      if (listSearch && !`${h.title} ${h.date}`.toLowerCase().includes(listSearch.toLowerCase())) return false;
      return true;
    });
    return list.sort((a, b) => a.date.localeCompare(b.date));
  }, [holidays, listCategory, listSearch]);

  const prevMonth = () => {
    if (month === 0) { setYear(year - 1); setMonth(11); }
    else setMonth(month - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setYear(year + 1); setMonth(0); }
    else setMonth(month + 1);
  };

  // ---- Aksi libur ----
  const saveHoliday = async () => {
    if (!holModal) return;
    if (!holModal.title.trim()) { alert('Nama libur wajib diisi.'); return; }
    try {
      setSavingHol(true);
      await apiJson('/api/tal/holidays', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...holModal, reason: `Simpan hari libur ${holModal.title} (${holModal.date}).` }),
      });
      setNotice('Hari libur berhasil disimpan.');
      setHolModal(null);
      await loadAll();
    } catch (e: any) {
      alert(e?.message || 'Gagal menyimpan libur.');
    } finally {
      setSavingHol(false);
    }
  };

  const deleteHoliday = async () => {
    if (!holDeleting) return;
    try {
      await apiJson(`/api/tal/holidays?id=${encodeURIComponent(holDeleting.id)}`, { method: 'DELETE' });
      setNotice('Hari libur berhasil dihapus.');
      setHolDeleting(null);
      await loadAll();
    } catch (e: any) {
      alert(e?.message || 'Gagal menghapus libur.');
    }
  };

  const resetHolidays = async () => {
    if (!window.confirm('Reset daftar libur ke default nasional 2025-2027? Libur kantor kustom akan terhapus.')) return;
    try {
      await apiJson('/api/tal/holidays', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset: true, reason: 'Reset daftar libur ke default nasional.' }),
      });
      setNotice('Daftar libur direset ke default nasional.');
      await loadAll();
    } catch (e: any) {
      alert(e?.message || 'Gagal mereset libur.');
    }
  };

  // ---- Aksi cuti (modal inline, porting TalCutiModal) ----
  const openCutiModal = (date: string) => {
    const existing = cuti.find((c) => c.date === date);
    setCutiReason(existing?.reason || '');
    setCutiModal({ date, existing });
  };

  const saveCuti = async (setAsCuti: boolean) => {
    if (!cutiModal) return;
    try {
      setSavingCuti(true);
      if (setAsCuti) {
        await apiJson('/api/tal/cuti', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date: cutiModal.date, reason: cutiReason }),
        });
        setNotice(`Tanggal ${cutiModal.date} ditandai sebagai cuti.`);
      } else {
        await apiJson(`/api/tal/cuti?date=${cutiModal.date}`, { method: 'DELETE' });
        setNotice(`Cuti tanggal ${cutiModal.date} dibatalkan.`);
      }
      setCutiModal(null);
      await loadAll();
    } catch (e: any) {
      alert(e?.message || 'Gagal menyimpan cuti.');
    } finally {
      setSavingCuti(false);
    }
  };

  const saveDeadline = async () => {
    if (!deadlineAvailable) return;
    try {
      setSavingDeadline(true);
      await apiJson('/api/tal/deadline-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: deadline }),
      });
      setNotice('Pengaturan deadline TAL berhasil disimpan.');
    } catch (e: any) {
      alert(e?.message || 'Gagal menyimpan pengaturan deadline.');
    } finally {
      setSavingDeadline(false);
    }
  };

  if (loading) return <div className="p-6 text-sm text-slate-500">Memuat kalender kerja...</div>;
  if (error) return <div className="p-6 text-sm text-red-600">{error}</div>;

  const todayKey = dateKey(now.getFullYear(), now.getMonth() + 1, now.getDate());

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center gap-2">
          <CalendarIcon size={20} className="text-blue-600 shrink-0" />
          <h1 className="text-lg font-bold text-slate-900">Kalender Kerja</h1>
        </div>
        <p className="text-sm text-slate-500 mt-1">
          Kalender kerja tim: hari libur, cuti, dan deadline TAL. Klik tanggal untuk menandai cuti Anda.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white px-2 py-2 flex flex-wrap gap-1">
        {(
          [
            ['calendar', 'Kalender', CalendarIcon],
            ['settings', 'Setting TAL', Sliders],
            ...(isAdmin ? [['database', 'Database TAL', Database] as const] : []),
            ...(isAdmin ? [['badges', 'Manajemen Lencana', Award] as const] : []),
          ] as const
        ).map(([tab, label, Icon]) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab as any)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ${
              activeTab === tab ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {notice && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700 flex items-center justify-between gap-2">
          <span>{notice}</span>
          <button onClick={() => setNotice('')} className="text-emerald-600"><X size={14} /></button>
        </div>
      )}

      {activeTab === 'calendar' && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <button onClick={prevMonth} className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"><ChevronLeft size={16} /></button>
              <button onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth()); }} className="px-3 py-1.5 rounded-xl hover:bg-slate-100 font-bold text-slate-900">
                {MONTHS_ID[month]} {year}
              </button>
              <button onClick={nextMonth} className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"><ChevronRight size={16} /></button>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-semibold">
                <button onClick={() => setViewMode('calendar')} className={`px-3 py-1.5 ${viewMode === 'calendar' ? 'bg-slate-900 text-white' : 'text-slate-600'}`}>Kalender</button>
                <button onClick={() => setViewMode('list')} className={`px-3 py-1.5 ${viewMode === 'list' ? 'bg-slate-900 text-white' : 'text-slate-600'}`}>Daftar Libur</button>
              </div>
              {isAdmin && (
                <button
                  onClick={() => setHolModal({ date: todayKey, title: '', category: 'nasional', description: '', isRecurringYearly: false })}
                  className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-blue-600 text-white"
                >
                  <Plus size={14} /> Tambah Libur
                </button>
              )}
            </div>
          </div>

          {viewMode === 'calendar' ? (
            <div>
              <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-slate-500 mb-1">
                {DAYS_SHORT.map((d) => (<div key={d} className="py-1">{d}</div>))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {cells.map((ds, i) => {
                  if (!ds) return <div key={`empty-${i}`} className="min-h-[72px] rounded-lg bg-slate-50/60" />;
                  const hol = holidayByDate.get(ds);
                  const dayCuti = cutiByDate.get(ds) || [];
                  const dayTasks = tasksByDate.get(ds) || [];
                  const done = dayTasks.filter((t) => t.status === 'done').length;
                  const isToday = ds === todayKey;
                  return (
                    <button
                      key={ds}
                      onClick={() => openCutiModal(ds)}
                      title="Klik untuk kelola cuti tanggal ini"
                      className={`min-h-[72px] rounded-lg border p-1.5 text-left align-top ${
                        isToday ? 'border-blue-500 ring-1 ring-blue-500' : 'border-slate-200 hover:border-slate-300'
                      } ${hol ? 'bg-red-50/60' : ''}`}
                    >
                      <div className={`text-xs font-bold ${isToday ? 'text-blue-700' : 'text-slate-800'}`}>{Number(ds.slice(8))}</div>
                      {hol && <div className="text-[10px] leading-tight text-red-700 font-semibold truncate" title={hol.title}>{hol.title}</div>}
                      {dayCuti.length > 0 && (
                        <div className="text-[10px] leading-tight text-amber-700 font-semibold flex items-center gap-0.5">
                          <Palmtree size={10} /> Cuti{dayCuti.length > 1 ? ` (${dayCuti.length})` : ''}
                        </div>
                      )}
                      {dayTasks.length > 0 && (
                        <div className="text-[10px] leading-tight text-slate-500">
                          {done}/{dayTasks.length} task
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-slate-400 mt-2">
                Keterangan: merah = hari libur · <Palmtree size={11} className="inline" /> = cuti · angka task = tugas harian Anda pada tanggal itu (bila route task tersedia).
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input value={listSearch} onChange={(e) => setListSearch(e.target.value)} placeholder="Cari libur..." className="text-sm border border-slate-200 rounded-lg pl-7 pr-2 py-1.5" />
                </div>
                <select value={listCategory} onChange={(e) => setListCategory(e.target.value as any)} className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white">
                  <option value="all">Semua kategori</option>
                  <option value="nasional">Nasional</option>
                  <option value="cuti_bersama">Cuti Bersama</option>
                  <option value="kantor">Kantor</option>
                </select>
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700">{holidaysInYear.length} Hari</span>
                {isAdmin && (
                  <button onClick={resetHolidays} className="ml-auto flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50">
                    <RefreshCw size={13} /> Reset ke Default Nasional
                  </button>
                )}
              </div>
              <div className="divide-y divide-slate-100">
                {holidaysInYear.length === 0 && <div className="text-sm text-slate-400 py-3">Belum ada hari libur pada tahun ini.</div>}
                {holidaysInYear.map((h) => (
                  <div key={h.id} className="py-2 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate">{h.title}</div>
                      <div className="text-xs text-slate-500">{h.date} · {h.category}{h.isRecurringYearly ? ' · berulang tiap tahun' : ''}</div>
                    </div>
                    {isAdmin && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => setHolModal({ id: h.id, date: h.date, title: h.title, category: h.category as any, description: h.description, isRecurringYearly: h.isRecurringYearly })}
                          className="text-xs font-semibold text-blue-600 hover:underline px-2"
                        >
                          Ubah
                        </button>
                        <button onClick={() => setHolDeleting(h)} className="text-xs font-semibold text-red-600 hover:underline px-2">
                          Hapus
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-4 space-y-4">
            <h2 className="text-sm font-bold text-slate-900">Setting TAL — Batas Waktu Kunci & Laporan</h2>
            <div className="p-3 bg-blue-50/80 border border-blue-200 rounded-xl flex items-start gap-2 text-xs text-blue-900">
              <Info size={16} className="text-blue-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold mb-0.5">Formula Hari Kerja Otomatis</p>
                <p>
                  Sistem TAL secara otomatis mengecualikan <b>Hari Minggu</b> dan <b>Tanggal Merah</b> yang terdaftar pada Kalender Kerja saat menghitung batas akhir (deadline) perencanaan dan pelaporan.
                </p>
              </div>
            </div>
          {!deadlineAvailable ? (
            <p className="text-sm text-slate-500">
              Pengaturan deadline TAL belum tersedia — route <code className="bg-slate-100 px-1 rounded">/api/tal/deadline-settings</code> milik
              sub-tahap (a) dan belum dibuat saat halaman ini ditulis. Pengaturan akan aktif otomatis setelah route itu ada.
            </p>
          ) : (
            <>
              <p className="text-xs text-slate-500">
                Setelah batas waktu ini tercapai, data TAL pada periode bersangkutan terkunci (kecuali dibuka kunci manual
                oleh Administrator di Tab Database TAL).
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(
                  [
                    ['planLockWeeklyDays', 'Kunci plan mingguan (H+ hari kerja)', 'planLockWeeklyTime', 'Jam kunci plan mingguan'],
                    ['planLockMonthlyDays', 'Kunci plan bulanan (H+ hari kerja)', 'planLockMonthlyTime', 'Jam kunci plan bulanan'],
                    ['reportDailyDays', 'Lapor harian (H+ hari)', 'reportDailyTime', 'Jam lapor harian'],
                    ['reportWeeklyDays', 'Lapor mingguan (H+ hari)', 'reportWeeklyTime', 'Jam lapor mingguan'],
                    ['reportMonthlyDays', 'Lapor bulanan (H+ hari)', 'reportMonthlyTime', 'Jam lapor bulanan'],
                    ['systemLockMonthlyDays', 'Kunci sistem bulanan (H+ hari)', 'systemLockMonthlyTime', 'Jam kunci sistem'],
                  ] as const
                ).map(([dayKey, dayLabel, timeKey, timeLabel]) => (
                  <div key={dayKey} className="border border-slate-200 rounded-lg p-3 space-y-2">
                    <label className="block text-xs font-semibold text-slate-700">{dayLabel}</label>
                    <input
                      type="number" min={0} max={30}
                      value={Number(deadline[dayKey] ?? 0)}
                      disabled={!isAdmin}
                      onChange={(e) => setDeadline((d) => ({ ...d, [dayKey]: Number(e.target.value) || 0 }))}
                      className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5"
                    />
                    <label className="block text-xs font-semibold text-slate-700">{timeLabel}</label>
                    <input
                      type="time"
                      value={String(deadline[timeKey] || '23:59')}
                      disabled={!isAdmin}
                      onChange={(e) => setDeadline((d) => ({ ...d, [timeKey]: e.target.value }))}
                      className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5"
                    />
                  </div>
                ))}
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={!!deadline.systemLockEnabled}
                  disabled={!isAdmin}
                  onChange={(e) => setDeadline((d) => ({ ...d, systemLockEnabled: e.target.checked }))}
                />
                Aktifkan kunci sistem bulanan otomatis
              </label>
              {isAdmin && (
                <button onClick={saveDeadline} disabled={savingDeadline} className="text-xs font-semibold px-4 py-2 rounded-lg bg-blue-600 text-white disabled:opacity-50">
                  {savingDeadline ? 'Menyimpan...' : 'Simpan Pengaturan'}
                </button>
              )}
            </>
          )}
          <div className="border-t border-slate-100 pt-3">
            <h3 className="text-sm font-semibold text-slate-900 mb-1">Hari Libur</h3>
            <p className="text-xs text-slate-500 mb-2">
              Kelola hari libur dari tab Kalender (tombol &ldquo;Tambah Libur&rdquo; dan daftar libur). Reset ke default nasional juga tersedia di sana.
            </p>
            {isAdmin && (
              <button onClick={resetHolidays} className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50">
                <RefreshCw size={13} /> Reset Libur ke Default Nasional
              </button>
            )}
          </div>
          </div>

          {/* Simulator Kalkulator Hari Kerja (porting KalenderKerja backup) */}
          <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-4 space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
              <div className="p-2 bg-amber-50 text-amber-700 rounded-lg">
                <Calculator size={18} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Simulasi Kalkulator Hari Kerja</h3>
                <p className="text-[11px] text-slate-500">Uji coba perhitungan H+X dengan libur aktif</p>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Pilih Tanggal Awal (Start Date)</label>
                <input
                  type="date"
                  value={simStartDate}
                  onChange={(e) => setSimStartDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Jumlah Hari Kerja (H + X)</label>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 5, 7].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setSimDaysToAdd(num)}
                      className={`flex-1 py-1.5 text-xs font-bold rounded-lg border transition ${
                        simDaysToAdd === num
                          ? 'bg-amber-600 text-white border-amber-600'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      H+{num}
                    </button>
                  ))}
                </div>
              </div>
              {simResult && (
                <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-xl space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800">Hasil Perhitungan Deadline</span>
                  <div className="text-lg font-black text-amber-950">{simResult.deadlineDateStr}</div>
                  {simResult.skippedHolidays.length > 0 ? (
                    <div className="text-[11px] text-amber-800 pt-1 border-t border-amber-200/80">
                      <p className="font-semibold mb-1">Hari Libur yang Dilewati (Dikecualikan):</p>
                      <ul className="list-disc list-inside space-y-0.5 text-[10px] text-amber-900">
                        {simResult.skippedHolidays.map((h, i) => (
                          <li key={i}>{h}</li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className="text-[11px] text-amber-700 pt-1">Tidak melewati hari libur nasional tambahan.</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'database' && isAdmin && <TalAdminDatabaseTab />}

      {activeTab === 'badges' && isAdmin && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-bold text-slate-900 mb-1">Manajemen Lencana</h2>
          <p className="text-sm text-slate-500">
            Manajemen lencana (badge) adalah bagian sub-tahap (c) Gelombang 4 dan dikelola di halaman{' '}
            <Link href="/tal/badges" className="text-blue-600 font-semibold hover:underline">TAL Badges</Link>.
          </p>
        </div>
      )}

      {/* Modal libur */}
      {holModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/50" onClick={() => setHolModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">{holModal.id ? 'Ubah Hari Libur' : 'Tambah Hari Libur'}</h3>
              <button onClick={() => setHolModal(null)} className="p-1 text-slate-400 hover:text-slate-700"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Tanggal</label>
                <input type="date" value={holModal.date} onChange={(e) => setHolModal({ ...holModal, date: e.target.value })} className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nama Libur</label>
                <input type="text" value={holModal.title} onChange={(e) => setHolModal({ ...holModal, title: e.target.value })} placeholder="Contoh: Hari Kemerdekaan RI" className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Kategori</label>
                <select value={holModal.category} onChange={(e) => setHolModal({ ...holModal, category: e.target.value as any })} className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white">
                  <option value="nasional">Nasional</option>
                  <option value="cuti_bersama">Cuti Bersama</option>
                  <option value="kantor">Kantor</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Keterangan (opsional)</label>
                <input type="text" value={holModal.description} onChange={(e) => setHolModal({ ...holModal, description: e.target.value })} className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200" />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={holModal.isRecurringYearly} onChange={(e) => setHolModal({ ...holModal, isRecurringYearly: e.target.checked })} />
                Berulang setiap tahun
              </label>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3.5 bg-slate-50 border-t border-slate-100">
              <button onClick={() => setHolModal(null)} className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-xl">Batal</button>
              <button onClick={saveHoliday} disabled={savingHol} className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl disabled:opacity-50">
                {savingHol ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal hapus libur */}
      {holDeleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/50" onClick={() => setHolDeleting(null)}>
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-slate-900 mb-1">Hapus Hari Libur?</h3>
            <p className="text-sm text-slate-600 mb-4">{holDeleting.title} — {holDeleting.date}</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setHolDeleting(null)} className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl">Batal</button>
              <button onClick={deleteHoliday} className="px-4 py-2 text-xs font-bold text-white bg-red-600 rounded-xl">Hapus</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal cuti — porting TalCutiModal (inline) */}
      {cutiModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/50" onClick={() => setCutiModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-amber-50/70">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-100 text-amber-700 rounded-xl"><Palmtree size={20} /></div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">{cutiModal.existing ? 'Kelola Status Cuti' : 'Tandai Sebagai Hari Cuti'}</h3>
                  <p className="text-[11px] text-amber-800 font-semibold">Tanggal: {cutiModal.date}</p>
                </div>
              </div>
              <button onClick={() => setCutiModal(null)} className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-3.5">
              {(tasksByDate.get(cutiModal.date) || []).length > 0 && !cutiModal.existing && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-rose-800 text-xs">
                  <AlertTriangle size={18} className="text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-rose-900 mb-0.5">Perhatian: Ada Tugas di Tanggal Ini</p>
                    <p>Terdapat <b>{(tasksByDate.get(cutiModal.date) || []).length} tugas</b> pada tanggal ini. Menandai cuti akan mengecualikan hari ini dari kewajiban tugas harian (penghapusan tugas dilakukan dari halaman Tasks).</p>
                  </div>
                </div>
              )}
              <p className="text-xs text-slate-600">
                {cutiModal.existing
                  ? 'Tanggal ini saat ini ditandai sebagai hari cuti Anda. Anda dapat membatalkan atau memperbarui keterangan cuti.'
                  : 'Menandai tanggal ini sebagai cuti akan mengecualikan hari ini dari kewajiban tugas harian.'}
              </p>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Alasan / Keterangan Cuti (Opsional)</label>
                <input
                  type="text"
                  value={cutiReason}
                  onChange={(e) => setCutiReason(e.target.value)}
                  placeholder="Contoh: Cuti tahunan / Keperluan keluarga / Izin sakit"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3.5 bg-slate-50 border-t border-slate-100">
              <button onClick={() => setCutiModal(null)} className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-xl">Batal</button>
              {cutiModal.existing ? (
                <button onClick={() => saveCuti(false)} disabled={savingCuti} className="px-4 py-2 text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl disabled:opacity-50">
                  {savingCuti ? 'Memproses...' : 'Batalkan Cuti'}
                </button>
              ) : (
                <button onClick={() => saveCuti(true)} disabled={savingCuti} className="px-5 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl disabled:opacity-50">
                  {savingCuti ? 'Menyimpan...' : 'Tandai Cuti'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
