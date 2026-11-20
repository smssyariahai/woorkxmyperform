// components/koperasi/SignaturePad.tsx — port dari backup MyPerform
// (src/components/koperasi/SignaturePad.tsx, 443 baris): tanda tangan
// digital — mode Gambar Manual (canvas 600x220 + fullscreen) atau Upload
// Gambar (dropzone/kamera, dibuka di SignatureEditorModal crop+filter).
'use client';

import React, { useEffect, useRef, useState } from "react";
import { Camera, Expand, X } from "lucide-react";
import { Dropzone } from "./Dropzone";
import { SignatureEditorModal } from "./SignatureEditorModal";
import { CameraCapture } from "./CameraCapture";

interface SignaturePadProps {
  value: string;
  onChange: (dataUrl: string) => void;
}

// Tanda tangan digital meniru formulir referensi KSPPS
// (web_app_form_koperasi.html): tombol mode Gambar Manual / Upload Gambar
// di atas, canvas 160px berlatar checkerboard, tombol Hapus Tanda Tangan
// dan Fullscreen di bawah, serta modal fullscreen persis referensi
// (header "Tanda Tangan Manual" + Simpan, footer "Hapus & Ulangi").
// Upload gambar juga memakai dropzone tiruan Kalkulator Gadai Emas.
// Satu penyimpangan kecil dari referensi: ganti mode hanya menghapus
// coretan bila modenya benar-benar berubah (klik mode yang sedang aktif
// tidak menghapus tanda tangan yang sudah ada).
const W = 600;
const H = 220;
const STROKE = "#1f2937";
const CHECKERBOARD: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(45deg, #ddd 25%, transparent 25%), linear-gradient(-45deg, #ddd 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ddd 75%), linear-gradient(-45deg, transparent 75%, #ddd 75%)",
  backgroundSize: "20px 20px",
  backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0px",
  backgroundColor: "#fdfdfd",
};

const drawDataUrl = (canvas: HTMLCanvasElement, dataUrl: string, w: number, h: number) =>
  new Promise<void>((resolve) => {
    const img = new Image();
    img.onload = () => {
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.drawImage(img, 0, 0, w, h);
      resolve();
    };
    img.onerror = () => resolve();
    img.src = dataUrl;
  });

export const SignaturePad: React.FC<SignaturePadProps> = ({ value, onChange }) => {
  const [mode, setMode] = useState<"draw" | "upload">("draw");
  const [fsOpen, setFsOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorImage, setEditorImage] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fsCanvasRef = useRef<HTMLCanvasElement>(null);
  const fsWrapRef = useRef<HTMLDivElement>(null);
  const [sigCameraOpen, setSigCameraOpen] = useState(false);
  const drawingRef = useRef(false);
  const strokedRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const fsDrawingRef = useRef(false);
  const fsLastRef = useRef<{ x: number; y: number } | null>(null);
  const lastCommittedRef = useRef("");

  const setupMainCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== W * dpr) {
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.scale(dpr, dpr);
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = STROKE;
      }
    }
  };

  useEffect(() => {
    setupMainCanvas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sinkronisasi dari luar (muat data edit, Reset form, hapus): gambar
  // nilai yang berbeda ke canvas, atau bersihkan bila nilai dikosongkan.
  useEffect(() => {
    if (value === lastCommittedRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    setupMainCanvas();
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    if (value) {
      drawDataUrl(canvas, value, W, H).then(() => {
        lastCommittedRef.current = value;
      });
    } else {
      lastCommittedRef.current = "";
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const commitMain = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    lastCommittedRef.current = dataUrl;
    onChange(dataUrl);
  };

  const clearMain = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, W, H);
    lastCommittedRef.current = "";
    onChange("");
  };

  const switchMode = (m: "draw" | "upload") => {
    if (m === mode) return;
    clearMain();
    setMode(m);
  };

  const point = (e: React.PointerEvent, canvas: HTMLCanvasElement, w: number, h: number) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * w,
      y: ((e.clientY - rect.top) / rect.height) * h,
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setupMainCanvas();
    drawingRef.current = true;
    strokedRef.current = false;
    lastRef.current = point(e, canvas, W, H);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const p = canvas ? point(e, canvas, W, H) : null;
    const last = lastRef.current;
    if (!canvas || !ctx || !p || !last) return;
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastRef.current = p;
    strokedRef.current = true;
  };

  const endStroke = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastRef.current = null;
    if (strokedRef.current) {
      strokedRef.current = false;
      commitMain();
    }
  };

  // Upload foto tanda tangan kini dibuka di editor (crop + rotate +
  // edit/filter) dari formulir referensi, bukan langsung ditempel ke canvas.
  const onUploadFile = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setEditorImage(reader.result);
        setEditorOpen(true);
      }
    };
    reader.readAsDataURL(file);
  };

  // Hasil editor ditempel ke canvas utama (fit-contain, tengah) lalu disimpan.
  const saveEdited = (pngDataUrl: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setupMainCanvas();
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, W, H);
      const ratio = Math.min(W / img.width, H / img.height);
      const drawW = img.width * ratio;
      const drawH = img.height * ratio;
      ctx.drawImage(img, (W - drawW) / 2, (H - drawH) / 2, drawW, drawH);
      commitMain();
    };
    img.src = pngDataUrl;
    setEditorOpen(false);
  };

  // --- Fullscreen (persis referensi) ---
  const openFs = () => setFsOpen(true);

  useEffect(() => {
    if (!fsOpen) return;
    const raf = requestAnimationFrame(() => {
      const wrap = fsWrapRef.current;
      const fsCanvas = fsCanvasRef.current;
      const mainCanvas = canvasRef.current;
      if (!wrap || !fsCanvas || !mainCanvas) return;
      const w = wrap.clientWidth || window.innerWidth;
      const h = wrap.clientHeight || window.innerHeight - 112;
      fsCanvas.width = w;
      fsCanvas.height = h;
      const ctx = fsCanvas.getContext("2d");
      if (!ctx) return;
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.strokeStyle = STROKE;
      ctx.clearRect(0, 0, w, h);
      // Tempel dengan fit-contain (jaga aspek), bukan stretch.
      const ratio = Math.min(w / mainCanvas.width, h / mainCanvas.height);
      const drawW = mainCanvas.width * ratio;
      const drawH = mainCanvas.height * ratio;
      ctx.drawImage(mainCanvas, (w - drawW) / 2, (h - drawH) / 2, drawW, drawH);
    });
    return () => cancelAnimationFrame(raf);
  }, [fsOpen]);

  const fsPoint = (e: React.PointerEvent) => {
    const canvas = fsCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const fsPointerDown = (e: React.PointerEvent) => {
    fsDrawingRef.current = true;
    fsLastRef.current = fsPoint(e);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const fsPointerMove = (e: React.PointerEvent) => {
    if (!fsDrawingRef.current) return;
    const canvas = fsCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    const p = fsPoint(e);
    const last = fsLastRef.current;
    if (!canvas || !ctx || !last) return;
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    fsLastRef.current = p;
  };

  const fsEnd = () => {
    fsDrawingRef.current = false;
    fsLastRef.current = null;
  };

  const closeFs = (save: boolean) => {
    if (save) {
      const fsCanvas = fsCanvasRef.current;
      const mainCanvas = canvasRef.current;
      if (fsCanvas && mainCanvas) {
        // Simpan HANYA area yang ada piksel tintanya (bounding box),
        // ditempel fit-contain tanpa stretch — perbaikan stretch.
        const fsCtx = fsCanvas.getContext("2d");
        const imgData = fsCtx?.getImageData(0, 0, fsCanvas.width, fsCanvas.height);
        let minX = fsCanvas.width;
        let minY = fsCanvas.height;
        let maxX = -1;
        let maxY = -1;
        if (imgData) {
          const d = imgData.data;
          for (let y = 0; y < fsCanvas.height; y++) {
            for (let x = 0; x < fsCanvas.width; x++) {
              if (d[(y * fsCanvas.width + x) * 4 + 3] > 10) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
              }
            }
          }
        }
        if (maxX >= 0) {
          const cropW = maxX - minX + 1;
          const cropH = maxY - minY + 1;
          const tmp = document.createElement("canvas");
          tmp.width = cropW;
          tmp.height = cropH;
          tmp.getContext("2d")!.drawImage(fsCanvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH);
          setupMainCanvas();
          const ctx = mainCanvas.getContext("2d");
          if (ctx) {
            ctx.clearRect(0, 0, W, H);
            const ratio = Math.min(W / cropW, H / cropH);
            const drawW = cropW * ratio;
            const drawH = cropH * ratio;
            ctx.drawImage(tmp, (W - drawW) / 2, (H - drawH) / 2, drawW, drawH);
          }
          commitMain();
        }
        // Bila fullscreen kosong (tanpa piksel), jangan menimpa tanda tangan lama.
      }
    }
    setFsOpen(false);
  };

  const clearFs = () => {
    const canvas = fsCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const modeBtnCls = (active: boolean) =>
    `text-xs px-3 py-1.5 rounded-md font-medium ${
      active ? "bg-emerald-600 text-white" : "bg-gray-200 text-gray-700"
    }`;

  return (
    <div>
      <span className="block text-xs sm:text-sm font-semibold text-slate-700 mb-1.5">Tanda Tangan Digital</span>
      <div className="flex gap-2 mb-3">
        <button type="button" onClick={() => switchMode("draw")} className={modeBtnCls(mode === "draw")}>
          ✏️ Gambar Manual
        </button>
        <button type="button" onClick={() => switchMode("upload")} className={modeBtnCls(mode === "upload")}>
          📁 Upload Gambar
        </button>
      </div>
      {mode === "upload" && (
        <div className="mb-3 p-3 bg-gray-50 rounded-md border border-gray-200">
          <Dropzone
            mainText="Atau seret dan lepas gambar tanda tangan di sini"
            onFile={onUploadFile}
          />
          <button
            type="button"
            onClick={() => setSigCameraOpen(true)}
            className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-xs font-medium text-white hover:bg-emerald-700"
          >
            <Camera size={14} /> Foto dengan Kamera
          </button>
        </div>
      )}
      <div
        className="border border-gray-300 rounded-md bg-white relative overflow-hidden"
        style={CHECKERBOARD}
      >
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endStroke}
          onPointerCancel={endStroke}
          onPointerLeave={endStroke}
          className="w-full cursor-crosshair touch-none block"
          style={{ touchAction: "none", aspectRatio: `${W} / ${H}`, height: "auto" }}
        />
      </div>
      <div className="flex justify-between items-center mt-2">
        <button type="button" onClick={clearMain} className="text-sm text-red-600 hover:text-red-800 font-medium">
          Hapus Tanda Tangan
        </button>
        {mode === "draw" && (
          <button
            type="button"
            onClick={openFs}
            className="text-sm text-emerald-600 hover:text-emerald-800 font-medium flex items-center gap-1"
          >
            <Expand size={16} /> Fullscreen
          </button>
        )}
      </div>

      {fsOpen && (
        <div className="fixed inset-0 bg-white z-[100] flex flex-col">
          <div className="h-14 bg-gray-100 border-b flex justify-between items-center px-4 shrink-0 shadow-sm">
            <button type="button" onClick={() => closeFs(false)} className="text-gray-500 hover:text-red-600 p-2">
              <X size={24} />
            </button>
            <span className="font-semibold text-gray-700">Tanda Tangan Manual</span>
            <button
              type="button"
              onClick={() => closeFs(true)}
              className="px-4 py-1.5 bg-emerald-600 text-white rounded font-medium shadow-sm"
            >
              Simpan
            </button>
          </div>
          <div className="flex-1 relative bg-white" ref={fsWrapRef}>
            <canvas
              ref={fsCanvasRef}
              onPointerDown={fsPointerDown}
              onPointerMove={fsPointerMove}
              onPointerUp={fsEnd}
              onPointerCancel={fsEnd}
              onPointerLeave={fsEnd}
              className="absolute inset-0 w-full h-full cursor-crosshair touch-none"
              style={{ touchAction: "none" }}
            />
          </div>
          <div className="h-14 bg-gray-50 border-t flex justify-center items-center shrink-0">
            <button type="button" onClick={clearFs} className="text-red-600 text-sm font-medium">
              Hapus &amp; Ulangi
            </button>
          </div>
        </div>
      )}

      {editorOpen && editorImage && (
        <SignatureEditorModal
          imageDataUrl={editorImage}
          onSave={saveEdited}
          onClose={() => setEditorOpen(false)}
        />
      )}
      <CameraCapture
        open={sigCameraOpen}
        onClose={() => setSigCameraOpen(false)}
        onCapture={(f) => {
          setSigCameraOpen(false);
          onUploadFile(f);
        }}
        onGalleryFile={(f) => {
          setSigCameraOpen(false);
          onUploadFile(f);
        }}
      />
    </div>
  );
};

export default SignaturePad;
