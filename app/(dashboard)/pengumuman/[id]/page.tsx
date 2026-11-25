'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Clock,
  Copy,
  Pencil,
  Send,
  Trash2,
  Users,
} from 'lucide-react';
import { Badge, Card } from '@/components/ui/primitives';
import { ConfirmDialog, Modal } from '@/components/ui/modal';
import { ErrorState, Skeleton } from '@/components/ui/states';
import {
  deleteAnnouncement,
  formatTanggalJam,
  getAnnouncement,
  markAnnouncementRead,
  publishAnnouncement,
  PRIORITY_LABEL,
  STATUS_LABEL,
  type Announcement,
} from '@/lib/pengumuman/client';

// Detail pengumuman — porting AnnouncementDetail.tsx (dipangkas):
// teks biasa (whitespace-pre-line, tanpa Markdown / dangerouslySetInnerHTML),
// banner imageUrl + lightbox Modal, salin link, tandai dibaca saat dibuka.

const STATUS_TONE: Record<string, 'green' | 'amber' | 'gray'> = {
  published: 'green',
  scheduled: 'amber',
  draft: 'gray',
};

const PRIORITY_TONE: Record<string, 'red' | 'amber' | 'gray'> = {
  mendesak: 'red',
  penting: 'amber',
  normal: 'gray',
};

export default function PengumumanDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id);
  const [a, setA] = useState<Announcement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getAnnouncement(id)
      .then((row) => {
        if (!alive) return;
        setA(row);
        // Tandai dibaca saat dibuka (best-effort; gagal = abaikan).
        markAnnouncementRead(id).catch(() => {});
      })
      .catch((e: any) => {
        if (alive) setError(e?.message || 'Gagal memuat pengumuman.');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [id]);

  async function copyLink() {
    const url = `${window.location.origin}/pengumuman/${id}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    toast.success('Tautan disalin.');
    setTimeout(() => setCopied(false), 2000);
  }

  async function handlePublish() {
    setPublishing(true);
    try {
      const res = await publishAnnouncement(id);
      setA(res.announcement);
      if (res.email.status === 'not_configured') {
        toast.success(
          `Terkirim ke ${res.inAppSent} pengguna (in-app). Email belum terkirim — SMTP belum dikonfigurasi.`
        );
      } else {
        toast.success(`Terkirim ke ${res.inAppSent} pengguna.`);
      }
    } catch (e: any) {
      toast.error(e?.message || 'Gagal mengirim pengumuman.');
    } finally {
      setPublishing(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteAnnouncement(id);
      toast.success('Pengumuman dihapus.');
      router.push('/pengumuman');
    } catch (e: any) {
      toast.error(e?.message || 'Gagal menghapus pengumuman.');
      setDeleting(false);
      setDeleteOpen(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !a) {
    return (
      <ErrorState
        message={error || 'Pengumuman tidak ditemukan.'}
        onRetry={() => router.push('/pengumuman')}
      />
    );
  }

  const emailWarning =
    a.status === 'published' &&
    a.channels.email &&
    (a.emailStatus === 'not_configured' ||
      a.emailStatus === 'failed' ||
      a.emailStatus === 'partial' ||
      a.emailStatus === 'skipped');

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/pengumuman"
          className="flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" /> Kembali ke Pengumuman
        </Link>
        <button
          type="button"
          className="btn-secondary !px-3 !py-1.5 text-sm"
          onClick={copyLink}
        >
          {copied ? (
            <Check className="mr-1.5 h-4 w-4" />
          ) : (
            <Copy className="mr-1.5 h-4 w-4" />
          )}
          {copied ? 'Disalin!' : 'Salin Link'}
        </button>
      </div>

      <Card>
        {a.imageUrl && (
          <button
            type="button"
            onClick={() => setLightbox(true)}
            className="mb-4 block w-full overflow-hidden rounded-xl"
            aria-label="Perbesar gambar"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={a.imageUrl}
              alt=""
              className="max-h-[380px] w-full object-cover"
            />
          </button>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={STATUS_TONE[a.status] ?? 'gray'}>
            {STATUS_LABEL[a.status]}
          </Badge>
          {a.filters?.platform === true && (
            <Badge tone="amber">Dari Administrator Pusat</Badge>
          )}
          {a.priority !== 'normal' && (
            <Badge tone={PRIORITY_TONE[a.priority] ?? 'gray'}>
              {a.priority === 'mendesak' ? (
                <AlertTriangle className="mr-1 inline h-3 w-3" />
              ) : null}
              {PRIORITY_LABEL[a.priority]}
            </Badge>
          )}
          <span className="ml-auto text-xs text-muted">
            {formatTanggalJam(a.createdAt)}
          </span>
        </div>

        <h1 className="mt-3 text-[22px] font-bold leading-snug text-ink">
          {a.title}
        </h1>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
          <span className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-900 text-[13px] font-bold text-white">
              {(a.authorName || 'A').charAt(0).toUpperCase()}
            </span>
            <span>
              <span className="block font-medium text-ink">
                {a.authorName || 'Administrator'}
              </span>
              <span className="block text-xs">{a.authorEmail}</span>
            </span>
          </span>
          <span className="flex items-center gap-1.5">
            <Users className="h-4 w-4" />
            {a.targetMode === 'targeted'
              ? `Pengguna Tertarget (${(a.target?.userEmails?.length ?? a.recipientEmails.length) || 0} penerima)`
              : 'Semua Pengguna'}
          </span>
        </div>

        {a.status === 'scheduled' && a.scheduledAt && (
          <p className="mt-4 flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
            <Clock className="h-4 w-4" /> Akan dikirim{' '}
            {formatTanggalJam(a.scheduledAt)} — belum ada pengiriman otomatis,
            gunakan tombol Kirim Sekarang.
          </p>
        )}

        {a.summary && (
          <div className="mt-4 rounded-lg border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-ink">
            {a.summary}
          </div>
        )}

        {a.content && (
          <p className="mt-4 whitespace-pre-line break-words text-[15px] leading-relaxed text-ink">
            {a.content}
          </p>
        )}

        {emailWarning && (
          <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700">
            {a.emailStatus === 'not_configured'
              ? 'Email tidak terkirim — SMTP belum dikonfigurasi. Isi SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS di .env untuk mengaktifkan email.'
              : a.emailStatus === 'failed'
                ? `Email gagal terkirim (${a.emailFailed} gagal). ${a.emailError ?? ''}`
                : a.emailStatus === 'partial'
                  ? `Email sebagian terkirim (${a.emailSent} berhasil, ${a.emailFailed} gagal).`
                  : 'Email dilewati — tidak ada penerima email.'}
          </p>
        )}
        {a.status === 'published' &&
          a.channels.email &&
          a.emailStatus === 'sent' && (
            <p className="mt-4 text-sm text-muted">
              Email terkirim ke {a.emailSent} penerima.
            </p>
          )}

        {a.status !== 'published' && (
          <div className="mt-6 flex flex-wrap gap-2 border-t border-line pt-4">
            <button
              type="button"
              className="btn-primary"
              onClick={handlePublish}
              disabled={publishing}
            >
              <Send className="mr-1.5 h-4 w-4" />
              {publishing ? 'Mengirim…' : 'Kirim Sekarang'}
            </button>
            <Link
              href={`/pengumuman?edit=${a.id}`}
              className="btn-secondary"
            >
              <Pencil className="mr-1.5 h-4 w-4" /> Edit
            </Link>
            <button
              type="button"
              className="btn-ghost text-danger"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="mr-1.5 h-4 w-4" /> Hapus
            </button>
          </div>
        )}
      </Card>

      {a.imageUrl && (
        <Modal
          open={lightbox}
          onClose={() => setLightbox(false)}
          title={a.title}
          wide
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={a.imageUrl} alt="" className="w-full rounded-lg" />
        </Modal>
      )}

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        title="Hapus pengumuman?"
        message="Draft / jadwal ini akan dihapus permanen."
        confirmLabel="Ya, hapus"
        loading={deleting}
      />
    </div>
  );
}
