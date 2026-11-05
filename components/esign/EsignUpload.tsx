'use client';

import { useRef, useState } from 'react';
import { UploadCloud, FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const MAX_BYTES = 10 * 1024 * 1024; // 10MB

export interface EsignUploadResult {
  fileUrl: string;
  originalFilePath: string;
  originalHash: string;
}

/** Zona drag-and-drop + pilih file PDF untuk dokumen E-Sign (dipakai form buat & halaman detail). */
export function EsignUpload({
  documentId,
  onUploaded,
}: {
  documentId: string;
  onUploaded: (r: EsignUploadResult) => void;
}) {
  const [drag, setDrag] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Format harus PDF.');
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error('Ukuran maksimal 10MB.');
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const r = await fetch(`/api/esign/documents/${documentId}/upload`, { method: 'POST', body: form });
      const j = await r.json().catch(() => ({}));
      if (!j.success) throw new Error(j.message || 'Gagal mengunggah.');
      toast.success('PDF berhasil diunggah.');
      onUploaded(j.data);
    } catch (e: any) {
      toast.error(e.message || 'Gagal mengunggah.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f);
          e.target.value = '';
        }}
      />
      <button
        type="button"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files?.[0];
          if (f) upload(f);
        }}
        className={cn(
          'flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-10 text-center transition-colors',
          drag ? 'border-brand-600 bg-brand-50 dark:bg-brand-900/20' : 'border-line hover:border-brand/50',
          uploading && 'opacity-60'
        )}
      >
        {uploading ? (
          <Loader2 className="h-8 w-8 animate-spin text-muted" />
        ) : (
          <UploadCloud className="h-8 w-8 text-muted" />
        )}
        <span className="text-[14px] font-medium text-ink">
          {uploading ? 'Mengunggah…' : 'Seret file PDF ke sini, atau klik untuk memilih'}
        </span>
        <span className="flex items-center gap-1.5 text-[12px] text-muted">
          <FileText className="h-3.5 w-3.5" /> Hanya PDF, maksimal 10MB
        </span>
      </button>
    </div>
  );
}
