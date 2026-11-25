'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

type ProvisioningStatus = 'PROVISIONING' | 'ACTIVE' | 'FAILED';

interface StatusResponse {
  tenantCode: string;
  companyName: string;
  status: ProvisioningStatus;
  step: string;
}

const TENANT_CODE_RE = /^woork_t_[0-9a-f]{8}$/;

/** Label langkah provisioning yang ramah pengguna (tanpa istilah teknis). */
const STEP_LABELS: Record<string, string> = {
  CREATING_DB: 'Membuat database perusahaan…',
  MIGRATING: 'Menyiapkan struktur database…',
  SEEDING: 'Menyiapkan data awal perusahaan…',
  VERIFYING: 'Memverifikasi database…',
  DONE: 'Menyelesaikan penyiapan…',
};

function stepLabel(step: string): string {
  return STEP_LABELS[step] ?? 'Menyiapkan database perusahaan Anda…';
}

function ProvisioningContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tenant = searchParams.get('tenant') ?? '';
  const valid = TENANT_CODE_RE.test(tenant);

  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [invalidLink, setInvalidLink] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const redirectedRef = useRef(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/tenants/${tenant}/status`, { cache: 'no-store' });
      if (res.status === 400 || res.status === 404) {
        setInvalidLink(true);
        return;
      }
      if (!res.ok) {
        setLoadError(true);
        return;
      }
      const json = await res.json();
      const data = (json?.data ?? json) as StatusResponse;
      setLoadError(false);
      setStatus(data);
    } catch {
      setLoadError(true);
    }
  }, [tenant]);

  // Poll status tiap 3 detik sampai provisioning selesai atau gagal.
  useEffect(() => {
    if (!valid) return;
    void fetchStatus();
    const timer = setInterval(() => {
      void fetchStatus();
    }, 3000);
    return () => clearInterval(timer);
  }, [valid, fetchStatus]);

  // Berhenti polling saat terminal, dan arahkan ke login saat database siap.
  const terminal = status?.status === 'ACTIVE' || status?.status === 'FAILED';
  useEffect(() => {
    if (status?.status === 'ACTIVE' && !redirectedRef.current) {
      redirectedRef.current = true;
      const timer = setTimeout(() => {
        router.push(`/login?tenant=${tenant}`);
      }, 1200);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [status?.status, router, tenant]);

  return (
    <main className="min-h-screen bg-canvas text-ink flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg rounded-card border border-line bg-white px-6 py-8 shadow-soft sm:px-10 dark:bg-slate-900">
        <p className="text-sm font-semibold tracking-wide text-brand">WOORK</p>
        <h1 className="mt-2 text-xl font-bold leading-snug">Penyiapan Perusahaan</h1>

        {!valid || invalidLink ? (
          <div className="mt-6">
            <p className="text-sm text-muted">Tautan provisioning tidak valid.</p>
            <p className="mt-2 text-sm text-muted">
              Tautan ini mungkin sudah kedaluwarsa atau salah. Silakan kembali ke halaman masuk
              atau hubungi admin.
            </p>
            <Link
              href="/login"
              className="mt-6 inline-flex items-center justify-center rounded-btn bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600"
            >
              Kembali ke Masuk
            </Link>
          </div>
        ) : loadError && !status ? (
          <div className="mt-6">
            <p className="text-sm text-muted">
              Tidak dapat memeriksa status penyiapan saat ini. Silakan coba lagi.
            </p>
            <button
              type="button"
              onClick={() => void fetchStatus()}
              className="mt-6 inline-flex items-center justify-center rounded-btn bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600"
            >
              Coba lagi
            </button>
          </div>
        ) : status?.status === 'FAILED' ? (
          <div className="mt-6">
            <p className="text-base font-semibold text-danger">Provisioning gagal.</p>
            <p className="mt-2 text-sm text-muted">
              Penyiapan database untuk {status.companyName} tidak dapat diselesaikan. Silakan
              hubungi admin.
            </p>
            <Link
              href="/login"
              className="mt-6 inline-flex items-center justify-center rounded-btn border border-line bg-white px-4 py-2.5 text-sm font-semibold text-ink hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700"
            >
              Kembali ke Masuk
            </Link>
          </div>
        ) : status?.status === 'ACTIVE' ? (
          <div className="mt-6">
            <p className="text-base font-semibold text-emerald-600 dark:text-emerald-400">
              Database siap!
            </p>
            <p className="mt-2 text-sm text-muted">
              Database {status.companyName} sudah aktif. Anda akan diarahkan ke halaman masuk…
            </p>
          </div>
        ) : (
          <div className="mt-6">
            <div className="flex items-center gap-3">
              <span
                className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-line border-t-brand"
                aria-hidden="true"
              />
              <p className="text-base font-semibold">Menyiapkan database perusahaan Anda…</p>
            </div>
            <p className="mt-3 text-sm text-muted">
              {status ? stepLabel(status.step) : 'Memeriksa status penyiapan…'}
            </p>
            {status?.companyName ? (
              <p className="mt-4 rounded-btn border border-line bg-canvas px-4 py-3 text-sm">
                <span className="text-muted">Perusahaan: </span>
                <span className="font-semibold">{status.companyName}</span>
              </p>
            ) : null}
            <p className="mt-4 text-xs text-muted">
              Proses ini biasanya memakan waktu beberapa saat. Halaman ini memperbarui status
              secara otomatis — Anda tidak perlu memuat ulang.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

export default function ProvisioningPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-canvas text-ink flex items-center justify-center px-4 py-10">
          <div className="w-full max-w-lg rounded-card border border-line bg-white px-6 py-8 shadow-soft sm:px-10 dark:bg-slate-900">
            <p className="text-sm font-semibold tracking-wide text-brand">WOORK</p>
            <p className="mt-4 text-sm text-muted">Memuat status penyiapan…</p>
          </div>
        </main>
      }
    >
      <ProvisioningContent />
    </Suspense>
  );
}
