// Halaman Kategori E-Arsip — CRUD kategori + subkategori (induk/anak)
// + deskripsi. Hapus hanya bila tidak ada dokumen & subkategori terkait
// (API mengembalikan error yang jelas). Butuh EARSIP_MANAGE untuk tulis;
// baca butuh EARSIP_VIEW.
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { FolderOpen, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge, Card } from '@/components/ui/primitives';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import {
  createCategory,
  deleteCategory,
  listCategories,
  updateCategory,
  type ArchiveCategoryItem,
} from '@/lib/earsip/client';

const EMPTY_FORM = { name: '', description: '', parentId: '' };

export default function EarsipKategoriPage() {
  const [items, setItems] = useState<ArchiveCategoryItem[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<ArchiveCategoryItem | null>(null);
  const [deleting, setDeleting] = useState<ArchiveCategoryItem | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await listCategories();
      setItems(r.categories);
      setCanManage(r.canManage);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Gagal memuat kategori.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate(parentId = '') {
    setEditing(null);
    setForm({ ...EMPTY_FORM, parentId });
    setShowForm(true);
  }

  function openEdit(c: ArchiveCategoryItem) {
    setEditing(c);
    setForm({ name: c.name, description: c.description ?? '', parentId: c.parentId ?? '' });
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast.error('Nama kategori wajib diisi.');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        const updated = await updateCategory(editing.id, {
          name: form.name.trim(),
          description: form.description.trim() || null,
          parentId: form.parentId || null,
        });
        toast.success('Kategori diperbarui.');
        setItems((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      } else {
        const created = await createCategory({
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          parentId: form.parentId || null,
        });
        toast.success('Kategori dibuat.');
        setItems((prev) => [...prev, created]);
      }
      setForm(EMPTY_FORM);
      setShowForm(false);
      setEditing(null);
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Gagal menyimpan kategori.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await deleteCategory(deleting.id);
      toast.success('Kategori dihapus.');
      setDeleting(null);
      setItems((prev) => prev.filter((c) => c.id !== deleting.id));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Gagal menghapus kategori.');
    } finally {
      setDeleteLoading(false);
    }
  }

  const roots = items.filter((c) => !c.parentId);
  const childrenOf = (parentId: string) => items.filter((c) => c.parentId === parentId);
  // Induk yang bisa dipilih saat edit: semua kategori kecuali diri sendiri
  // dan turunannya (mencegah siklus — server juga memvalidasi).
  const parentOptions = editing
    ? items.filter((c) => c.id !== editing.id && !isDescendantOf(c, editing.id, items))
    : items;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Link href="/earsip" className="text-xs text-brand hover:underline">← Kembali ke E-Arsip</Link>
          <h1 className="mt-1 text-lg font-bold text-slate-800">Kategori Arsip</h1>
          <p className="text-xs text-slate-500">
            Kelompokkan dokumen arsip ke dalam kategori dan subkategori.
          </p>
        </div>
        {canManage && (
          <button onClick={() => openCreate()} className="btn-primary inline-flex items-center gap-1.5">
            <Plus size={15} /> Tambah Kategori
          </button>
        )}
      </div>

      <Card>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<FolderOpen className="h-7 w-7" />}
            title="Belum ada kategori"
            description="Buat kategori pertama, mis. “Surat Masuk”, “Kontrak”, atau “Keuangan”. Dokumen baru wajib memilih kategori."
            action={
              canManage ? (
                <button className="btn-primary" onClick={() => openCreate()}>
                  Tambah Kategori
                </button>
              ) : undefined
            }
          />
        ) : (
          <ul className="space-y-2">
            {roots.map((root) => (
              <li key={root.id}>
                <CategoryRow
                  c={root}
                  canManage={canManage}
                  onEdit={() => openEdit(root)}
                  onDelete={() => setDeleting(root)}
                  onAddChild={() => openCreate(root.id)}
                />
                {childrenOf(root.id).map((child) => (
                  <div key={child.id} className="ml-6 mt-2 border-l-2 border-slate-200 pl-3">
                    <CategoryRow
                      c={child}
                      canManage={canManage}
                      onEdit={() => openEdit(child)}
                      onDelete={() => setDeleting(child)}
                      onAddChild={undefined}
                    />
                    {childrenOf(child.id).map((grand) => (
                      <div key={grand.id} className="ml-6 mt-2 border-l-2 border-slate-200 pl-3">
                        <CategoryRow
                          c={grand}
                          canManage={canManage}
                          onEdit={() => openEdit(grand)}
                          onDelete={() => setDeleting(grand)}
                          onAddChild={undefined}
                        />
                      </div>
                    ))}
                  </div>
                ))}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal
        open={showForm}
        onClose={() => { setShowForm(false); setEditing(null); }}
        title={editing ? 'Edit Kategori' : 'Tambah Kategori'}
      >
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">Nama kategori *</span>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Contoh: Surat Masuk"
              maxLength={100}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">Kategori induk (opsional — kosongkan untuk kategori utama)</span>
            <select
              className="input w-full"
              value={form.parentId}
              onChange={(e) => setForm({ ...form, parentId: e.target.value })}
            >
              <option value="">— Kategori utama —</option>
              {parentOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.parentName ? `${c.parentName} / ${c.name}` : c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">Deskripsi</span>
            <textarea
              className="input w-full resize-y"
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Keterangan singkat kategori ini (opsional)."
            />
          </label>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => { setShowForm(false); setEditing(null); }}>Batal</button>
            <button onClick={handleSave} disabled={saving || !form.name.trim()} className="btn-primary disabled:opacity-50">
              {saving ? 'Menyimpan…' : editing ? 'Simpan Perubahan' : 'Buat Kategori'}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title="Hapus Kategori"
        message={deleting ? `Hapus kategori "${deleting.name}"? Kategori yang masih punya dokumen atau subkategori tidak bisa dihapus.` : ''}
        confirmLabel="Ya, hapus"
        loading={deleteLoading}
      />
    </div>
  );
}

function CategoryRow({
  c,
  canManage,
  onEdit,
  onDelete,
  onAddChild,
}: {
  c: ArchiveCategoryItem;
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onAddChild?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 p-4">
      <div>
        <span className="flex items-center gap-2">
          <FolderOpen size={16} className="text-slate-400" />
          <span className="text-sm font-semibold text-slate-800">{c.name}</span>
          <Badge tone="gray">{c.documentCount} dokumen</Badge>
          {c.childCount > 0 && <Badge tone="blue">{c.childCount} subkategori</Badge>}
        </span>
        {c.description && <span className="mt-1 block text-xs text-slate-500">{c.description}</span>}
        {c.createdByName && <span className="mt-0.5 block text-xs text-slate-400">Dibuat oleh {c.createdByName}</span>}
      </div>
      {canManage && (
        <span className="flex gap-1">
          {onAddChild && (
            <button onClick={onAddChild} className="btn-ghost !px-2.5 !py-1.5 text-xs" title="Tambah subkategori">
              <Plus size={14} /> Subkategori
            </button>
          )}
          <button onClick={onEdit} className="btn-ghost !px-2 !py-1.5" title="Edit">
            <Pencil size={14} />
          </button>
          <button onClick={onDelete} className="btn-ghost !px-2 !py-1.5 text-red-600" title="Hapus">
            <Trash2 size={14} />
          </button>
        </span>
      )}
    </div>
  );
}

/** Apakah `candidate` adalah turunan dari `ancestorId` (telusur parent)? */
function isDescendantOf(
  candidate: ArchiveCategoryItem,
  ancestorId: string,
  all: ArchiveCategoryItem[]
): boolean {
  let current: ArchiveCategoryItem | undefined = candidate;
  const seen = new Set<string>();
  while (current?.parentId) {
    if (seen.has(current.id)) break;
    seen.add(current.id);
    if (current.parentId === ancestorId) return true;
    current = all.find((c) => c.id === current!.parentId);
  }
  return false;
}
