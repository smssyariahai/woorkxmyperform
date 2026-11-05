'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardTitle } from '@/components/ui/primitives';
import { toast } from 'sonner';
import { friendlyFetchError } from '@/lib/fetch-error';
import { FileSignature, ArrowRight, CheckCircle2 } from 'lucide-react';
import { EsignUpload } from './EsignUpload';
import { PdfViewer, type EsignPosition } from './PdfViewer';
import { ESIGN_CATEGORIES } from './status';

async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!j.success) throw new Error(j.message || 'Terjadi kesalahan.');
  return j.data;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

/** Alur buat dokumen: isi form → buat draft → upload PDF → preview (pilih posisi tanda tangan). */
export function DocumentForm() {
  const router = useRouter();
  const [documentNumber, setDocumentNumber] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [workflowType, setWorkflowType] = useState<'SEQUENTIAL' | 'PARALLEL'>('SEQUENTIAL');
  const [expiresAt, setExpiresAt] = useState('');
  const [showSignerName, setShowSignerName] = useState(true);
  const [showSignerPosition, setShowSignerPosition] = useState(true);
  const [showSignedDate, setShowSignedDate] = useState(true);
  const [showDocRef, setShowDocRef] = useState(true);
  const [creating, setCreating] = useState(false);
  const [doc, setDoc] = useState<any>(null);
  const [fileUrl, setFileUrl] = useState('');
  const [position, setPosition] = useState<EsignPosition | null>(null);

  async function createDraft(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const data = await api('/api/esign/documents', {
        method: 'POST',
        body: JSON.stringify({
          documentNumber,
          title,
          category,
          description: description || null,
          workflowType,
          approvalStatus: 'NOT_REQUIRED',
          expiresAt: expiresAt || null,
          showSignerName,
          showSignerPosition,
          showSignedDate,
          showDocRef,
        }),
      });
      setDoc(data.item);
      toast.success('Draft dokumen dibuat. Lanjutkan dengan mengunggah PDF.');
    } catch (err: any) {
      toast.error(friendlyFetchError(err, 'Gagal membuat dokumen.'));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-ink">
          <FileSignature className="h-5 w-5 text-brand-700" /> Buat Dokumen E-Sign
        </h1>
        <p className="mt-1 text-[13px] text-muted">
          Dokumen disimpan sebagai draft. Tanda tangan elektronik internal — bukan tersertifikasi PSrE.
        </p>
      </div>

      {/* Langkah 1 — form */}
      <Card>
        <CardTitle>1 · Informasi dokumen</CardTitle>
        <form onSubmit={createDraft} className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nomor dokumen *">
              <input
                className="input"
                value={documentNumber}
                onChange={(e) => setDocumentNumber(e.target.value)}
                placeholder="mis. ESIGN/2026/001"
                required
                disabled={!!doc}
              />
            </Field>
            <Field label="Kategori *">
              <input
                className="input"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="mis. Kontrak Kerja"
                list="esign-categories"
                required
                disabled={!!doc}
              />
              <datalist id="esign-categories">
                {ESIGN_CATEGORIES.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
          </div>
          <Field label="Nama dokumen *">
            <input
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="mis. Kontrak Kerja — Andi Wijaya"
              required
              disabled={!!doc}
            />
          </Field>
          <Field label="Deskripsi">
            <textarea
              className="input min-h-[72px]"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Keterangan singkat dokumen (opsional)"
              disabled={!!doc}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Urutan penandatanganan">
              <select
                className="input"
                value={workflowType}
                onChange={(e) => setWorkflowType(e.target.value as 'SEQUENTIAL' | 'PARALLEL')}
                disabled={!!doc}
              >
                <option value="SEQUENTIAL">Berurutan (sequential)</option>
                <option value="PARALLEL">Bersamaan (parallel)</option>
              </select>
            </Field>
            <Field label="Tanggal kedaluwarsa (opsional)">
              <input
                type="date"
                className="input"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                disabled={!!doc}
              />
            </Field>
          </div>
          <div className="rounded-lg border border-line p-3">
            <p className="text-[13px] font-semibold text-ink">Tampilan tanda tangan di PDF final</p>
            <p className="mt-0.5 text-[12px] text-muted">
              Elemen di bawah gambar tanda tangan. Matikan bila nama/jabatan sudah tercetak di isi kontrak.
            </p>
            <div className="mt-2 grid gap-2 text-[13px] sm:grid-cols-2">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={showSignerName} onChange={(e) => setShowSignerName(e.target.checked)} disabled={!!doc} />
                Nama penandatangan
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={showSignerPosition} onChange={(e) => setShowSignerPosition(e.target.checked)} disabled={!!doc} />
                Jabatan
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={showSignedDate} onChange={(e) => setShowSignedDate(e.target.checked)} disabled={!!doc} />
                Tanggal tanda tangan
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={showDocRef} onChange={(e) => setShowDocRef(e.target.checked)} disabled={!!doc} />
                Nomor referensi dokumen
              </label>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-secondary"
                disabled={!!doc}
                onClick={() => {
                  setShowSignerName(false);
                  setShowSignerPosition(false);
                  setShowSignedDate(false);
                  setShowDocRef(false);
                }}
              >
                Hanya tanda tangan
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={!!doc}
                onClick={() => {
                  setShowSignerName(true);
                  setShowSignerPosition(true);
                  setShowSignedDate(true);
                  setShowDocRef(true);
                }}
              >
                Tampilkan semua
              </button>
            </div>
          </div>
          {!doc && (
            <button type="submit" className="btn-primary" disabled={creating}>
              {creating ? 'Menyimpan…' : 'Buat draft'}
            </button>
          )}
          {doc && (
            <p className="flex items-center gap-1.5 text-[13px] font-medium text-emerald-700">
              <CheckCircle2 className="h-4 w-4" /> Draft dibuat: {doc.documentNumber}
            </p>
          )}
        </form>
      </Card>

      {/* Langkah 2 — upload */}
      {doc && !fileUrl && (
        <Card>
          <CardTitle>2 · Unggah file PDF</CardTitle>
          <div className="mt-4">
            <EsignUpload
              documentId={doc.id}
              onUploaded={(r) => setFileUrl(r.fileUrl)}
            />
          </div>
          <button
            type="button"
            className="btn-secondary mt-4"
            onClick={() => router.push(`/esign/${doc.id}`)}
          >
            Lewati dulu — ke halaman dokumen
          </button>
        </Card>
      )}

      {/* Langkah 3 — preview + pilih posisi */}
      {doc && fileUrl && (
        <Card>
          <CardTitle>3 · Preview & posisi tanda tangan</CardTitle>
          <p className="mt-1 text-[13px] text-muted">
            Periksa isi dokumen. Klik pada halaman untuk memilih posisi kotak tanda tangan — posisi ini
            dipakai saat mengatur penandatangan (Fase 4).
          </p>
          <div className="mt-4">
            <PdfViewer src={fileUrl} selectable selected={position} onSelectPosition={setPosition} />
          </div>
          {position && (
            <p className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-[13px] text-brand-800 dark:bg-brand-900/30 dark:text-brand-100">
              Posisi dipilih — halaman {position.page}, x {(position.x * 100).toFixed(0)}%, y{' '}
              {(position.y * 100).toFixed(0)}% dari halaman.
            </p>
          )}
          <button
            type="button"
            className="btn-primary mt-4"
            onClick={() => router.push(`/esign/${doc.id}`)}
          >
            Selesai — lihat dokumen <ArrowRight className="ml-1 inline h-4 w-4" />
          </button>
        </Card>
      )}
    </div>
  );
}
