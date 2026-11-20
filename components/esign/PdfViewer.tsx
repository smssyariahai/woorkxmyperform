'use client';

import { useEffect, useRef, useState } from 'react';
import type * as PdfJs from 'pdfjs-dist';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Loader2, FileWarning, MousePointerClick, X } from 'lucide-react';
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

/** Satu kotak tanda tangan milik seorang penandatangan (mode multi-kotak). */
export interface EsignPositionBox {
  id: string;
  label: string;
  /** Warna kotak (hex), dipakai untuk border, latar, dan label nama. */
  color: string;
  position: EsignPosition;
}

/** Ukuran default kotak tanda tangan (fraksi halaman). */
export const DEFAULT_SIGN_BOX = { width: 0.25, height: 0.08 };

let workerConfigured = false;

export function PdfViewer({
  src,
  selectable = false,
  selected = null,
  onSelectPosition,
  // --- Mode multi-kotak (opsional; dipakai wizard buat dokumen). Bila tidak
  // diisi, perilaku persis seperti sebelumnya (satu kotak `selected` saja). ---
  boxes,
  activeBoxId = null,
  onBoxSelect,
  onBoxMove,
  onBoxRemove,
  /** Klik di area kosong kanvas → tempatkan penandatangan aktif (kotak di tengah titik ketuk). */
  onPlace,
  /** Chip penandatangan dijatuhkan (HTML5 drag & drop) ke kanvas. */
  onDropSigner,
  /** Halaman terkontrol (opsional) — bila diisi, parent yang mengatur halaman. */
  page: controlledPage,
  onPageChange,
  className,
}: {
  src: string;
  selectable?: boolean;
  selected?: EsignPosition | null;
  onSelectPosition?: (pos: EsignPosition) => void;
  boxes?: EsignPositionBox[];
  activeBoxId?: string | null;
  onBoxSelect?: (id: string) => void;
  onBoxMove?: (id: string, pos: EsignPosition) => void;
  onBoxRemove?: (id: string) => void;
  onPlace?: (pos: EsignPosition) => void;
  onDropSigner?: (signerId: string, pos: EsignPosition) => void;
  page?: number;
  onPageChange?: (page: number) => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pdf, setPdf] = useState<PdfJs.PDFDocumentProxy | null>(null);
  const [innerPage, setInnerPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rendering, setRendering] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);
  const [resizeTick, setResizeTick] = useState(0);
  // Seret kotak yang sedang di-drag (pointer capture): posisi awal + posisi kotak awal.
  const boxDragRef = useRef<{ id: string; startX: number; startY: number; orig: EsignPosition } | null>(null);

  const page = controlledPage ?? innerPage;
  function goToPage(p: number) {
    const next = Math.min(Math.max(p, 1), Math.max(numPages, 1));
    setInnerPage(next);
    onPageChange?.(next);
  }

  // Muat dokumen (dynamic import — pdfjs-dist hanya masuk bundle client saat komponen dipakai).
  useEffect(() => {
    let cancelled = false;
    let doc: PdfJs.PDFDocumentProxy | null = null;
    setLoading(true);
    setError('');
    setPdf(null);
    goToPage(1);
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
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const fx = (e.clientX - rect.left) / rect.width;
    const fy = (e.clientY - rect.top) / rect.height;
    // Mode multi-kotak: ketuk untuk menempatkan penandatangan aktif — kotak
    // dipusatkan pada titik ketuk agar mudah diarahkan dengan jari.
    if (onPlace) {
      const w = DEFAULT_SIGN_BOX.width;
      const h = DEFAULT_SIGN_BOX.height;
      const x = Math.min(Math.max(fx - w / 2, 0), 1 - w);
      const y = Math.min(Math.max(fy - h / 2, 0), 1 - h);
      onPlace({ page, x, y, width: w, height: h });
      return;
    }
    if (!selectable) return;
    const x = Math.min(Math.max(fx, 0), 1 - DEFAULT_SIGN_BOX.width);
    const y = Math.min(Math.max(fy, 0), 1 - DEFAULT_SIGN_BOX.height);
    onSelectPosition?.({ page, x, y, width: DEFAULT_SIGN_BOX.width, height: DEFAULT_SIGN_BOX.height });
  }

  /** Seret kotak penandatangan (pointer events — jalan di mouse maupun sentuhan). */
  function onBoxPointerDown(e: React.PointerEvent<HTMLDivElement>, box: EsignPositionBox) {
    if (!onBoxMove) return;
    e.preventDefault();
    e.stopPropagation();
    onBoxSelect?.(box.id);
    boxDragRef.current = { id: box.id, startX: e.clientX, startY: e.clientY, orig: box.position };
    (e.currentTarget as HTMLDivElement).setPointerCapture?.(e.pointerId);
  }

  function onBoxPointerMove(e: React.PointerEvent<HTMLDivElement>, box: EsignPositionBox) {
    const d = boxDragRef.current;
    if (!d || d.id !== box.id || !onBoxMove) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const dx = (e.clientX - d.startX) / rect.width;
    const dy = (e.clientY - d.startY) / rect.height;
    const x = Math.min(Math.max(d.orig.x + dx, 0), 1 - box.position.width);
    const y = Math.min(Math.max(d.orig.y + dy, 0), 1 - box.position.height);
    onBoxMove(box.id, { ...box.position, x, y });
  }

  function onBoxPointerUp() {
    boxDragRef.current = null;
  }

  /** Chip penandatangan dijatuhkan ke kanvas (HTML5 drag & drop, desktop). */
  function handleWrapperDrop(e: React.DragEvent) {
    if (!onDropSigner) return;
    const signerId =
      e.dataTransfer.getData('application/x-esign-signer') || e.dataTransfer.getData('text/plain');
    if (!signerId) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const fx = (e.clientX - rect.left) / rect.width;
    const fy = (e.clientY - rect.top) / rect.height;
    const w = DEFAULT_SIGN_BOX.width;
    const h = DEFAULT_SIGN_BOX.height;
    const x = Math.min(Math.max(fx - w / 2, 0), 1 - w);
    const y = Math.min(Math.max(fy - h / 2, 0), 1 - h);
    onDropSigner(signerId, { page, x, y, width: w, height: h });
  }

  return (
    <div className={cn('space-y-2', className)}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn-secondary !px-2.5"
          disabled={page <= 1 || loading}
          onClick={() => goToPage(page - 1)}
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
          onClick={() => goToPage(page + 1)}
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
        {onPlace && (
          <span className="ml-auto flex items-center gap-1.5 text-[12px] text-muted">
            <MousePointerClick className="h-4 w-4" />
            Ketuk halaman untuk menempatkan kotak tanda tangan
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
        <div
          className={cn('relative mx-auto w-fit', (loading || error) && 'hidden')}
          onDragOver={(e) => {
            if (!onDropSigner) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
          }}
          onDrop={handleWrapperDrop}
        >
          <canvas
            ref={canvasRef}
            onClick={handleCanvasClick}
            className={cn(
              'block rounded bg-white shadow',
              (selectable || onPlace) && 'cursor-crosshair'
            )}
          />
          {/* Kotak-kotak penandatangan (mode multi-kotak, wizard). */}
          {(boxes ?? [])
            .filter((b) => b.position.page === page)
            .map((box) => {
              const active = box.id === activeBoxId;
              return (
                <div
                  key={box.id}
                  role="button"
                  aria-label={`Kotak tanda tangan ${box.label}`}
                  className={cn(
                    'absolute rounded border-2',
                    active ? 'z-20 shadow-lg' : 'z-10',
                    onBoxMove && 'cursor-grab touch-none active:cursor-grabbing'
                  )}
                  style={{
                    left: `${box.position.x * 100}%`,
                    top: `${box.position.y * 100}%`,
                    width: `${box.position.width * 100}%`,
                    height: `${box.position.height * 100}%`,
                    borderColor: box.color,
                    backgroundColor: `${box.color}26`,
                  }}
                  onPointerDown={(e) => onBoxPointerDown(e, box)}
                  onPointerMove={(e) => onBoxPointerMove(e, box)}
                  onPointerUp={onBoxPointerUp}
                  onPointerCancel={onBoxPointerUp}
                  onClick={(e) => {
                    e.stopPropagation();
                    onBoxSelect?.(box.id);
                  }}
                >
                  <span
                    className="absolute -top-6 left-0 flex max-w-full items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold text-white"
                    style={{ backgroundColor: box.color }}
                  >
                    <span className="truncate">{box.label}</span>
                  </span>
                  {active && onBoxRemove && (
                    <button
                      type="button"
                      aria-label={`Hapus posisi ${box.label}`}
                      title="Hapus posisi"
                      className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-white text-danger shadow ring-1 ring-line hover:bg-red-50"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        onBoxRemove(box.id);
                      }}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              );
            })}
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
