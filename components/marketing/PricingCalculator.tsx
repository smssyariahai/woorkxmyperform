'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

/* ------------------------------ tipe katalog ------------------------------ */

export interface CatalogUserTier {
  id: string;
  name: string;
  maxUsers: number | null;
  monthlyPrice: number | null;
  yearlyPrice: number | null;
  isCustomPrice: boolean;
  minStorageGb: number;
}

export interface CatalogStorageTier {
  id: string;
  name: string;
  capacityGb: number | null;
  monthlyPrice: number | null;
  yearlyPrice: number | null;
  isCustomPrice: boolean;
}

export interface CatalogModule {
  id: string;
  moduleKey: string;
  name: string;
  monthlyPrice: number;
  yearlyPrice: number;
}

export interface PricingCatalog {
  userTiers: CatalogUserTier[];
  storageTiers: CatalogStorageTier[];
  modules: CatalogModule[];
  ppnRateBps: number;
}

export type BillingCycle = 'MONTHLY' | 'YEARLY';

/* --------------------------------- util ----------------------------------- */

export function rp(n: number): string {
  return `Rp${Math.round(n).toLocaleString('id-ID')}`;
}

function priceFor(
  tier: { monthlyPrice: number | null; yearlyPrice: number | null },
  cycle: BillingCycle
): number {
  if (cycle === 'YEARLY') return tier.yearlyPrice ?? (tier.monthlyPrice ?? 0) * 10;
  return tier.monthlyPrice ?? 0;
}

/* --------------------------- tombol pilihan umum -------------------------- */

function OptionButton({
  selected,
  disabled,
  onClick,
  label,
  children,
}: {
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'min-h-[44px] w-full rounded-card border p-3.5 text-left transition-all',
        selected
          ? 'border-brand-500 bg-brand-50/70 ring-2 ring-brand/15 dark:bg-brand-900/25'
          : 'border-line bg-white hover:border-brand-300 dark:bg-slate-900',
        disabled && 'cursor-not-allowed opacity-40 hover:border-line'
      )}
    >
      {children}
    </button>
  );
}

/* ------------------------------- kalkulator ------------------------------- */

export default function PricingCalculator({ catalog }: { catalog: PricingCatalog }) {
  const { userTiers, storageTiers, modules, ppnRateBps } = catalog;
  const ppnPercent = ppnRateBps / 100;

  const [cycle, setCycle] = useState<BillingCycle>('MONTHLY');
  const [userTierId, setUserTierId] = useState<string>(
    userTiers.find((t) => !t.isCustomPrice)?.id ?? userTiers[0]?.id ?? ''
  );
  const [storageTierId, setStorageTierId] = useState<string>(
    storageTiers.find((t) => !t.isCustomPrice)?.id ?? storageTiers[0]?.id ?? ''
  );
  const [selectedModules, setSelectedModules] = useState<string[]>([]);

  const userTier = userTiers.find((t) => t.id === userTierId) ?? userTiers[0];
  const minStorage = userTier?.minStorageGb ?? 0;

  /* Storage efektif: bila pilihan tersimpan di bawah minimum tier pengguna,
     naikkan otomatis ke tier terkecil yang memenuhi syarat. */
  const storageTier = useMemo(() => {
    const current = storageTiers.find((s) => s.id === storageTierId);
    if (current && (current.capacityGb === null || current.capacityGb >= minStorage)) return current;
    return (
      storageTiers.find((s) => !s.isCustomPrice && s.capacityGb !== null && s.capacityGb >= minStorage) ??
      storageTiers.find((s) => !s.isCustomPrice) ??
      storageTiers[0]
    );
  }, [storageTierId, storageTiers, minStorage]);

  const isCustom = Boolean(userTier?.isCustomPrice || storageTier?.isCustomPrice);

  const userPrice = userTier && !userTier.isCustomPrice ? priceFor(userTier, cycle) : 0;
  const storagePrice = storageTier && !storageTier.isCustomPrice ? priceFor(storageTier, cycle) : 0;
  const moduleLines = modules
    .filter((m) => selectedModules.includes(m.moduleKey))
    .map((m) => ({ name: m.name, price: priceFor(m, cycle) }));
  const subtotal = userPrice + storagePrice + moduleLines.reduce((acc, l) => acc + l.price, 0);
  const ppn = Math.round((subtotal * ppnRateBps) / 10000);
  const total = subtotal + ppn;
  const cycleLabel = cycle === 'YEARLY' ? 'tahun' : 'bulan';

  function toggleModule(key: string) {
    setSelectedModules((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  return (
    <div className="mt-12 grid items-start gap-6 lg:grid-cols-[1fr_380px]">
      {/* ------------------------------- pilihan ------------------------------ */}
      <div className="space-y-8">
        <fieldset>
          <legend className="text-[13px] font-bold uppercase tracking-wide text-ink">Siklus tagihan</legend>
          <div
            className="mt-3 inline-flex rounded-card border border-line bg-white p-1 dark:bg-slate-900"
            role="group"
            aria-label="Pilih siklus tagihan"
          >
            {(
              [
                { id: 'MONTHLY', label: 'Bulanan' },
                { id: 'YEARLY', label: 'Tahunan · hemat 2 bulan' },
              ] as const
            ).map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={cycle === c.id}
                onClick={() => setCycle(c.id)}
                className={cn(
                  'min-h-[44px] rounded-btn px-4 py-2.5 text-sm font-semibold transition-all',
                  cycle === c.id ? 'bg-brand-500 text-white shadow-sm' : 'text-muted hover:text-ink'
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[12.5px] text-muted">
            Harga tahunan = 10x harga bulanan, jadi Anda hemat 2 bulan setiap tahun.
          </p>
        </fieldset>

        <fieldset>
          <legend className="text-[13px] font-bold uppercase tracking-wide text-ink">
            Jumlah pengguna
          </legend>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {userTiers.map((t) => (
              <OptionButton
                key={t.id}
                selected={userTier?.id === t.id}
                onClick={() => setUserTierId(t.id)}
                label={`Tier ${t.name}`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-[14px] font-semibold text-ink">{t.name}</span>
                  <span
                    className={cn(
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2',
                      userTier?.id === t.id
                        ? 'border-brand-500 bg-brand-500 text-white'
                        : 'border-line bg-white text-transparent dark:bg-slate-900'
                    )}
                    aria-hidden
                  >
                    <Check className="h-3 w-3" />
                  </span>
                </span>
                <span className="mt-1 block text-[13px] text-muted">
                  {t.isCustomPrice ? 'Harga khusus' : `${rp(priceFor(t, cycle))} / ${cycleLabel}`}
                </span>
              </OptionButton>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-[13px] font-bold uppercase tracking-wide text-ink">
            Kapasitas penyimpanan
          </legend>
          {minStorage > 0 && (
            <p className="mt-2 text-[12.5px] text-muted">
              Tier pengguna yang dipilih membutuhkan penyimpanan minimal{' '}
              {minStorage >= 1000 ? `${minStorage / 1000} TB` : `${minStorage} GB`}.
            </p>
          )}
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {storageTiers.map((s) => {
              const tooSmall = s.capacityGb !== null && s.capacityGb < minStorage;
              return (
                <OptionButton
                  key={s.id}
                  selected={storageTier?.id === s.id}
                  disabled={tooSmall}
                  onClick={() => setStorageTierId(s.id)}
                  label={`Storage ${s.name}${tooSmall ? ' (di bawah minimum tier pengguna)' : ''}`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-[14px] font-semibold text-ink">{s.name}</span>
                    <span
                      className={cn(
                        'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2',
                        storageTier?.id === s.id
                          ? 'border-brand-500 bg-brand-500 text-white'
                          : 'border-line bg-white text-transparent dark:bg-slate-900'
                      )}
                      aria-hidden
                    >
                      <Check className="h-3 w-3" />
                    </span>
                  </span>
                  <span className="mt-1 block text-[13px] text-muted">
                    {s.isCustomPrice
                      ? 'Harga khusus'
                      : tooSmall
                        ? 'Di bawah minimum tier pengguna'
                        : `${rp(priceFor(s, cycle))} / ${cycleLabel}`}
                  </span>
                </OptionButton>
              );
            })}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-[13px] font-bold uppercase tracking-wide text-ink">
            Modul tambahan <span className="font-medium normal-case tracking-normal text-muted">(opsional)</span>
          </legend>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {modules.map((m) => {
              const on = selectedModules.includes(m.moduleKey);
              return (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleModule(m.moduleKey)}
                  className={cn(
                    'min-h-[44px] w-full rounded-card border p-3.5 text-left transition-all',
                    on
                      ? 'border-brand-500 bg-brand-50/70 ring-2 ring-brand/15 dark:bg-brand-900/25'
                      : 'border-line bg-white hover:border-brand-300 dark:bg-slate-900'
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-[14px] font-semibold text-ink">{m.name}</span>
                    <span
                      className={cn(
                        'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2',
                        on
                          ? 'border-brand-500 bg-brand-500 text-white'
                          : 'border-line bg-white text-transparent dark:bg-slate-900'
                      )}
                      aria-hidden
                    >
                      <Check className="h-3 w-3" />
                    </span>
                  </span>
                  <span className="mt-1 block text-[13px] text-muted">
                    {rp(priceFor(m, cycle))} / {cycleLabel}
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>
      </div>

      {/* ------------------------------ ringkasan ----------------------------- */}
      <div className="rounded-3xl border border-line bg-white p-6 shadow-pop lg:sticky lg:top-24 dark:bg-slate-900">
        <h3 className="text-[16px] font-bold text-ink">Ringkasan paket Anda</h3>
        {isCustom ? (
          <div className="mt-4 space-y-4">
            <p className="rounded-card bg-brand-50 px-4 py-3 text-[13.5px] leading-relaxed text-brand-700 dark:bg-brand-900/30 dark:text-brand-100">
              Pilihan Anda memakai harga khusus (di atas 500 pengguna atau di atas 2 TB). Lanjutkan
              pendaftaran — tim kami akan menghubungi Anda dengan penawaran yang disesuaikan.
            </p>
            <dl className="space-y-2 text-[13.5px]">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Pengguna</dt>
                <dd className="font-semibold text-ink">{userTier?.name}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Penyimpanan</dt>
                <dd className="font-semibold text-ink">{storageTier?.name}</dd>
              </div>
              {moduleLines.length > 0 && (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Modul</dt>
                  <dd className="text-right font-semibold text-ink">{moduleLines.length} modul</dd>
                </div>
              )}
            </dl>
            <p className="text-[22px] font-extrabold tracking-tight text-ink">Hubungi kami</p>
            <Link href="/register" className="btn-primary w-full px-4 py-3.5 text-[15px]">
              Lanjutkan pendaftaran <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <dl className="space-y-2.5 text-[13.5px]">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Pengguna · {userTier?.name}</dt>
                <dd className="font-semibold text-ink">{rp(userPrice)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Penyimpanan · {storageTier?.name}</dt>
                <dd className="font-semibold text-ink">{rp(storagePrice)}</dd>
              </div>
              {moduleLines.map((l) => (
                <div key={l.name} className="flex justify-between gap-3">
                  <dt className="text-muted">Modul · {l.name}</dt>
                  <dd className="font-semibold text-ink">{rp(l.price)}</dd>
                </div>
              ))}
            </dl>
            <div className="space-y-2 border-t border-line pt-4 text-[13.5px]">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Subtotal</dt>
                <dd className="font-semibold text-ink">{rp(subtotal)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">PPN {ppnPercent}%</dt>
                <dd className="font-semibold text-ink">{rp(ppn)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3 pt-1">
                <dt className="text-[15px] font-bold text-ink">Total</dt>
                <dd className="text-right">
                  <span className="text-[26px] font-extrabold tracking-tight text-ink">{rp(total)}</span>
                  <span className="text-[13px] text-muted"> / {cycleLabel}</span>
                </dd>
              </div>
            </div>
            <Link href="/register" className="btn-primary w-full px-4 py-3.5 text-[15px]">
              Daftar dengan paket ini <ArrowRight className="h-4 w-4" />
            </Link>
            <p className="text-center text-[12.5px] leading-relaxed text-muted">
              Trial 30 hari gratis untuk pendaftaran baru. PPN {ppnPercent}% sudah termasuk dalam total
              di atas.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
