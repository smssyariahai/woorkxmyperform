'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardTitle } from '@/components/ui/primitives';
import { Input, Field, PasswordInput } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ShieldCheck, KeyRound, Save, Loader2, Timer, Mail, Send } from 'lucide-react';
import { cn } from '@/lib/utils';

const EMPTY = {
  google_client_id: '',
  google_client_secret: '',
  turnstile_site_key: '',
  turnstile_secret_key: '',
  'smtp.host': '',
  'smtp.port': '587',
  'smtp.user': '',
  'smtp.pass': '',
  'smtp.from': '',
};

export function SystemSettingsClient() {
  const [values, setValues] = useState({ ...EMPTY });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [trialEnabled, setTrialEnabled] = useState(true);
  const [trialSaving, setTrialSaving] = useState(false);
  const [testSending, setTestSending] = useState(false);

  useEffect(() => {
    fetch('/api/super/system-settings')
      .then((r) => r.json())
      .then((j) => {
        if (j.success) setValues({ ...EMPTY, ...j.data });
        else toast.error(j.message || 'Gagal memuat pengaturan.');
      })
      .catch(() => toast.error('Gagal memuat pengaturan.'))
      .finally(() => setLoading(false));
    fetch('/api/public/pricing')
      .then((r) => r.json())
      .then((j) => {
        if (j.success && j.data?.settings) setTrialEnabled(j.data.settings.trialEnabled ?? true);
      })
      .catch(() => {});
  }, []);

  async function saveTrial(next: boolean) {
    const prev = trialEnabled;
    setTrialEnabled(next);
    setTrialSaving(true);
    try {
      const r = await fetch('/api/super/pricing/settings', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ trialEnabled: next }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success(next ? 'Sistem trial diaktifkan.' : 'Sistem trial dinonaktifkan.');
    } catch (e: any) {
      setTrialEnabled(prev);
      toast.error(e.message || 'Gagal mengubah sistem trial.');
    } finally {
      setTrialSaving(false);
    }
  }

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

  async function sendTestEmail() {
    setTestSending(true);
    try {
      const r = await fetch('/api/super/system-settings/test-email', { method: 'POST' });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success(`Email uji terkirim ke ${j.data?.to ?? 'email Anda'}. Cek kotak masuk (dan folder spam).`);
    } catch (e: any) {
      toast.error(e.message || 'Gagal mengirim email uji.');
    } finally {
      setTestSending(false);
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
            <Input
              value={values.turnstile_secret_key}
              onChange={(e) => set('turnstile_secret_key', e.target.value)}
              placeholder="Belum diisi — tempel Secret Key dari dashboard Cloudflare"
              autoComplete="off"
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

      <Card>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-brand" /> Email SMTP (Pengiriman Invoice &amp; Pengumuman)
        </CardTitle>
        <div className="mt-4 space-y-4">
          <p className="text-[12.5px] text-muted">
            Dipakai untuk mengirim email invoice ke tenant saat tagihan terbit, dan email
            pengumuman. Bila dikosongkan, email tidak dikirim (invoice tetap muncul di
            aplikasi). Untuk Gmail, pakai App Password — bukan password akun biasa.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_120px]">
            <Field label="SMTP Host">
              <Input
                value={values['smtp.host']}
                onChange={(e) => set('smtp.host', e.target.value)}
                placeholder="smtp.gmail.com"
                autoComplete="off"
                spellCheck={false}
              />
            </Field>
            <Field label="SMTP Port">
              <Input
                value={values['smtp.port']}
                onChange={(e) => set('smtp.port', e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="587"
                autoComplete="off"
                inputMode="numeric"
              />
            </Field>
          </div>
          <Field label="SMTP User (email pengirim)">
            <Input
              value={values['smtp.user']}
              onChange={(e) => set('smtp.user', e.target.value)}
              placeholder="admin@woork.id"
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
          <Field label="SMTP Password / App Password">
            <PasswordInput
              value={values['smtp.pass']}
              onChange={(e) => set('smtp.pass', e.target.value)}
              placeholder="••••••••••••••••"
              autoComplete="new-password"
              spellCheck={false}
            />
          </Field>
          <Field label="Alamat pengirim (From) — opsional">
            <Input
              value={values['smtp.from']}
              onChange={(e) => set('smtp.from', e.target.value)}
              placeholder="WOORK <admin@woork.id>"
              autoComplete="off"
              spellCheck={false}
            />
            <p className="mt-1.5 text-[12.5px] text-muted">
              Bila kosong, dipakai SMTP User sebagai pengirim.
            </p>
          </Field>
          <div className="flex items-center gap-3">
            <Button onClick={sendTestEmail} loading={testSending} className="!py-2 !px-4">
              <Send className="h-4 w-4" /> Kirim email uji
            </Button>
            <p className="text-[12.5px] text-muted">
              Email uji dikirim ke alamat email akun admin Anda. Simpan dulu bila baru mengubah pengaturan.
            </p>
          </div>
        </div>
      </Card>

      <Card>
        <CardTitle className="flex items-center gap-2">
          <Timer className="h-5 w-5 text-brand" /> Sistem Trial
        </CardTitle>
        <div className="mt-4 flex items-start justify-between gap-4">
          <div className="text-[13.5px] leading-relaxed">
            <p className="font-semibold text-ink">{trialEnabled ? 'Trial aktif' : 'Trial nonaktif'}</p>
            <p className="mt-1 text-muted">
              Bila aktif, pendaftar baru bisa memilih trial (Jalur B: 30 hari; Jalur A: 14 hari).
              Bila dimatikan, pendaftaran baru langsung berlangganan berbayar dan tenant baru
              yang dibuat Master langsung aktif — tanpa masa trial. Berlaku untuk pendaftaran
              baru setelah perubahan; tenant trial yang sudah berjalan tidak berubah.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={trialEnabled}
            aria-label="Sistem trial"
            disabled={trialSaving}
            onClick={() => saveTrial(!trialEnabled)}
            className={cn(
              'relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50',
              trialEnabled ? 'bg-brand' : 'bg-line'
            )}
          >
            <span
              className={cn(
                'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all',
                trialEnabled ? 'left-[22px]' : 'left-0.5'
              )}
            />
          </button>
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
