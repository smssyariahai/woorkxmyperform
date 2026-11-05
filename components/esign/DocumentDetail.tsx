'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardTitle, Badge } from '@/components/ui/primitives';
import { toast } from 'sonner';
import { friendlyFetchError } from '@/lib/fetch-error';
import { FileSignature, Trash2, ExternalLink, Download, Users, History, Send, XCircle, CheckCircle2, ShieldCheck, AlertTriangle, Copy, PenLine } from 'lucide-react';
import { PdfViewer } from './PdfViewer';
import { EsignUpload } from './EsignUpload';
import { SignerManager } from './SignerManager';
import { EsignClient } from './EsignClient';
import { ESIGN_STATUS_META } from './status';

const tgl = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const jam = (s?: string | null) =>
  s
    ? new Date(s).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';

async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!j.success) throw new Error(j.message || 'Terjadi kesalahan.');
  return j.data;
}

const STATUS_TONE: Record<string, 'green' | 'amber' | 'blue' | 'red' | 'gray'> = {
  DRAFT: 'gray',
  PENDING_APPROVAL: 'amber',
  PENDING_SIGNATURE: 'blue',
  PARTIALLY_SIGNED: 'blue',
  SIGNED: 'green',
  COMPLETED: 'green',
  REJECTED: 'red',
  CANCELLED: 'red',
  EXPIRED: 'red',
};

/** Satu baris hasil verifikasi hash: status + hash terpotong + salin/lihat penuh. */
function HashRow({ label, info }: { label: string; info: { present: boolean; valid: boolean; storedHash: string | null; actualHash: string | null } }) {
  const [full, setFull] = useState(false);
  const [copied, setCopied] = useState(false);
  const hash = info.actualHash ?? info.storedHash;
  const shown = hash ? (full ? hash : `${hash.slice(0, 20)}…`) : '—';
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 border-b border-line py-2 text-[13px] last:border-0">
      <span className="text-muted">{label}</span>
      <span className="text-right">
        {!info.present ? (
          <Badge tone="gray">Belum ada file</Badge>
        ) : info.valid ? (
          <Badge tone="green">Cocok</Badge>
        ) : (
          <Badge tone="red">Tidak cocok</Badge>
        )}
        {hash && (
          <span className="mt-1 block break-all">
            <code className="text-[12px]">{shown}</code>{' '}
            <button
              type="button"
              className="text-brand-700 hover:underline"
              onClick={() => {
                navigator.clipboard?.writeText(hash).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                });
              }}
            >
              <Copy className="inline h-3.5 w-3.5" /> {copied ? 'Disalin' : 'Salin'}
            </button>{' '}
            <button type="button" className="text-brand-700 hover:underline" onClick={() => setFull((v) => !v)}>
              {full ? 'Sembunyikan' : 'Lihat penuh'}
            </button>
          </span>
        )}
        {info.present && !info.valid && info.storedHash && info.actualHash && (
          <span className="mt-1 block break-all text-muted">
            Tersimpan: <code className="text-[12px]">{info.storedHash.slice(0, 20)}…</code>
          </span>
        )}
      </span>
    </div>
  );
}

/** Halaman detail dokumen E-Sign: info, preview PDF / upload, penandatangan, riwayat. */
export function DocumentDetail({ id }: { id: string }) {
  const router = useRouter();
  const [item, setItem] = useState<any>(null);
  const [viewerUserId, setViewerUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [verify, setVerify] = useState<any>(null);
  const [verifying, setVerifying] = useState(false);
  const [flags, setFlags] = useState({ showSignerName: true, showSignerPosition: true, showSignedDate: true, showDocRef: true });
  const [savingDisplay, setSavingDisplay] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  // Info tanda tangan milik viewer sendiri (dari GET detail): token hanya
  // diisi server bila sekarang memang gilirannya.
  const [mySign, setMySign] = useState<{ token: string | null; status: string | null; turn: boolean; waiting: boolean }>({
    token: null,
    status: null,
    turn: false,
    waiting: false,
  });

  async function checkIntegrity() {
    setVerifying(true);
    try {
      const data = await api(`/api/esign/documents/${id}/verify`);
      setVerify(data);
    } catch (e: any) {
      toast.error(friendlyFetchError(e, 'Gagal memverifikasi dokumen.'));
    } finally {
      setVerifying(false);
    }
  }

  async function load(silent = false) {
    if (!silent) setLoading(true);
    setErr('');
    try {
      const data = await api(`/api/esign/documents/${id}`);
      setItem(data.item);
      setViewerUserId(data.viewerUserId ?? null);
      setMySign({
        token: data.mySignToken ?? null,
        status: data.mySigningStatus ?? null,
        turn: !!data.myTurn,
        waiting: !!data.myWaiting,
      });
      setFlags({
        showSignerName: data.item.showSignerName ?? true,
        showSignerPosition: data.item.showSignerPosition ?? true,
        showSignedDate: data.item.showSignedDate ?? true,
        showDocRef: data.item.showDocRef ?? true,
      });
    } catch (e: any) {
      if (!silent) setErr(friendlyFetchError(e, 'Gagal memuat dokumen.'));
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function act(action: 'send' | 'cancel' | 'approve' | 'reject-approval', label: string) {
    if (action === 'send') {
      if (!item.originalFilePath) {
        toast.error('Unggah file PDF terlebih dahulu.');
        return;
      }
      if (!item.signers?.length) {
        toast.error('Tambahkan minimal satu penandatangan terlebih dahulu.');
        return;
      }
      if (!window.confirm(`Kirim dokumen "${item.title}" untuk ditandatangani?`)) return;
    }
    if (action === 'cancel') {
      if (!window.confirm(`Batalkan dokumen "${item.title}"? Tindakan ini tidak dapat dibatalkan.`)) return;
    }
    let body: any = undefined;
    if (action === 'approve') {
      if (!window.confirm(`Setujui dokumen "${item.title}" untuk lanjut ke tahap tanda tangan?`)) return;
      body = { approved: true };
    }
    if (action === 'reject-approval') {
      const reason = window.prompt('Alasan penolakan persetujuan (opsional):') ?? '';
      body = { approved: false, reason: reason || undefined };
    }
    setActing(action);
    try {
      const data = await api(`/api/esign/documents/${id}/${action === 'reject-approval' ? 'approve' : action}`, {
        method: 'POST',
        body: body ? JSON.stringify(body) : undefined,
      });
      toast.success(label);
      if (data?.warnings?.length) {
        toast.warning(`${data.warnings.length} penandatangan belum memiliki posisi tanda tangan di PDF.`);
      }
      await load();
    } catch (e: any) {
      toast.error(friendlyFetchError(e, 'Gagal memproses.'));
    } finally {
      setActing(null);
    }
  }

  async function remove() {
    if (!window.confirm(`Hapus dokumen "${item?.title}"? Tindakan ini tidak dapat dibatalkan.`)) return;
    setDeleting(true);
    try {
      await api(`/api/esign/documents/${id}`, { method: 'DELETE' });
      toast.success('Dokumen dihapus.');
      router.push('/esign');
    } catch (e: any) {
      toast.error(friendlyFetchError(e, 'Gagal menghapus dokumen.'));
    } finally {
      setDeleting(false);
    }
  }

  async function saveDisplay() {
    setSavingDisplay(true);
    try {
      await api(`/api/esign/documents/${id}`, { method: 'PATCH', body: JSON.stringify(flags) });
      toast.success('Pengaturan tampilan tanda tangan disimpan.');
      await load(true);
    } catch (e: any) {
      toast.error(friendlyFetchError(e, 'Gagal menyimpan pengaturan tampilan.'));
    } finally {
      setSavingDisplay(false);
    }
  }

  async function regenerate() {
    if (!window.confirm(`Buat ulang PDF final "${item?.title}" dengan tampilan tanda tangan saat ini? File asli tidak berubah.`)) return;
    setRegenerating(true);
    try {
      await api(`/api/esign/documents/${id}/finalize`, { method: 'POST' });
      toast.success('PDF final dibuat ulang.');
      await load(true);
    } catch (e: any) {
      toast.error(friendlyFetchError(e, 'Gagal membuat ulang PDF final.'));
    } finally {
      setRegenerating(false);
    }
  }

  if (loading) return <p className="py-10 text-center text-[13px] text-muted">Memuat dokumen…</p>;
  if (err || !item) {
    return (
      <div className="mx-auto max-w-3xl py-10 text-center">
        <p className="font-semibold text-ink">Dokumen tidak dapat dibuka.</p>
        <p className="mt-1 text-[13px] text-muted">{err || 'Dokumen tidak ditemukan.'}</p>
        <Link href="/esign" className="btn-secondary mt-4 inline-block">
          Kembali ke daftar
        </Link>
      </div>
    );
  }

  const meta = ESIGN_STATUS_META[item.status] ?? { label: item.status, cls: 'badge-gray' };
  const fileUrl = `/api/esign/documents/${item.id}/file`;
  const signedCount = (item.signers ?? []).filter((s: any) => s.signingStatus === 'SIGNED').length;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <EsignClient onEvent={() => load(true)} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-ink">
            <FileSignature className="h-5 w-5 text-brand-700" /> {item.title}
          </h1>
          <p className="mt-1 text-[13px] text-muted">
            {item.documentNumber} · {item.category} · dibuat {tgl(item.createdAt)} oleh {item.createdBy?.name ?? '—'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={STATUS_TONE[item.status] ?? 'gray'}>{meta.label}</Badge>
          {mySign.turn && mySign.token && (
            <Link href={`/esign/sign/${mySign.token}`} className="btn-primary">
              <PenLine className="mr-1 inline h-4 w-4" /> Tanda Tangani
            </Link>
          )}
          {!mySign.turn && mySign.waiting && (
            <span className="text-[12.5px] text-muted">Menunggu giliran penandatangan sebelumnya</span>
          )}
          {item.status === 'DRAFT' && (
            <>
              <button
                type="button"
                className="btn-primary"
                onClick={() => act('send', 'Dokumen dikirim untuk ditandatangani.')}
                disabled={acting !== null}
              >
                <Send className="mr-1 inline h-4 w-4" /> {acting === 'send' ? 'Mengirim…' : 'Kirim'}
              </button>
              <button type="button" className="btn-secondary !text-danger" onClick={remove} disabled={deleting}>
                <Trash2 className="mr-1 inline h-4 w-4" /> {deleting ? 'Menghapus…' : 'Hapus'}
              </button>
            </>
          )}
          {item.status === 'PENDING_APPROVAL' && viewerUserId && item.approver?.id === viewerUserId && (
            <>
              <button
                type="button"
                className="btn-primary"
                onClick={() => act('approve', 'Dokumen disetujui — lanjut ke tahap tanda tangan.')}
                disabled={acting !== null}
              >
                <CheckCircle2 className="mr-1 inline h-4 w-4" /> Setujui
              </button>
              <button
                type="button"
                className="btn-secondary !text-danger"
                onClick={() => act('reject-approval', 'Persetujuan ditolak.')}
                disabled={acting !== null}
              >
                <XCircle className="mr-1 inline h-4 w-4" /> Tolak
              </button>
            </>
          )}
          {['PENDING_APPROVAL', 'PENDING_SIGNATURE', 'PARTIALLY_SIGNED'].includes(item.status) && (
            <button
              type="button"
              className="btn-secondary !text-danger"
              onClick={() => act('cancel', 'Dokumen dibatalkan.')}
              disabled={acting !== null}
            >
              <XCircle className="mr-1 inline h-4 w-4" /> {acting === 'cancel' ? 'Membatalkan…' : 'Batalkan'}
            </button>
          )}
        </div>
      </div>

      <Card>
        <div className="grid gap-3 text-[13px] sm:grid-cols-2">
          <p>
            <span className="text-muted">Alur tanda tangan: </span>
            <b>{item.workflowType === 'PARALLEL' ? 'Bersamaan (parallel)' : 'Berurutan (sequential)'}</b>
          </p>
          <p>
            <span className="text-muted">Persetujuan: </span>
            <b>
              {item.approvalStatus === 'NOT_REQUIRED'
                ? 'Tidak diperlukan'
                : `${item.approvalStatus}${item.approver?.name ? ` · oleh ${item.approver.name}` : ''}`}
            </b>
          </p>
          <p>
            <span className="text-muted">Kedaluwarsa: </span>
            <b>{tgl(item.expiresAt)}</b>
          </p>
          <p>
            <span className="text-muted">Penandatangan: </span>
            <b>
              {signedCount}/{item.signers?.length ?? 0} selesai
            </b>
          </p>
          {item.description && (
            <p className="sm:col-span-2">
              <span className="text-muted">Deskripsi: </span>
              {item.description}
            </p>
          )}
          {item.originalHash && (
            <p className="sm:col-span-2 break-all">
              <span className="text-muted">SHA-256 file asli: </span>
              <code className="text-[12px]">{item.originalHash}</code>
            </p>
          )}
          {item.finalHash && (
            <p className="sm:col-span-2 break-all">
              <span className="text-muted">SHA-256 PDF final: </span>
              <code className="text-[12px]">{item.finalHash}</code>
            </p>
          )}
          {item.completedAt && (
            <p>
              <span className="text-muted">Selesai: </span>
              <b>{jam(item.completedAt)}</b>
            </p>
          )}
        </div>
        {item.originalFilePath && (
          <a href={fileUrl} target="_blank" rel="noreferrer" className="btn-secondary mt-4 inline-block">
            <ExternalLink className="mr-1 inline h-4 w-4" /> Buka PDF di tab baru
          </a>
        )}
        {item.status === 'COMPLETED' && item.finalFilePath && (
          <>
            <a href={`/api/esign/documents/${item.id}/final`} className="btn-primary ml-2 mt-4 inline-block">
              <Download className="mr-1 inline h-4 w-4" /> Unduh PDF Final
            </a>
            <button type="button" className="btn-secondary ml-2 mt-4" onClick={regenerate} disabled={regenerating}>
              {regenerating ? 'Membuat ulang…' : 'Buat ulang PDF final'}
            </button>
          </>
        )}
      </Card>

      {/* Tampilan tanda tangan di PDF final */}
      <Card>
        <CardTitle>Tampilan tanda tangan di PDF final</CardTitle>
        <p className="mt-1 text-[13px] text-muted">
          Elemen di bawah gambar tanda tangan. Bisa diubah kapan saja — ubah lalu tekan Simpan; untuk dokumen yang
          sudah selesai, tekan &quot;Buat ulang PDF final&quot; agar perubahan terlihat di file final.
        </p>
        <div className="mt-3 grid gap-2 text-[13px] sm:grid-cols-2">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={flags.showSignerName} onChange={(e) => setFlags({ ...flags, showSignerName: e.target.checked })} />
            Nama penandatangan
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={flags.showSignerPosition} onChange={(e) => setFlags({ ...flags, showSignerPosition: e.target.checked })} />
            Jabatan
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={flags.showSignedDate} onChange={(e) => setFlags({ ...flags, showSignedDate: e.target.checked })} />
            Tanggal tanda tangan
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={flags.showDocRef} onChange={(e) => setFlags({ ...flags, showDocRef: e.target.checked })} />
            Nomor referensi dokumen
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="btn-primary" onClick={saveDisplay} disabled={savingDisplay}>
            {savingDisplay ? 'Menyimpan…' : 'Simpan tampilan'}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setFlags({ showSignerName: false, showSignerPosition: false, showSignedDate: false, showDocRef: false })}
          >
            Hanya tanda tangan
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setFlags({ showSignerName: true, showSignerPosition: true, showSignedDate: true, showDocRef: true })}
          >
            Tampilkan semua
          </button>
        </div>
      </Card>

      {/* Verifikasi integritas */}
      <Card>
        <CardTitle>
          <span className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" /> Verifikasi Integritas
          </span>
        </CardTitle>
        <p className="mt-2 text-[13px] text-muted">
          Memeriksa ulang hash SHA-256 file di server terhadap hash yang tersimpan saat dokumen dibuat/difinalisasi.
          Verifikasi ini adalah pemeriksaan integritas internal — bukan sertifikat elektronik tersertifikasi.
        </p>
        <button type="button" className="btn-primary mt-3" onClick={checkIntegrity} disabled={verifying}>
          {verifying ? 'Memeriksa…' : 'Periksa Sekarang'}
        </button>
        {verify && (
          <div className="mt-4">
            {((verify.original?.present && !verify.original?.valid) || (verify.final?.present && !verify.final?.valid)) && (
              <p className="mb-3 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-[13px] font-semibold text-red-700">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                PERINGATAN: hash tidak cocok — file telah berubah setelah finalisasi. Jangan percaya isi file ini sebelum diperiksa.
              </p>
            )}
            <HashRow label="File asli (PDF awal)" info={verify.original} />
            <HashRow label="PDF final" info={verify.final} />
            <p className="mt-2 text-[12px] text-muted">Diperiksa: {jam(verify.checkedAt)}</p>
          </div>
        )}
      </Card>

      {/* File / preview */}
      <Card>
        <CardTitle>{item.originalFilePath ? 'Preview PDF' : 'Unggah PDF'}</CardTitle>
        <div className="mt-4">
          {item.originalFilePath ? (
            <PdfViewer src={fileUrl} />
          ) : (
            <>
              <p className="mb-3 text-[13px] text-muted">
                Dokumen masih DRAFT dan belum memiliki file. Unggah PDF untuk melihat preview.
              </p>
              <EsignUpload documentId={item.id} onUploaded={() => load()} />
            </>
          )}
        </div>
      </Card>

      {/* Penandatangan */}
      <Card>
        <CardTitle>
          <span className="flex items-center gap-2">
            <Users className="h-4 w-4" /> Penandatangan
          </span>
        </CardTitle>
        <div className="mt-2">
          <SignerManager
            documentId={item.id}
            signers={item.signers ?? []}
            canManage={item.status === 'DRAFT'}
            fileUrl={item.originalFilePath ? fileUrl : null}
            onChanged={load}
          />
        </div>
      </Card>

      {/* Riwayat */}
      <Card>
        <CardTitle>
          <span className="flex items-center gap-2">
            <History className="h-4 w-4" /> Riwayat aktivitas
          </span>
        </CardTitle>
        {item.auditLogs?.length ? (
          <ul className="mt-3 space-y-2">
            {item.auditLogs.map((a: any) => (
              <li key={a.id} className="flex items-start justify-between gap-2 text-[13px]">
                <span>
                  <b>{a.action}</b>
                  {a.metadata && a.metadata !== '{}' ? <span className="text-muted"> — {a.metadata}</span> : null}
                </span>
                <span className="shrink-0 text-muted">{jam(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-[13px] text-muted">Belum ada aktivitas tercatat.</p>
        )}
      </Card>
    </div>
  );
}
