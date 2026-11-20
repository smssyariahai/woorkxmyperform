'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  AlertTriangle,
  CalendarClock,
  Check,
  Clock,
  FileText,
  Megaphone,
  Plus,
  Search,
  Send,
  Settings2,
  Trash2,
  Users,
} from 'lucide-react';
import { Badge, Card } from '@/components/ui/primitives';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ui/modal';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { NotificationPreferenceModal } from '@/components/pengumuman/NotificationPreferenceModal';
import {
  createAnnouncement,
  deleteAnnouncement,
  formatTanggal,
  formatTanggalJam,
  getAnnouncement,
  getRecipients,
  listAnnouncements,
  publishAnnouncement,
  updateAnnouncement,
  PRIORITY_LABEL,
  STATUS_LABEL,
  type Announcement,
  type Priority,
  type RecipientUser,
  type TargetMode,
} from '@/lib/pengumuman/client';

// Halaman Pengumuman — porting AnnouncementList + BroadcastNotification
// (dipangkas, WAVE03_FRONTEND_BRIEF.md §2): satu halaman 3 tab
// (Daftar | Buat Baru | Draft & Terjadwal). Tanpa rich-text editor,
// tanpa upload gambar, tanpa filter perusahaan/cabang/divisi backup.
// Saluran email tersedia di form; bila SMTP belum dikonfigurasi, publish
// tetap sukses in-app dan email dicatat 'not_configured'.

type Tab = 'daftar' | 'buat' | 'draft';

const PRIORITY_TONE: Record<Priority, 'red' | 'amber' | 'gray'> = {
  mendesak: 'red',
  penting: 'amber',
  normal: 'gray',
};

const STATUS_TONE: Record<string, 'green' | 'amber' | 'gray'> = {
  published: 'green',
  scheduled: 'amber',
  draft: 'gray',
};

function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

function targetLabel(a: Announcement): string {
  if (a.targetMode === 'targeted') {
    const n = a.target?.userEmails?.length ?? a.recipientEmails.length;
    return `Pengguna Tertarget (${n} penerima)`;
  }
  return 'Semua Pengguna';
}

function emailStatusNote(a: Announcement): string | null {
  if (a.status !== 'published') return null;
  if (!a.channels.email) return null;
  switch (a.emailStatus) {
    case 'not_configured':
      return 'Email tidak terkirim — SMTP belum dikonfigurasi.';
    case 'failed':
      return `Email gagal terkirim (${a.emailFailed} gagal).`;
    case 'partial':
      return `Email sebagian terkirim (${a.emailSent} berhasil, ${a.emailFailed} gagal).`;
    case 'skipped':
      return 'Email dilewati — tidak ada penerima email.';
    case 'sent':
      return `Email terkirim ke ${a.emailSent} penerima.`;
    default:
      return null;
  }
}

const EMPTY_FORM = {
  title: '',
  summary: '',
  content: '',
  imageUrl: '',
  priority: 'normal' as Priority,
  targetMode: 'all' as TargetMode,
  targetEmails: [] as string[],
  channelApp: true,
  channelEmail: false,
  scheduledAt: '',
};

export default function PengumumanPage() {
  const [tab, setTab] = useState<Tab>('daftar');
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [prefOpen, setPrefOpen] = useState(false);
  const [allUsers, setAllUsers] = useState<RecipientUser[]>([]);
  const [allCount, setAllCount] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [list, recv] = await Promise.all([
        listAnnouncements('', q.trim() || undefined),
        getRecipients('all'),
      ]);
      setItems(list);
      setAllUsers(recv.users);
      setAllCount(recv.total);
    } catch (e: any) {
      setError(e?.message || 'Gagal memuat pengumuman.');
    } finally {
      setLoading(false);
    }
  }, [q]);

  useEffect(() => {
    load();
  }, [load]);

  // Mode edit via ?edit=<id> (dari halaman detail).
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('edit');
    if (!id) return;
    getAnnouncement(id)
      .then((a) => {
        if (a.status === 'published') {
          toast.error('Pengumuman yang sudah terkirim tidak bisa diubah.');
          return;
        }
        loadIntoForm(a);
      })
      .catch((e: any) =>
        toast.error(e?.message || 'Gagal memuat pengumuman untuk diedit.')
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function loadIntoForm(a: Announcement) {
    setEditingId(a.id);
    setForm({
      title: a.title,
      summary: a.summary,
      content: a.content,
      imageUrl: a.imageUrl ?? '',
      priority: a.priority,
      targetMode: a.targetMode,
      targetEmails: a.target?.userEmails ?? [],
      channelApp: a.channels.app,
      channelEmail: a.channels.email,
      scheduledAt: toLocalInput(a.scheduledAt),
    });
    setTab('buat');
    window.scrollTo({ top: 0 });
  }

  function resetForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  const published = useMemo(
    () => items.filter((i) => i.status === 'published'),
    [items]
  );
  const drafts = useMemo(
    () => items.filter((i) => i.status !== 'published'),
    [items]
  );

  const recipientCount =
    form.targetMode === 'targeted' ? form.targetEmails.length : allCount;

  function buildInput(scheduled: string | null) {
    return {
      title: form.title.trim(),
      summary: form.summary.trim(),
      content: form.content,
      imageUrl: form.imageUrl.trim() || null,
      category: 'announcement',
      priority: form.priority,
      targetMode: form.targetMode,
      target:
        form.targetMode === 'targeted'
          ? { userEmails: form.targetEmails }
          : undefined,
      channels: { app: form.channelApp, email: form.channelEmail },
      scheduledAt: scheduled,
    };
  }

  function validateForm(needsSchedule: boolean): string | null {
    if (!form.title.trim()) return 'Judul pengumuman wajib diisi.';
    if (!form.content.trim() && !form.summary.trim()) {
      return 'Isi atau ringkasan pengumuman wajib diisi.';
    }
    if (!form.channelApp && !form.channelEmail) {
      return 'Pilih minimal satu saluran (aplikasi / email).';
    }
    if (form.targetMode === 'targeted' && form.targetEmails.length === 0) {
      return 'Pilih minimal satu penerima untuk target tertarget.';
    }
    if (needsSchedule) {
      if (!form.scheduledAt) return 'Tanggal & jam pengiriman wajib diisi.';
      if (new Date(form.scheduledAt).getTime() <= Date.now()) {
        return 'Waktu pengiriman harus di masa depan.';
      }
    } else if (form.scheduledAt) {
      if (new Date(form.scheduledAt).getTime() <= Date.now()) {
        return 'Waktu pengiriman harus di masa depan.';
      }
    }
    return null;
  }

  async function saveDraftOrScheduled(asScheduled: boolean) {
    const err = validateForm(asScheduled);
    if (err) return toast.error(err);
    setSaving(true);
    try {
      const scheduled = asScheduled
        ? form.scheduledAt
        : form.scheduledAt || null;
      const input = buildInput(scheduled);
      if (editingId) {
        await updateAnnouncement(editingId, input);
        toast.success(
          asScheduled
            ? 'Jadwal pengumuman diperbarui.'
            : 'Draft pengumuman disimpan.'
        );
      } else {
        await createAnnouncement(input);
        toast.success(
          asScheduled ? 'Pengumuman terjadwal disimpan.' : 'Draft disimpan.'
        );
      }
      resetForm();
      setTab('draft');
      await load();
    } catch (e: any) {
      toast.error(e?.message || 'Gagal menyimpan pengumuman.');
    } finally {
      setSaving(false);
    }
  }

  async function sendNow() {
    const err = validateForm(false);
    if (err) return toast.error(err);
    setSaving(true);
    try {
      let id = editingId;
      const input = buildInput(null);
      if (id) {
        await updateAnnouncement(id, input);
      } else {
        const created = await createAnnouncement(input);
        id = created.id;
      }
      const res = await publishAnnouncement(id!);
      if (res.email.status === 'not_configured') {
        toast.success(
          `Pengumuman terkirim ke ${res.inAppSent} pengguna (in-app). Email belum terkirim — SMTP belum dikonfigurasi.`
        );
      } else if (res.email.status === 'failed') {
        toast.success(
          `Pengumuman terkirim ke ${res.inAppSent} pengguna (in-app). Email gagal terkirim.`
        );
      } else {
        toast.success(
          `Pengumuman terkirim ke ${res.inAppSent} pengguna.`
        );
      }
      resetForm();
      setTab('daftar');
      await load();
    } catch (e: any) {
      toast.error(e?.message || 'Gagal mengirim pengumuman.');
    } finally {
      setSaving(false);
    }
  }

  async function publishItem(id: string) {
    setPublishingId(id);
    try {
      const res = await publishAnnouncement(id);
      if (res.email.status === 'not_configured') {
        toast.success(
          `Terkirim ke ${res.inAppSent} pengguna (in-app). Email belum terkirim — SMTP belum dikonfigurasi.`
        );
      } else {
        toast.success(`Terkirim ke ${res.inAppSent} pengguna.`);
      }
      await load();
    } catch (e: any) {
      toast.error(e?.message || 'Gagal mengirim pengumuman.');
    } finally {
      setPublishingId(null);
    }
  }

  async function confirmDelete() {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await deleteAnnouncement(deleteId);
      toast.success('Pengumuman dihapus.');
      setDeleteId(null);
      await load();
    } catch (e: any) {
      toast.error(e?.message || 'Gagal menghapus pengumuman.');
    } finally {
      setDeleting(false);
    }
  }

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'daftar', label: 'Daftar', count: published.length },
    { key: 'buat', label: editingId ? 'Edit Pengumuman' : 'Buat Baru' },
    { key: 'draft', label: 'Draft & Terjadwal', count: drafts.length },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-[22px] font-bold text-ink">
            <Megaphone className="h-6 w-6 text-brand" /> Pengumuman
          </h1>
          <p className="mt-1 text-sm text-muted">
            Siarkan pengumuman ke seluruh anggota kantor atau ke penerima
            tertentu — muncul di lonceng notifikasi, dan lewat email bila
            dikonfigurasi.
          </p>
        </div>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => setPrefOpen(true)}
        >
          <Settings2 className="mr-1.5 h-4 w-4" /> Preferensi
        </button>
      </div>

      <div className="flex gap-1 border-b border-line">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px ${
              tab === t.key
                ? 'border-brand text-brand'
                : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            {t.label}
            {typeof t.count === 'number' ? ` (${t.count})` : ''}
          </button>
        ))}
      </div>

      {tab === 'daftar' && (
        <div className="space-y-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari judul pengumuman…"
              className="pl-9"
            />
          </div>
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : error ? (
            <ErrorState message={error} onRetry={load} />
          ) : published.length === 0 ? (
            <EmptyState
              icon={<Megaphone className="h-7 w-7" />}
              title="Belum ada pengumuman"
              description="Pengumuman yang sudah terkirim akan tampil di sini."
              action={
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => setTab('buat')}
                >
                  <Plus className="mr-1.5 h-4 w-4" /> Buat Pengumuman
                </button>
              }
            />
          ) : (
            published.map((a) => (
              <AnnouncementCard
                key={a.id}
                a={a}
                onPublish={undefined}
                publishing={false}
                onEdit={undefined}
                onDelete={undefined}
              />
            ))
          )}
        </div>
      )}

      {tab === 'draft' && (
        <div className="space-y-4">
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : error ? (
            <ErrorState message={error} onRetry={load} />
          ) : drafts.length === 0 ? (
            <EmptyState
              icon={<FileText className="h-7 w-7" />}
              title="Tidak ada draft atau jadwal"
              description="Simpan draft atau jadwalkan pengumuman dari tab Buat Baru."
              action={
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => setTab('buat')}
                >
                  <Plus className="mr-1.5 h-4 w-4" /> Buat Pengumuman
                </button>
              }
            />
          ) : (
            drafts.map((a) => (
              <AnnouncementCard
                key={a.id}
                a={a}
                onPublish={() => publishItem(a.id)}
                publishing={publishingId === a.id}
                onEdit={() => loadIntoForm(a)}
                onDelete={() => setDeleteId(a.id)}
              />
            ))
          )}
        </div>
      )}

      {tab === 'buat' && (
        <Card>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendNow();
            }}
            className="space-y-5"
          >
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink">
                Judul pengumuman *
              </label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="mis. Libur Bersama Hari Raya"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink">
                Deskripsi singkat
              </label>
              <textarea
                value={form.summary}
                onChange={(e) =>
                  setForm({ ...form, summary: e.target.value.slice(0, 160) })
                }
                rows={2}
                placeholder="Ringkasan yang tampil di daftar & lonceng (otomatis 160 karakter pertama isi bila kosong)"
                className="input w-full resize-y"
              />
              <p className="mt-1 text-xs text-muted">
                {form.summary.length}/160 karakter
              </p>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink">
                Isi pengumuman
              </label>
              <textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                rows={8}
                placeholder="Tulis isi pengumuman di sini…"
                className="input w-full resize-y"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink">
                  Prioritas
                </label>
                <select
                  value={form.priority}
                  onChange={(e) =>
                    setForm({ ...form, priority: e.target.value as Priority })
                  }
                  className="input w-full"
                >
                  <option value="normal">Normal</option>
                  <option value="penting">Penting</option>
                  <option value="mendesak">Mendesak</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink">
                  Gambar sampul (URL, opsional)
                </label>
                <Input
                  value={form.imageUrl}
                  onChange={(e) =>
                    setForm({ ...form, imageUrl: e.target.value })
                  }
                  placeholder="https://…"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink">
                Target penerima
              </label>
              <select
                value={form.targetMode}
                onChange={(e) =>
                  setForm({
                    ...form,
                    targetMode: e.target.value as TargetMode,
                    targetEmails: [],
                  })
                }
                className="input w-full"
              >
                <option value="all">Semua Pengguna ({allCount} akun)</option>
                <option value="targeted">Pengguna Tertarget (pilih email)</option>
              </select>
              {form.targetMode === 'targeted' && (
                <div className="mt-2 max-h-56 space-y-1 overflow-auto rounded-lg border border-line p-3">
                  {allUsers.length === 0 ? (
                    <p className="text-sm text-muted">
                      Tidak ada anggota aktif.
                    </p>
                  ) : (
                    allUsers.map((u) => {
                      const checked = form.targetEmails.includes(u.email);
                      return (
                        <label
                          key={u.id}
                          className="flex cursor-pointer items-center gap-2.5 rounded px-1 py-1.5 text-sm hover:bg-brand-50"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setForm({
                                ...form,
                                targetEmails: checked
                                  ? form.targetEmails.filter(
                                      (e) => e !== u.email
                                    )
                                  : [...form.targetEmails, u.email],
                              })
                            }
                            className="h-4 w-4 accent-brand-600"
                          />
                          <span className="text-ink">{u.name}</span>
                          <span className="text-xs text-muted">{u.email}</span>
                        </label>
                      );
                    })
                  )}
                </div>
              )}
              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted">
                <Users className="h-3.5 w-3.5" /> {recipientCount} penerima
                {form.targetMode === 'targeted'
                  ? ' terpilih'
                  : ' (semua anggota aktif)'}
              </p>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink">
                Saluran
              </label>
              <div className="flex flex-wrap gap-4">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={form.channelApp}
                    onChange={(e) =>
                      setForm({ ...form, channelApp: e.target.checked })
                    }
                    className="h-4 w-4 accent-brand-600"
                  />
                  Notifikasi Aplikasi
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={form.channelEmail}
                    onChange={(e) =>
                      setForm({ ...form, channelEmail: e.target.checked })
                    }
                    className="h-4 w-4 accent-brand-600"
                  />
                  Email
                </label>
              </div>
              {form.channelEmail && (
                <p className="mt-1.5 text-xs text-muted">
                  Email dikirim saat publish; penerima yang menonaktifkan
                  email di Preferensi tidak menerima email. Batas 100
                  penerima per pengiriman.
                </p>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink">
                Jadwalkan pengiriman (opsional)
              </label>
              <input
                type="datetime-local"
                value={form.scheduledAt}
                onChange={(e) =>
                  setForm({ ...form, scheduledAt: e.target.value })
                }
                className="input w-full sm:max-w-xs"
              />
              <p className="mt-1.5 text-xs text-muted">
                Bila diisi (waktu di masa depan), pengumuman disimpan sebagai
                Terjadwal. Tidak ada pengiriman otomatis — kirim manual lewat
                tombol &ldquo;Kirim Sekarang&rdquo; di tab Draft &amp; Terjadwal.
              </p>
            </div>

            <div className="flex flex-wrap gap-2 border-t border-line pt-4">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => saveDraftOrScheduled(false)}
                disabled={saving}
              >
                <FileText className="mr-1.5 h-4 w-4" /> Simpan Draft
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => saveDraftOrScheduled(true)}
                disabled={saving}
              >
                <CalendarClock className="mr-1.5 h-4 w-4" /> Simpan sebagai
                Terjadwal
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={saving}
              >
                <Send className="mr-1.5 h-4 w-4" /> Kirim Sekarang
                {recipientCount > 0 ? ` (${recipientCount} Penerima)` : ''}
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={resetForm}
                disabled={saving}
              >
                Reset
              </button>
            </div>
          </form>
        </Card>
      )}

      <NotificationPreferenceModal
        open={prefOpen}
        onClose={() => setPrefOpen(false)}
      />
      <ConfirmDialog
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={confirmDelete}
        title="Hapus pengumuman?"
        message="Draft / jadwal ini akan dihapus permanen. Pengumuman yang sudah terkirim tidak bisa dihapus."
        confirmLabel="Ya, hapus"
        loading={deleting}
      />
    </div>
  );
}

function AnnouncementCard({
  a,
  onPublish,
  publishing,
  onEdit,
  onDelete,
}: {
  a: Announcement;
  onPublish?: () => void;
  publishing: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const emailNote = emailStatusNote(a);
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={STATUS_TONE[a.status] ?? 'gray'}>
              {STATUS_LABEL[a.status]}
            </Badge>
            {a.priority !== 'normal' && (
              <Badge tone={PRIORITY_TONE[a.priority]}>
                {a.priority === 'mendesak' ? (
                  <AlertTriangle className="mr-1 inline h-3 w-3" />
                ) : null}
                {PRIORITY_LABEL[a.priority]}
              </Badge>
            )}
            <span className="text-xs text-muted">
              {formatTanggal(a.createdAt)} · oleh {a.authorName || '—'}
            </span>
          </div>
          <Link
            href={`/pengumuman/${a.id}`}
            className="mt-2 block text-[15px] font-semibold text-ink hover:text-brand line-clamp-2"
          >
            {a.title}
          </Link>
          {a.summary && (
            <p className="mt-1 text-sm text-muted line-clamp-2">{a.summary}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
            <span className="flex items-center gap-1">
              <Users className="h-3.5 w-3.5" /> {targetLabel(a)}
            </span>
            {a.status === 'scheduled' && a.scheduledAt && (
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" /> Akan dikirim{' '}
                {formatTanggalJam(a.scheduledAt)}
              </span>
            )}
            {a.status === 'published' && a.sentAt && (
              <span className="flex items-center gap-1">
                <Check className="h-3.5 w-3.5" /> Terkirim{' '}
                {formatTanggalJam(a.sentAt)}
              </span>
            )}
          </div>
          {emailNote && (
            <p
              className={`mt-2 text-xs ${
                a.emailStatus === 'sent'
                  ? 'text-muted'
                  : 'font-medium text-amber-600'
              }`}
            >
              {emailNote}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {onPublish && (
            <button
              type="button"
              className="btn-primary !px-3 !py-1.5 text-sm"
              onClick={onPublish}
              disabled={publishing}
            >
              <Send className="mr-1.5 h-3.5 w-3.5" />
              {publishing ? 'Mengirim…' : 'Kirim Sekarang'}
            </button>
          )}
          {onEdit && (
            <button
              type="button"
              className="btn-secondary !px-3 !py-1.5 text-sm"
              onClick={onEdit}
            >
              Muat / Edit
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              className="btn-ghost !px-2.5 !py-1.5 text-danger"
              onClick={onDelete}
              aria-label="Hapus"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </Card>
  );
}
