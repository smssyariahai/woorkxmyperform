'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Avatar, Badge, CardTitle } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { Input, Field } from '@/components/ui/input';
import { SearchInput, Pagination } from '@/components/ui/search';
import { EmptyState, ErrorState, Skeleton, NoResults } from '@/components/ui/states';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { customerSchema } from '@/lib/validation';
import { maskPhone, timeAgo, cn } from '@/lib/utils';
import { Plus, Pencil, Trash2, KanbanSquare, CalendarClock, FileDown } from 'lucide-react';
import { z } from 'zod';

type CustomerForm = z.infer<typeof customerSchema>;

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  company: string | null;
  stage: string;
  score: string | null;
  owner: { id: string; name: string } | null;
  tags: Array<{ id: string; name: string }>;
  channel: string | null;
  updatedAt: string;
}

const STAGES = ['Baru', 'Dihubungi', 'Terkualifikasi', 'Proposal', 'Negosiasi', 'Pelanggan'];

/** Unduh CSV lewat fetch agar 403 (tanpa CRM_EXPORT) tampil sebagai toast, bukan halaman JSON. */
async function downloadExport() {
  try {
    const r = await fetch('/api/customers/export');
    if (!r.ok) {
      const j = await r.json().catch(() => null);
      throw new Error(j?.message || 'Gagal mengekspor.');
    }
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'pelanggan.csv'; a.click();
    URL.revokeObjectURL(url);
  } catch (e: any) { toast.error(e.message || 'Gagal mengekspor.'); }
}

export function CrmClient() {
  const [items, setItems] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [stage, setStage] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [deleting, setDeleting] = useState<Customer | null>(null);
  const [busy, setBusy] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CustomerForm>({ resolver: zodResolver(customerSchema) });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page), perPage: '10' });
      if (q.trim()) params.set('q', q.trim());
      if (stage) params.set('stage', stage);
      const r = await fetch(`/api/customers?${params}`);
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      setItems(j.data.items);
      setTotalPages(j.data.totalPages);
      setTotal(j.data.total);
    } catch (e: any) {
      setError(e.message || 'Gagal memuat pelanggan.');
    } finally {
      setLoading(false);
    }
  }, [page, q, stage]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [q, stage]);

  function openCreate() {
    setEditing(null);
    reset({ name: '', phone: '', email: '', company: '', stage: 'Baru' });
    setModalOpen(true);
  }

  function openEdit(c: Customer) {
    setEditing(c);
    reset({
      name: c.name,
      phone: c.phone ?? '',
      email: c.email ?? '',
      company: c.company ?? '',
      stage: c.stage,
      score: (c.score as any) ?? undefined,
    });
    setModalOpen(true);
  }

  async function onSubmit(data: CustomerForm) {
    try {
      const r = await fetch(editing ? `/api/customers/${editing.id}` : '/api/customers', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success(editing ? 'Pelanggan diperbarui.' : 'Pelanggan ditambahkan.');
      setModalOpen(false);
      load();
    } catch (e: any) {
      toast.error(e.message || 'Gagal menyimpan.');
    }
  }

  async function doDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/customers/${deleting.id}`, { method: 'DELETE' });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success('Pelanggan dihapus.');
      setDeleting(null);
      load();
    } catch (e: any) {
      toast.error(e.message || 'Gagal menghapus.');
    } finally {
      setBusy(false);
    }
  }

  const hasFilter = q.trim() !== '' || stage !== '';

  return (
    <div className="max-w-[1400px] mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-ink">CRM</h1>
          <p className="text-sm text-muted">{total} pelanggan terdaftar</p>
        </div>
        <div className="flex gap-2">
          <Link href="/crm/leads" className="btn-secondary">
            <KanbanSquare className="h-4 w-4" /> Kanban Lead
          </Link>
          <button onClick={downloadExport} className="btn-secondary">
            <FileDown className="h-4 w-4" /> Ekspor CSV
          </button>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> Tambah Pelanggan
          </Button>
        </div>
      </div>

      <div className="card !p-4">
        <div className="flex flex-wrap gap-3">
          <SearchInput placeholder="Cari nama, telepon, email…" onChange={setQ} className="flex-1 min-w-[220px]" />
          <select
            value={stage}
            onChange={(e) => setStage(e.target.value)}
            className="input !w-auto"
            aria-label="Filter tahap"
          >
            <option value="">Semua tahap</option>
            {STAGES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="table-wrap p-4 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : error ? (
        <div className="card"><ErrorState message={error} onRetry={load} /></div>
      ) : items.length === 0 ? (
        <div className="card">
          {hasFilter ? (
            <NoResults onClear={() => { setQ(''); setStage(''); }} />
          ) : (
            <EmptyState
              title="Belum ada pelanggan"
              description="Tambahkan pelanggan pertama Anda untuk mulai mengelola relasi."
              action={<Button onClick={openCreate}><Plus className="h-4 w-4" /> Tambah Pelanggan</Button>}
            />
          )}
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Nama</th>
                <th>Kontak</th>
                <th>Tahap</th>
                <th>Pemilik</th>
                <th>Aktivitas Terakhir</th>
                <th className="!text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/crm/customers/${c.id}`} className="flex items-center gap-2.5 group">
                      <Avatar name={c.name} size={34} />
                      <span>
                        <span className="block font-semibold text-ink group-hover:text-brand group-hover:underline">
                          {c.name}
                        </span>
                        {c.company && <span className="block text-[12px] text-muted">{c.company}</span>}
                      </span>
                    </Link>
                  </td>
                  <td>
                    <span className="block text-[13px] text-ink">{maskPhone(c.phone)}</span>
                    {c.email && <span className="block text-[12px] text-muted">{c.email}</span>}
                  </td>
                  <td>
                    <Badge tone="blue">{c.stage}</Badge>
                    {c.score && (
                      <Badge tone={c.score === 'Tinggi' ? 'green' : 'amber'} className="ml-1.5">
                        {c.score}
                      </Badge>
                    )}
                  </td>
                  <td className="text-[13px] text-muted">{c.owner?.name ?? '-'}</td>
                  <td className="text-[13px] text-muted">{timeAgo(c.updatedAt)}</td>
                  <td>
                    <div className="flex justify-end gap-1">
                      <button
                        className="btn-ghost !px-2 !py-1.5"
                        onClick={() => openEdit(c)}
                        aria-label={`Ubah ${c.name}`}
                        title="Ubah"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        className="btn-ghost !px-2 !py-1.5 !text-danger"
                        onClick={() => setDeleting(c)}
                        aria-label={`Hapus ${c.name}`}
                        title="Hapus"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={page} totalPages={totalPages} onPage={setPage} />
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Ubah Pelanggan' : 'Tambah Pelanggan'}>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Nama lengkap" error={errors.name?.message}>
              <Input placeholder="Bu Sari" {...register('name')} />
            </Field>
            <Field label="Nomor WhatsApp" error={errors.phone?.message}>
              <Input placeholder="62812xxxxxxx" {...register('phone')} />
            </Field>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Email" optional error={errors.email?.message}>
              <Input type="email" placeholder="nama@email.com" {...register('email')} />
            </Field>
            <Field label="Perusahaan" optional>
              <Input placeholder="Toko Kue Sari" {...register('company')} />
            </Field>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Tahap">
              <select className="input" {...register('stage')}>
                {STAGES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field label="Skor" optional>
              <select className="input" {...register('score')}>
                <option value="">-</option>
                {['Tinggi', 'Sedang', 'Rendah'].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </Field>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Usaha" optional>
              <Input placeholder="Toko kue" {...register('business')} />
            </Field>
            <Field label="Minat" optional>
              <Input placeholder="Paket Pro" {...register('interest')} />
            </Field>
          </div>
          <Field label="Anggaran" optional>
            <Input placeholder="Rp 5 juta/bulan" {...register('budget')} />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>
              Batal
            </button>
            <Button type="submit" loading={isSubmitting}>
              {editing ? 'Simpan Perubahan' : 'Tambah Pelanggan'}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={doDelete}
        loading={busy}
        title="Hapus pelanggan"
        message={`Yakin ingin menghapus ${deleting?.name}? Semua data terkait (percakapan, lead, follow up) ikut terhapus.`}
        confirmLabel="Ya, hapus"
      />
    </div>
  );
}
