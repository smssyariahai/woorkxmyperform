'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { formatBytes, type DocTypeDef } from '@/lib/perusahaan/constants';
import { compressImage } from '@/lib/perusahaan/compress';
import { apiJson, type CompanyDoc } from './PerusahaanClient';

const STATUS_BADGE: Record<string, { cls: string; label: string }> = {
  DIAJUKAN: { cls: 'badge-blue', label: 'Diajukan' },
  TERVERIFIKASI: { cls: 'badge-green', label: 'Terverifikasi' },
  DITOLAK: { cls: 'badge-red', label: 'Ditolak' },
  PERLU_PERBAIKAN: { cls: 'badge-amber', label: 'Perlu Perbaikan' },
};

export function DocumentUploadCard({
  def,
  docs,
  canManage,
  onChanged,
}: {
  def: DocTypeDef;
  docs: CompanyDoc[];
  canManage: boolean;
  onChanged: () => void;
}) {
  const [label, setLabel] = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const accept = def.category === 'PDF' ? 'application/pdf' : 'image/jpeg,image/png,image/webp';

  async function handleFile(file: File) {
    if (def.labelPrompt && def.labelOptions && !label) {
      toast.error(`Pilih ${def.labelPrompt.toLowerCase()} terlebih dahulu.`);
      return;
    }
    if (def.labelPrompt && !def.labelOptions && !label.trim()) {
      toast.error(`Isi ${def.labelPrompt.toLowerCase()} terlebih dahulu.`);
      return;
    }
    // Validasi awal di client (format + ukuran sebelum kompresi).
    const isFoto = def.category === 'FOTO';
    const okType = isFoto
      ? ['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
      : file.type === 'application/pdf';
    if (!okType) {
      toast.error(
        isFoto
          ? 'Foto hanya menerima JPG, JPEG, PNG, atau WebP.'
          : 'Dokumen ini hanya menerima file PDF.'
      );
      return;
    }
    setUploading(true);
    try {
      let blob: Blob = file;
      let originalSize = file.size;
      if (isFoto) {
        setProgress('Mengompres foto…');
        const res = await compressImage(file, def.maxBytes);
        originalSize = res.originalSize;
        if (res.overLimit) {
          toast.error(
            `Foto masih melebihi ${formatBytes(def.maxBytes)} setelah kompresi. Gunakan foto yang lebih kecil.`
          );
          return;
        }
        blob = res.blob;
      }
      setProgress('Mengunggah…');
      const fd = new FormData();
      fd.append('docType', def.key);
      if (label.trim()) fd.append('label', label.trim());
      fd.append('originalSize', String(originalSize));
      fd.append('file', blob, file.name);
      await apiJson('/api/perusahaan/dokumen', { method: 'POST', body: fd });
      toast.success(`Dokumen ${def.label} berhasil diunggah.`);
      setLabel('');
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal mengunggah dokumen.');
    } finally {
      setUploading(false);
      setProgress('');
    }
  }

  async function removeDoc(doc: CompanyDoc) {
    if (!confirm(`Hapus dokumen ${doc.originalName}?`)) return;
    try {
      await apiJson(`/api/perusahaan/dokumen/${doc.id}`, { method: 'DELETE' });
      toast.success('Dokumen dihapus.');
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal menghapus dokumen.');
    }
  }

  const hasDoc = docs.length > 0;
  const fileUrl = (id: string) => `/api/perusahaan/dokumen/${id}/file`;

  return (
    <div className="rounded-card border border-line bg-white dark:bg-slate-900 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-ink">
            {def.label}{' '}
            <span className={def.required ? 'badge-red ml-1' : 'badge-gray ml-1'}>
              {def.required ? 'Wajib' : 'Opsional'}
            </span>
          </p>
          <p className="mt-0.5 text-[12px] text-muted">
            {def.category === 'PDF' ? 'PDF' : 'Foto (JPG, JPEG, PNG, WebP)'} · maks{' '}
            {formatBytes(def.maxBytes)}
            {def.multiple ? ' per file' : ''}
            {def.hint ? ` · ${def.hint}` : ''}
          </p>
        </div>
        <span className={hasDoc ? 'badge-green' : 'badge-amber'}>
          {hasDoc ? `${docs.length} terunggah` : 'Belum diunggah'}
        </span>
      </div>

      {/* Daftar dokumen yang sudah ada */}
      {docs.map((doc) => {
        const st = STATUS_BADGE[doc.status] ?? { cls: 'badge-gray', label: doc.status };
        const isImage = doc.mimeType.startsWith('image/');
        return (
          <div
            key={doc.id}
            className="mt-3 flex items-center gap-3 rounded-input border border-line bg-slate-50/60 dark:bg-slate-800/40 p-2.5"
          >
            {isImage ? (
              <a href={fileUrl(doc.id)} target="_blank" rel="noreferrer" title="Lihat gambar">
                <img
                  src={fileUrl(doc.id)}
                  alt={doc.originalName}
                  className="h-12 w-12 shrink-0 rounded border border-line object-cover"
                />
              </a>
            ) : (
              <a
                href={fileUrl(doc.id)}
                target="_blank"
                rel="noreferrer"
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded border border-line bg-white text-[11px] font-bold text-danger dark:bg-slate-900"
                title="Lihat PDF"
              >
                PDF
              </a>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink" title={doc.originalName}>
                {doc.originalName}
              </p>
              <p className="truncate text-[12px] text-muted">
                {doc.label ? `${doc.label} · ` : ''}
                {formatBytes(doc.originalSize)}
                {doc.compressedSize < doc.originalSize
                  ? ` → ${formatBytes(doc.compressedSize)} (dikompres)`
                  : ''}
                {' · '}
                {doc.uploadedByName} · {new Date(doc.uploadedAt).toLocaleDateString('id-ID')}
              </p>
              <span className={`${st.cls} mt-1`}>{st.label}</span>
            </div>
            <div className="flex shrink-0 flex-col gap-1">
              <a
                href={fileUrl(doc.id)}
                target="_blank"
                rel="noreferrer"
                className="btn-ghost !py-1 !px-2 text-[12px]"
              >
                Lihat
              </a>
              <button
                type="button"
                className="btn-ghost !py-1 !px-2 text-[12px] text-danger"
                onClick={() => void removeDoc(doc)}
                disabled={!canManage}
              >
                Hapus
              </button>
            </div>
          </div>
        );
      })}

      {/* Upload — single: unggah baru = ganti (server mengganti setelah file baru tersimpan) */}
      {canManage && (
        <div className="mt-3 space-y-2">
          {def.labelPrompt && def.labelOptions && (
            <select
              className="input"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              disabled={uploading}
            >
              <option value="">— Pilih {def.labelPrompt.toLowerCase()} —</option>
              {def.labelOptions.map((o) => (
                <option key={o} value={o}>
                  {o === 'LUAR' ? 'Luar' : 'Dalam'}
                </option>
              ))}
            </select>
          )}
          {def.labelPrompt && !def.labelOptions && (
            <input
              className="input"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={def.labelPrompt}
              disabled={uploading}
              maxLength={100}
            />
          )}
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            className="btn-secondary !py-2 !px-3 text-[13px]"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
          >
            {uploading
              ? progress || 'Mengunggah…'
              : hasDoc
                ? def.multiple
                  ? 'Tambah Dokumen'
                  : 'Ganti Dokumen'
                : 'Upload Dokumen'}
          </button>
        </div>
      )}
      {canManage && !def.multiple && hasDoc && (
        <p className="mt-2 text-[12px] text-muted">
          Untuk mengganti, unggah file baru — file lama diganti setelah file baru berhasil disimpan.
        </p>
      )}
    </div>
  );
}
