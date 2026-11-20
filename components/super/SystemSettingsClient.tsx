'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardTitle } from '@/components/ui/primitives';
import { Input, Field, PasswordInput } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ShieldCheck, KeyRound, Save, Loader2 } from 'lucide-react';

const EMPTY = {
  google_client_id: '',
  google_client_secret: '',
  turnstile_site_key: '',
  turnstile_secret_key: '',
};

export function SystemSettingsClient() {
  const [values, setValues] = useState({ ...EMPTY });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/super/system-settings')
      .then((r) => r.json())
      .then((j) => {
        if (j.success) setValues({ ...EMPTY, ...j.data });
        else toast.error(j.message || 'Gagal memuat pengaturan.');
      })
      .catch(() => toast.error('Gagal memuat pengaturan.'))
      .finally(() => setLoading(false));
  }, []);

  function set(k: keyof typeof EMPTY, v: string) {
    setValues((p) => ({ ...p, [k]: v }));
  }

  async function save() {
    setSaving(true);
    try {
      const r = await fetch('/api/super/system-settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(values),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success('Pengaturan sistem disimpan.');
    } catch (e: any) {
      toast.error(e.message || 'Gagal menyimpan pengaturan.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center text-muted">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-[900px] mx-auto space-y-6">
      <div>
        <h1 className="text-[22px] font-bold text-ink flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-brand" /> Pengaturan Sistem
        </h1>
        <p className="text-sm text-muted">Konfigurasi global platform — hanya Administrator Pusat.</p>
      </div>

      <Card>
        <CardTitle>Google OAuth Client ID (Untuk Login/Daftar via Gmail)</CardTitle>
        <div className="mt-4 space-y-4">
          <Field label="Google OAuth Client ID">
            <Input
              value={values.google_client_id}
              onChange={(e) => set('google_client_id', e.target.value)}
              placeholder="xxxx.apps.googleusercontent.com"
              autoComplete="off"
              spellCheck={false}
            />
            <p className="mt-1.5 text-[12.5px] text-muted">
              Biarkan kosong jika tidak ingin menampilkan tombol Login Google
            </p>
          </Field>
          <Field label="Google OAuth Client Secret">
            <PasswordInput
              value={values.google_client_secret}
              onChange={(e) => set('google_client_secret', e.target.value)}
              placeholder="GOCSPX-••••••••••••••••"
              autoComplete="new-password"
              spellCheck={false}
            />
            <p className="mt-1.5 text-[12.5px] text-muted">
              Wajib diisi bersama Client ID agar login Google berfungsi
            </p>
          </Field>
        </div>
      </Card>

      <Card>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-brand" /> Cloudflare Turnstile (Untuk keamanan Login/Register)
        </CardTitle>
        <div className="mt-4 space-y-4">
          <Field label="Cloudflare Turnstile Site Key">
            <Input
              value={values.turnstile_site_key}
              onChange={(e) => set('turnstile_site_key', e.target.value)}
              placeholder="0x4AAAAAAA••••••••••••"
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
          <Field label="Cloudflare Turnstile Secret Key">
            <PasswordInput
              value={values.turnstile_secret_key}
              onChange={(e) => set('turnstile_secret_key', e.target.value)}
              placeholder="0x4AAAAAAA••••••••••••"
              autoComplete="new-password"
              spellCheck={false}
            />
            <p className="mt-1.5 text-[12.5px] text-muted">
              Biarkan kosong jika tidak ingin menggunakan Cloudflare CAPTCHA.
            </p>
          </Field>
          <p className="text-[12.5px] text-muted">
            Bila aktif, verifikasi Turnstile diterapkan pada halaman Login, Daftar, Lupa Password,
            dan Reset Password.
          </p>
        </div>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} loading={saving} className="!py-2.5 !px-6">
          <Save className="h-4 w-4" /> Simpan Pengaturan
        </Button>
      </div>
    </div>
  );
}
