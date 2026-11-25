'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Field, Input, PasswordInput } from '@/components/ui/input';
import { POSITIONS, POSITION_OTHER, isValidPhone } from '@/lib/perusahaan/constants';
import { apiJson, type MasterAccount } from './PerusahaanClient';

function initialPosition(jobTitle: string | null): { position: string; custom: string } {
  if (!jobTitle) return { position: '', custom: '' };
  if ((POSITIONS as readonly string[]).includes(jobTitle) && jobTitle !== POSITION_OTHER) {
    return { position: jobTitle, custom: '' };
  }
  if (jobTitle === POSITION_OTHER) return { position: POSITION_OTHER, custom: '' };
  return { position: POSITION_OTHER, custom: jobTitle };
}

export function MasterAccountTab({
  masterAccount,
  canManage,
  onSaved,
}: {
  masterAccount: MasterAccount | null;
  canManage: boolean;
  onSaved: () => void;
}) {
  const init = initialPosition(masterAccount?.jobTitle ?? null);
  const [name, setName] = useState(masterAccount?.name ?? '');
  const [position, setPosition] = useState(init.position);
  const [customPosition, setCustomPosition] = useState(init.custom);
  const [phone, setPhone] = useState(masterAccount?.phone ?? '');
  const [saving, setSaving] = useState(false);

  // Password (alur yang sudah ada: PUT /api/settings scope=password)
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    const i = initialPosition(masterAccount?.jobTitle ?? null);
    setName(masterAccount?.name ?? '');
    setPosition(i.position);
    setCustomPosition(i.custom);
    setPhone(masterAccount?.phone ?? '');
  }, [masterAccount]);

  function reset() {
    const i = initialPosition(masterAccount?.jobTitle ?? null);
    setName(masterAccount?.name ?? '');
    setPosition(i.position);
    setCustomPosition(i.custom);
    setPhone(masterAccount?.phone ?? '');
  }

  async function save() {
    if (!name.trim() || name.trim().length < 2) {
      toast.error('Nama lengkap minimal 2 karakter.');
      return;
    }
    if (!position) {
      toast.error('Posisi jabatan wajib dipilih.');
      return;
    }
    if (position === POSITION_OTHER && customPosition.trim().length < 2) {
      toast.error('Nama jabatan wajib diisi bila memilih Lainnya.');
      return;
    }
    if (!isValidPhone(phone)) {
      toast.error('Nomor HP PIC tidak valid. Contoh: +6281234567890.');
      return;
    }
    setSaving(true);
    try {
      await apiJson('/api/perusahaan/akun-master', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          position,
          customPosition: position === POSITION_OTHER ? customPosition.trim() : null,
          phone: phone.trim(),
        }),
      });
      toast.success('Akun Master berhasil disimpan.');
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal menyimpan Akun Master.');
    } finally {
      setSaving(false);
    }
  }

  async function changePassword() {
    if (!currentPassword) {
      toast.error('Password saat ini wajib diisi.');
      return;
    }
    if (newPassword.length < 8) {
      toast.error('Password baru minimal 8 karakter.');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Konfirmasi password baru tidak cocok.');
      return;
    }
    setSavingPassword(true);
    try {
      await apiJson('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: 'password',
          currentPassword,
          newPassword,
        }),
      });
      toast.success('Password berhasil diubah.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal mengubah password.');
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="card p-4 sm:p-6 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-ink">Informasi Akun Master</h2>
          <p className="mt-0.5 text-sm text-muted">
            Akun utama yang bertanggung jawab atas pengelolaan perusahaan di WOORK.
          </p>
        </div>

        <Field label="Nama Lengkap *">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nama lengkap akun master"
            disabled={!canManage}
            maxLength={200}
          />
        </Field>

        <Field label="Posisi Jabatan *">
          <select
            className="input"
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            disabled={!canManage}
          >
            <option value="">— Pilih posisi jabatan —</option>
            {POSITIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </Field>

        {position === POSITION_OTHER && (
          <Field label="Nama Jabatan *">
            <Input
              value={customPosition}
              onChange={(e) => setCustomPosition(e.target.value)}
              placeholder="Tulis nama jabatan"
              disabled={!canManage}
              maxLength={100}
            />
          </Field>
        )}

        <Field label="Email">
          <Input value={masterAccount?.email ?? ''} readOnly disabled />
          <p className="mt-1 text-[12px] text-muted">
            Email login — perubahan email mengikuti mekanisme verifikasi email dan tidak dapat
            diubah dari halaman ini.
          </p>
        </Field>

        <Field label="Nomor HP Project Manager / PIC *">
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+6281234567890"
            disabled={!canManage}
            inputMode="tel"
          />
          <p className="mt-1 text-[12px] text-muted">
            Kontak utama untuk komunikasi terkait pengelolaan perusahaan.
          </p>
        </Field>

        <div className="flex flex-wrap gap-2 pt-1">
          <button type="button" className="btn-primary" onClick={save} disabled={!canManage || saving}>
            {saving ? 'Menyimpan…' : 'Simpan Perubahan'}
          </button>
          <button type="button" className="btn-secondary" onClick={reset} disabled={!canManage}>
            Batal
          </button>
        </div>
      </div>

      {/* Ubah password — memakai alur yang sudah ada */}
      <div className="card p-4 sm:p-6 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-ink">Ubah Password</h2>
          <p className="mt-0.5 text-sm text-muted">
            Password tidak pernah ditampilkan. Masukkan password saat ini untuk menggantinya.
          </p>
        </div>
        <Field label="Password Saat Ini">
          <PasswordInput
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="Password saat ini"
            autoComplete="current-password"
          />
        </Field>
        <Field label="Password Baru">
          <PasswordInput
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Minimal 8 karakter"
            autoComplete="new-password"
          />
        </Field>
        <Field label="Konfirmasi Password Baru">
          <PasswordInput
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Ulangi password baru"
            autoComplete="new-password"
          />
        </Field>
        <div>
          <button
            type="button"
            className="btn-primary"
            onClick={changePassword}
            disabled={savingPassword}
          >
            {savingPassword ? 'Mengubah…' : 'Ubah Password'}
          </button>
        </div>
      </div>
    </div>
  );
}
