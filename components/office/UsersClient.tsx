'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Card, CardTitle, Badge } from '@/components/ui/primitives';
import { Field } from '@/components/ui/input';
import { Input } from '@/components/ui/input';
import { SearchInput, Pagination } from '@/components/ui/search';
import { Plus, Pencil, Power, KeyRound, UserCog, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Member {
  id: string;
  user: { id: string; name: string; email: string; phone: string | null; status: string; isSuperAdmin: boolean };
  role: { id: string; name: string };
  department: { id: string; name: string } | null;
  jobTitle: string | null;
  status: string;
}

export function UsersClient({ perms, isSuperAdmin, currentUserId }: { perms: string[]; isSuperAdmin: boolean; currentUserId: string }) {
  const [items, setItems] = useState<Member[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [depts, setDepts] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [roleId, setRoleId] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [modal, setModal] = useState<null | 'role' | 'reset' | 'super'>(null);
  const [sel, setSel] = useState<Member | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', roleId: '', departmentId: '', jobTitle: '' });

  const can = (...ks: string[]) => perms.includes('*') || ks.some((k) => perms.includes(k));

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), perPage: '15' });
    if (q.trim()) params.set('q', q.trim());
    if (roleId) params.set('roleId', roleId);
    if (status) params.set('status', status);
    const r = await fetch(`/api/admin/users?${params}`);
    const j = await r.json();
    if (j.success) {
      setItems(j.data.items);
      setTotalPages(j.data.totalPages);
    }
  }, [page, q, roleId, status]);

  const loadRefs = useCallback(async () => {
    const [rr, dd] = await Promise.all([
      fetch('/api/admin/roles').then((r) => r.json()).catch(() => null),
      fetch('/api/admin/departments').then((r) => r.json()).catch(() => null),
    ]);
    if (rr?.success) setRoles(rr.data);
    if (dd?.success) setDepts(dd.data);
  }, []);

  useEffect(() => { loadRefs(); }, [loadRefs]);
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  async function toggleActive(m: Member) {
    const active = m.status !== 'ACTIVE';
    if (!confirm(`${active ? 'Aktifkan' : 'Nonaktifkan'} akun ${m.user.name}?`)) return;
    try {
      const r = await fetch(`/api/admin/users/${m.id}/deactivate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success(`Akun ${active ? 'diaktifkan' : 'dinonaktifkan'}.`);
      load();
    } catch (e: any) {
      toast.error(e.message || 'Gagal mengubah status.');
    }
  }

  async function submitRole() {
    if (!sel || !form.roleId) return;
    if (!confirm(`Ubah role ${sel.user.name} menjadi ${roles.find((r) => r.id === form.roleId)?.name}?`)) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/users/${sel.id}/role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roleId: form.roleId }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success('Role diperbarui.');
      setModal(null);
      load();
    } catch (e: any) {
      toast.error(e.message || 'Gagal mengubah role.');
    } finally {
      setBusy(false);
    }
  }

  async function submitSuper() {
    if (!sel) return;
    const target = !sel.user.isSuperAdmin;
    if (!confirm(target
      ? `Jadikan ${sel.user.name} sebagai Administrator Pusat?\n\nIa akan mendapat akses penuh: semua kantor, paket & billing, Saldo Master, Pengaturan Sistem, dan hapus kantor.`
      : `Cabut status Administrator Pusat dari ${sel.user.name}?\n\nIa kehilangan akses ke semua menu pusat (kelola kantor, billing, Saldo Master, Pengaturan Sistem).`)) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/users/${sel.id}/super-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isSuperAdmin: target }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success(target ? `${sel.user.name} kini Administrator Pusat.` : `Status Administrator Pusat ${sel.user.name} dicabut.`);
      setModal(null);
      load();
    } catch (e: any) {
      toast.error(e.message || 'Gagal mengubah status Administrator Pusat.');
    } finally {
      setBusy(false);
    }
  }

  async function submitReset() {
    if (!sel || form.password.length < 8) {
      toast.error('Password minimal 8 karakter.');
      return;
    }
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/users/${sel.id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: form.password }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success('Password direset.');
      setModal(null);
    } catch (e: any) {
      toast.error(e.message || 'Gagal me-reset password.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-ink">Pengguna</h1>
          <p className="text-sm text-muted">Kelola akun karyawan di kantor ini.</p>
        </div>
        {can('USERS_CREATE') && (
          <Link href="/admin-kantor/users/new" className="btn-primary !py-2 text-[13px]">
            <Plus className="h-4 w-4" /> Tambah Pengguna
          </Link>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="w-64"><SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Cari nama / email…" /></div>
        <select value={roleId} onChange={(e) => { setRoleId(e.target.value); setPage(1); }} className="input !w-auto">
          <option value="">Semua role</option>
          {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="input !w-auto">
          <option value="">Semua status</option>
          <option value="ACTIVE">Aktif</option>
          <option value="INACTIVE">Nonaktif</option>
        </select>
      </div>

      <Card className="!p-0 overflow-x-auto">
        <table className="table">
          <thead>
            <tr><th>Nama</th><th>Email</th><th>Role</th><th>Divisi</th><th>Jabatan</th><th>Status</th><th className="!text-right">Aksi</th></tr>
          </thead>
          <tbody>
            {items.map((m) => (
              <tr key={m.id}>
                <td className="font-medium text-ink">{m.user.name}</td>
                <td className="text-muted">{m.user.email}</td>
                <td>
                  <span className="inline-flex flex-wrap gap-1">
                    <Badge tone="blue">{m.role.name}</Badge>
                    {m.user.isSuperAdmin && <Badge tone="amber">Administrator Pusat</Badge>}
                  </span>
                </td>
                <td className="text-muted">{m.department?.name ?? '—'}</td>
                <td className="text-muted">{m.jobTitle ?? '—'}</td>
                <td><Badge tone={m.status === 'ACTIVE' ? 'green' : 'gray'}>{m.status === 'ACTIVE' ? 'Aktif' : 'Nonaktif'}</Badge></td>
                <td className="!text-right">
                  <span className="inline-flex gap-1 justify-end">
                    {can('USERS_UPDATE') && (
                      <Link href={`/admin-kantor/users/${m.id}`} title="Edit" className="rounded-btn p-2 text-muted hover:bg-slate-100 hover:text-ink"><Pencil className="h-4 w-4" /></Link>
                    )}
                    {can('USERS_ASSIGN_ROLE') && (
                      <button onClick={() => { setSel(m); setForm((f) => ({ ...f, roleId: m.role.id })); setModal('role'); }} title="Ubah role" className="rounded-btn p-2 text-muted hover:bg-slate-100 hover:text-ink"><UserCog className="h-4 w-4" /></button>
                    )}
                    {isSuperAdmin && (
                      <button onClick={() => { setSel(m); setModal('super'); }} title="Administrator Pusat" className={cn('rounded-btn p-2 transition-colors', m.user.isSuperAdmin ? 'text-amber-500 hover:bg-amber-50' : 'text-muted hover:bg-slate-100 hover:text-ink')}><ShieldCheck className="h-4 w-4" /></button>
                    )}
                    {can('USERS_UPDATE') && (
                      <button onClick={() => { setSel(m); setForm((f) => ({ ...f, password: '' })); setModal('reset'); }} title="Reset password" className="rounded-btn p-2 text-muted hover:bg-slate-100 hover:text-ink"><KeyRound className="h-4 w-4" /></button>
                    )}
                    {can('USERS_DEACTIVATE') && (
                      <button
                        onClick={() => toggleActive(m)}
                        title={m.status === 'ACTIVE' ? 'Nonaktifkan' : 'Aktifkan'}
                        className={cn('rounded-btn p-2 transition-colors', m.status === 'ACTIVE' ? 'text-muted hover:bg-red-50 hover:text-danger' : 'text-muted hover:bg-emerald-50 hover:text-emerald-600')}
                      >
                        <Power className="h-4 w-4" />
                      </button>
                    )}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && <p className="text-sm text-muted text-center py-8">Tidak ada pengguna.</p>}
        <Pagination page={page} totalPages={totalPages} onPage={setPage} />
      </Card>

      {/* Modal ubah role */}
      {modal === 'role' && sel && (
        <Modal title={`Ubah Role — ${sel.user.name}`} onClose={() => setModal(null)}>
          <Field label="Role baru">
            <select value={form.roleId} onChange={(e) => setForm({ ...form, roleId: e.target.value })} className="input">
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </Field>
          <p className="text-[12.5px] text-muted mt-3">Permission yang diberikan mengikuti role baru. Perubahan berlaku pada permintaan berikutnya.</p>
          <ModalFoot onClose={() => setModal(null)} onSave={submitRole} busy={busy} saveLabel="Ubah Role" />
        </Modal>
      )}

      {/* Modal Administrator Pusat */}
      {modal === 'super' && sel && (
        <Modal title={`Administrator Pusat — ${sel.user.name}`} onClose={() => setModal(null)}>
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted">Status saat ini:</span>
              {sel.user.isSuperAdmin
                ? <Badge tone="amber">Administrator Pusat</Badge>
                : <Badge tone="gray">Bukan Administrator Pusat</Badge>}
            </div>
            <p className="text-[13px] text-muted leading-relaxed">
              Administrator Pusat adalah status global akun (berlaku di semua kantor, terpisah dari role kantor).
              Pemegangnya dapat membuka menu pusat: kelola semua kantor, paket &amp; billing, Saldo Master,
              Pengaturan Sistem, dan menghapus kantor.
            </p>
            {sel.user.id === currentUserId && sel.user.isSuperAdmin && (
              <p className="text-[12.5px] text-amber-600 bg-amber-50 rounded-btn px-3 py-2">
                Ini akun Anda sendiri — statusnya tidak dapat dicabut dari sini agar Anda tidak terkunci dari akses pusat.
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setModal(null)} className="btn-ghost !py-2 text-[13px]">Batal</button>
            {!(sel.user.id === currentUserId && sel.user.isSuperAdmin) && (
              <button onClick={submitSuper} disabled={busy} className={cn('btn-primary !py-2 text-[13px]', !sel.user.isSuperAdmin ? '' : '!bg-red-600 hover:!bg-red-700')}>
                {busy ? 'Menyimpan…' : sel.user.isSuperAdmin ? 'Cabut Status' : 'Jadikan Administrator Pusat'}
              </button>
            )}
          </div>
        </Modal>
      )}

      {/* Modal reset password */}
      {modal === 'reset' && sel && (
        <Modal title={`Reset Password — ${sel.user.name}`} onClose={() => setModal(null)}>
          <Field label="Password baru (min. 8 karakter)">
            <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </Field>
          <p className="text-[12.5px] text-muted mt-3">Sesi aktif pengguna akan dicabut.</p>
          <ModalFoot onClose={() => setModal(null)} onSave={submitReset} busy={busy} saveLabel="Reset" />
        </Modal>
      )}
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-brand-900/45" onClick={onClose} />
      <div className="relative card w-full max-w-lg p-6 shadow-pop space-y-4 max-h-[90vh] overflow-y-auto">
        <CardTitle>{title}</CardTitle>
        {children}
      </div>
    </div>
  );
}

function ModalFoot({ onClose, onSave, busy, saveLabel }: { onClose: () => void; onSave: () => void; busy: boolean; saveLabel: string }) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <button onClick={onClose} className="btn-ghost !py-2 text-[13px]">Batal</button>
      <button onClick={onSave} disabled={busy} className="btn-primary !py-2 text-[13px]">
        {busy ? 'Menyimpan…' : saveLabel}
      </button>
    </div>
  );
}
