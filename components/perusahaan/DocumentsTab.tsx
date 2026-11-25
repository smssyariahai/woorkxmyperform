'use client';

import { docTypesFor, DOC_TYPES_BADAN_USAHA, DOC_TYPES_UMKM } from '@/lib/perusahaan/constants';
import type { CompanyDoc } from './PerusahaanClient';
import { DocumentUploadCard } from './DocumentUploadCard';

export function DocumentsTab({
  businessType,
  documents,
  canManage,
  onChanged,
}: {
  businessType: string | null;
  documents: CompanyDoc[];
  canManage: boolean;
  onChanged: () => void;
}) {
  const defs = docTypesFor(businessType);
  const byType = new Map<string, CompanyDoc[]>();
  for (const d of documents) {
    const list = byType.get(d.docType) ?? [];
    list.push(d);
    byType.set(d.docType, list);
  }

  // Dokumen yang sudah ada tapi jenis usahanya berubah (arsip dipertahankan).
  const allDefs = [...DOC_TYPES_UMKM, ...DOC_TYPES_BADAN_USAHA];
  const archived = documents.filter(
    (d) => !defs.some((def) => def.key === d.docType)
  );

  return (
    <div className="space-y-4">
      <div className="card p-4 sm:p-6">
        <h2 className="text-base font-semibold text-ink">Dokumen Perusahaan</h2>
        <p className="mt-0.5 text-sm text-muted">
          Daftar dokumen legalitas mengikuti jenis usaha yang dipilih. Dokumen diunggah sebagai
          file asli (PDF) atau foto — foto dikompres otomatis sebelum diunggah agar ukurannya
          memenuhi batas.
        </p>
        {!businessType && (
          <p className="mt-3 rounded-input border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
            Pilih Jenis Usaha dulu di tab Informasi Perusahaan untuk melihat daftar dokumen yang
            harus dilengkapi.
          </p>
        )}
      </div>

      {defs.map((def) => (
        <DocumentUploadCard
          key={def.key}
          def={def}
          docs={byType.get(def.key) ?? []}
          canManage={canManage}
          onChanged={onChanged}
        />
      ))}

      {archived.length > 0 && (
        <div className="card p-4 sm:p-6">
          <h3 className="text-sm font-semibold text-ink">Arsip Dokumen Sebelumnya</h3>
          <p className="mt-0.5 text-[13px] text-muted">
            Dokumen ini tidak lagi masuk daftar wajib setelah jenis usaha berubah, tetapi tetap
            tersimpan dan dapat diakses.
          </p>
          <div className="mt-3 space-y-2">
            {archived.map((d) => {
              const def = allDefs.find((x) => x.key === d.docType);
              return (
                <div
                  key={d.id}
                  className="flex items-center justify-between gap-2 rounded-input border border-line px-3 py-2 text-sm"
                >
                  <span className="min-w-0 truncate text-ink">
                    {def?.label ?? d.docType} — {d.originalName}
                  </span>
                  <a
                    href={`/api/perusahaan/dokumen/${d.id}/file`}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 text-brand hover:underline"
                  >
                    Lihat
                  </a>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
