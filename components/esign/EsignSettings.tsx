'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardTitle, Badge } from '@/components/ui/primitives';
import { toast } from 'sonner';
import { friendlyFetchError } from '@/lib/fetch-error';
import { SignatureCanvas } from './SignatureCanvas';
import { ESIGN_REMINDER_DELAY_MS, ESIGN_REMINDER_MAX } from '@/lib/esign/reminders';
import { PenLine, KeyRound, Loader2, ArrowLeft, ShieldCheck, Info, BellRing } from 'lucide-react';

interface Profile {
  hasSignature: boolean;
  signatureHash: string | null;
  pinSet: boolean;
  pinUpdatedAt: string | null;
}

const tgl = (s?: string | null) =>
  s
    ? new Date(s).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';

/** Halaman Pengaturan E-Sign: tanda tangan pribadi + PIN tanda tangan. */
export function EsignSettings() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [sigVersion, setSigVersion] = useState(0);
  const [savingSig, setSavingSig] = useState(false);

  // Form PIN
  const [currentPin, setCurrentPin] = useState('');
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [savingPin, setSavingPin] = useState(false);

  async function load() {
    try {
      const r = await fetch('/api/esign/profile');
      const j = await r.json().catch(() => ({}));
      if (!j.success) throw new Error(j.message || 'Gagal memuat profil.');
      setProfile(j.data);
    } catch (e: any) {
      toast.error(friendlyFetchError(e, 'Gagal memuat profil E-Sign.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function saveSignature(dataUrl: string) {
    setSavingSig(true);
    try {
      const r = await fetch('/api/esign/profile/signature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUrl }),
      });
      const j = await r.json().catch(() => ({}));
      if (!j.success) throw new Error(j.message || 'Gagal menyimpan tanda tangan.');
      toast.success('Tanda tangan berhasil disimpan.');
      setSigVersion((v) => v + 1);
      await load();
    } catch (e: any) {
      toast.error(friendlyFetchError(e, 'Gagal menyimpan tanda tangan.'));
    } finally {
      setSavingSig(false);
    }
  }

  const pinValid = (v: string) => /^\d{4,12}$/.test(v);

  async function savePin() {
    if (!pinValid(pin)) {
      toast.error('PIN harus 4–12 digit angka.');
      return;
    }
    if (pin !== pinConfirm) {
      toast.error('Konfirmasi PIN tidak cocok.');
      return;
    }
    if (profile?.pinSet && !pinValid(currentPin)) {
      toast.error('Masukkan PIN saat ini (4–12 digit angka).');
      return;
    }
    setSavingPin(true);
    try {
      const r = await fetch('/api/esign/profile/pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin, currentPin: profile?.pinSet ? currentPin : undefined }),
      });
      const j = await r.json().catch(() => ({}));
      if (!j.success) throw new Error(j.message || 'Gagal menyimpan PIN.');
      toast.success(profile?.pinSet ? 'PIN berhasil diubah.' : 'PIN berhasil diatur.');
      setCurrentPin('');
      setPin('');
      setPinConfirm('');
      await load();
    } catch (e: any) {
      toast.error(friendlyFetchError(e, 'Gagal menyimpan PIN.'));
    } finally {
      setSavingPin(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-muted">Memuat pengaturan E-Sign…</p>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-ink">
            <PenLine className="h-5 w-5 text-brand-700" /> Pengaturan E-Sign
          </h1>
          <p className="mt-1 text-[13px] text-muted">
            Tanda tangan elektronik internal — bukan tersertifikasi PSrE.
          </p>
        </div>
        <Link href="/esign" className="btn-secondary">
          <ArrowLeft className="mr-1 inline h-4 w-4" /> Kembali ke Daftar
        </Link>
      </div>

      {/* Tanda tangan */}
      <Card>
        <CardTitle>Tanda Tangan Saya</CardTitle>
        <p className="mt-1 text-[13px] text-muted">
          Gambar tanda tangan Anda di bawah ini. Tanda tangan ini dipakai saat Anda menandatangani
          dokumen E-Sign.
        </p>

        {profile?.hasSignature && (
          <div className="mt-4">
            <p className="mb-1 text-[12.5px] font-medium text-ink">Tanda tangan tersimpan:</p>
            <div className="inline-block rounded-lg border border-slate-200 bg-white p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/esign/profile/signature?v=${sigVersion}`}
                alt="Tanda tangan tersimpan"
                className="max-h-20 max-w-full"
              />
            </div>
            {profile.signatureHash && (
              <p className="mt-1 font-mono text-[11px] text-muted">
                SHA-256: {profile.signatureHash.slice(0, 20)}…
              </p>
            )}
          </div>
        )}

        <div className="mt-4">
          <SignatureCanvas onSave={saveSignature} saving={savingSig} />
        </div>

        <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-slate-50 px-3 py-2 text-[12.5px] text-muted">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          Memperbarui tanda tangan tidak mengubah dokumen yang sudah ditandatangani — dokumen
          final menyimpan salinan gambar saat penandatanganan terjadi.
        </p>
      </Card>

      {/* PIN */}
      <Card>
        <CardTitle>PIN Tanda Tangan</CardTitle>
        <p className="mt-1 text-[13px] text-muted">
          PIN dipakai sebagai konfirmasi tambahan saat Anda menandatangani dokumen. PIN hanya
          disimpan sebagai hash dan tidak pernah dikirim lewat WhatsApp.
        </p>

        <div className="mt-4 flex items-center gap-2">
          {profile?.pinSet ? (
            <Badge tone="green">
              <ShieldCheck className="mr-1 inline h-3.5 w-3.5" /> PIN sudah diatur
            </Badge>
          ) : (
            <Badge tone="amber">PIN belum diatur</Badge>
          )}
          {profile?.pinSet && profile.pinUpdatedAt && (
            <span className="text-[12.5px] text-muted">
              Terakhir diubah: {tgl(profile.pinUpdatedAt)}
            </span>
          )}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {profile?.pinSet && (
            <label className="block">
              <span className="mb-1 block text-[12.5px] font-medium text-ink">PIN saat ini</span>
              <input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                value={currentPin}
                onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, '').slice(0, 12))}
                placeholder="4–12 digit"
                className="input w-full"
              />
            </label>
          )}
          <label className="block">
            <span className="mb-1 block text-[12.5px] font-medium text-ink">
              {profile?.pinSet ? 'PIN baru' : 'PIN baru'}
            </span>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 12))}
              placeholder="4–12 digit angka"
              className="input w-full"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12.5px] font-medium text-ink">Konfirmasi PIN baru</span>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              value={pinConfirm}
              onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 12))}
              placeholder="Ulangi PIN baru"
              className="input w-full"
            />
          </label>
        </div>

        <div className="mt-4">
          <button type="button" onClick={savePin} disabled={savingPin} className="btn-primary">
            {savingPin ? (
              <Loader2 className="mr-1 inline h-4 w-4 animate-spin" />
            ) : (
              <KeyRound className="mr-1 inline h-4 w-4" />
            )}
            {profile?.pinSet ? 'Ubah PIN' : 'Atur PIN'}
          </button>
          <p className="mt-2 text-[12px] text-muted">
            Setelah 5 kali percobaan PIN yang salah berurutan, PIN terkunci sementara selama 15
            menit.
          </p>
        </div>
      </Card>

      {/* Pengingat otomatis (read-only) */}
      <Card>
        <CardTitle>
          <span className="flex items-center gap-2">
            <BellRing className="h-4 w-4" /> Pengingat Otomatis
          </span>
        </CardTitle>
        <p className="mt-2 text-[13px] text-muted">
          Cron pengingat berjalan tiap 5 menit. Penandatangan yang belum menyelesaikan
          tugasnya diingatkan {ESIGN_REMINDER_DELAY_MS / 3_600_000} jam setelah dokumen dikirim
          ke gilirannya, maksimal {ESIGN_REMINDER_MAX}x per penandatangan. Dokumen yang melewati
          tanggal kedaluwarsa otomatis berstatus EXPIRED dan tautan aksesnya dicabut.
          Notifikasi WhatsApp yang gagal terkirim dicoba ulang otomatis (maksimal 5x).
        </p>
      </Card>
    </div>
  );
}
