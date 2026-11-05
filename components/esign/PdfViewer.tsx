'use client';

import { useEffect, useRef, useState } from 'react';
import type * as PdfJs from 'pdfjs-dist';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Loader2, FileWarning, MousePointerClick } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Posisi tanda tangan ternormalisasi: fraksi 0–1 dari lebar/tinggi halaman + nomor halaman.
 *  Disimpan sebagai fraksi agar akurat di semua zoom/ukuran layar — saat finalisasi
 *  PDF (Fase 5) dikonversi ke koordinat PDF (bottom-left, points). */
export interface EsignPosition {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Ukuran default kotak tanda tangan (fraksi halaman). */
export const DEFAULT_SIGN_BOX = { width: 0.25, height: 0.08 };

let workerConfigured = false;

export function PdfViewer({
  src,
  selectable = false,
  selected = null,
  onSelectPosition,
  className,
}: {
  src: string;
  selectable?: boolean;
  selected?: EsignPosition | null;
  onSelectPosition?: (pos: EsignPosition) => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pdf, setPdf] = useState<PdfJs.PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rendering, setRendering] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);
  const [resizeTick, setResizeTick] = useState(0);

  // Muat dokumen (dynamic import — pdfjs-dist hanya masuk bundle client saat komponen dipakai).
  useEffect(() => {
    let cancelled = false;
    let doc: PdfJs.PDFDocumentProxy | null = null;
    setLoading(true);
    setError('');
    setPdf(null);
    setPage(1);
    setNumPages(0);
    (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        if (!workerConfigured) {
          pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
          workerConfigured = true;
        }
        const loadingTask = pdfjs.getDocument({ url: src });
        doc = await loadingTask.promise;
        if (cancelled) {
          await doc.destroy();
          return;
        }
        setNumPages(doc.numPages);
        setPdf(doc);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Gagal memuat PDF.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      doc?.destroy().catch(() => {});
    };
  }, [src, reloadTick]);

  // Render ulang saat lebar container berubah.
  useEffect(() => {
    let t: any;
    const onResize = () => {
      clearTimeout(t);
      t = setTimeout(() => setResizeTick((v) => v + 1), 150);
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      clearTimeout(t);
    };
  }, []);

  // Render halaman aktif (fit-width × zoom, tajam di layar retina).
  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;
    let renderTask: any = null;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    setRendering(true);
    (async () => {
      try {
        const pg = await pdf.getPage(page);
        if (cancelled) return;
        const viewport1 = pg.getViewport({ scale: 1 });
        const containerWidth = container.clientWidth - 16; // padding container
        const baseScale = containerWidth > 0 ? containerWidth / viewport1.width : 1;
        const scale = baseScale * zoom;
        const viewport = pg.getViewport({ scale });
        const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
        canvas.width = Math.max(1, Math.floor(viewport.width * dpr));
        canvas.height = Math.max(1, Math.floor(viewport.height * dpr));
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        renderTask = pg.render({ canvasContext: ctx, viewport });
        await renderTask.promise;
      } catch (e: any) {
        if (e?.name !== 'RenderingCancelledException' && !cancelled) {
          setError('Gagal merender halaman.');
        }
      } finally {
        if (!cancelled) setRendering(false);
      }
    })();
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [pdf, page, zoom, resizeTick]);

  function handleCanvasClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!selectable) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const fx = (e.clientX - rect.left) / rect.width;
    const fy = (e.clientY - rect.top) / rect.height;
    const x = Math.min(Math.max(fx, 0), 1 - DEFAULT_SIGN_BOX.width);
    const y = Math.min(Math.max(fy, 0), 1 - DEFAULT_SIGN_BOX.height);
    onSelectPosition?.({ page, x, y, width: DEFAULT_SIGN_BOX.width, height: DEFAULT_SIGN_BOX.height });
  }

  return (
    <div className={cn('space-y-2', className)}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn-secondary !px-2.5"
          disabled={page <= 1 || loading}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          aria-label="Halaman sebelumnya"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-[13px] text-muted">
          Halaman {numPages > 0 ? page : '—'} / {numPages || '—'}
        </span>
        <button
          type="button"
          className="btn-secondary !px-2.5"
          disabled={page >= numPages || loading}
          onClick={() => setPage((p) => Math.min(numPages, p + 1))}
          aria-label="Halaman berikutnya"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <span className="mx-1 h-5 w-px bg-line" />
        <button
          type="button"
          className="btn-secondary !px-2.5"
          disabled={loading}
          onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))}
          aria-label="Perkecil"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <span className="w-12 text-center text-[13px] text-muted">{Math.round(zoom * 100)}%</span>
        <button
          type="button"
          className="btn-secondary !px-2.5"
          disabled={loading}
          onClick={() => setZoom((z) => Math.min(2.5, +(z + 0.25).toFixed(2)))}
          aria-label="Perbesar"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        {rendering && <Loader2 className="h-4 w-4 animate-spin text-muted" />}
        {selectable && (
          <span className="ml-auto flex items-center gap-1.5 text-[12px] text-muted">
            <MousePointerClick className="h-4 w-4" />
            Klik pada halaman untuk memilih posisi tanda tangan
          </span>
        )}
      </div>

      {/* Kanvas */}
      <div
        ref={containerRef}
        className="overflow-auto rounded-lg border border-line bg-slate-100 p-2 dark:bg-slate-800"
      >
        {loading && (
          <div className="flex items-center justify-center gap-2 py-16 text-[13px] text-muted">
            <Loader2 className="h-5 w-5 animate-spin" /> Memuat PDF…
          </div>
        )}
        {error && !loading && (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <FileWarning className="h-8 w-8 text-danger" />
            <p className="text-[13px] font-medium text-ink">PDF tidak dapat ditampilkan.</p>
            <p className="max-w-sm text-[12px] text-muted">{error}</p>
            <button type="button" className="btn-secondary mt-1" onClick={() => setReloadTick((v) => v + 1)}>
              Coba lagi
            </button>
          </div>
        )}
        <div className={cn('relative mx-auto w-fit', (loading || error) && 'hidden')}>
          <canvas
            ref={canvasRef}
            onClick={handleCanvasClick}
            className={cn('block rounded bg-white shadow', selectable && 'cursor-crosshair')}
          />
          {selected && selected.page === page && (
            <div
              className="pointer-events-none absolute rounded border-2 border-brand-600 bg-brand-500/20"
              style={{
                left: `${selected.x * 100}%`,
                top: `${selected.y * 100}%`,
                width: `${selected.width * 100}%`,
                height: `${selected.height * 100}%`,
              }}
            >
              <span className="absolute -top-6 left-0 whitespace-nowrap rounded bg-brand-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                Tanda tangan
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
