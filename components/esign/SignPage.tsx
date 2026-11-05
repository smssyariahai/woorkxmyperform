'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardTitle, Badge } from '@/components/ui/primitives';
import { toast } from 'sonner';
import { friendlyFetchError } from '@/lib/fetch-error';
import { FileSignature, ShieldCheck, AlertTriangle, CheckCircle2, PenLine, XCircle } from 'lucide-react';
import { PdfViewer } from './PdfViewer';
import { SignatureCanvas } from './SignatureCanvas';
import { ESIGN_STATUS_META } from './status';

const tgl = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

async function fetchJson(path: string, init?: RequestInit) {
  const r = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, ok: r.ok, body: j };
}

const SIGNABLE = ['PENDING_SIGNATURE', 'PARTIALLY_SIGNED'];

/**
 * Halaman penandatanganan via tautan (dibuka dari WhatsApp).
 * Alur: cek token → login bila belum → verifikasi akun == penandatangan →
 * baca dokumen → pilih tanda tangan (tersimpan / gambar baru) + PIN +
 * konfirmasi eksplisit → preview → konfirmasi akhir.
 * Membuka tautan TIDAK PERNAH menandatangani dokumen.
 */
export function SignPage({ token }: { token: string }) {
  const [phase, setPhase] = useState<'loading' | 'invalid' | 'expired' | 'ready'>('loading');
  const [info, setInfo] = useState<any>(null);
  const [me, setMe] = useState<{ userId: string; hasSignature: boolean; pinSet: boolean } | null>(null);
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);

  const [mode, setMode] = useState<'saved' | 'draw'>('saved');
  const [drawnImage, setDrawnImage] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [review, setReview] = useState(false);
  const [signing, setSigning] = useState(false);
  const [signed, setSigned] = useState<{ documentStatus: string } | null>(null);
  const [err, setErr] = useState('');
  // Judul kartu error saat pengecekan tautan gagal — dibedakan per penyebab
  // agar "tidak valid" tidak lagi dipakai untuk semua kegagalan (429/5xx).
  const [errTitle, setErrTitle] = useState('Tautan tidak valid.');

  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [rejected, setRejected] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { status, ok, body } = await fetchJson(`/api/esign/sign/${encodeURIComponent(token)}`);
        if (!ok) {
          if (status === 410) {
            setPhase('expired');
            setErr(body?.message || 'Tautan tanda tangan sudah kedaluwarsa.');
          } else if (status === 429) {
            setPhase('invalid');
            setErrTitle('Terlalu banyak percobaan.');
            setErr(body?.message || 'Coba lagi dalam satu menit.');
          } else if (status >= 500) {
            setPhase('invalid');
            setErrTitle('Server sedang bermasalah.');
            setErr(
              'Coba muat ulang halaman ini sebentar lagi. Bila terus gagal, minta tautan baru kepada pengirim dokumen.'
            );
          } else {
            setPhase('invalid');
            setErrTitle('Tautan tidak valid.');
            setErr(body?.message || 'Tautan tanda tangan ini tidak dapat digunakan. Minta tautan baru kepada pengirim dokumen.');
          }
          return;
        }
        setInfo(body.data);
        setPhase('ready');
        const prof = await fetchJson('/api/esign/profile');
        if (!prof.ok) {
          setLoggedIn(false);
        } else {
          setLoggedIn(true);
          setMe(prof.body.data);
        }
      } catch {
        // Gagal terhubung sama sekali (mis. server mati / tanpa internet):
        // sebelumnya stuck di "Memeriksa tautan…" tanpa penjelasan.
        setPhase('invalid');
        setErrTitle('Tidak dapat terhubung ke server.');
        setErr('Periksa koneksi internet Anda lalu muat ulang halaman ini.');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const isMine = Boolean(me && info && me.userId === info.signer.userId);
  const docSignable = info ? SIGNABLE.includes(info.document.status) : false;
  const canAct = phase === 'ready' && loggedIn === true && isMine && docSignable && info.signer.signingStatus === 'PENDING';

  async function submitSign() {
    if (!info) return;
    setErr('');
    setSigning(true);
    try {
      const { ok, body } = await fetchJson(`/api/esign/documents/${info.document.id}/sign`, {
        method: 'POST',
        body: JSON.stringify({
          token,
          pin,
          confirm: true,
          signatureImage: mode === 'draw' ? drawnImage : undefined,
        }),
      });
      if (!ok) throw new Error(body?.message || 'Gagal menandatangani dokumen.');
      setSigned({ documentStatus: body.data.documentStatus });
      toast.success('Dokumen berhasil ditandatangani.');
    } catch (e: any) {
      setErr(friendlyFetchError(e, 'Gagal menandatangani dokumen.'));
      setReview(false);
    } finally {
      setSigning(false);
    }
  }

  function startReview() {
    setErr('');
    if (mode === 'saved' && !me?.hasSignature) {
      setErr('Anda belum memiliki tanda tangan tersimpan. Gambar tanda tangan baru di bawah ini.');
      return;
    }
    if (mode === 'draw' && !drawnImage) {
      setErr('Gambar tanda tangan Anda terlebih dahulu, lalu tekan Simpan pada canvas.');
      return;
    }
    if (!/^\d{4,12}$/.test(pin)) {
      setErr('PIN harus 4–12 digit angka.');
      return;
    }
    if (!confirmed) {
      setErr('Centang konfirmasi bahwa Anda telah membaca dokumen dan menyetujui untuk menandatanganinya.');
      return;
    }
    setReview(true);
  }

  async function submitReject() {
    if (!info || !rejectReason.trim()) return;
    setRejecting(true);
    try {
      const { ok, body } = await fetchJson(`/api/esign/documents/${info.document.id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ token, reason: rejectReason.trim() }),
      });
      if (!ok) throw new Error(body?.message || 'Gagal menolak dokumen.');
      setRejected(true);
      toast.success('Dokumen ditolak.');
    } catch (e: any) {
      setErr(friendlyFetchError(e, 'Gagal menolak dokumen.'));
    } finally {
      setRejecting(false);
    }
  }

  const sigPreviewSrc =
    mode === 'draw' ? drawnImage : me?.hasSignature ? '/api/esign/profile/signature' : null;

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-4xl space-y-5">
        <header className="text-center">
          <p className="flex items-center justify-center gap-2 text-lg font-bold text-ink">
            <FileSignature className="h-6 w-6 text-brand-700" /> WOORK · E-Sign
          </p>
          <p className="mt-1 text-[12px] text-muted">
            Tanda tangan elektronik internal — bukan tersertifikasi PSrE
          </p>
        </header>

        {phase === 'loading' && <p className="py-10 text-center text-[13px] text-muted">Memeriksa tautan…</p>}

        {(phase === 'invalid' || phase === 'expired') && (
          <Card>
            <div className="py-8 text-center">
              <AlertTriangle className="mx-auto h-8 w-8 text-danger" />
              <p className="mt-3 font-semibold text-ink">
                {phase === 'expired' ? 'Tautan sudah kedaluwarsa.' : errTitle}
              </p>
              <p className="mt-1 text-[13px] text-muted">
                {err || 'Tautan tanda tangan ini tidak dapat digunakan. Minta tautan baru kepada pengirim dokumen.'}
              </p>
              <Link href="/login" className="btn-secondary mt-4 inline-block">
                Masuk ke WOORK
              </Link>
            </div>
          </Card>
        )}

        {phase === 'ready' && info && (
          <>
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h1 className="text-xl font-bold text-ink">{info.document.title}</h1>
                  <p className="mt-1 text-[13px] text-muted">
                    {info.document.documentNumber} · {info.document.category} · dari {info.document.createdByName} (
                    {info.document.organizationName})
                  </p>
                  <p className="mt-1 text-[13px] text-muted">
                    Ditujukan kepada: <b className="text-ink">{info.signer.name}</b>
                    {info.signer.position ? ` · ${info.signer.position}` : ''}
                    {` · urutan ${info.signer.signingOrder}`}
                    {info.document.workflowType === 'SEQUENTIAL' ? ' · berurutan' : ' · bersamaan'}
                  </p>
                  <p className="mt-1 text-[13px] text-muted">Berlaku sampai: {tgl(info.document.expiresAt)}</p>
                </div>
                <Badge tone={info.document.status === 'SIGNED' || info.document.status === 'COMPLETED' ? 'green' : 'blue'}>
                  {ESIGN_STATUS_META[info.document.status]?.label ?? info.document.status}
                </Badge>
              </div>
            </Card>

            <Card>
              <CardTitle>Preview Dokumen</CardTitle>
              <div className="mt-4">
                <PdfViewer src={info.fileUrl} />
              </div>
            </Card>

            {signed && (
              <Card>
                <div className="flex items-start gap-3 py-2">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
                  <div>
                    <p className="font-semibold text-ink">Dokumen berhasil ditandatangani.</p>
                    <p className="mt-1 text-[13px] text-muted">
                      Status dokumen sekarang: {ESIGN_STATUS_META[signed.documentStatus]?.label ?? signed.documentStatus}.
                      Informasi ini sudah tercatat pada sistem administrasi perusahaan.
                    </p>
                    <Link href="/esign" className="btn-secondary mt-3 inline-block">
                      Lihat Dokumen Saya
                    </Link>
                  </div>
                </div>
              </Card>
            )}

            {rejected && (
              <Card>
                <div className="flex items-start gap-3 py-2">
                  <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
                  <div>
                    <p className="font-semibold text-ink">Dokumen ditolak.</p>
                    <p className="mt-1 text-[13px] text-muted">
                      Penolakan Anda sudah tercatat dan pengirim dokumen akan diberitahu.
                    </p>
                  </div>
                </div>
              </Card>
            )}

            {!signed && !rejected && loggedIn === false && (
              <Card>
                <div className="py-4 text-center">
                  <ShieldCheck className="mx-auto h-6 w-6 text-brand-700" />
                  <p className="mt-2 font-semibold text-ink">Masuk untuk melanjutkan</p>
                  <p className="mt-1 text-[13px] text-muted">
                    Anda harus login dengan akun yang ditunjuk sebagai penandatangan sebelum menandatangani dokumen ini.
                  </p>
                  <Link href={`/login?callbackUrl=${encodeURIComponent(`/esign/sign/${token}`)}`} className="btn-primary mt-4 inline-block">
                    Masuk
                  </Link>
                </div>
              </Card>
            )}

            {!signed && !rejected && loggedIn === true && !isMine && (
              <Card>
                <div className="py-4 text-center">
                  <AlertTriangle className="mx-auto h-6 w-6 text-danger" />
                  <p className="mt-2 font-semibold text-ink">Tautan ini bukan untuk akun Anda.</p>
                  <p className="mt-1 text-[13px] text-muted">
                    Dokumen ini ditujukan kepada {info.signer.name}. Masuk dengan akun yang benar untuk melanjutkan.
                  </p>
                </div>
              </Card>
            )}

            {!signed && !rejected && loggedIn === true && isMine && info.signer.signingStatus === 'SIGNED' && (
              <Card>
                <div className="py-4 text-center">
                  <CheckCircle2 className="mx-auto h-6 w-6 text-green-600" />
                  <p className="mt-2 font-semibold text-ink">Anda sudah menandatangani dokumen ini.</p>
                </div>
              </Card>
            )}

            {!signed && !rejected && loggedIn === true && isMine && info.signer.signingStatus !== 'SIGNED' && !docSignable && (
              <Card>
                <div className="py-4 text-center">
                  <AlertTriangle className="mx-auto h-6 w-6 text-danger" />
                  <p className="mt-2 font-semibold text-ink">Dokumen tidak dapat ditandatangani.</p>
                  <p className="mt-1 text-[13px] text-muted">
                    Status dokumen: {ESIGN_STATUS_META[info.document.status]?.label ?? info.document.status}.
                  </p>
                </div>
              </Card>
            )}

            {canAct && !review && (
              <Card>
                <CardTitle>
                  <span className="flex items-center gap-2">
                    <PenLine className="h-4 w-4" /> Tanda Tangani
                  </span>
                </CardTitle>
                <div className="mt-4 space-y-4">
                  <div>
                    <p className="mb-2 text-[13px] font-semibold text-ink">Tanda tangan</p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={mode === 'saved' ? 'btn-primary' : 'btn-secondary'}
                        onClick={() => setMode('saved')}
                        disabled={!me?.hasSignature}
                      >
                        Gunakan tanda tangan tersimpan
                      </button>
                      <button
                        type="button"
                        className={mode === 'draw' ? 'btn-primary' : 'btn-secondary'}
                        onClick={() => setMode('draw')}
                      >
                        Gambar tanda tangan baru
                      </button>
                    </div>
                    {!me?.hasSignature && (
                      <p className="mt-2 text-[12px] text-muted">
                        Anda belum memiliki tanda tangan tersimpan — gambar di bawah ini, atau simpan di{' '}
                        <Link href="/esign/settings" className="text-brand-700 underline">
                          Pengaturan E-Sign
                        </Link>
                        .
                      </p>
                    )}
                  </div>

                  {mode === 'saved' && me?.hasSignature && (
                    <div>
                      <p className="mb-1 text-[12px] text-muted">Tanda tangan tersimpan Anda:</p>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src="/api/esign/profile/signature"
                        alt="Tanda tangan tersimpan"
                        className="max-h-28 rounded-lg border border-line bg-white p-2"
                      />
                    </div>
                  )}

                  {mode === 'draw' && (
                    <div>
                      <SignatureCanvas onSave={(d) => setDrawnImage(d)} />
                      {drawnImage && (
                        <p className="mt-2 text-[12px] text-green-700">Tanda tangan baru tersimpan untuk dokumen ini.</p>
                      )}
                    </div>
                  )}

                  <div>
                    <label className="mb-1 block text-[13px] font-semibold text-ink" htmlFor="esign-pin">
                      PIN tanda tangan
                    </label>
                    <input
                      id="esign-pin"
                      type="password"
                      inputMode="numeric"
                      autoComplete="off"
                      className="input w-full max-w-xs"
                      placeholder="Masukkan PIN (4–12 digit)"
                      value={pin}
                      onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, '').slice(0, 12))}
                    />
                    {!me?.pinSet && (
                      <p className="mt-1 text-[12px] text-danger">
                        Anda belum mengatur PIN. Atur PIN di{' '}
                        <Link href="/esign/settings" className="underline">
                          Pengaturan E-Sign
                        </Link>{' '}
                        sebelum menandatangani.
                      </p>
                    )}
                  </div>

                  <label className="flex items-start gap-2 text-[13px]">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                    />
                    <span>
                      Saya telah membaca dokumen ini dan menyetujui untuk menandatanganinya. Saya memahami bahwa tanda
                      tangan ini tercatat beserta waktu, alamat IP, dan perangkat saya.
                    </span>
                  </label>

                  {err && <p className="text-[13px] text-danger">{err}</p>}

                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="btn-primary" onClick={startReview}>
                      Lanjut ke Konfirmasi
                    </button>
                    <button
                      type="button"
                      className="btn-secondary !text-danger"
                      onClick={() => setRejectOpen((v) => !v)}
                    >
                      Tolak Dokumen
                    </button>
                  </div>

                  {rejectOpen && (
                    <div className="space-y-2 rounded-lg border border-line p-3">
                      <label className="block text-[13px] font-semibold text-ink" htmlFor="reject-reason">
                        Alasan penolakan (wajib)
                      </label>
                      <textarea
                        id="reject-reason"
                        className="input w-full"
                        rows={3}
                        placeholder="Tulis alasan Anda menolak dokumen ini…"
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                      />
                      <button
                        type="button"
                        className="btn-primary !bg-danger"
                        onClick={submitReject}
                        disabled={rejecting || !rejectReason.trim()}
                      >
                        {rejecting ? 'Mengirim…' : 'Kirim Penolakan'}
                      </button>
                    </div>
                  )}
                </div>
              </Card>
            )}

            {canAct && review && (
              <Card>
                <CardTitle>Konfirmasi Akhir</CardTitle>
                <div className="mt-4 space-y-3 text-[13px]">
                  <p>
                    <span className="text-muted">Dokumen: </span>
                    <b>{info.document.title}</b> ({info.document.documentNumber})
                  </p>
                  <p>
                    <span className="text-muted">Penandatangan: </span>
                    <b>{info.signer.name}</b>
                    {info.signer.position ? ` · ${info.signer.position}` : ''}
                  </p>
                  <div>
                    <p className="text-muted">Tanda tangan yang akan ditempatkan:</p>
                    {sigPreviewSrc && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={sigPreviewSrc}
                        alt="Preview tanda tangan"
                        className="mt-1 max-h-28 rounded-lg border border-line bg-white p-2"
                      />
                    )}
                  </div>
                  <p className="text-muted">
                    Dengan menekan tombol di bawah, tanda tangan Anda akan disimpan dan tidak dapat diubah tanpa membuat
                    versi baru.
                  </p>
                  {err && <p className="text-danger">{err}</p>}
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="btn-primary" onClick={submitSign} disabled={signing}>
                      {signing ? 'Memproses…' : 'Konfirmasi & Tanda Tangani'}
                    </button>
                    <button type="button" className="btn-secondary" onClick={() => setReview(false)} disabled={signing}>
                      Kembali
                    </button>
                  </div>
                </div>
              </Card>
            )}

            <p className="pb-4 text-center text-[12px] text-muted">
              Keamanan: tautan ini bersifat pribadi dan memiliki masa berlaku. Jangan bagikan PIN Anda kepada siapa pun,
              termasuk melalui WhatsApp.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
