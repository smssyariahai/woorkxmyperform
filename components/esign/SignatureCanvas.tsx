'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Eraser, RotateCcw, Save, Loader2, PenLine } from 'lucide-react';

type Pt = { x: number; y: number }; // fraksi 0–1 dari ukuran canvas (tahan resize)
type Stroke = Pt[];

const CSS_HEIGHT = 240;
const LINE_WIDTH = 2.5;
const INK = '#1e293b';

/** Canvas tanda tangan: Pointer Events (mouse/touch/stylus menyatu), garis halus, tajam di retina. */
export function SignatureCanvas({
  onSave,
  saving = false,
}: {
  /** Dipanggil dengan PNG data URL saat tombol Simpan ditekan. */
  onSave: (dataUrl: string) => void | Promise<void>;
  saving?: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const currentRef = useRef<Stroke | null>(null);
  const drawingRef = useRef(false);
  const [strokeCount, setStrokeCount] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);

  const isEmpty = strokeCount === 0;

  /** Gambar ulang seluruh goresan dari data fraksi (dipakai setelah undo/resize). */
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.lineWidth = LINE_WIDTH * (window.devicePixelRatio || 1);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = INK;
    const drawStroke = (s: Stroke) => {
      if (s.length === 0) return;
      ctx.beginPath();
      ctx.moveTo(s[0].x * w, s[0].y * h);
      if (s.length === 1) {
        ctx.lineTo(s[0].x * w + 0.01, s[0].y * h + 0.01);
      } else {
        for (let i = 1; i < s.length - 1; i++) {
          const mx = ((s[i].x + s[i + 1].x) / 2) * w;
          const my = ((s[i].y + s[i + 1].y) / 2) * h;
          ctx.quadraticCurveTo(s[i].x * w, s[i].y * h, mx, my);
        }
        ctx.lineTo(s[s.length - 1].x * w, s[s.length - 1].y * h);
      }
      ctx.stroke();
    };
    for (const s of strokesRef.current) drawStroke(s);
    if (currentRef.current) drawStroke(currentRef.current);
  }, []);

  /** Sesuaikan ukuran piksel canvas dengan lebar container × devicePixelRatio. */
  const fitCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const dpr = window.devicePixelRatio || 1;
    const cssW = wrap.clientWidth;
    canvas.width = Math.max(1, Math.round(cssW * dpr));
    canvas.height = Math.round(CSS_HEIGHT * dpr);
    canvas.style.height = `${CSS_HEIGHT}px`;
    redraw();
  }, [redraw]);

  useEffect(() => {
    fitCanvas();
    const ro = new ResizeObserver(() => fitCanvas());
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [fitCanvas]);

  const posOf = (e: React.PointerEvent): Pt => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    };
  };

  const updatePreview = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setPreview(canvas.toDataURL('image/png'));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    drawingRef.current = true;
    currentRef.current = [posOf(e)];
    redraw();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drawingRef.current || !currentRef.current) return;
    e.preventDefault();
    currentRef.current.push(posOf(e));
    redraw();
  };

  const endStroke = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    if (currentRef.current && currentRef.current.length > 0) {
      strokesRef.current.push(currentRef.current);
      setStrokeCount(strokesRef.current.length);
    }
    currentRef.current = null;
    redraw();
    updatePreview();
  };

  const handleClear = () => {
    strokesRef.current = [];
    currentRef.current = null;
    setStrokeCount(0);
    setPreview(null);
    redraw();
  };

  const handleUndo = () => {
    strokesRef.current.pop();
    setStrokeCount(strokesRef.current.length);
    redraw();
    updatePreview();
  };

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas || isEmpty) return;
    onSave(canvas.toDataURL('image/png'));
  };

  return (
    <div className="space-y-3">
      <div
        ref={wrapRef}
        className="overflow-hidden rounded-xl border border-slate-300 bg-white"
      >
        <canvas
          ref={canvasRef}
          className="block w-full cursor-crosshair touch-none select-none"
          style={{ touchAction: 'none', height: CSS_HEIGHT }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endStroke}
          onPointerCancel={endStroke}
          onPointerLeave={endStroke}
          aria-label="Area menggambar tanda tangan"
        />
      </div>
      <p className="flex items-center gap-1.5 text-[12.5px] text-muted">
        <PenLine className="h-3.5 w-3.5" />
        Gambar dengan mouse, jari, atau stylus. Kanvas kosong tidak bisa disimpan.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleUndo}
          disabled={isEmpty || saving}
          className="btn-secondary"
        >
          <RotateCcw className="mr-1 inline h-4 w-4" /> Urungkan
        </button>
        <button
          type="button"
          onClick={handleClear}
          disabled={isEmpty || saving}
          className="btn-secondary"
        >
          <Eraser className="mr-1 inline h-4 w-4" /> Hapus
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={isEmpty || saving}
          className="btn-primary"
        >
          {saving ? (
            <Loader2 className="mr-1 inline h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-1 inline h-4 w-4" />
          )}
          Simpan Tanda Tangan
        </button>
      </div>
      {preview && (
        <div>
          <p className="mb-1 text-[12.5px] font-medium text-ink">Pratinjau:</p>
          <div className="inline-block rounded-lg border border-slate-200 bg-white p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Pratinjau tanda tangan" className="max-h-20 max-w-full" />
          </div>
        </div>
      )}
    </div>
  );
}
