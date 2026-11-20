// app/(dashboard)/koperasi/anggota/page.tsx — list anggota.
// Port dari backup MyPerform (src/pages/KoperasiAnggotaList.tsx, 957 baris):
// tabel + pencarian (nama/NIK), filter cabang & tujuan, urutkan per
// kolom, pilih kolom tampil, tampilan tabel/kartu, modal detail (termasuk
// foto KTP/foto anggota/tanda tangan + fullscreen + unduh), hapus, kirim
// JSON per anggota, export Excel.
// PENYEDERHANAAN WOORK: data diambil per halaman dari
// GET /api/koperasi/anggota (pencarian & filter cabang di sisi server;
// urutan & filter tujuan/tanggal di sisi klien dalam halaman yang dimuat).
// Foto di list tampil sebagai thumbnail dari URL serve (atau inisial bila
// tidak ada foto). Hapus admin-only di API — bila ditolak 403, tampilkan
// pesan yang jelas.
'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as XLSX from 'xlsx';
import {
  ChevronLeft,
  ChevronRight,
  Columns3,
  Download,
  Eye,
  FileSpreadsheet,
  LayoutGrid,
  Loader2,
  Maximize,
  Pencil,
  Plus,
  Search,
  Send,
  Table2,
  Trash2,
  X,
} from 'lucide-react';
import KirimJsonModal from '@/components/koperasi/KirimJsonModal';
import { buildAnggotaJson } from '@/lib/koperasi/kirimJson';
import {
  deleteKoperasiAnggota,
  fetchKoperasiAnggota,
  fetchKoperasiCabang,
  type KoperasiAnggota,
} from '@/lib/koperasi/client';
import { CABANG_OPTIONS } from '@/lib/koperasi/cabang';

type ColKey =
  | 'nik'
  | 'nama'
  | 'cabang'
  | 'jk'
  | 'hp'
  | 'pekerjaan'
  | 'tujuan'
  | 'simpanan'
  | 'pinjaman'
  | 'tanggal';

const COLUMNS: Array<{ key: ColKey; label: string }> = [
  { key: 'nik', label: 'NIK' },
  { key: 'nama', label: 'Nama Lengkap' },
  { key: 'cabang', label: 'Cabang' },
  { key: 'jk', label: 'Jenis Kelamin' },
  { key: 'hp', label: 'No HP' },
  { key: 'pekerjaan', label: 'Pekerjaan' },
  { key: 'tujuan', label: 'Tujuan' },
  { key: 'simpanan', label: 'Simpanan' },
  { key: 'pinjaman', label: 'Pinjaman' },
  { key: 'tanggal', label: 'Tanggal Daftar' },
];

const COLS_STORAGE_KEY = 'koperasi-anggota-columns';
const PAGE_SIZE = 20;

const badge = (ada: boolean) =>
  ada ? (
    <span className="inline-block px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-medium">Ada</span>
  ) : (
    <span className="inline-block px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[11px] font-medium">Belum ada</span>
  );

function initials(nama: string) {
  const parts = nama.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
}

const FotoDenganAksi = ({
  src,
  label,
  fileName,
  bg,
  onFullscreen,
}: {
  src: string;
  label: string;
  fileName: string;
  bg: string;
  onFullscreen: () => void;
}) => (
  <div>
    <span className="block text-[11px] font-semibold text-slate-500 mb-1">{label}</span>
    <div className="relative">
      <img src={src} alt={label} className={`w-full max-h-44 object-contain rounded-xl border border-slate-200 ${bg}`} />
      <div className="absolute top-1.5 right-1.5 flex gap-1">
        <button
          type="button"
          onClick={onFullscreen}
          className="p-1.5 rounded-lg bg-white/95 border border-slate-200 text-slate-600 shadow hover:text-slate-900"
          title="Lihat fullscreen"
          aria-label={`Lihat ${label} fullscreen`}
        >
          <Maximize size={14} />
        </button>
        <a
          href={src}
          download={fileName}
          className="p-1.5 rounded-lg bg-white/95 border border-slate-200 text-slate-600 shadow hover:text-slate-900"
          title="Unduh foto"
          aria-label={`Unduh ${label}`}
        >
          <Download size={14} />
        </a>
      </div>
    </div>
  </div>
);

export default function KoperasiAnggotaListPage() {
  const router = useRouter();
  const [rows, setRows] = useState<KoperasiAnggota[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [cabangFilter, setCabangFilter] = useState('');
  const [cabangOptions, setCabangOptions] = useState<string[]>(CABANG_OPTIONS);
  const [tujuanFilter, setTujuanFilter] = useState('');
  const [sortKey, setSortKey] = useState<ColKey>('tanggal');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [visible, setVisible] = useState<Set<ColKey>>(() => new Set(COLUMNS.map((c) => c.key)));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [view, setView] = useState<'table' | 'card'>(() => {
    try {
      return (localStorage.getItem('koperasi-anggota-view') as 'table' | 'card') || 'table';
    } catch {
      return 'table';
    }
  });
  const [detail, setDetail] = useState<KoperasiAnggota | null>(null);
  const [lightbox, setLightbox] = useState<{ src: string; label: string } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<KoperasiAnggota | null>(null);
  const [kirimTarget, setKirimTarget] = useState<KoperasiAnggota | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    try {
      const saved = localStorage.getItem(COLS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as string[];
        if (parsed.length > 0) setVisible(new Set(parsed as ColKey[]));
      }
    } catch {}
    fetchKoperasiCabang()
      .then((list) => {
        const names = list.map((c) => c.nama).filter(Boolean);
        if (names.length > 0) setCabangOptions(names);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async (p: number, q: string, cabang: string) => {
    setLoading(true);
    setError('');
    try {
      const r = await fetchKoperasiAnggota({
        search: q || undefined,
        cabang: cabang || undefined,
        page: p,
        pageSize: PAGE_SIZE,
      });
      setRows(r.items);
      setTotal(r.total);
      setPage(r.page);
    } catch (e: any) {
      setError(e?.message || 'Gagal memuat daftar anggota.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(page, searchDebounced, cabangFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, searchDebounced, cabangFilter]);

  useEffect(() => {
    try {
      localStorage.setItem(COLS_STORAGE_KEY, JSON.stringify([...visible]));
    } catch {}
  }, [visible]);

  const changeView = (v: 'table' | 'card') => {
    setView(v);
    try {
      localStorage.setItem('koperasi-anggota-view', v);
    } catch {}
  };

  // Filter tujuan + urutan di sisi klien (dalam halaman yang dimuat).
  const filtered = useMemo(() => {
    let out = rows;
    if (tujuanFilter) out = out.filter((r) => r.tujuanKeanggotaan === tujuanFilter);
    const val = (r: KoperasiAnggota): string | number | boolean => {
      switch (sortKey) {
        case 'nik': return r.nik;
        case 'nama': return r.namaLengkap;
        case 'cabang': return r.cabang;
        case 'jk': return r.jenisKelamin;
        case 'hp': return r.noHp;
        case 'pekerjaan': return r.pekerjaan;
        case 'tujuan': return r.tujuanKeanggotaan;
        case 'simpanan': return r.hasSimpanan;
        case 'pinjaman': return r.hasPinjaman;
        case 'tanggal': return r.createdAt ? new Date(r.createdAt).getTime() : 0;
        default: return '';
      }
    };
    return [...out].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      let cmp = 0;
      if (typeof va === 'number' && typeof vb === 'number') cmp = va - vb;
      else if (typeof va === 'boolean' && typeof vb === 'boolean') cmp = va === vb ? 0 : va ? 1 : -1;
      else cmp = String(va).localeCompare(String(vb));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [rows, tujuanFilter, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const toggleSort = (key: ColKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const toggleCol = (key: ColKey) => {
    setVisible((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size > 1) next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const doDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await deleteKoperasiAnggota(pendingDelete.id);
      setPendingDelete(null);
      load(page, searchDebounced, cabangFilter);
    } catch (e: any) {
      setDeleteError(e?.message || 'Gagal menghapus anggota.');
    } finally {
      setDeleting(false);
    }
  };

  // Export ke Excel (.xlsx): memakai baris yang sedang tampil di halaman
  // ini. Foto tidak ikut (base64 akan membengkakkan file).
  const exportExcel = () => {
    const header = [
      'Cabang', 'NIK', 'Nama Lengkap', 'Tempat Lahir', 'Tanggal Lahir', 'Jenis Kelamin',
      'Alamat KTP', 'No HP', 'Nama Ibu Kandung', 'Pekerjaan', 'Status Perkawinan',
      'Penghasilan Bulanan', 'Tujuan Keanggotaan', 'Simpanan', 'Pinjaman',
      'Pernyataan AD/ART', 'Mobile Banking', 'Tanggal Daftar',
    ];
    const data = filtered.map((r) => ({
      Cabang: r.cabang,
      NIK: r.nik,
      'Nama Lengkap': r.namaLengkap,
      'Tempat Lahir': r.tempatLahir,
      'Tanggal Lahir': r.tanggalLahir,
      'Jenis Kelamin': r.jenisKelamin,
      'Alamat KTP': r.alamatKtp,
      'No HP': r.noHp,
      'Nama Ibu Kandung': r.namaIbuKandung,
      Pekerjaan: r.pekerjaan,
      'Status Perkawinan': r.statusPerkawinan,
      'Penghasilan Bulanan': r.penghasilanBulanan,
      'Tujuan Keanggotaan': r.tujuanKeanggotaan,
      Simpanan: r.hasSimpanan ? 'Ada' : 'Belum',
      Pinjaman: r.hasPinjaman ? 'Ada' : 'Belum',
      'Pernyataan AD/ART': r.setujuPernyataan ? 'Disetujui' : 'Belum',
      'Mobile Banking': r.setujuMobileBanking ? 'Ya' : 'Tidak',
      'Tanggal Daftar': r.createdAt ? new Date(r.createdAt).toLocaleDateString('id-ID') : '',
    }));
    const ws = XLSX.utils.json_to_sheet(data, { header });
    ws['!cols'] = header.map((h) => ({
      wch: Math.min(60, Math.max(h.length, ...data.map((r) => String((r as Record<string, unknown>)[h] ?? '').length)) + 2),
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Anggota');
    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    XLSX.writeFile(wb, `List-Anggota-${stamp}.xlsx`);
  };

  const fotoFileName = (label: string, src: string) => {
    const m = src.match(/\.([a-zA-Z]+)(?:\?|$)/);
    const ext = m ? m[1].toLowerCase() : 'jpg';
    const nama = (detail?.namaLengkap || 'anggota').replace(/[^a-zA-Z0-9-_]+/g, '-').replace(/-+/g, '-');
    return `${label.replace(/\s+/g, '-')}-${nama}.${ext}`;
  };

  const cell = (r: KoperasiAnggota, key: ColKey) => {
    switch (key) {
      case 'nik':
        return <span className="font-mono">{r.nik}</span>;
      case 'nama':
        return (
          <span className="inline-flex items-center gap-2">
            {r.fotoAnggota ? (
              <img src={r.fotoAnggota} alt={r.namaLengkap} className="w-8 h-8 rounded-full object-cover border border-slate-200 shrink-0" />
            ) : (
              <span className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-bold flex items-center justify-center shrink-0">
                {initials(r.namaLengkap)}
              </span>
            )}
            <span className="font-medium text-slate-800">{r.namaLengkap}</span>
          </span>
        );
      case 'cabang':
        return r.cabang;
      case 'jk':
        return r.jenisKelamin;
      case 'hp':
        return r.noHp;
      case 'pekerjaan':
        return r.pekerjaan || '-';
      case 'tujuan':
        return r.tujuanKeanggotaan || '-';
      case 'simpanan':
        return badge(r.hasSimpanan);
      case 'pinjaman':
        return badge(r.hasPinjaman);
      case 'tanggal':
        return r.createdAt ? new Date(r.createdAt).toLocaleDateString('id-ID') : '-';
      default:
        return '';
    }
  };

  const kolomBody = (
    <>
      <p className="px-2 py-1 text-[11px] font-semibold text-slate-500">Tampilkan / sembunyikan kolom</p>
      {COLUMNS.map((c) => (
        <label key={c.key} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer">
          <input
            type="checkbox"
            checked={visible.has(c.key)}
            onChange={() => toggleCol(c.key)}
            className="accent-blue-600"
          />
          <span className="text-xs text-slate-700">{c.label}</span>
        </label>
      ))}
    </>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-slate-800">List Anggota</h1>
          <p className="text-xs text-slate-500">{total.toLocaleString('id-ID')} anggota terdaftar</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={exportExcel}
            disabled={loading || filtered.length === 0}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-emerald-300 bg-white text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
          >
            <FileSpreadsheet size={16} /> Export Excel
          </button>
          <Link
            href="/koperasi/anggota-baru"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700"
          >
            <Plus size={16} /> Tambah Anggota
          </Link>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 p-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center border border-slate-300 rounded-xl overflow-hidden bg-white flex-1 min-w-[200px]">
          <Search size={14} className="ml-2.5 text-slate-400 shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Cari nama atau NIK..."
            className="w-full px-2 py-2 text-xs outline-none"
          />
        </div>
        <select
          value={cabangFilter}
          onChange={(e) => { setCabangFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white outline-none"
          aria-label="Filter cabang"
        >
          <option value="">Semua Cabang</option>
          {cabangOptions.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select
          value={tujuanFilter}
          onChange={(e) => setTujuanFilter(e.target.value)}
          className="px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white outline-none"
          aria-label="Filter tujuan keanggotaan"
        >
          <option value="">Semua Tujuan</option>
          <option value="Simpanan / Tabungan">Simpanan / Tabungan</option>
          <option value="Pembiayaan / Pinjaman">Pembiayaan / Pinjaman</option>
        </select>
        <div className="relative">
          <button
            type="button"
            onClick={() => setPickerOpen((o) => !o)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <Columns3 size={14} /> Kolom
          </button>
          {pickerOpen && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setPickerOpen(false)} />
              <div className="absolute right-0 z-30 mt-1 w-56 bg-white border border-slate-200 rounded-xl shadow-lg p-2">
                {kolomBody}
              </div>
            </>
          )}
        </div>
        <div className="inline-flex items-center rounded-xl border border-slate-300 bg-white p-0.5">
          <button
            type="button"
            onClick={() => changeView('table')}
            className={view === 'table'
              ? 'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold'
              : 'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-slate-600 text-xs font-medium hover:bg-slate-50'}
          >
            <Table2 size={14} /> Tabel
          </button>
          <button
            type="button"
            onClick={() => changeView('card')}
            className={view === 'card'
              ? 'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold'
              : 'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-slate-600 text-xs font-medium hover:bg-slate-50'}
          >
            <LayoutGrid size={14} /> Kartu
          </button>
        </div>
      </div>

      {view === 'table' ? (
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
          <table className="w-full min-w-[900px] text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                {COLUMNS.filter((c) => visible.has(c.key)).map((c) => (
                  <th key={c.key} className="text-left px-3 py-2.5 font-semibold text-slate-600 whitespace-nowrap">
                    <button type="button" onClick={() => toggleSort(c.key)} className="inline-flex items-center gap-1 hover:text-blue-700">
                      {c.label}
                      {sortKey === c.key && <span className="text-blue-600">{sortDir === 'asc' ? '▲' : '▼'}</span>}
                    </button>
                  </th>
                ))}
                <th className="text-right px-3 py-2.5 font-semibold text-slate-600 w-12">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={visible.size + 1} className="px-3 py-10 text-center text-slate-500">
                    <Loader2 size={18} className="animate-spin inline mr-2" /> Memuat daftar anggota...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={visible.size + 1} className="px-3 py-10 text-center text-slate-500">
                    {total === 0 ? 'Belum ada anggota. Tambah anggota pertama lewat tombol di atas.' : 'Tidak ada anggota yang cocok dengan filter.'}
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                    {COLUMNS.filter((c) => visible.has(c.key)).map((c) => (
                      <td key={c.key} className="px-3 py-2.5 text-slate-700 whitespace-nowrap">
                        {cell(r, c.key)}
                      </td>
                    ))}
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      <button type="button" onClick={() => setDetail(r)} aria-label="Lihat detail" className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800">
                        <Eye size={16} />
                      </button>
                      <button type="button" onClick={() => router.push(`/koperasi/anggota-baru/${r.id}`)} aria-label="Edit" className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800">
                        <Pencil size={16} />
                      </button>
                      <button type="button" onClick={() => setKirimTarget(r)} aria-label="Kirim JSON" className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-emerald-700">
                        <Send size={16} />
                      </button>
                      <button type="button" onClick={() => { setDeleteError(''); setPendingDelete(r); }} aria-label="Hapus" className="p-1.5 rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600">
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {loading ? (
            <div className="bg-white rounded-xl border border-slate-200 p-6 text-center text-xs text-slate-500 sm:col-span-2">
              <Loader2 size={18} className="animate-spin inline mr-2" /> Memuat daftar anggota...
            </div>
          ) : filtered.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-6 text-center text-xs text-slate-500 sm:col-span-2">
              {total === 0 ? 'Belum ada anggota. Tambah anggota pertama lewat tombol di atas.' : 'Tidak ada anggota yang cocok dengan filter.'}
            </div>
          ) : (
            filtered.map((r) => (
              <div key={r.id} className="bg-white rounded-xl border border-slate-200 p-4 space-y-1.5">
                <div className="flex items-center gap-2">
                  {r.fotoAnggota ? (
                    <img src={r.fotoAnggota} alt={r.namaLengkap} className="w-10 h-10 rounded-full object-cover border border-slate-200 shrink-0" />
                  ) : (
                    <span className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center justify-center shrink-0">
                      {initials(r.namaLengkap)}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-800 truncate">{r.namaLengkap}</p>
                    <p className="text-[11px] text-slate-500 font-mono">{r.nik}</p>
                  </div>
                </div>
                {COLUMNS.filter((c) => visible.has(c.key) && c.key !== 'nama' && c.key !== 'nik').map((c) => (
                  <div key={c.key} className="flex gap-2 text-xs">
                    <span className="w-28 shrink-0 text-slate-500">{c.label}</span>
                    <span className="flex-1 text-slate-800 break-words">{cell(r, c.key)}</span>
                  </div>
                ))}
                <div className="flex gap-2 pt-2 border-t border-slate-100">
                  <button type="button" onClick={() => setDetail(r)} className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50">
                    <Eye size={13} /> Detail
                  </button>
                  <button type="button" onClick={() => router.push(`/koperasi/anggota-baru/${r.id}`)} className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50">
                    <Pencil size={13} /> Edit
                  </button>
                  <button type="button" onClick={() => { setDeleteError(''); setPendingDelete(r); }} className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg border border-red-200 text-xs font-medium text-red-600 hover:bg-red-50">
                    <Trash2 size={13} /> Hapus
                  </button>
                </div>
                <button type="button" onClick={() => setKirimTarget(r)} className="w-full inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg border border-emerald-200 text-xs font-semibold text-emerald-700 hover:bg-emerald-50">
                  <Send size={13} /> Kirim JSON
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* Pagination */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          Halaman {page} dari {totalPages} · {total.toLocaleString('id-ID')} anggota
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <ChevronLeft size={14} /> Sebelumnya
          </button>
          <button
            type="button"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Berikutnya <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {kirimTarget && (
        <KirimJsonModal
          open={!!kirimTarget}
          onClose={() => setKirimTarget(null)}
          payload={buildAnggotaJson(kirimTarget)}
          anggotaId={kirimTarget.id}
        />
      )}

      {detail && (
        <div
          className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setDetail(null)}
        >
          <div className="w-full max-w-2xl bg-white rounded-2xl my-auto" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {detail.fotoAnggota ? (
                  <img src={detail.fotoAnggota} alt={detail.namaLengkap} className="w-11 h-11 rounded-full object-cover border border-slate-200" />
                ) : (
                  <span className="w-11 h-11 rounded-full bg-emerald-100 text-emerald-700 text-sm font-bold flex items-center justify-center">
                    {initials(detail.namaLengkap)}
                  </span>
                )}
                <div>
                  <h2 className="text-base font-bold text-slate-800">{detail.namaLengkap}</h2>
                  <p className="text-xs text-slate-500">
                    NIK {detail.nik} · {detail.cabang || '-'}
                  </p>
                </div>
              </div>
              <button type="button" onClick={() => setDetail(null)} className="p-1.5 text-slate-500 hover:text-slate-800">
                <X size={18} />
              </button>
            </div>
            <div className="px-5 py-4 space-y-5 text-xs">
              <section>
                <h3 className="text-xs font-bold text-emerald-700 border-b border-slate-200 pb-1.5 mb-3">A. Data Identitas Pribadi</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                  {(
                    [
                      ['Tempat, Tanggal Lahir', `${detail.tempatLahir || '-'}, ${detail.tanggalLahir || '-'}`],
                      ['Jenis Kelamin', detail.jenisKelamin || '-'],
                      ['Alamat Sesuai KTP', detail.alamatKtp || '-'],
                      ['No HP/WhatsApp', detail.noHp || '-'],
                      ['Nama Ibu Kandung', detail.namaIbuKandung || '-'],
                    ] as Array<[string, string]>
                  ).map(([label, val]) => (
                    <div key={label}>
                      <span className="block text-[11px] font-semibold text-slate-500">{label}</span>
                      <span className="text-slate-800">{val}</span>
                    </div>
                  ))}
                </div>
              </section>
              <section>
                <h3 className="text-xs font-bold text-emerald-700 border-b border-slate-200 pb-1.5 mb-3">B. Data Pekerjaan &amp; Keuangan (KYC)</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                  {(
                    [
                      ['Pekerjaan', detail.pekerjaan || '-'],
                      ['Status Perkawinan', detail.statusPerkawinan || '-'],
                      ['Perkiraan Penghasilan/Bulan', detail.penghasilanBulanan || '-'],
                      ['Tujuan Keanggotaan', detail.tujuanKeanggotaan || '-'],
                    ] as Array<[string, string]>
                  ).map(([label, val]) => (
                    <div key={label}>
                      <span className="block text-[11px] font-semibold text-slate-500">{label}</span>
                      <span className="text-slate-800">{val}</span>
                    </div>
                  ))}
                </div>
              </section>
              {(detail.fotoKtp || detail.fotoAnggota || detail.tandaTangan) && (
                <section>
                  <h3 className="text-xs font-bold text-emerald-700 border-b border-slate-200 pb-1.5 mb-3">C. Dokumen Tambahan &amp; Tanda Tangan</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {detail.fotoKtp && (
                      <FotoDenganAksi
                        src={detail.fotoKtp}
                        label="KTP"
                        fileName={fotoFileName('KTP', detail.fotoKtp)}
                        bg="bg-slate-50"
                        onFullscreen={() => setLightbox({ src: detail.fotoKtp, label: 'KTP' })}
                      />
                    )}
                    {detail.fotoAnggota && (
                      <FotoDenganAksi
                        src={detail.fotoAnggota}
                        label="Foto Anggota"
                        fileName={fotoFileName('Foto-Anggota', detail.fotoAnggota)}
                        bg="bg-slate-50"
                        onFullscreen={() => setLightbox({ src: detail.fotoAnggota, label: 'Foto Anggota' })}
                      />
                    )}
                    {detail.tandaTangan && (
                      <FotoDenganAksi
                        src={detail.tandaTangan}
                        label="Tanda Tangan"
                        fileName={fotoFileName('Tanda-Tangan', detail.tandaTangan)}
                        bg="bg-white"
                        onFullscreen={() => setLightbox({ src: detail.tandaTangan, label: 'Tanda Tangan' })}
                      />
                    )}
                  </div>
                </section>
              )}
              <section>
                <h3 className="text-xs font-bold text-emerald-700 border-b border-slate-200 pb-1.5 mb-3">Persetujuan &amp; Status</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                  {(
                    [
                      ['Mobile Banking', detail.setujuMobileBanking ? 'Bersedia' : 'Tidak'],
                      ['Pernyataan Data Benar & Patuh AD/ART', detail.setujuPernyataan ? 'Disetujui' : 'Belum disetujui'],
                      ['Tanggal Daftar', detail.createdAt ? new Date(detail.createdAt).toLocaleString('id-ID') : '-'],
                    ] as Array<[string, string]>
                  ).map(([label, val]) => (
                    <div key={label}>
                      <span className="block text-[11px] font-semibold text-slate-500">{label}</span>
                      <span className="text-slate-800">{val}</span>
                    </div>
                  ))}
                  <div>
                    <span className="block text-[11px] font-semibold text-slate-500">Status Produk</span>
                    <span className="inline-flex items-center gap-2">
                      Simpanan {badge(detail.hasSimpanan)} Pinjaman {badge(detail.hasPinjaman)}
                    </span>
                  </div>
                </div>
              </section>
            </div>
            <div className="px-5 py-3 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setDetail(null);
                  router.push(`/koperasi/anggota-baru/${detail.id}`);
                }}
                className="px-3 py-2 rounded-lg bg-blue-600 text-xs font-medium text-white hover:bg-blue-700"
              >
                Edit Anggota
              </button>
              <button
                type="button"
                onClick={() => setDetail(null)}
                className="px-3 py-2 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {lightbox && (
        <div
          className="fixed inset-0 z-[130] bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <div className="absolute top-3 right-3 flex gap-2">
            <a
              href={lightbox.src}
              download={fotoFileName(lightbox.label, lightbox.src)}
              className="p-2.5 rounded-full bg-white text-slate-700 shadow hover:bg-slate-100"
              title="Unduh foto"
              aria-label={`Unduh ${lightbox.label}`}
              onClick={(e) => e.stopPropagation()}
            >
              <Download size={18} />
            </a>
            <button
              type="button"
              onClick={() => setLightbox(null)}
              className="p-2.5 rounded-full bg-white text-slate-700 shadow hover:bg-slate-100"
              title="Tutup"
              aria-label="Tutup fullscreen"
            >
              <X size={18} />
            </button>
          </div>
          <img
            src={lightbox.src}
            alt={lightbox.label}
            className="max-w-full max-h-[90vh] object-contain rounded-xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {pendingDelete && (
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-2xl p-5">
            <h2 className="text-base font-bold text-slate-800">Hapus anggota?</h2>
            <p className="mt-1 text-sm text-slate-600">
              {pendingDelete.namaLengkap} (NIK {pendingDelete.nik}) akan dihapus permanen beserta foto dan tanda tangannya.
            </p>
            {deleteError && (
              <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{deleteError}</p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setPendingDelete(null)}
                className="px-3 py-2 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={doDelete}
                className="px-3 py-2 rounded-lg bg-red-600 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? 'Menghapus...' : 'Ya, Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
