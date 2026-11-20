'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardTitle, Badge, Avatar } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { Input, Field, PasswordInput } from '@/components/ui/input';
import { Skeleton, ErrorState } from '@/components/ui/states';
import { formatDateTime } from '@/lib/utils';
import { User as UserIcon, ShieldCheck, MonitorSmartphone, Camera } from 'lucide-react';

const ROLE_LABEL: Record<string, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  SUPERVISOR: 'Supervisor',
  AGENT: 'Agen',
};

export function ProfileClient() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [newPw2, setNewPw2] = useState('');
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await fetch('/api/settings');
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      setData(j.data);
      setName(j.data.user.name);
      setPhone(j.data.user.phone ?? '');
    } catch (e: any) {
      setError(e.message || 'Gagal memuat profil.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function saveProfile() {
    if (!name.trim()) {
      toast.error('Nama tidak boleh kosong.');
      return;
    }
    setBusy(true);
    try {
      const r = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'profile', name: name.trim(), phone: phone.trim() }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success('Profil disimpan.');
      load();
    } catch (e: any) {
      toast.error(e.message || 'Gagal menyimpan profil.');
    } finally {
      setBusy(false);
    }
  }

  async function onAvatarFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'].includes(file.type)) {
      toast.error('Format gambar harus PNG, JPG, WEBP, atau SVG.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Ukuran gambar maksimal 2MB.');
      return;
    }
    setUploadingAvatar(true);
    try {
      const fd = new FormData();
      fd.append('avatar', file);
      const r = await fetch('/api/settings/avatar', { method: 'POST', body: fd });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success('Foto profil diperbarui.');
      load();
    } catch (err: any) {
      toast.error(err.message || 'Gagal mengunggah foto.');
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function removeAvatar() {
    if (!confirm('Hapus foto profil?')) return;
    setUploadingAvatar(true);
    try {
      const r = await fetch('/api/settings/avatar', { method: 'DELETE' });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success('Foto profil dihapus.');
      load();
    } catch (err: any) {
      toast.error(err.message || 'Gagal menghapus foto.');
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function changePassword() {    if (newPw !== newPw2) {
      toast.error('Konfirmasi password baru tidak cocok.');
      return;
    }
    if (newPw.length < 8) {
      toast.error('Password baru minimal 8 karakter.');
      return;
    }
    setBusy(true);
    try {
      const r = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'password', currentPassword: curPw, newPassword: newPw }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success('Password berhasil diubah.');
      setCurPw('');
      setNewPw('');
      setNewPw2('');
    } catch (e: any) {
      toast.error(e.message || 'Gagal mengubah password.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-[860px] mx-auto space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-56 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="max-w-[860px] mx-auto">
        <div className="card">
          <ErrorState message={error} onRetry={load} />
        </div>
      </div>
    );
  }

  const user = data.user;

  return (
    <div className="max-w-[860px] mx-auto space-y-5">
      <div>
        <h1 className="text-[22px] font-bold text-ink">Profil saya</h1>
        <p className="text-sm text-muted">Kelola informasi akun dan keamanan Anda.</p>
      </div>

      <Card>
        <div className="flex items-center gap-4 mb-6">
          <div className="relative shrink-0">
            <Avatar name={user.name} size={64} src={user.avatar} />
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              disabled={uploadingAvatar}
              className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-brand text-white shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              title="Ganti foto profil"
              aria-label="Ganti foto profil"
            >
              <Camera className="h-3.5 w-3.5" />
            </button>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="hidden"
              onChange={onAvatarFile}
              aria-hidden
              tabIndex={-1}
            />
          </div>
          <div>
            <p className="text-[16px] font-bold text-ink">{user.name}</p>
            <p className="text-[13px] text-muted">{user.email}</p>
            <div className="mt-1.5 flex gap-1.5">
              <Badge tone="blue">{ROLE_LABEL[data.role] ?? data.role}</Badge>
              <Badge tone="green">{data.org.name}</Badge>
            </div>
            {user.avatar && (
              <button
                type="button"
                onClick={removeAvatar}
                disabled={uploadingAvatar}
                className="mt-1.5 text-[12px] font-medium text-danger hover:underline"
              >
                Hapus foto
              </button>
            )}
          </div>
        </div>
        <CardTitle className="mb-4 flex items-center gap-2">
          <UserIcon className="h-4 w-4" /> Informasi profil
        </CardTitle>
        <div className="grid sm:grid-cols-2 gap-4 max-w-xl">
          <Field label="Nama lengkap">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama Anda" />
          </Field>
          <Field label="Nomor telepon" optional>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="08xx…" />
          </Field>
          <Field label="Email">
            <Input value={user.email} disabled />
          </Field>
        </div>
        <div className="mt-5">
          <Button onClick={saveProfile} disabled={busy}>
            {busy ? 'Menyimpan…' : 'Simpan perubahan'}
          </Button>
        </div>
      </Card>

      <Card>
        <CardTitle className="mb-1 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" /> Keamanan
        </CardTitle>
        <p className="text-[13px] text-muted mb-5">Ubah password akun Anda secara berkala.</p>
        <div className="grid sm:grid-cols-3 gap-4 max-w-2xl">
          <Field label="Password saat ini">
            <PasswordInput
              value={curPw}
              onChange={(e) => setCurPw(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </Field>
          <Field label="Password baru">
            <PasswordInput
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              placeholder="Min. 8 karakter"
              autoComplete="new-password"
            />
          </Field>
          <Field label="Konfirmasi password baru">
            <PasswordInput
              value={newPw2}
              onChange={(e) => setNewPw2(e.target.value)}
              placeholder="Ulangi password"
              autoComplete="new-password"
            />
          </Field>
        </div>
        <div className="mt-5">
          <Button variant="secondary" onClick={changePassword} disabled={busy || !curPw || !newPw}>
            {busy ? 'Memproses…' : 'Ubah password'}
          </Button>
        </div>
      </Card>

      <Card>
        <CardTitle className="mb-1 flex items-center gap-2">
          <MonitorSmartphone className="h-4 w-4" /> Sesi aktif
        </CardTitle>
        <p className="text-[13px] text-muted mb-4">Perangkat yang sedang masuk ke akun ini.</p>
        {(data.sessions ?? []).length === 0 && (
          <p className="text-[13px] text-muted">Tidak ada data sesi.</p>
        )}
        <ul className="divide-y divide-line">
          {(data.sessions ?? []).map((s: any) => (
            <li key={s.id} className="py-2.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13.5px] font-medium text-ink truncate">
                  {s.userAgent ?? 'Perangkat tidak dikenal'}
                </p>
                <p className="text-[12px] text-muted">
                  {s.ipAddress ?? '-'} · {formatDateTime(s.createdAt)}
                </p>
              </div>
              <Badge tone="green">Aktif</Badge>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
