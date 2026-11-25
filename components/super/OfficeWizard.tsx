'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card } from '@/components/ui/primitives';
import { Field, Input } from '@/components/ui/input';
import { ArrowLeft, ArrowRight, Building2, Check, KeyRound, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatIDR } from '@/lib/modular';

/* Katalog paket (sama dengan GET /api/public/pricing — getCatalogForRegistration). */
interface Catalog {
  userTiers: { id: string; name: string; minStorageGb: number; monthlyPrice: number | null; yearlyPrice: number | null }[];
  storageTiers: { id: string; name: string; capacityGb: number | null; monthlyPrice: number | null; yearlyPrice: number | null }[];
  modules: { moduleKey: string; name: string; monthlyPrice: number | null; yearlyPrice: number | null }[];
  settings: { ppnRateBps: number; invoiceValidityHours: number; trialEnabled: boolean };
}

export function OfficeWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [done, setDone] = useState<any | null>(null);

  // Langkah 1 — detail kantor
  const [office, setOffice] = useState({ name: '', description: '', email: '', phone: '', address: '' });
  // Langkah 2 — admin kantor
  const [admin, setAdmin] = useState({ adminName: '', adminEmail: '', adminPassword: '' });
  // Langkah 3 — paket langganan (Bab 9)
  const [userTierId, setUserTierId] = useState('');
  const [storageTierId, setStorageTierId] = useState('');
  const [modules, setModules] = useState<string[]>([]);
  const [billingCycle, setBillingCycle] = useState<'MONTHLY' | 'YEARLY'>('MONTHLY');

  useEffect(() => {
    fetch('/api/public/pricing')
      .then((r) => r.json())
      .then((j) => {
        if (j.success) setCatalog(j.data);
      })
      .catch(() => {});
  }, []);

  const selectedUserTier = useMemo(
    () => catalog?.userTiers.find((t) => t.id === userTierId) ?? null,
    [catalog, userTierId],
  );
  const selectedStorageTier = useMemo(
    () => catalog?.storageTiers.find((t) => t.id === storageTierId) ?? null,
    [catalog, storageTierId],
  );

  /* Storage yang tersedia: hanya opsi capacityGb >= minimum tier pengguna. */
  const storageOptions = useMemo(() => {
    if (!catalog) return [];
    const min = selectedUserTier?.minStorageGb ?? 0;
    return catalog.storageTiers.map((t) => ({
      tier: t,
      disabled: t.capacityGb !== null && t.capacityGb < min,
    }));
  }, [catalog, selectedUserTier]);

  /* Ringkasan harga live (dasar + PPN + total) per siklus yang dipilih. */
  const priceSummary = useMemo(() => {
    if (!catalog) return null;
    const priceOf = (row: { monthlyPrice: number | null; yearlyPrice: number | null }) =>
      billingCycle === 'YEARLY' ? row.yearlyPrice : row.monthlyPrice;
    const items: { label: string; amount: number | null }[] = [];
    let base = 0;
    let custom = false;
    if (selectedUserTier) {
      const a = priceOf(selectedUserTier);
      items.push({ label: selectedUserTier.name, amount: a });
      if (a === null) custom = true; else base += a;
    }
    if (selectedStorageTier) {
      const a = priceOf(selectedStorageTier);
      items.push({ label: selectedStorageTier.name, amount: a });
      if (a === null) custom = true; else base += a;
    }
    for (const key of modules) {
      const m = catalog.modules.find((x) => x.moduleKey === key);
      if (m) {
        const a = priceOf(m);
        items.push({ label: m.name, amount: a });
        if (a !== null) base += a;
      }
    }
    const ppn = Math.round((base * (catalog.settings.ppnRateBps ?? 1100)) / 10000);
    return { items, base, ppn, total: base + ppn, custom };
  }, [catalog, selectedUserTier, selectedStorageTier, modules, billingCycle]);

  const cycleLabel = billingCycle === 'YEARLY' ? 'tahunan' : 'bulanan';

  /* Trial dimatikan Master (Pengaturan Sistem) → tenant baru langsung
     berlangganan (berbayar, wajib ≥1 modul). */
  const trialEnabled = catalog?.settings.trialEnabled ?? true;

  function toggleModule(key: string) {
    setModules((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));
  }

  function validStep1() {
    if (!office.name.trim()) { toast.error('Nama kantor wajib diisi.'); return false; }
    return true;
  }

  function validStep2() {
    if (!admin.adminName.trim() || !admin.adminEmail.trim() || admin.adminPassword.length < 8) {
      toast.error('Lengkapi data admin kantor (password min. 8 karakter).');
      return false;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(admin.adminEmail)) {
      toast.error('Format email admin tidak valid.');
      return false;
    }
    return true;
  }

  function validStep3() {
    if (!userTierId) { toast.error('Pilih tier pengguna.'); return false; }
    if (!storageTierId) { toast.error('Pilih tier storage.'); return false; }
    if (!trialEnabled && modules.length === 0) {
      toast.error('Trial sedang dinonaktifkan — langganan berbayar wajib memilih minimal 1 modul berbayar.');
      return false;
    }
    return true;
  }

  async function submit() {
    if (!validStep3()) return;
    setBusy(true);
    try {
      const r = await fetch('/api/super/offices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...office,
          ...admin,
          userTierId,
          storageTierId,
          modules,
          billingCycle,
        }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      setDone(j.data);
      toast.success(trialEnabled ? `Kantor "${office.name}" dibuat — trial gratis 14 hari.` : `Kantor "${office.name}" dibuat — langganan langsung aktif.`);
    } catch (e: any) {
      toast.error(e.message || 'Gagal membuat kantor.');
    } finally {
      setBusy(false);
    }
  }

  const steps = [
    { n: 1, label: 'Detail Kantor', icon: Building2 },
    { n: 2, label: 'Admin Kantor', icon: KeyRound },
    { n: 3, label: 'Paket Langganan', icon: Wallet },
  ];

  if (done) {
    return (
      <div className="max-w-[640px] mx-auto space-y-5">
        <Card className="!p-6 text-center space-y-4">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <Check className="h-6 w-6" />
          </span>
          <h1 className="text-[20px] font-bold text-ink">Kantor &ldquo;{done.name}&rdquo; dibuat</h1>
          <p className="text-sm text-muted leading-relaxed">
            Situs publik: <b className="text-ink">{done.siteUrl}</b>
            {done.dnsOk ? '' : ` (DNS gagal: ${done.dnsError || 'periksa nanti'})`}
            <br />
            {done.subscription.trialEndsAt ? (
              <>
                Trial <b className="text-ink">gratis 14 hari</b> sampai{' '}
                <b className="text-ink">{new Date(done.subscription.trialEndsAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</b>
                {' '}— admin kantor bisa langsung login, tanpa menunggu invoice.
              </>
            ) : (
              <>
                Langganan <b className="text-ink">aktif</b> sampai{' '}
                <b className="text-ink">{new Date(done.subscription.currentPeriodEndsAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</b>
                {' '}— admin kantor bisa langsung login, tanpa menunggu invoice.
              </>
            )}
          </p>
          <div className="rounded-btn border border-line bg-canvas p-4 text-left text-[13.5px] space-y-1.5">
            <p className="flex justify-between"><span className="text-muted">Kode tenant</span><b>{done.tenantCode}</b></p>
            <p className="flex justify-between"><span className="text-muted">Tier pengguna</span><b>{selectedUserTier?.name ?? '—'}</b></p>
            <p className="flex justify-between"><span className="text-muted">Tier storage</span><b>{selectedStorageTier?.name ?? '—'}</b></p>
            <p className="flex justify-between"><span className="text-muted">Modul berbayar</span><b>{modules.length > 0 ? modules.map((k) => catalog?.modules.find((m) => m.moduleKey === k)?.name ?? k).join(', ') : 'Tidak ada (hanya modul non-berbayar)'}</b></p>
            {priceSummary && !priceSummary.custom && (
              <p className="flex justify-between border-t border-line pt-2">
                <span className="text-muted">Total {cycleLabel} (setelah trial)</span>
                <b>{formatIDR(priceSummary.total)}</b>
              </p>
            )}
            {priceSummary?.custom && (
              <p className="text-muted">Harga khusus — total akan dinegosiasikan dengan Master.</p>
            )}
          </div>
          {done.packageSyncWarning && (
            <div className="rounded-btn border border-amber-200 bg-amber-50 px-4 py-3 text-left text-[13px]">
              <p className="font-bold text-ink">Modul paket belum tersinkron</p>
              <p className="mt-1 text-muted">{done.packageSyncWarning} Atur ulang paket di halaman tenant.</p>
            </div>
          )}
          <div className="flex justify-center gap-2">
            <Link href={`/admin/tenants/${done.id}`} className="btn-primary !py-2 text-[13px]">
              Lihat Tenant
            </Link>
            <Link href="/admin/offices" className="btn-ghost !py-2 text-[13px]">Kembali ke Daftar Kantor</Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-[720px] mx-auto space-y-5">
      <div>
        <Link href="/admin/offices" className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-muted hover:text-brand mb-3">
          <ArrowLeft className="h-4 w-4" /> Kembali ke Daftar Kantor
        </Link>
        <h1 className="text-[22px] font-bold text-ink">Buat Kantor Baru</h1>
        <p className="text-sm text-muted">Kantor dibuat beserta admin OWNER dan paket langganan. {trialEnabled ? 'Trial gratis 14 hari, tanpa invoice.' : 'Trial sedang dinonaktifkan — langganan langsung aktif.'}</p>
      </div>

      {/* Indikator langkah */}
      <div className="flex items-center gap-2">
        {steps.map((s) => (
          <button
            key={s.n}
            onClick={() => s.n < step && setStep(s.n)}
            className={cn(
              'flex flex-1 items-center gap-2 rounded-btn border px-3 py-2.5 text-left transition-colors',
              step === s.n ? 'border-brand bg-brand-50 text-brand-700' : 'border-line text-muted'
            )}
          >
            <s.icon className="h-4 w-4 shrink-0" />
            <span className="text-[12.5px] font-semibold leading-tight">
              <span className="block text-[10.5px] font-bold uppercase tracking-wide opacity-70">Langkah {s.n}</span>
              {s.label}
            </span>
          </button>
        ))}
      </div>

      <Card className="!p-6 space-y-4">
        {step === 1 && (
          <>
            <Field label="Nama kantor *"><Input value={office.name} onChange={(e) => setOffice({ ...office, name: e.target.value })} placeholder="SINERGI" /></Field>
            <p className="-mt-2 text-[12px] text-muted">Subdomain & situs publik dibuat otomatis, mis. <b>sinergi.xsramazys.dev</b>.</p>
            <Field label="Deskripsi"><Input value={office.description} onChange={(e) => setOffice({ ...office, description: e.target.value })} placeholder="Deskripsi singkat kantor" /></Field>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Email kantor"><Input type="email" value={office.email} onChange={(e) => setOffice({ ...office, email: e.target.value })} placeholder="kantor@contoh.id" /></Field>
              <Field label="Telepon / WhatsApp"><Input inputMode="numeric" autoComplete="tel" value={office.phone} onChange={(e) => setOffice({ ...office, phone: e.target.value.replace(/\D/g, '') })} placeholder="08xxxxxxxxxx" /></Field>
            </div>
            <Field label="Alamat"><Input value={office.address} onChange={(e) => setOffice({ ...office, address: e.target.value })} placeholder="Alamat kantor" /></Field>
          </>
        )}

        {step === 2 && (
          <>
            <p className="text-[13px] text-muted">Akun ini menjadi pemilik (OWNER) kantor dan bisa langsung login setelah kantor dibuat.</p>
            <Field label="Nama lengkap *"><Input value={admin.adminName} onChange={(e) => setAdmin({ ...admin, adminName: e.target.value })} placeholder="Nama admin" /></Field>
            <Field label="Email *"><Input type="email" value={admin.adminEmail} onChange={(e) => setAdmin({ ...admin, adminEmail: e.target.value })} placeholder="admin@kantor.id" /></Field>
            <Field label="Password awal *"><Input type="password" value={admin.adminPassword} onChange={(e) => setAdmin({ ...admin, adminPassword: e.target.value })} placeholder="Min. 8 karakter" /></Field>
          </>
        )}

        {step === 3 && (
          <>
            <div className="rounded-input border border-line p-4 space-y-3">
              <h3 className="text-[14px] font-bold text-ink">Pilih paket</h3>
              <Field label="Batas jumlah pengguna">
                <select
                  className="input"
                  value={userTierId}
                  onChange={(e) => { setUserTierId(e.target.value); setStorageTierId(''); }}
                  disabled={!catalog}
                >
                  <option value="">{catalog ? '— Pilih tier pengguna —' : 'Memuat katalog…'}</option>
                  {catalog?.userTiers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}{t.monthlyPrice !== null ? ` — ${formatIDR(t.monthlyPrice)}/bln` : ' — Harga khusus'}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Batas storage">
                <select className="input" value={storageTierId} onChange={(e) => setStorageTierId(e.target.value)} disabled={!catalog || !userTierId}>
                  <option value="">{!userTierId ? 'Pilih tier pengguna dulu' : '— Pilih tier storage —'}</option>
                  {storageOptions.map(({ tier, disabled }) => (
                    <option key={tier.id} value={tier.id} disabled={disabled}>
                      {tier.name}{tier.monthlyPrice !== null ? ` — ${formatIDR(tier.monthlyPrice)}/bln` : ' — Harga khusus'}
                      {disabled ? ' (di bawah minimum tier pengguna)' : ''}
                    </option>
                  ))}
                </select>
                {selectedUserTier && (
                  <p className="mt-1 text-[12px] text-muted">
                    Storage minimum untuk tier {selectedUserTier.name} adalah {selectedUserTier.minStorageGb} GB.
                  </p>
                )}
              </Field>
              <Field label="Modul berbayar yang dipakai">
                <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                  {catalog?.modules.map((m) => (
                    <label key={m.moduleKey} className="flex items-start gap-2.5 text-[13px] text-ink cursor-pointer">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 rounded accent-[#087BFF]"
                        checked={modules.includes(m.moduleKey)}
                        onChange={() => toggleModule(m.moduleKey)}
                      />
                      <span>
                        <span className="font-semibold">{m.name}</span>
                        <span className="text-muted"> — {m.monthlyPrice !== null ? `${formatIDR(m.monthlyPrice)}/bln` : 'Harga khusus'}</span>
                      </span>
                    </label>
                  ))}
                  {!catalog && <p className="text-[13px] text-muted">Memuat modul…</p>}
                </div>
                <p className="mt-2 text-[12px] text-muted">Modul non-berbayar (Dashboard, Setting, Pengumuman, Tiket, E-Sign, dan lainnya) selalu ikut tanpa biaya.</p>
              </Field>
              <Field label="Siklus pembayaran">
                <div className="flex gap-2">
                  {(['MONTHLY', 'YEARLY'] as const).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setBillingCycle(c)}
                      className={
                        'flex-1 rounded-input border px-3 py-2.5 text-[13px] font-semibold transition-colors ' +
                        (billingCycle === c ? 'border-brand bg-brand/10 text-brand' : 'border-line text-muted hover:text-ink')
                      }
                    >
                      {c === 'MONTHLY' ? 'Bulanan' : 'Tahunan (hemat 2 bulan)'}
                    </button>
                  ))}
                </div>
              </Field>

              {/* Ringkasan harga live */}
              {priceSummary && (selectedUserTier || selectedStorageTier || modules.length > 0) && (
                <div className="rounded-input bg-canvas px-4 py-3 text-[13px]">
                  <p className="font-bold text-ink">Ringkasan harga {cycleLabel}</p>
                  {priceSummary.items.map((it) => (
                    <p key={it.label} className="mt-1 flex justify-between text-muted">
                      <span>{it.label}</span>
                      <span>{it.amount === null ? 'Harga khusus' : formatIDR(it.amount)}</span>
                    </p>
                  ))}
                  {priceSummary.custom ? (
                    <p className="mt-2 font-semibold text-ink">Harga khusus (hubungi Master) — total akan dinegosiasikan.</p>
                  ) : (
                    <>
                      <p className="mt-1 flex justify-between text-muted">
                        <span>PPN ({catalog ? Math.round((catalog.settings.ppnRateBps ?? 1100) / 100) : 11}%)</span>
                        <span>{formatIDR(priceSummary.ppn)}</span>
                      </p>
                      <p className="mt-2 flex justify-between border-t border-line pt-2 font-bold text-ink">
                        <span>Total {cycleLabel}</span>
                        <span>{formatIDR(priceSummary.total)}</span>
                      </p>
                      <p className="mt-1 text-muted">
                        {trialEnabled
                          ? 'Gratis selama 14 hari trial — tagihan pertama diterbitkan setelah trial berakhir.'
                          : 'Trial dinonaktifkan — langganan langsung aktif. Tagihan perpanjangan diterbitkan 7 hari sebelum periode berakhir.'}
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        <div className="flex justify-between pt-2">
          <button
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            disabled={step === 1}
            className="btn-ghost !py-2 text-[13px] disabled:opacity-40"
          >
            Kembali
          </button>
          {step < 3 ? (
            <button
              onClick={() => {
                if (step === 1 && validStep1()) setStep(2);
                if (step === 2 && validStep2()) setStep(3);
              }}
              className="btn-primary !py-2 text-[13px]"
            >
              Lanjut <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button onClick={submit} disabled={busy} className="btn-primary !py-2 text-[13px]">
              {busy ? 'Menyimpan…' : 'Buat Kantor'}
            </button>
          )}
        </div>
      </Card>
    </div>
  );
}
