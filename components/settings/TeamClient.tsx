'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Avatar, Badge, CardTitle } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { Input, Field } from '@/components/ui/input';
import { Skeleton, ErrorState, EmptyState } from '@/components/ui/states';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { ROLE_DESCRIPTIONS } from '@/lib/permissions';
import { timeAgo } from '@/lib/utils';
import { Plus, Users, Mail, Trash2, KeyRound, UserPlus } from 'lucide-react';

interface Member {
  id: string;
  status: string;
  joinedAt: string;
  user: { id: string; name: string; email: string; avatar: string | null; status: string };
  role: { id: string; name: string };
}

interface Invitation {
  id: string;
  email: string;
  expiresAt: string;
  createdAt: string;
  role: { name: string };
}

const ROLES = ['ADMIN', 'SUPERVISOR', 'AGENT', 'VIEWER'];

export function TeamClient({ selfId }: { selfId: string }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('AGENT');
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<Member | null>(null);
  // buat akun langsung
  const [createOpen, setCreateOpen] = useState(false);
  const [cName, setCName] = useState('');
  const [cEmail, setCEmail] = useState('');
  const [cPassword, setCPassword] = useState('');
  const [cRole, setCRole] = useState('AGENT');
  // reset password
  const [resetTarget, setResetTarget] = useState<Member | null>(null);
  const [newPw, setNewPw] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await fetch('/api/team');
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      setMembers(j.data.members);
      setInvites(j.data.invitations);
    } catch (e: any) {
      setError(e.message || 'Gagal memuat tim.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function invite() {
    if (!/.+@.+\..+/.test(email) || busy) return;
    setBusy(true);
    try {
      const r = await fetch('/api/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success(`Undangan dikirim ke ${email}.`);
      setEmail('');
      setInviteOpen(false);
      load();
    } catch (e: any) {
      toast.error(e.message || 'Gagal mengundang.');
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(m: Member, newRole: string) {
    try {
      const r = await fetch(`/api/team/${m.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success(`Role ${m.user.name} diubah ke ${newRole}.`);
      load();
    } catch (e: any) {
      toast.error(e.message || 'Gagal mengubah role.');
    }
  }

  async function toggleStatus(m: Member) {
    const next = m.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    try {
      const r = await fetch(`/api/team/${m.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success(next === 'ACTIVE' ? 'Anggota diaktifkan.' : 'Anggota dinonaktifkan.');
      load();
    } catch (e: any) {
      toast.error(e.message || 'Gagal mengubah status.');
    }
  }

  async function doRemove() {
    if (!removing) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/team/${removing.id}`, { method: 'DELETE' });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success('Anggota dihapus.');
      setRemoving(null);
      load();
    } catch (e: any) {
      toast.error(e.message || 'Gagal menghapus.');
    } finally {
      setBusy(false);
    }
  }

  async function createAccount() {
    if (cName.trim().length < 3) {
      toast.error('Nama minimal 3 karakter.');
      return;
    }
    if (!/.+@.+\..+/.test(cEmail)) {
      toast.error('Format email tidak valid.');
      return;
    }
    if (cPassword.length < 8) {
      toast.error('Password minimal 8 karakter.');
      return;
    }
    setBusy(true);
    try {
      const r = await fetch('/api/team/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: cName.trim(), email: cEmail.trim(), password: cPassword, role: cRole }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success(`Akun ${cEmail.trim()} berhasil dibuat.`);
      setCName('');
      setCEmail('');
      setCPassword('');
      setCRole('AGENT');
      setCreateOpen(false);
      load();
    } catch (e: any) {
      toast.error(e.message || 'Gagal membuat akun.');
    } finally {
      setBusy(false);
    }
  }

  async function doResetPassword() {
    if (!resetTarget) return;
    if (newPw.length < 8) {
      toast.error('Password baru minimal 8 karakter.');
      return;
    }
    setBusy(true);
    try {
      const r = await fetch(`/api/team/${resetTarget.id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: newPw }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success(`Password ${resetTarget.user.name} berhasil direset.`);
      setResetTarget(null);
      setNewPw('');
    } catch (e: any) {
      toast.error(e.message || 'Gagal mereset password.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1200px] mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-ink">Tim</h1>
          <p className="text-sm text-muted">{members.length} anggota · kelola role & akses</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setInviteOpen(true)}>
            <Plus className="h-4 w-4" /> Undang Anggota
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <UserPlus className="h-4 w-4" /> Buat Akun
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : error ? (
        <div className="card"><ErrorState message={error} onRetry={load} /></div>
      ) : (
        <>
          <div className="card !p-0 overflow-hidden">
            <div className="px-5 py-4 border-b border-line">
              <CardTitle>Anggota Workspace</CardTitle>
            </div>
            {members.map((m) => {
              const isSelf = m.user.id === selfId;
              return (
                <div key={m.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5 border-b border-line/60 last:border-0">
                  <Avatar name={m.user.name} size={38} />
                  <div className="flex-1 min-w-[180px]">
                    <p className="text-[14px] font-semibold text-ink">
                      {m.user.name} {isSelf && <Badge tone="blue" className="ml-1">Anda</Badge>}
                    </p>
                    <p className="text-[12.5px] text-muted">{m.user.email} · bergabung {timeAgo(m.joinedAt)}</p>
                  </div>
                  <Badge tone={m.status === 'ACTIVE' ? 'green' : 'gray'}>
                    {m.status === 'ACTIVE' ? 'Aktif' : 'Nonaktif'}
                  </Badge>
                  <select
                    value={m.role.name}
                    onChange={(e) => changeRole(m, e.target.value)}
                    disabled={isSelf || m.role.name === 'OWNER'}
                    className="input !w-auto !py-2 text-[13px]"
                    aria-label={`Role ${m.user.name}`}
                    title={ROLE_DESCRIPTIONS[m.role.name]}
                  >
                    {m.role.name === 'OWNER' && <option value="OWNER">OWNER</option>}
                    {ROLES.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                  {!isSelf && m.role.name !== 'OWNER' && (
                    <>
                      <button
                        className="btn-secondary !py-2 !px-3 text-[12.5px]"
                        onClick={() => toggleStatus(m)}
                      >
                        {m.status === 'ACTIVE' ? 'Nonaktifkan' : 'Aktifkan'}
                      </button>
                      <button
                        className="btn-ghost !px-2"
                        onClick={() => { setResetTarget(m); setNewPw(''); }}
                        aria-label={`Reset password ${m.user.name}`}
                        title="Reset password"
                      >
                        <KeyRound className="h-4 w-4" />
                      </button>
                      <button
                        className="btn-ghost !px-2 !text-danger"
                        onClick={() => setRemoving(m)}
                        aria-label={`Hapus ${m.user.name}`}
                        title="Hapus dari workspace"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {invites.length > 0 && (
            <div className="card !p-0 overflow-hidden">
              <div className="px-5 py-4 border-b border-line">
                <CardTitle>Undangan Tertunda</CardTitle>
              </div>
              {invites.map((inv) => (
                <div key={inv.id} className="flex items-center gap-3 px-5 py-3 border-b border-line/60 last:border-0">
                  <Mail className="h-4 w-4 text-muted" />
                  <span className="flex-1 text-[13.5px] text-ink">{inv.email}</span>
                  <Badge tone="amber">{inv.role.name}</Badge>
                  <span className="text-[12px] text-muted">kedaluwarsa {timeAgo(inv.expiresAt)}</span>
                </div>
              ))}
            </div>
          )}

          <div className="card">
            <CardTitle className="mb-3">Role & Permission</CardTitle>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {Object.entries(ROLE_DESCRIPTIONS).map(([r, d]) => (
                <div key={r} className="rounded-xl border border-line p-3.5">
                  <Badge tone={r === 'OWNER' ? 'blue' : r === 'VIEWER' ? 'gray' : 'green'}>{r}</Badge>
                  <p className="mt-2 text-[12.5px] text-muted">{d}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} title="Undang Anggota Tim">
        <div className="space-y-4">
          <Field label="Email">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@perusahaan.com" />
          </Field>
          <Field label="Role">
            <select className="input" value={role} onChange={(e) => setRole(e.target.value)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>{r} — {ROLE_DESCRIPTIONS[r]}</option>
              ))}
            </select>
          </Field>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setInviteOpen(false)}>Batal</button>
            <Button onClick={invite} loading={busy}>Kirim Undangan</Button>
          </div>
        </div>
      </Modal>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Buat Akun Baru">
        <div className="space-y-4">
          <p className="text-[13px] text-muted">
            Akun langsung aktif dan bisa dipakai login — tanpa perlu undangan.
          </p>
          <Field label="Nama lengkap">
            <Input value={cName} onChange={(e) => setCName(e.target.value)} placeholder="Nama anggota tim" />
          </Field>
          <Field label="Email">
            <Input type="email" value={cEmail} onChange={(e) => setCEmail(e.target.value)} placeholder="nama@perusahaan.com" />
          </Field>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Password">
              <Input
                type="password"
                value={cPassword}
                onChange={(e) => setCPassword(e.target.value)}
                placeholder="Min. 8 karakter"
                autoComplete="new-password"
              />
            </Field>
            <Field label="Role">
              <select className="input" value={cRole} onChange={(e) => setCRole(e.target.value)}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>{r} — {ROLE_DESCRIPTIONS[r]}</option>
                ))}
              </select>
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setCreateOpen(false)}>Batal</button>
            <Button onClick={createAccount} loading={busy}>Buat Akun</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!resetTarget} onClose={() => setResetTarget(null)} title="Reset Password">
        <div className="space-y-4">
          <p className="text-[13px] text-muted">
            Atur password baru untuk <span className="font-semibold text-ink">{resetTarget?.user.name}</span> ({resetTarget?.user.email}).
            Sampaikan password baru ini kepada yang bersangkutan.
          </p>
          <Field label="Password baru">
            <Input
              type="password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              placeholder="Min. 8 karakter"
              autoComplete="new-password"
            />
          </Field>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setResetTarget(null)}>Batal</button>
            <Button onClick={doResetPassword} loading={busy}>Reset Password</Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={doRemove}
        loading={busy}
        title="Hapus anggota"
        message={`Yakin menghapus ${removing?.user.name} dari workspace?`}
        confirmLabel="Ya, hapus"
      />
    </div>
  );
}
