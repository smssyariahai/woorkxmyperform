'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardTitle, Badge } from '@/components/ui/primitives';
import { Field } from '@/components/ui/input';
import { Input } from '@/components/ui/input';
import { SearchInput, Pagination } from '@/components/ui/search';
import { Plus, Pencil, Power, KeyRound, UserCog } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Member {
  id: string;
  user: { id: string; name: string; email: string; phone: string | null; status: string };
  role: { id: string; name: string };
  department: { id: string; name: string } | null;
  jobTitle: string | null;
  status: string;
}

export function UsersClient({ perms }: { perms: string[] }) {
  const [items, setItems] = useState<Member[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [depts, setDepts] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [roleId, setRoleId] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [modal, setModal] = useState<null | 'add' | 'edit' | 'role' | 'reset'>(null);
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

  function openAdd() {
    setForm({ name: '', email: '', phone: '', password: '', roleId: '', departmentId: '', jobTitle: '' });
    setModal('add');
  }
  function openEdit(m: Member) {
    setSel(m);
    setForm({ name: m.user.name, email: m.user.email, phone: m.user.phone ?? '', password: '', roleId: m.role.id, departmentId: m.department?.id ?? '', jobTitle: m.jobTitle ?? '' });
    setModal('edit');
  }

  async function submitAdd() {
    if (!form.name.trim() || !form.email.trim() || !form.roleId) {
      toast.error('Nama, email, dan role wajib diisi.');
      return;
    }
    setBusy(true);
    try {
      const r = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          password: form.password,
          roleId: form.roleId,
          departmentId: form.departmentId || null,
          jobTitle: form.jobTitle.trim(),
        }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success('Pengguna ditambahkan.');
      setModal(null);
      load();
    } catch (e: any) {
      toast.error(e.message || 'Gagal menambah pengguna.');
    } finally {
      setBusy(false);
    }
  }

  async function submitEdit() {
    if (!sel) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/users/${sel.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          phone: form.phone.trim(),
          departmentId: form.departmentId || null,
          jobTitle: form.jobTitle.trim(),
        }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success('Data pengguna diperbarui.');
      setModal(null);
      load();
    } catch (e: any) {
      toast.error(e.message || 'Gagal menyimpan.');
    } finally {
      setBusy(false);
    }
  }

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
          <button onClick={openAdd} className="btn-primary !py-2 text-[13px]">
            <Plus className="h-4 w-4" /> Tambah Pengguna
          </button>
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
                <td><Badge tone="blue">{m.role.name}</Badge></td>
                <td className="text-muted">{m.department?.name ?? '—'}</td>
                <td className="text-muted">{m.jobTitle ?? '—'}</td>
                <td><Badge tone={m.status === 'ACTIVE' ? 'green' : 'gray'}>{m.status === 'ACTIVE' ? 'Aktif' : 'Nonaktif'}</Badge></td>
                <td className="!text-right">
                  <span className="inline-flex gap-1 justify-end">
                    {can('USERS_UPDATE') && (
                      <button onClick={() => openEdit(m)} title="Edit" className="rounded-btn p-2 text-muted hover:bg-slate-100 hover:text-ink"><Pencil className="h-4 w-4" /></button>
                    )}
                    {can('USERS_ASSIGN_ROLE') && (
                      <button onClick={() => { setSel(m); setForm((f) => ({ ...f, roleId: m.role.id })); setModal('role'); }} title="Ubah role" className="rounded-btn p-2 text-muted hover:bg-slate-100 hover:text-ink"><UserCog className="h-4 w-4" /></button>
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

      {/* Modal tambah */}
      {modal === 'add' && (
        <Modal title="Tambah Pengguna" onClose={() => setModal(null)}>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Nama lengkap *"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Email *"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="No. telepon"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field label="Password awal (opsional)"><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Kosongkan bila belum diset" /></Field>
            <Field label="Role *">
              <select value={form.roleId} onChange={(e) => setForm({ ...form, roleId: e.target.value })} className="input">
                <option value="">— Pilih role —</option>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </Field>
            <Field label="Divisi">
              <select value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })} className="input">
                <option value="">— Tanpa divisi —</option>
                {depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field>
            <Field label="Jabatan"><Input value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} placeholder="cth: Staff HR" /></Field>
          </div>
          <ModalFoot onClose={() => setModal(null)} onSave={submitAdd} busy={busy} saveLabel="Tambah" />
        </Modal>
      )}

      {/* Modal edit */}
      {modal === 'edit' && sel && (
        <Modal title={`Edit — ${sel.user.name}`} onClose={() => setModal(null)}>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Nama lengkap"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="No. telepon"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field label="Divisi">
              <select value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })} className="input">
                <option value="">— Tanpa divisi —</option>
                {depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field>
            <Field label="Jabatan"><Input value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} /></Field>
          </div>
          <ModalFoot onClose={() => setModal(null)} onSave={submitEdit} busy={busy} saveLabel="Simpan" />
        </Modal>
      )}

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
