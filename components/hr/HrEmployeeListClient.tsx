'use client';

// Daftar seluruh karyawan (HR Detail) — /hr/detail.
// Pola: components/hr/HrClient.tsx (EmployeeTab) + halaman /tiket.
// Filter HANYA yang didukung field HrEmployee yang benar-benar ada:
// pencarian nama/NIK/no. karyawan/jabatan, status, dan departemen
// (teks bebas — pilihan diisi dari nilai yang ada di data).
// TIDAK ADA filter cabang: HrEmployee tidak punya field cabang.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/primitives';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { Search, Plus, Users, Pencil, Trash2, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { friendlyFetchError } from '@/lib/fetch-error';
import { EmployeeModal } from '@/components/hr/HrClient';
import {
  listEmployees,
  deleteEmployee,
  type HrEmployeeItem,
} from '@/lib/hr/client';

const EMP_STATUS: Record<string, { label: string; cls: string }> = {
  AKTIF: { label: 'Aktif', cls: 'badge-green' },
  CUTI: { label: 'Cuti', cls: 'badge-amber' },
  NONAKTIF: { label: 'Nonaktif', cls: 'badge' },
};

const tgl = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export function HrEmployeeListClient() {
  const [items, setItems] = useState<HrEmployeeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [department, setDepartment] = useState('');
  const [showEmployee, setShowEmployee] = useState<any>(null); // null | {} | item
  const [busy, setBusy] = useState('');

  async function load() {
    setLoading(true);
    setErr('');
    try {
      const d = await listEmployees({ q, status, department });
      setItems(d.items);
    } catch (e: any) {
      setErr(friendlyFetchError(e, 'Gagal memuat daftar karyawan.'));
    } finally {
      setLoading(false);
    }
  }

  // Muat ulang saat filter berubah (debounce pencarian 300ms).
  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, status, department]);

  // Pilihan departemen = nilai distinct yang benar-benar ada di data
  // (HrEmployee.department teks bebas, bukan FK ke model Department).
  const departments = useMemo(() => {
    const set = new Set<string>();
    items.forEach((e) => {
      if (e.department?.trim()) set.add(e.department.trim());
    });
    return [...set].sort((a, b) => a.localeCompare(b, 'id'));
  }, [items]);

  const stats = useMemo(
    () => ({
      total: items.length,
      aktif: items.filter((e) => e.status === 'AKTIF').length,
      cuti: items.filter((e) => e.status === 'CUTI').length,
    }),
    [items]
  );

  async function remove(e: HrEmployeeItem) {
    if (!confirm(`Hapus karyawan "${e.name}"? Kontrak terkait ikut terhapus.`)) return;
    setBusy(e.id);
    try {
      await deleteEmployee(e.id);
      toast.success(`Karyawan "${e.name}" dihapus.`);
      await load();
    } catch (err: any) {
      toast.error(friendlyFetchError(err, 'Gagal menghapus.'));
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="w-full min-w-0 max-w-[1400px] mx-auto space-y-4 sm:space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-white">
          <Users className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg sm:text-xl font-bold text-ink">HR Detail — Daftar Karyawan</h1>
          <p className="text-[13px] text-muted">
            {loading ? 'Memuat…' : `${stats.total} karyawan · ${stats.aktif} aktif · ${stats.cuti} cuti`}
          </p>
        </div>
        <Link href="/hr" className="btn-secondary">← Kembali ke HR</Link>
        <button onClick={() => setShowEmployee({})} className="btn-primary">
          <Plus className="h-4 w-4" /> Tambah karyawan
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari nama / NIK / no. karyawan / jabatan…"
            className="input !pl-9"
          />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="input !w-auto">
          <option value="">Semua status</option>
          <option value="AKTIF">Aktif</option>
          <option value="CUTI">Cuti</option>
          <option value="NONAKTIF">Nonaktif</option>
        </select>
        <select value={department} onChange={(e) => setDepartment(e.target.value)} className="input !w-auto">
          <option value="">Semua departemen</option>
          {departments.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </div>

      {err ? (
        <Card><ErrorState message={err} onRetry={load} /></Card>
      ) : loading ? (
        <Card className="!p-0 overflow-hidden">
          <div className="p-5 space-y-3">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-1/2" />
          </div>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Users className="h-7 w-7" />}
            title="Belum ada karyawan"
            description={
              q || status || department
                ? 'Tidak ada karyawan yang cocok dengan pencarian/filter. Coba ubah kata kunci atau filter.'
                : 'Tambah karyawan pertama dari tombol di atas, atau terima kandidat di tab Pipeline Rekrutmen.'
            }
            action={
              <button onClick={() => setShowEmployee({})} className="btn-primary">
                <Plus className="h-4 w-4" /> Tambah karyawan
              </button>
            }
          />
        </Card>
      ) : (
        <Card className="!p-0 overflow-hidden">
          <div className="table-wrap !border-0 !rounded-none">
            <table className="table">
              <thead>
                <tr>
                  <th>No. Karyawan</th>
                  <th>Nama</th>
                  <th>NIK</th>
                  <th>Jabatan</th>
                  <th>Departemen</th>
                  <th>Bergabung</th>
                  <th>Kontrak</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((e) => {
                  const latest = e.contracts?.[0];
                  return (
                    <tr key={e.id}>
                      <td className="font-mono text-[13px]">{e.employeeNo}</td>
                      <td className="font-medium text-ink">{e.name}</td>
                      <td className="text-muted font-mono text-[13px]">{e.nik || '—'}</td>
                      <td className="text-muted">{e.position}</td>
                      <td className="text-muted">{e.department || '—'}</td>
                      <td className="text-muted">{tgl(e.joinDate)}</td>
                      <td>
                        {latest ? (
                          <span className={latest.type === 'PKWTT' ? 'badge-green' : 'badge-blue'}>{latest.type}</span>
                        ) : (
                          <span className="text-muted text-[12px]">Belum ada</span>
                        )}
                      </td>
                      <td>
                        <span className={EMP_STATUS[e.status]?.cls || 'badge'}>
                          {EMP_STATUS[e.status]?.label || e.status}
                        </span>
                      </td>
                      <td className="text-right whitespace-nowrap">
                        <Link
                          href={`/hr/detail/${e.id}`}
                          className="btn-ghost !py-1 !px-2 text-[12.5px] text-brand"
                        >
                          Detail <ChevronRight className="h-3.5 w-3.5" />
                        </Link>
                        <button
                          onClick={() => setShowEmployee(e)}
                          className="btn-ghost !py-1 !px-2 text-[12.5px]"
                          title="Ubah"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => remove(e)}
                          disabled={busy === e.id}
                          className="btn-ghost !py-1 !px-2 text-red-600 text-[12.5px]"
                          title="Hapus"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <p className="text-[12px] text-muted">
        Menampilkan {items.length} karyawan (maks 200). Filter cabang tidak tersedia — data karyawan tidak memiliki field cabang.
      </p>

      <EmployeeModal
        open={showEmployee !== null}
        initial={showEmployee}
        onClose={() => setShowEmployee(null)}
        onSaved={load}
      />
    </div>
  );
}
