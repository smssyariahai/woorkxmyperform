'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { Pencil, Plus, Trash2, Power, PowerOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Template } from './TemplatePicker';

const CATEGORIES = ['Sapaan', 'Paket & Harga', 'Follow Up', 'Penutup', 'Umum'];

interface FormState {
  id: string | null;
  name: string;
  category: string;
  body: string;
  isActive: boolean;
}

const EMPTY_FORM: FormState = { id: null, name: '', category: 'Umum', body: '', isActive: true };

export function TemplateManager({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Template | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch('/api/templates?active=0');
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      setTemplates(j.data.items);
    } catch (e: any) {
      toast.error(e.message || 'Gagal memuat template.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) {
      load();
      setForm(EMPTY_FORM);
      setDeleting(null);
    }
  }, [open ]);

  function startEdit(t: Template) {
    setForm({ id: t.id, name: t.name, category: t.category, body: t.body, isActive: t.isActive });
  }

  async function save() {
    if (!form.name.trim() || !form.body.trim()) {
      toast.error('Nama dan isi template wajib diisi.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        category: form.category,
        body: form.body,
        isActive: form.isActive,
      };
      const r = await fetch(form.id ? `/api/templates/${form.id}` : '/api/templates', {
        method: form.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success(form.id ? 'Template diperbarui.' : 'Template ditambahkan.');
      setForm(EMPTY_FORM);
      await load();
    } catch (e: any) {
      toast.error(e.message || 'Gagal menyimpan template.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(t: Template) {
    try {
      const r = await fetch(`/api/templates/${t.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: t.name, category: t.category, body: t.body, isActive: !t.isActive }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success(t.isActive ? 'Template dinonaktifkan.' : 'Template diaktifkan.');
      await load();
    } catch (e: any) {
      toast.error(e.message || 'Gagal mengubah status.');
    }
  }

  async function doDelete() {
    if (!deleting) return;
    setDeletingBusy(true);
    try {
      const r = await fetch(`/api/templates/${deleting.id}`, { method: 'DELETE' });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success('Template dihapus.');
      setDeleting(null);
      await load();
    } catch (e: any) {
      toast.error(e.message || 'Gagal menghapus template.');
    } finally {
      setDeletingBusy(false);
    }
  }

  return (
    <>
      <Modal open={open} onClose={onClose} title="Kelola Template Balasan" wide>
        <div className="grid gap-6 md:grid-cols-2">
          {/* Daftar */}
          <div>
            <p className="text-[13px] font-semibold text-ink mb-2">
              Template tersimpan {templates.length > 0 && `(${templates.length})`}
            </p>
            <div className="space-y-2 max-h-[46vh] overflow-y-auto pr-1">
              {loading && <p className="text-[13px] text-muted">Memuat…</p>}
              {!loading && templates.length === 0 && (
                <p className="text-[13px] text-muted">Belum ada template.</p>
              )}
              {templates.map((t) => (
                <div
                  key={t.id}
                  className={cn(
                    'rounded-xl border border-line p-3',
                    !t.isActive && 'opacity-60'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold text-ink truncate">{t.name}</span>
                    <span className="badge !text-[10.5px] !py-0.5 !px-2 shrink-0">{t.category}</span>
                    <div className="ml-auto flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => toggleActive(t)}
                        className="btn-ghost !px-2 !py-1.5"
                        title={t.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                      >
                        {t.isActive ? <Power className="h-3.5 w-3.5" /> : <PowerOff className="h-3.5 w-3.5" />}
                      </button>
                      <button onClick={() => startEdit(t)} className="btn-ghost !px-2 !py-1.5" title="Ubah">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleting(t)}
                        className="btn-ghost !px-2 !py-1.5 !text-red-600"
                        title="Hapus"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="mt-1.5 text-[12px] text-muted line-clamp-2 whitespace-pre-wrap">{t.body}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Form */}
          <div>
            <p className="text-[13px] font-semibold text-ink mb-2">
              {form.id ? 'Ubah template' : 'Template baru'}
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-[12.5px] font-medium text-ink">Nama</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="cth: Sapaan awal"
                  className="input mt-1 w-full"
                />
              </div>
              <div>
                <label className="text-[12.5px] font-medium text-ink">Kategori</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  className="input mt-1 w-full"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[12.5px] font-medium text-ink">Isi pesan</label>
                <textarea
                  value={form.body}
                  onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                  placeholder="Tulis isi template…"
                  rows={5}
                  className="input mt-1 w-full resize-y"
                />
                <p className="mt-1 text-[11.5px] text-muted">
                  Tip: tulis <code className="px-1 rounded bg-slate-100 dark:bg-slate-800">{'{{nama}}'}</code> untuk
                  disisipi nama pelanggan otomatis.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={save}
                  disabled={saving}
                  className="btn-primary !py-2 text-[13px] inline-flex items-center gap-1.5"
                >
                  <Plus className="h-4 w-4" /> {saving ? 'Menyimpan…' : form.id ? 'Simpan perubahan' : 'Tambah template'}
                </button>
                {form.id && (
                  <button onClick={() => setForm(EMPTY_FORM)} className="btn-secondary !py-2 text-[13px]">
                    Batal
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={doDelete}
        loading={deletingBusy}
        title="Hapus template?"
        message={`Template "${deleting?.name}" akan dihapus permanen.`}
        confirmLabel="Ya, hapus"
      />
    </>
  );
}
