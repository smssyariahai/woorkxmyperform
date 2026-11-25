'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/ui/primitives';
import { apiJson } from '@/lib/calendar/client';

interface RegistrationStatus {
  id: string;
  companyName: string;
  status: string;
  decisionReason: string | null;
  decidedAt: string | null;
  createdAt: string;
}

const STATUS_META: Record<string, { label: string; badge: string; title: string; desc: string }> = {
  PENDING_VERIFICATION: {
    label: 'Menunggu Verifikasi',
    badge: 'bg-amber-100 text-amber-800',
    title: 'Pendaftaran Anda sedang diverifikasi',
    desc: 'Master akan memeriksa data dan dokumen perusahaan Anda. Anda dapat mengecek status pendaftaran kapan saja lewat tautan ini — tidak perlu login.',
  },
  NEEDS_REVISION: {
    label: 'Perlu Perbaikan',
    badge: 'bg-amber-100 text-amber-800',
    title: 'Pendaftaran Anda perlu diperbaiki',
    desc: 'Master meminta perbaikan pada pendaftaran Anda. Perbaiki data yang disebutkan di bawah ini, lalu kirim ulang pendaftaran Anda.',
  },
  REJECTED: {
    label: 'Ditolak',
    badge: 'bg-red-100 text-danger',
    title: 'Pendaftaran Anda ditolak',
    desc: 'Master menolak pendaftaran ini dengan alasan di bawah. Anda dapat mendaftar ulang dari awal dengan data yang sudah diperbaiki.',
  },
  APPROVED: {
    label: 'Disetujui',
    badge: 'bg-emerald-100 text-emerald-800',
    title: 'Pendaftaran Anda disetujui',
    desc: 'Selamat! Workspace perusahaan Anda sudah dibuat. Undangan Administrator pertama dikirim ke email yang Anda daftarkan — silakan masuk untuk mulai memakai WOORK.',
  },
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return iso;
  }
}

function StatusInner() {
  const params = useSearchParams();
  const ref = params.get('ref') ?? '';
  const token = params.get('token') ?? '';
  const [data, setData] = useState<RegistrationStatus | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ref || !token) {
      setError('Tautan status tidak lengkap. Buka tautan status yang Anda terima setelah mendaftar.');
      setLoading(false);
      return;
    }
    apiJson<RegistrationStatus>(`/api/public/registrations/${encodeURIComponent(ref)}?token=${encodeURIComponent(token)}`)
      .then(setData)
      .catch(() => setError('Pendaftaran tidak ditemukan atau tautan sudah tidak berlaku.'))
      .finally(() => setLoading(false));
  }, [ref, token]);

  const meta = data ? STATUS_META[data.status] : null;

  return (
    <div>
      <div className="mb-8 hidden lg:block">
        <Logo />
      </div>
      <h1 className="text-[24px] font-bold text-ink">Status Pendaftaran</h1>

      {loading && <p className="mt-8 text-sm text-muted">Memuat status pendaftaran…</p>}

      {!loading && error && (
        <div className="mt-8 rounded-input border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-medium text-danger" role="alert">
          {error}
        </div>
      )}

      {!loading && data && meta && (
        <div className="mt-8 space-y-4">
          <span className={'inline-block rounded-full px-3 py-1 text-[12px] font-bold ' + meta.badge}>
            {meta.label}
          </span>
          <h2 className="text-[16px] font-bold text-ink">{meta.title}</h2>
          <p className="text-[13px] text-muted">{meta.desc}</p>
          <div className="rounded-input border border-line px-4 py-3 text-[13px] space-y-1">
            <p className="flex justify-between"><span className="text-muted">Perusahaan</span><span className="font-semibold text-ink">{data.companyName}</span></p>
            <p className="flex justify-between"><span className="text-muted">Didaftarkan</span><span className="font-semibold text-ink">{formatDate(data.createdAt)}</span></p>
            {data.decidedAt && (
              <p className="flex justify-between"><span className="text-muted">Diputuskan</span><span className="font-semibold text-ink">{formatDate(data.decidedAt)}</span></p>
            )}
          </div>
          {data.decisionReason && (
            <div className="rounded-input bg-canvas px-4 py-3 text-[13px]">
              <p className="font-bold text-ink">Catatan Master</p>
              <p className="mt-1 text-muted">{data.decisionReason}</p>
            </div>
          )}
          <div className="flex flex-col gap-3 pt-2">
            {data.status === 'APPROVED' && (
              <Link href="/login">
                <Button className="w-full !py-3">Masuk ke WOORK</Button>
              </Link>
            )}
            {data.status === 'NEEDS_REVISION' && (
              <Link href={`/register/resubmit?ref=${encodeURIComponent(data.id)}&token=${encodeURIComponent(token)}`}>
                <Button className="w-full !py-3">Perbaiki &amp; Kirim Ulang</Button>
              </Link>
            )}
            {(data.status === 'NEEDS_REVISION' || data.status === 'REJECTED') && (
              <Link href="/register">
                <Button className="w-full !py-3">Daftar Ulang</Button>
              </Link>
            )}
            <Link href="/login" className="text-center text-[13px] font-semibold text-brand hover:underline">
              Sudah memiliki akun? Masuk
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default function RegistrationStatusPage() {
  return (
    <Suspense fallback={<p className="mt-8 text-sm text-muted">Memuat status pendaftaran…</p>}>
      <StatusInner />
    </Suspense>
  );
}
