// Halaman E-Arsip (kantor) — dashboard ringkasan, daftar dokumen arsip
// (cari + filter kategori/tanggal/pengunggah/status + pagination), modal
// upload (multipart, validasi tipe/ukuran di frontend; server memvalidasi
// ulang), preview + download + edit + arsipkan + hapus.
// Kerahasiaan: dokumen CONFIDENTIAL hanya tampil bagi Super Admin /
// EARSIP_MANAGE — ditegakkan API; halaman hanya menyembunyikan tombol
// tambahan bila tidak berhak. Semua teks Bahasa Indonesia.
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Archive as ArchiveIcon,
  Download,
  Eye,
  FileText,
  FolderOpen,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge, Card } from '@/components/ui/primitives';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { Pagination, SearchInput } from '@/components/ui/search';
import { formatTanggal, formatTanggalJam } from '@/lib/pengumuman/client';
import {
  EARSIP_ALLOWED_LABEL,
  EARSIP_CONFIDENTIALITIES,
  EARSIP_CONFIDENTIALITY_LABEL,
  EARSIP_STATUSES,
  EARSIP_STATUS_LABEL,
  deleteDocument,
  formatFileSize,
  getStats,
  listDocuments,
  updateDocument,
  uploadDocument,
  validateEarsipFileClient,
  type ArchiveCategoryItem,
  type ArchiveDocumentItem,
  type EarsipConfidentiality,
  type EarsipStats,
  type EarsipStatus,
  type EarsipUploader,
} from '@/lib/earsip/client';

const STATUS_TONE: Record<string, 'green' | 'amber' | 'blue' | 'gray'> = {
  ACTIVE: 'green',
  ARCHIVED: 'gray',
};

const CONF_TONE: Record<string, 'red' | 'amber' | 'blue' | 'gray'> = {
  CONFIDENTIAL: 'red',
  INTERNAL: 'amber',
  PUBLIC: 'blue',
};

const EMPTY_UPLOAD = {
  title: '',
  categoryId: '',
  documentNumber: '',
  documentDate: '',
  description: '',
  confidentiality: 'INTERNAL' as EarsipConfidentiality,
};

type AuditItem = { id: string; action: string; description: string | null; createdAt: string; user?: { name: string } | null };

export default function EarsipPage() {
  const [stats, setStats] = useState<EarsipStats | null>(null);
  const [items, setItems] = useState<ArchiveDocumentItem[]>([]);
  const [categories, setCategories] = useState<ArchiveCategoryItem[]>([]);
  const [uploaders, setUploaders] = useState<EarsipUploader[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [uploaderFilter, setUploaderFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [fromFilter, setFromFilter] = useState('');
  const [toFilter, setToFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [activities, setActivities] = useState<AuditItem[]>([]);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadForm, setUploadForm] = useState(EMPTY_UPLOAD);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState<ArchiveDocumentItem | null>(null);
  const [editForm, setEditForm] = useState({
    title: '',
    categoryId: '',
    documentNumber: '',
    documentDate: '',
    description: '',
    confidentiality: 'INTERNAL' as EarsipConfidentiality,
    status: 'ACTIVE' as EarsipStatus,
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleting, setDeleting] = useState<ArchiveDocumentItem | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [s, r] = await Promise.all([
        getStats(),
        listDocuments({
          q: q || undefined,
          categoryId: categoryFilter || undefined,
          uploaderId: uploaderFilter || undefined,
          status: statusFilter || undefined,
          from: fromFilter || undefined,
          to: toFilter || undefined,
          page,
          limit: 20,
        }),
      ]);
      setStats(s);
      setItems(r.documents);
      setCategories(r.categories);
      setUploaders(r.uploaders);
      setTotal(r.total);
      setTotalPages(r.totalPages);
      setCanManage(r.canManage);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Gagal memuat arsip.');
    } finally {
      setLoading(false);
    }
  }, [q, categoryFilter, uploaderFilter, statusFilter, fromFilter, toFilter, page]);

  useEffect(() => {
    load();
  }, [load]);

  // Aktivitas terbaru (AuditLog modul EARSIP) — hanya tampil bagi pemegang
  // AUDIT_VIEW; gagal dimuat = seksi disembunyikan, bukan error halaman.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/audit?module=EARSIP&perPage=5');
        const body = await res.json().catch(() => ({}));
        if (!res.ok) return;
        const data = body.data ?? body;
        setActivities(Array.isArray(data.items) ? data.items : []);
      } catch {
        /* abaikan */
      }
    })();
  }, []);

  async function handleUpload() {
    if (!uploadForm.title.trim()) {
      toast.error('Judul dokumen wajib diisi.');
      return;
    }
    if (!uploadForm.categoryId) {
      toast.error('Kategori wajib dipilih.');
      return;
    }
    if (!uploadFile) {
      toast.error('Pilih file yang akan diarsipkan.');
      return;
    }
    const fileErr = validateEarsipFileClient(uploadFile);
    if (fileErr) {
      toast.error(fileErr);
      return;
    }
    setUploading(true);
    try {
      const doc = await uploadDocument({
        title: uploadForm.title.trim(),
        categoryId: uploadForm.categoryId,
        documentNumber: uploadForm.documentNumber.trim() || undefined,
        documentDate: uploadForm.documentDate || undefined,
        description: uploadForm.description.trim() || undefined,
        confidentiality: uploadForm.confidentiality,
        file: uploadFile,
      });
      toast.success('Dokumen berhasil diarsipkan.');
      setUploadForm(EMPTY_UPLOAD);
      setUploadFile(null);
      setShowUpload(false);
      setPage(1);
      setItems((prev) => [doc, ...prev]);
      setTotal((t) => t + 1);
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Gagal mengunggah dokumen.');
    } finally {
      setUploading(false);
    }
  }

  function openEdit(doc: ArchiveDocumentItem) {
    setEditing(doc);
    setEditForm({
      title: doc.title,
      categoryId: doc.categoryId,
      documentNumber: doc.documentNumber ?? '',
      documentDate: doc.documentDate ? doc.documentDate.slice(0, 10) : '',
      description: doc.description ?? '',
      confidentiality: doc.confidentiality as EarsipConfidentiality,
      status: doc.status as EarsipStatus,
    });
  }

  async function handleEdit() {
    if (!editing) return;
    if (!editForm.title.trim()) {
      toast.error('Judul dokumen wajib diisi.');
      return;
    }
    setSavingEdit(true);
    try {
      const updated = await updateDocument(editing.id, {
        title: editForm.title.trim(),
        categoryId: editForm.categoryId,
        documentNumber: editForm.documentNumber.trim() || null,
        documentDate: editForm.documentDate || null,
        description: editForm.description.trim() || null,
        confidentiality: editForm.confidentiality,
        status: editForm.status,
      });
      toast.success('Dokumen diperbarui.');
      setEditing(null);
      setItems((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Gagal mengubah dokumen.');
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleArchive(doc: ArchiveDocumentItem) {
    const next = doc.status === 'ACTIVE' ? 'ARCHIVED' : 'ACTIVE';
    try {
      const updated = await updateDocument(doc.id, { status: next as EarsipStatus });
      toast.success(next === 'ARCHIVED' ? 'Dokumen diarsipkan.' : 'Dokumen dikembalikan ke aktif.');
      setItems((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Gagal mengubah status dokumen.');
    }
  }

  async function handleDelete() {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await deleteDocument(deleting.id);
      toast.success('Dokumen dihapus.');
      setDeleting(null);
      setItems((prev) => prev.filter((d) => d.id !== deleting.id));
      setTotal((t) => Math.max(0, t - 1));
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Gagal menghapus dokumen.');
    } finally {
      setDeleteLoading(false);
    }
  }

  const latest = stats?.latestDocuments?.[0];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-slate-800">E-Arsip</h1>
          <p className="text-xs text-slate-500">
            Arsip dokumen kantor — unggah, cari, dan kelola dokumen dalam satu tempat.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/earsip/kategori" className="btn-secondary inline-flex items-center gap-1.5">
            <FolderOpen size={15} /> Kategori
          </Link>
          <button onClick={() => setShowUpload(true)} className="btn-primary inline-flex items-center gap-1.5">
            <Plus size={15} /> Upload Dokumen
          </button>
        </div>
      </div>

      {/* Kartu ringkasan */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <p className="text-xs text-slate-500">Total Dokumen</p>
          <p className="mt-1 text-2xl font-bold text-slate-800">{stats ? stats.totalDocuments : '—'}</p>
          <p className="mt-1 text-xs text-slate-500">{stats ? `${formatFileSize(stats.totalSizeBytes)} total ukuran file` : 'Memuat…'}</p>
        </Card>
        <Card>
          <p className="text-xs text-slate-500">Total Kategori</p>
          <p className="mt-1 text-2xl font-bold text-slate-800">{stats ? stats.totalCategories : '—'}</p>
          <p className="mt-1 text-xs text-slate-500">
            <Link href="/earsip/kategori" className="text-brand hover:underline">Kelola kategori →</Link>
          </p>
        </Card>
        <Card>
          <p className="text-xs text-slate-500">Dokumen Terbaru</p>
          <p className="mt-1 truncate text-sm font-semibold text-slate-800" title={latest?.title}>
            {latest ? latest.title : '—'}
          </p>
          <p className="mt-1 text-xs text-slate-500">{latest ? `${latest.uploaderName} • ${formatTanggalJam(latest.uploadedAt)}` : 'Belum ada dokumen'}</p>
        </Card>
        <Card>
          <p className="text-xs text-slate-500">Total Upload</p>
          <p className="mt-1 text-2xl font-bold text-slate-800">{stats ? stats.totalUploads : '—'}</p>
          <p className="mt-1 text-xs text-slate-500">file diarsipkan di kantor ini</p>
        </Card>
      </div>

      {/* Aktivitas terbaru (bila punya AUDIT_VIEW) */}
      {activities.length > 0 && (
        <Card>
          <h2 className="text-sm font-bold text-slate-800">Aktivitas Terbaru</h2>
          <ul className="mt-2 space-y-1.5">
            {activities.map((a) => (
              <li key={a.id} className="text-xs text-slate-600">
                <span className="font-medium text-slate-800">{a.user?.name ?? 'Pengguna'}</span> — {a.description ?? a.action}
                <span className="text-slate-400"> • {formatTanggalJam(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <div className="flex flex-wrap gap-2">
          <div className="min-w-[200px] flex-1">
            <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Cari judul, nomor, atau deskripsi dokumen…" />
          </div>
          <select className="input" value={categoryFilter} onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}>
            <option value="">Semua kategori</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.parentName ? `${c.parentName} / ${c.name}` : c.name}
              </option>
            ))}
          </select>
          <select className="input" value={uploaderFilter} onChange={(e) => { setUploaderFilter(e.target.value); setPage(1); }}>
            <option value="">Semua pengunggah</option>
            {uploaders.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
          <select className="input" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
            <option value="">Semua status</option>
            {EARSIP_STATUSES.map((s) => (
              <option key={s} value={s}>{EARSIP_STATUS_LABEL[s]}</option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-xs text-slate-500">
            Dari
            <input type="date" className="input" value={fromFilter} onChange={(e) => { setFromFilter(e.target.value); setPage(1); }} />
          </label>
          <label className="flex items-center gap-1 text-xs text-slate-500">
            s.d.
            <input type="date" className="input" value={toFilter} onChange={(e) => { setToFilter(e.target.value); setPage(1); }} />
          </label>
        </div>

        {loading ? (
          <div className="mt-4 space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<ArchiveIcon className="h-7 w-7" />}
            title="Belum ada dokumen arsip"
            description="Belum ada dokumen yang cocok. Klik “Upload Dokumen” untuk mengarsipkan dokumen pertama."
            action={
              <button className="btn-primary" onClick={() => setShowUpload(true)}>
                Upload Dokumen
              </button>
            }
          />
        ) : (
          <>
            <p className="mt-4 text-xs text-slate-500">{total} dokumen</p>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs text-slate-500">
                    <th className="py-2 pr-2 font-medium">Dokumen</th>
                    <th className="py-2 pr-2 font-medium">Kategori</th>
                    <th className="py-2 pr-2 font-medium">Pengunggah</th>
                    <th className="py-2 pr-2 font-medium">Tanggal Dokumen</th>
                    <th className="py-2 pr-2 font-medium">Ukuran</th>
                    <th className="py-2 pr-2 font-medium">Akses</th>
                    <th className="py-2 pr-2 font-medium">Status</th>
                    <th className="py-2 font-medium">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((d) => (
                    <tr key={d.id} className="border-b border-slate-100 align-top">
                      <td className="py-3 pr-2">
                        <span className="flex items-start gap-2">
                          <FileText size={16} className="mt-0.5 shrink-0 text-slate-400" />
                          <span>
                            <span className="block font-semibold text-slate-800">{d.title}</span>
                            <span className="block text-xs text-slate-500">
                              {d.documentNumber ? `${d.documentNumber} • ` : ''}{d.fileName}
                            </span>
                          </span>
                        </span>
                      </td>
                      <td className="py-3 pr-2 text-xs text-slate-600">{d.categoryName}</td>
                      <td className="py-3 pr-2 text-xs text-slate-600">{d.uploaderName}</td>
                      <td className="py-3 pr-2 text-xs text-slate-600">{formatTanggal(d.documentDate ?? d.uploadedAt)}</td>
                      <td className="py-3 pr-2 text-xs text-slate-600">{formatFileSize(d.fileSize)}</td>
                      <td className="py-3 pr-2">
                        <Badge tone={CONF_TONE[d.confidentiality] ?? 'gray'}>
                          {EARSIP_CONFIDENTIALITY_LABEL[d.confidentiality as EarsipConfidentiality] ?? d.confidentiality}
                        </Badge>
                      </td>
                      <td className="py-3 pr-2">
                        <Badge tone={STATUS_TONE[d.status] ?? 'gray'}>
                          {EARSIP_STATUS_LABEL[d.status as EarsipStatus] ?? d.status}
                        </Badge>
                      </td>
                      <td className="py-3">
                        <span className="flex gap-1">
                          <a
                            href={`/api/earsip/documents/${d.id}/file`}
                            target="_blank"
                            rel="noreferrer"
                            className="btn-ghost !px-2 !py-1.5"
                            title="Preview"
                          >
                            <Eye size={14} />
                          </a>
                          <a
                            href={`/api/earsip/documents/${d.id}/file?download=1`}
                            className="btn-ghost !px-2 !py-1.5"
                            title="Download"
                          >
                            <Download size={14} />
                          </a>
                          {canManage && (
                            <>
                              <button onClick={() => openEdit(d)} className="btn-ghost !px-2 !py-1.5" title="Edit">
                                <Pencil size={14} />
                              </button>
                              <button
                                onClick={() => handleArchive(d)}
                                className="btn-ghost !px-2 !py-1.5"
                                title={d.status === 'ACTIVE' ? 'Arsipkan' : 'Aktifkan kembali'}
                              >
                                <ArchiveIcon size={14} />
                              </button>
                              <button onClick={() => setDeleting(d)} className="btn-ghost !px-2 !py-1.5 text-red-600" title="Hapus">
                                <Trash2 size={14} />
                              </button>
                            </>
                          )}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} totalPages={totalPages} onPage={setPage} />
          </>
        )}
      </Card>

      {/* Modal upload */}
      <Modal open={showUpload} onClose={() => setShowUpload(false)} title="Upload Dokumen Arsip">
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">Judul *</span>
            <Input
              value={uploadForm.title}
              onChange={(e) => setUploadForm({ ...uploadForm, title: e.target.value })}
              placeholder="Contoh: Surat Keputusan Direksi No. 12/2026"
              maxLength={200}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Kategori *</span>
              <select
                className="input w-full"
                value={uploadForm.categoryId}
                onChange={(e) => setUploadForm({ ...uploadForm, categoryId: e.target.value })}
              >
                <option value="">— Pilih kategori —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.parentName ? `${c.parentName} / ${c.name}` : c.name}
                  </option>
                ))}
              </select>
              {categories.length === 0 && (
                <span className="mt-1 block text-xs text-slate-500">
                  Belum ada kategori. Buat dulu di <Link href="/earsip/kategori" className="text-brand hover:underline">halaman Kategori</Link>.
                </span>
              )}
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Tingkat Kerahasiaan</span>
              <select
                className="input w-full"
                value={uploadForm.confidentiality}
                onChange={(e) => setUploadForm({ ...uploadForm, confidentiality: e.target.value as EarsipConfidentiality })}
              >
                {EARSIP_CONFIDENTIALITIES.map((c) => (
                  <option key={c} value={c}>{EARSIP_CONFIDENTIALITY_LABEL[c]}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Nomor Dokumen</span>
              <Input
                value={uploadForm.documentNumber}
                onChange={(e) => setUploadForm({ ...uploadForm, documentNumber: e.target.value })}
                placeholder="Contoh: SK/012/2026"
                maxLength={100}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Tanggal Dokumen</span>
              <input
                type="date"
                className="input w-full"
                value={uploadForm.documentDate}
                onChange={(e) => setUploadForm({ ...uploadForm, documentDate: e.target.value })}
              />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">Deskripsi</span>
            <textarea
              className="input w-full resize-y"
              rows={3}
              value={uploadForm.description}
              onChange={(e) => setUploadForm({ ...uploadForm, description: e.target.value })}
              placeholder="Keterangan singkat tentang dokumen ini (opsional)."
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">File *</span>
            <input
              type="file"
              className="input w-full"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
              onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
            />
            <span className="mt-1 block text-xs text-slate-500">{EARSIP_ALLOWED_LABEL}. File executable dan ekstensi ganda ditolak.</span>
            {uploadFile && (
              <span className="mt-1 block text-xs text-slate-600">
                {uploadFile.name} • {formatFileSize(uploadFile.size)}
              </span>
            )}
          </label>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setShowUpload(false)}>Batal</button>
            <button
              onClick={handleUpload}
              disabled={uploading || !uploadForm.title.trim() || !uploadForm.categoryId || !uploadFile}
              className="btn-primary inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <Upload size={15} /> {uploading ? 'Mengunggah…' : 'Upload & Arsipkan'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal edit */}
      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit Dokumen Arsip">
        {editing && (
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Judul *</span>
              <Input
                value={editForm.title}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                maxLength={200}
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">Kategori *</span>
                <select
                  className="input w-full"
                  value={editForm.categoryId}
                  onChange={(e) => setEditForm({ ...editForm, categoryId: e.target.value })}
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.parentName ? `${c.parentName} / ${c.name}` : c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">Tingkat Kerahasiaan</span>
                <select
                  className="input w-full"
                  value={editForm.confidentiality}
                  onChange={(e) => setEditForm({ ...editForm, confidentiality: e.target.value as EarsipConfidentiality })}
                >
                  {EARSIP_CONFIDENTIALITIES.map((c) => (
                    <option key={c} value={c}>{EARSIP_CONFIDENTIALITY_LABEL[c]}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">Nomor Dokumen</span>
                <Input
                  value={editForm.documentNumber}
                  onChange={(e) => setEditForm({ ...editForm, documentNumber: e.target.value })}
                  maxLength={100}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">Tanggal Dokumen</span>
                <input
                  type="date"
                  className="input w-full"
                  value={editForm.documentDate}
                  onChange={(e) => setEditForm({ ...editForm, documentDate: e.target.value })}
                />
              </label>
            </div>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Deskripsi</span>
              <textarea
                className="input w-full resize-y"
                rows={3}
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Status</span>
              <select
                className="input w-full"
                value={editForm.status}
                onChange={(e) => setEditForm({ ...editForm, status: e.target.value as EarsipStatus })}
              >
                {EARSIP_STATUSES.map((s) => (
                  <option key={s} value={s}>{EARSIP_STATUS_LABEL[s]}</option>
                ))}
              </select>
            </label>
            <p className="text-xs text-slate-500">File: {editing.fileName} ({formatFileSize(editing.fileSize)}). File tidak bisa diganti — hapus dokumen lalu unggah ulang bila perlu ganti file.</p>
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setEditing(null)}>Batal</button>
              <button onClick={handleEdit} disabled={savingEdit || !editForm.title.trim()} className="btn-primary disabled:opacity-50">
                {savingEdit ? 'Menyimpan…' : 'Simpan Perubahan'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title="Hapus Dokumen Arsip"
        message={deleting ? `Hapus dokumen "${deleting.title}" beserta filenya? Tindakan ini tidak bisa dibatalkan.` : ''}
        confirmLabel="Ya, hapus"
        loading={deleteLoading}
      />
    </div>
  );
}
