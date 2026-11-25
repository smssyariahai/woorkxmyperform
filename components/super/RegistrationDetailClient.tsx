'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, Badge } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { apiJson } from '@/lib/calendar/client';

const STATUS_META: Record<string, { tone: 'green' | 'amber' | 'red' | 'gray'; label: string }> = {
  PENDING_VERIFICATION: { tone: 'amber', label: 'Menunggu Verifikasi' },
  NEEDS_REVISION: { tone: 'amber', label: 'Perlu Perbaikan' },
  APPROVED: { tone: 'green', label: 'Disetujui' },
  REJECTED: { tone: 'red', label: 'Ditolak' },
};

const DOC_TYPE_LABELS: Record<string, string> = {
  COMPANY_IDENTITY: 'Identitas perusahaan',
  PIC_KTP: 'KTP penanggung jawab',
  NPWP: 'NPWP',
  COOPERATIVE: 'Dokumen koperasi',
  SUPPORTING: 'Dokumen pendukung',
};

const DATA_DIGITIZED_LABELS: Record<string, string> = {
  ALL: 'Sudah semua',
  PARTIAL: 'Sebagian',
  NONE: 'Belum sama sekali',
};

const DOC_VOLUME_LABELS: Record<string, string> = {
  LOW: 'Sedikit',
  MEDIUM: 'Sedang',
  HIGH: 'Banyak',
};

interface SelfAssessment {
  employeeCount3mo?: number;
  neededModules?: string[];
  dataDigitized?: string;
  adminName?: string;
  adminEmail?: string;
  adminPhone?: string;
  wantsBranding?: boolean;
  docVolume?: string;
  heardFrom?: string;
  heardFromDetail?: string;
}

interface PackageSnapshot {
  userTierName?: string | null;
  storageTierName?: string | null;
  moduleNames?: string[];
  monthlyPrice?: number | null;
  yearlyPrice?: number | null;
  base?: number | null;
  ppn?: number | null;
  total?: number | null;
  ppnRateBps?: number | null;
}

interface RegistrationDocument {
  id: string;
  docType: string;
  docSubtype: string | null;
  fileName: string;
  fileSize: number;
  createdAt: string;
}

interface RegistrationTenant {
  id: string;
  tenantCode: string;
  tenantStatus: string;
  databaseStatus: string;
}

interface RegistrationDetail {
  id: string;
  companyName: string;
  legalEntityType: string;
  businessField: string;
  companyAddress: string;
  city: string;
  companyPhone: string;
  picName: string;
  picPosition: string;
  picEmail: string;
  picPhone: string;
  nib: string | null;
  userTierId: string | null;
  storageTierId: string | null;
  moduleKeys: string[];
  billingCycle: string;
  startChoice: string;
  npwpStatus: string;
  npwpStatement: string | null;
  status: string;
  decidedByUserId: string | null;
  decidedByName?: string | null;
  decidedAt: string | null;
  decisionReason: string | null;
  tenantId: string | null;
  createdAt: string;
  updatedAt: string;
  selfAssessment: SelfAssessment;
  packageSnapshot: PackageSnapshot;
  documents: RegistrationDocument[];
  tenant: RegistrationTenant | null;
  viewerIsSuperAdmin: boolean;
}

interface ApproveResult {
  tenantId: string;
  tenantCode: string;
  adminEmail: string;
  startChoice: string;
  invitationNote: string;
  packageSyncWarning?: string;
}

function fmtDate(v: string | null | undefined): string {
  if (!v) return '—';
  return new Date(v).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

function fmtDateTime(v: string | null | undefined): string {
  if (!v) return '—';
  return new Date(v).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatIDR(n: number | null | undefined): string {
  if (n === null || n === undefined) return 'Harga khusus';
  return 'Rp' + n.toLocaleString('id-ID');
}

function formatKB(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(2)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <p className="flex flex-wrap justify-between gap-2 text-[13px]">
      <span className="text-muted">{label}</span>
      <span className="font-medium text-ink text-right">{value}</span>
    </p>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="p-4 sm:p-5">
      <h2 className="text-[15px] font-bold text-ink">{title}</h2>
      <div className="mt-3 space-y-2">{children}</div>
    </Card>
  );
}

export function RegistrationDetailClient({ id }: { id: string }) {
  const [data, setData] = useState<RegistrationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionOk, setActionOk] = useState('');
  const [busy, setBusy] = useState('');
  const [reason, setReason] = useState('');
  const [approveResult, setApproveResult] = useState<ApproveResult | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await apiJson<RegistrationDetail>(`/api/super/registrations/${encodeURIComponent(id)}`);
      setData(d);
      setError('');
    } catch (e: any) {
      setError(e.message || 'Gagal memuat detail pendaftaran.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function postAction(path: string, body: any, busyKey: string) {
    setActionError('');
    setActionOk('');
    setBusy(busyKey);
    try {
      const res = await apiJson<any>(`/api/super/registrations/${encodeURIComponent(id)}/${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      });
      if (path === 'approve') {
        setApproveResult(res as ApproveResult);
        setActionOk('Pendaftaran disetujui — tenant baru dibuat.');
      } else if (path === 'request-revision') {
        setActionOk('Permintaan perbaikan dikirim — pendaftaran kembali ke pemohon.');
      } else {
        setActionOk('Pendaftaran ditolak.');
      }
      setReason('');
      await load();
    } catch (e: any) {
      setActionError(e.message || 'Keputusan gagal disimpan.');
    } finally {
      setBusy('');
    }
  }

  function submitRevisionOrReject(path: string, busyKey: string) {
    if (reason.trim().length < 10) {
      setActionError('Alasan wajib diisi minimal 10 karakter.');
      return;
    }
    postAction(path, { reason: reason.trim() }, busyKey);
  }

  if (loading) return <p className="text-sm text-muted">Memuat detail pendaftaran…</p>;

  if (error || !data) {
    return (
      <div className="rounded-input border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-medium text-danger" role="alert">
        {error || 'Pendaftaran tidak ditemukan.'}
      </div>
    );
  }

  const meta = STATUS_META[data.status] ?? { tone: 'gray' as const, label: data.status };
  const sa = data.selfAssessment ?? {};
  const snap = data.packageSnapshot ?? {};
  const isPending = data.status === 'PENDING_VERIFICATION';

  return (
    <div className="space-y-4">
      <div>
        <Link href="/admin/verifikasi-pendaftaran" className="text-[13px] font-semibold text-brand hover:underline">
          ← Kembali ke antrean
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-bold text-ink">{data.companyName}</h1>
          <Badge tone={meta.tone}>{meta.label}</Badge>
        </div>
        <p className="mt-1 text-sm text-muted">
          Didaftarkan {fmtDate(data.createdAt)} · {data.legalEntityType} · {data.city}
        </p>
      </div>

      {actionError && (
        <div className="rounded-input border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-medium text-danger" role="alert">
          {actionError}
        </div>
      )}
      {actionOk && (
        <div className="rounded-input border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] font-medium text-emerald-800" role="status">
          {actionOk}
        </div>
      )}

      <Section title="Perusahaan">
        <Row label="Nama perusahaan" value={data.companyName} />
        <Row label="Bentuk badan usaha" value={data.legalEntityType} />
        <Row label="Bidang usaha" value={data.businessField} />
        <Row label="Alamat" value={data.companyAddress} />
        <Row label="Kota" value={data.city} />
        <Row label="Telepon perusahaan" value={data.companyPhone} />
        <Row label="NIB / identitas badan usaha" value={data.nib ?? '—'} />
      </Section>

      <Section title="Penanggung Jawab (PIC)">
        <Row label="Nama" value={data.picName} />
        <Row label="Jabatan" value={data.picPosition} />
        <Row label="Email" value={data.picEmail} />
        <Row label="Telepon" value={data.picPhone} />
      </Section>

      <Section title="Paket yang dipilih">
        <Row label="Batas pengguna" value={snap.userTierName ?? '—'} />
        <Row label="Batas storage" value={snap.storageTierName ?? '—'} />
        <Row label="Modul" value={(snap.moduleNames?.length ?? 0) > 0 ? snap.moduleNames!.join(', ') : '—'} />
        <Row label="Siklus pembayaran" value={data.billingCycle === 'YEARLY' ? 'Tahunan' : 'Bulanan'} />
        <Row label="Mulai dengan" value={data.startChoice === 'TRIAL' ? 'Trial 30 hari' : 'Langsung berlangganan'} />
        {snap.monthlyPrice !== undefined && snap.monthlyPrice !== null && (
          <Row label="Harga dasar / bulan" value={formatIDR(snap.monthlyPrice)} />
        )}
        {snap.total !== undefined && snap.total !== null && (
          <Row label={`Total ${data.billingCycle === 'YEARLY' ? 'per tahun' : 'per bulan'} (termasuk PPN)`} value={formatIDR(snap.total)} />
        )}
      </Section>

      <Section title="Self Assessment">
        <Row label="1. Pengguna 3 bulan pertama" value={sa.employeeCount3mo !== undefined ? `${sa.employeeCount3mo} orang` : '—'} />
        <Row label="2. Modul paling dibutuhkan" value={(sa.neededModules?.length ?? 0) > 0 ? sa.neededModules!.join(', ') : '—'} />
        <Row label="3. Data sudah terdigitalisasi" value={sa.dataDigitized ? (DATA_DIGITIZED_LABELS[sa.dataDigitized] ?? sa.dataDigitized) : '—'} />
        <Row label="4. Calon Administrator" value={sa.adminName ? `${sa.adminName} — ${sa.adminEmail ?? ''} — ${sa.adminPhone ?? ''}` : '—'} />
        <Row label="5. Logo & warna sendiri" value={sa.wantsBranding === true ? 'Ya' : sa.wantsBranding === false ? 'Tidak' : '—'} />
        <Row label="6. Volume dokumen / bulan" value={sa.docVolume ? (DOC_VOLUME_LABELS[sa.docVolume] ?? sa.docVolume) : '—'} />
        <Row label="7. Mengenal WOORK dari" value={sa.heardFrom ? `${sa.heardFrom}${sa.heardFromDetail ? ` — ${sa.heardFromDetail}` : ''}` : '—'} />
      </Section>

      <Section title="Dokumen">
        {data.documents.length === 0 && <p className="text-[13px] text-muted">Tidak ada dokumen.</p>}
        {data.documents.map((doc) => {
          const isKtp = doc.docType === 'PIC_KTP';
          const ktpBlocked = isKtp && !data.viewerIsSuperAdmin;
          return (
            <div key={doc.id} className="flex flex-wrap items-center justify-between gap-2 rounded-input border border-line px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-ink">
                  {DOC_TYPE_LABELS[doc.docType] ?? doc.docType}
                  {doc.docSubtype ? ` — ${doc.docSubtype}` : ''}
                </p>
                <p className="text-[12px] text-muted">
                  {doc.fileName} · {formatKB(doc.fileSize)} · {fmtDate(doc.createdAt)}
                </p>
                {isKtp && (
                  <p className="text-[12px] font-semibold text-amber-700">Hanya Master Administrator</p>
                )}
                {ktpBlocked && (
                  <p className="text-[12px] text-muted">Anda bukan Master Administrator — KTP tidak dapat dibuka.</p>
                )}
              </div>
              {ktpBlocked ? (
                <Button type="button" variant="secondary" disabled>
                  Unduh
                </Button>
              ) : (
                <a
                  href={`/api/super/registrations/${encodeURIComponent(id)}/documents/${encodeURIComponent(doc.id)}`}
                  className="inline-flex items-center justify-center rounded-input border border-line bg-white px-3 py-2 text-[13px] font-semibold text-ink hover:border-brand/60"
                >
                  Unduh
                </a>
              )}
            </div>
          );
        })}
        <p className="text-[12px] text-muted">Setiap pembukaan KTP dicatat di audit log.</p>
      </Section>

      <Section title="Keputusan">
        {isPending && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                loading={busy === 'approve'}
                disabled={busy !== ''}
                onClick={() => postAction('approve', {}, 'approve')}
              >
                Setujui
              </Button>
            </div>
            <div className="space-y-2">
              <label htmlFor="decision-reason" className="text-[13px] font-semibold text-ink">
                Alasan perbaikan / penolakan (minimal 10 karakter)
              </label>
              <textarea
                id="decision-reason"
                className="input min-h-[72px] resize-y"
                placeholder="Tulis apa yang perlu diperbaiki, atau alasan penolakan…"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  loading={busy === 'request-revision'}
                  disabled={busy !== ''}
                  onClick={() => submitRevisionOrReject('request-revision', 'request-revision')}
                >
                  Minta Perbaikan
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  loading={busy === 'reject'}
                  disabled={busy !== ''}
                  onClick={() => submitRevisionOrReject('reject', 'reject')}
                >
                  Tolak
                </Button>
              </div>
            </div>
          </div>
        )}

        {data.status === 'APPROVED' && (
          <div className="space-y-2 text-[13px]">
            <Row label="Tenant" value={data.tenant ? `${data.tenant.tenantCode} (${data.tenant.tenantStatus})` : (approveResult?.tenantCode ?? '—')} />
            {data.decidedAt && <Row label="Disetujui" value={fmtDateTime(data.decidedAt)} />}
            {data.tenant && (
              <p>
                <Link href={`/admin/tenants/${data.tenant.id}`} className="font-semibold text-brand hover:underline">
                  Lihat tenant →
                </Link>
              </p>
            )}
            {(approveResult?.invitationNote || data.tenant) && approveResult?.invitationNote && (
              <div className="rounded-input bg-canvas px-4 py-3">
                <p className="font-bold text-ink">Undangan Client Admin</p>
                <p className="mt-1 text-muted">{approveResult.invitationNote}</p>
              </div>
            )}
            {!approveResult?.invitationNote && (
              <div className="rounded-input bg-canvas px-4 py-3">
                <p className="text-muted">
                  Akun Client Admin dibuat tanpa password. Email undangan belum bisa dikirim otomatis — minta admin mengatur password lewat /forgot-password.
                </p>
              </div>
            )}
            {approveResult?.packageSyncWarning && (
              <div className="rounded-input border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="font-bold text-ink">Modul paket belum tersinkron</p>
                <p className="mt-1 text-muted">
                  {approveResult.packageSyncWarning} Modul berbayar belum aktif di tenant ini — tenant tidak akan melihat modul apa pun sampai sinkronisasi diulang (jalankan skrip sync-package-modules atau ubah paket di halaman tenant).
                </p>
              </div>
            )}
          </div>
        )}

        {(data.status === 'NEEDS_REVISION' || data.status === 'REJECTED') && (
          <div className="space-y-2 text-[13px]">
            <Row label="Diputuskan" value={fmtDateTime(data.decidedAt)} />
            {(data.decidedByName || data.decidedByUserId) && (
              <Row label="Diputuskan oleh" value={data.decidedByName ?? data.decidedByUserId ?? '—'} />
            )}
            {data.decisionReason && (
              <div className="rounded-input bg-canvas px-4 py-3">
                <p className="font-bold text-ink">Alasan</p>
                <p className="mt-1 text-muted">{data.decisionReason}</p>
              </div>
            )}
          </div>
        )}
      </Section>
    </div>
  );
}
