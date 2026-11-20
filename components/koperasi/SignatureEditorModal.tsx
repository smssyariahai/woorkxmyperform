// components/koperasi/SignatureEditorModal.tsx — port dari backup MyPerform
// (src/components/koperasi/SignatureEditorModal.tsx, 708 baris): editor foto
// tanda tangan — tahap Crop (cropperjs) lalu Edit & Sempurnakan (14 filter
// canvas). Satu penyederhanaan: Auto Tune AI backup memanggil endpoint yang
// tidak ada di kontrak API WOORK, jadi tombolnya memakai preset lokal
// FALLBACK_TUNE. Dipakai SignaturePad saat upload gambar tanda tangan.
'use client';

import React, { useEffect, useRef, useState } from "react";
import Cropper from "cropperjs";
import "cropperjs/dist/cropper.css";
import { X } from "lucide-react";

interface SignatureEditorModalProps {
  imageDataUrl: string;
  onSave: (pngDataUrl: string) => void;
  onClose: () => void;
}

// Editor foto tanda tangan — port penuh dari formulir referensi KSPPS
// (20261026_web_app_form_koperasi.html): tahap Crop (Cropper.js +
// geser/putar + slider putar + tombol ±90° + handle putar di sudut),
// lalu tahap Edit & Sempurnakan (14 filter termasuk Hapus BG,
// Scan Mode, Magic Clean, Threshold; zoom + geser canvas; Auto Tune AI).
// Satu pengaman performa: canvas tahap edit dibatasi 1600px sisi terpanjang
// supaya mesin filter (per piksel) tetap cepat untuk foto besar.
const FILTER_CONFIG = {
  scanMode: { i: "🖨️", n: "Scan Mode", min: 0, max: 100 },
  magic: { i: "🪄", n: "Magic Clean", min: 0, max: 100 },
  threshold: { i: "🔳", n: "Threshold", min: 0, max: 255 },
  transparent: { i: "🏁", n: "Hapus BG", min: 0, max: 255 },
  brightness: { i: "☀️", n: "Brightness", min: -100, max: 100 },
  exposure: { i: "📸", n: "Exposure", min: -100, max: 100 },
  contrast: { i: "🌓", n: "Contrast", min: -100, max: 100 },
  highlights: { i: "✨", n: "Highlights", min: -100, max: 100 },
  shadows: { i: "🌑", n: "Shadows", min: -100, max: 100 },
  saturation: { i: "🌈", n: "Saturation", min: -100, max: 100 },
  tint: { i: "🧪", n: "Tint", min: -100, max: 100 },
  temperature: { i: "🌡️", n: "Temperature", min: -100, max: 100 },
  sharpness: { i: "📐", n: "Sharpness", min: 0, max: 100 },
  definition: { i: "🔍", n: "Definition", min: 0, max: 100 },
} as const;
type FilterKey = keyof typeof FILTER_CONFIG;
const ADVANCED_KEYS: FilterKey[] = ["scanMode", "magic", "threshold", "transparent"];
const BASIC_KEYS: FilterKey[] = (Object.keys(FILTER_CONFIG) as FilterKey[]).filter(
  (k) => !ADVANCED_KEYS.includes(k)
);
const EMPTY_VALS = Object.fromEntries(
  (Object.keys(FILTER_CONFIG) as FilterKey[]).map((k) => [k, 0])
) as Record<FilterKey, number>;
// Preset referensi bila Auto Tune AI tidak tersedia (tanpa kunci Gemini).
const FALLBACK_TUNE: Partial<Record<FilterKey, number>> = {
  scanMode: 50,
  contrast: 25,
  saturation: -100,
  sharpness: 50,
  transparent: 10,
};
const MAX_ENHANCE_DIM = 1600;

const CHECKERBOARD: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(45deg, #ddd 25%, transparent 25%), linear-gradient(-45deg, #ddd 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ddd 75%), linear-gradient(-45deg, transparent 75%, #ddd 75%)",
  backgroundSize: "20px 20px",
  backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0px",
  backgroundColor: "#fdfdfd",
};

// Mesin filter referensi (per piksel, selalu mulai dari data asli).
function applyFilters(orig: ImageData, vals: Record<FilterKey, number>): ImageData {
  const v = (k: FilterKey) => vals[k] || 0;
  const isAllZero = (Object.keys(vals) as FilterKey[]).every((k) => vals[k] === 0);
  if (isAllZero) return new ImageData(new Uint8ClampedArray(orig.data), orig.width, orig.height);
  const imgData = new ImageData(new Uint8ClampedArray(orig.data), orig.width, orig.height);
  const data = imgData.data;

  let blurData: Uint8ClampedArray | null = null;
  if (v("magic") > 0 || v("scanMode") > 0) {
    const srcCanvas = document.createElement("canvas");
    srcCanvas.width = orig.width;
    srcCanvas.height = orig.height;
    srcCanvas.getContext("2d")!.putImageData(orig, 0, 0);
    const smallCanvas = document.createElement("canvas");
    smallCanvas.width = Math.max(1, Math.floor(orig.width / 20));
    smallCanvas.height = Math.max(1, Math.floor(orig.height / 20));
    smallCanvas.getContext("2d")!.drawImage(srcCanvas, 0, 0, smallCanvas.width, smallCanvas.height);
    const blurCanvas = document.createElement("canvas");
    blurCanvas.width = orig.width;
    blurCanvas.height = orig.height;
    const blurCtx = blurCanvas.getContext("2d")!;
    blurCtx.imageSmoothingEnabled = true;
    blurCtx.imageSmoothingQuality = "high";
    blurCtx.drawImage(smallCanvas, 0, 0, blurCanvas.width, blurCanvas.height);
    blurData = blurCtx.getImageData(0, 0, blurCanvas.width, blurCanvas.height).data;
  }

  const cont = (259 * (v("contrast") + 255)) / (255 * (259 - v("contrast")));
  const sat = (v("saturation") + 100) / 100;
  const exp = Math.pow(2, v("exposure") / 50);
  const bri = v("brightness");
  const hl = v("highlights") / 100;
  const sh = v("shadows") / 100;
  const temp = v("temperature");
  const tint = v("tint");

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    if (v("scanMode") > 0 && blurData) {
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      const bGray = 0.299 * blurData[i] + 0.587 * blurData[i + 1] + 0.114 * blurData[i + 2];
      const offset = 40 - (v("scanMode") / 100) * 38;
      if (gray < bGray - offset) {
        r = g = b = 0;
      } else {
        r = g = b = 255;
      }
    } else if (v("magic") > 0 && blurData) {
      const magicBlend = v("magic") / 100;
      const br = Math.max(blurData[i], 1);
      const bg = Math.max(blurData[i + 1], 1);
      const bb = Math.max(blurData[i + 2], 1);
      const cr = Math.min(255, (r / br) * 240);
      const cg = Math.min(255, (g / bg) * 240);
      const cb = Math.min(255, (b / bb) * 240);
      r = r * (1 - magicBlend) + cr * magicBlend;
      g = g * (1 - magicBlend) + cg * magicBlend;
      b = b * (1 - magicBlend) + cb * magicBlend;
    }

    if (v("threshold") > 0) {
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      if (gray < v("threshold")) {
        r = g = b = 0;
      } else {
        r = g = b = 255;
      }
    }

    r = r * exp + bri;
    g = g * exp + bri;
    b = b * exp + bri;
    r = cont * (r - 128) + 128;
    g = cont * (g - 128) + 128;
    b = cont * (b - 128) + 128;
    r += temp;
    b -= temp;
    g += tint;

    let lum = 0.299 * r + 0.587 * g + 0.114 * b;
    if (lum > 127) {
      const f = (lum - 127) / 128;
      r += hl * 128 * f;
      g += hl * 128 * f;
      b += hl * 128 * f;
    } else {
      const f = (127 - lum) / 127;
      r += sh * 128 * f;
      g += sh * 128 * f;
      b += sh * 128 * f;
    }

    lum = 0.299 * r + 0.587 * g + 0.114 * b;
    r = lum + sat * (r - lum);
    g = lum + sat * (g - lum);
    b = lum + sat * (b - lum);

    data[i] = r < 0 ? 0 : r > 255 ? 255 : r;
    data[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
    data[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b;

    if (v("transparent") > 0) {
      const lumFinal = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      if (lumFinal >= 255 - v("transparent")) {
        data[i + 3] = 0;
      }
    }
  }

  if (v("sharpness") > 0 || v("definition") > 0) {
    const str = (v("sharpness") + v("definition")) / 100;
    const center = 1 + 4 * str;
    const edge = -str;
    const kernel = [0, edge, 0, edge, center, edge, 0, edge, 0];
    const tData = new Uint8ClampedArray(data);
    const w = orig.width;
    const h = orig.height;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = (y * w + x) * 4;
        if (data[idx + 3] === 0) continue;
        let r = 0;
        let g = 0;
        let b = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const kIdx = ((y + ky) * w + (x + kx)) * 4;
            const wgt = kernel[(ky + 1) * 3 + (kx + 1)];
            r += tData[kIdx] * wgt;
            g += tData[kIdx + 1] * wgt;
            b += tData[kIdx + 2] * wgt;
          }
        }
        data[idx] = r < 0 ? 0 : r > 255 ? 255 : r;
        data[idx + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
        data[idx + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
      }
    }
  }
  return imgData;
}

export const SignatureEditorModal: React.FC<SignatureEditorModalProps> = ({
  imageDataUrl,
  onSave,
  onClose,
}) => {
  const [stage, setStage] = useState<"crop" | "enhance">("crop");
  const [cropMode, setCropMode] = useState<"move" | "rotate">("move");
  const [rotate, setRotate] = useState(0);
  const [vals, setVals] = useState<Record<FilterKey, number>>({ ...EMPTY_VALS });
  const [advOpen, setAdvOpen] = useState(true);
  const [basOpen, setBasOpen] = useState(true);
  const [openSliders, setOpenSliders] = useState<Partial<Record<FilterKey, boolean>>>({});
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [autoTuning, setAutoTuning] = useState(false);
  const [autoNote, setAutoNote] = useState("");

  const rootRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const cropperRef = useRef<Cropper | null>(null);
  const rotateCleanupRef = useRef<(() => void) | null>(null);
  const enhanceCanvasRef = useRef<HTMLCanvasElement>(null);
  const enhanceWrapRef = useRef<HTMLDivElement>(null);
  const originalRef = useRef<ImageData | null>(null);
  const panRef = useRef({ dragging: false, startX: 0, startY: 0 });
  const stageRef = useRef(stage);
  stageRef.current = stage;

  const destroyCropper = () => {
    rotateCleanupRef.current?.();
    rotateCleanupRef.current = null;
    cropperRef.current?.destroy();
    cropperRef.current = null;
  };

  const handleClose = () => {
    destroyCropper();
    onClose();
  };

  // Handle putar di 4 sudut crop box (port addRotationHandle referensi).
  const addRotationHandles = (cropper: Cropper) => {
    const root = rootRef.current;
    if (!root) return;
    const cropBox = root.querySelector(".cropper-crop-box") as HTMLElement | null;
    if (!cropBox) return;
    cropBox.querySelectorAll(".custom-rotate-handle").forEach((el) => el.remove());

    let isRotating = false;
    let startAngle = 0;
    let baseRot = 0;
    let cx = 0;
    let cy = 0;

    const start = (e: MouseEvent | TouchEvent) => {
      if ((e as MouseEvent).button !== undefined && (e as MouseEvent).button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      isRotating = true;
      const rect = cropBox.getBoundingClientRect();
      cx = rect.left + rect.width / 2;
      cy = rect.top + rect.height / 2;
      const clientX = (e as TouchEvent).touches ? (e as TouchEvent).touches[0].clientX : (e as MouseEvent).clientX;
      const clientY = (e as TouchEvent).touches ? (e as TouchEvent).touches[0].clientY : (e as MouseEvent).clientY;
      startAngle = (Math.atan2(clientY - cy, clientX - cx) * 180) / Math.PI;
      baseRot = 0;
      setRotate((cur) => {
        baseRot = cur;
        return cur;
      });
    };
    const move = (e: MouseEvent | TouchEvent) => {
      if (!isRotating) return;
      e.preventDefault();
      const clientX = (e as TouchEvent).touches ? (e as TouchEvent).touches[0].clientX : (e as MouseEvent).clientX;
      const clientY = (e as TouchEvent).touches ? (e as TouchEvent).touches[0].clientY : (e as MouseEvent).clientY;
      const angle = (Math.atan2(clientY - cy, clientX - cx) * 180) / Math.PI;
      let newRot = baseRot + (angle - startAngle);
      if (newRot > 180) newRot -= 360;
      if (newRot < -180) newRot += 360;
      cropper.rotateTo(newRot);
      setRotate(newRot);
    };
    const stop = () => {
      isRotating = false;
    };

    const handles: HTMLElement[] = [];
    (["tl", "tr", "bl", "br"] as const).forEach((corner) => {
      const handle = document.createElement("div");
      handle.className = `custom-rotate-handle rotate-handle-${corner}`;
      handle.innerHTML = "↻";
      cropBox.appendChild(handle);
      handles.push(handle);
      handle.addEventListener("pointerdown", (e) => e.stopPropagation());
      handle.addEventListener("mousedown", start as EventListener);
      handle.addEventListener("touchstart", start as EventListener, { passive: false });
    });
    window.addEventListener("mousemove", move as EventListener);
    window.addEventListener("touchmove", move as EventListener, { passive: false });
    window.addEventListener("mouseup", stop);
    window.addEventListener("touchend", stop);
    rotateCleanupRef.current = () => {
      handles.forEach((h) => h.remove());
      window.removeEventListener("mousemove", move as EventListener);
      window.removeEventListener("touchmove", move as EventListener);
      window.removeEventListener("mouseup", stop);
      window.removeEventListener("touchend", stop);
    };
  };

  const initCropper = () => {
    const img = imgRef.current;
    if (!img || cropperRef.current) return;
    const cropper = new Cropper(img, {
      viewMode: 1,
      dragMode: "move",
      autoCropArea: 0.8,
      restore: false,
      guides: true,
      center: true,
      highlight: false,
      cropBoxMovable: true,
      cropBoxResizable: true,
      toggleDragModeOnDblclick: false,
      ready: () => {
        addRotationHandles(cropper);
        setRotate(0);
      },
    });
    cropperRef.current = cropper;
    setCropMode("move");
  };

  useEffect(() => {
    if (imgRef.current?.complete && imgRef.current?.naturalWidth) initCropper();
    return () => destroyCropper();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rotateTo = (deg: number) => {
    const clamped = Math.max(-180, Math.min(180, deg));
    cropperRef.current?.rotateTo(clamped);
    setRotate(clamped);
  };

  const setCanvasMode = (mode: "move" | "rotate") => {
    setCropMode(mode);
    cropperRef.current?.setDragMode(mode === "move" ? "move" : "none");
  };

  const goToEnhance = () => {
    const cropper = cropperRef.current;
    if (!cropper) return;
    const cropped = cropper.getCroppedCanvas();
    if (!cropped) return;
    let srcW = cropped.width;
    let srcH = cropped.height;
    let srcCanvas: HTMLCanvasElement = cropped;
    const longest = Math.max(srcW, srcH);
    if (longest > MAX_ENHANCE_DIM) {
      const ratio = MAX_ENHANCE_DIM / longest;
      srcW = Math.round(srcW * ratio);
      srcH = Math.round(srcH * ratio);
      const tmp = document.createElement("canvas");
      tmp.width = srcW;
      tmp.height = srcH;
      tmp.getContext("2d")!.drawImage(cropped, 0, 0, srcW, srcH);
      srcCanvas = tmp;
    }
    const canvas = enhanceCanvasRef.current;
    if (!canvas) return;
    canvas.width = srcW;
    canvas.height = srcH;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, srcW, srcH);
    ctx.drawImage(srcCanvas, 0, 0);
    originalRef.current = ctx.getImageData(0, 0, srcW, srcH);
    setVals({ ...EMPTY_VALS });
    setScale(1);
    setPan({ x: 0, y: 0 });
    setAutoNote("");
    setStage("enhance");
  };

  const goBackToCrop = () => setStage("crop");

  // Terapkan filter setiap kali nilai berubah (tahap enhance).
  useEffect(() => {
    if (stage !== "enhance") return;
    const canvas = enhanceCanvasRef.current;
    const orig = originalRef.current;
    if (!canvas || !orig) return;
    const ctx = canvas.getContext("2d")!;
    ctx.putImageData(applyFilters(orig, vals), 0, 0);
  }, [vals, stage]);

  // Zoom roda mouse di area canvas enhance (non-pasif supaya bisa dicegah).
  useEffect(() => {
    const wrap = enhanceWrapRef.current;
    if (!wrap) return;
    const onWheel = (e: WheelEvent) => {
      if (stageRef.current !== "enhance") return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setScale((s) => Math.max(0.1, Math.min(3, Math.round((s + delta) * 10) / 10)));
    };
    wrap.addEventListener("wheel", onWheel, { passive: false });
    return () => wrap.removeEventListener("wheel", onWheel);
  }, []);

  const onPanDown = (e: React.PointerEvent) => {
    panRef.current = { dragging: true, startX: e.clientX - pan.x, startY: e.clientY - pan.y };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPanMove = (e: React.PointerEvent) => {
    if (!panRef.current.dragging) return;
    setPan({ x: e.clientX - panRef.current.startX, y: e.clientY - panRef.current.startY });
  };
  const onPanUp = () => {
    panRef.current.dragging = false;
  };

  const updateFilter = (key: FilterKey, val: number) => {
    const conf = FILTER_CONFIG[key];
    const clamped = Math.max(conf.min, Math.min(conf.max, val));
    setVals((prev) => ({ ...prev, [key]: clamped }));
  };
  const resetFilter = (key: FilterKey) => updateFilter(key, 0);
  const resetAllFilters = () => setVals({ ...EMPTY_VALS });

  const autoTune = async () => {
    const orig = originalRef.current;
    const canvas = enhanceCanvasRef.current;
    if (!orig || !canvas) return;
    setAutoTuning(true);
    setAutoNote("");
    // WOORK: endpoint Auto Tune AI backup tidak ada di kontrak API
    // Gelombang 5 — langsung pakai preset pembersih dokumen lokal.
    setVals((prev) => ({ ...prev, ...FALLBACK_TUNE }));
    setAutoNote("Auto Tune AI belum tersedia — diterapkan preset pembersih dokumen.");
    setAutoTuning(false);
  };

  const saveToForm = () => {
    const canvas = enhanceCanvasRef.current;
    if (!canvas) return;
    onSave(canvas.toDataURL("image/png"));
  };

  const renderFilterGroup = (title: string, keys: FilterKey[], open: boolean, setOpen: (o: boolean) => void) => (
    <div className="mb-3 shrink-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex justify-between items-center bg-emerald-100 p-2 rounded-t-lg focus:outline-none"
      >
        <span className="font-bold text-emerald-800 text-sm">{title}</span>
        <span className={`text-emerald-800 transform transition-transform duration-200 ${open ? "rotate-180" : ""}`}>▼</span>
      </button>
      <div className={`flex flex-col gap-1 bg-white border border-emerald-100 border-t-0 rounded-b-lg p-2 ${open ? "" : "hidden"}`}>
        {keys.map((key) => {
          const conf = FILTER_CONFIG[key];
          const val = vals[key];
          const sliderOpen = !!openSliders[key];
          return (
            <div key={key} className="border border-gray-200 rounded-lg w-full bg-gray-50 mb-2 overflow-hidden shrink-0">
              <div className="flex items-center justify-between w-full p-2 bg-white hover:bg-gray-50">
                <div
                  className="flex items-center gap-2 flex-1 cursor-pointer select-none relative"
                  onClick={() => setOpenSliders((prev) => ({ ...prev, [key]: !prev[key] }))}
                >
                  <span className="text-sm font-medium text-gray-700">{conf.n}</span>
                  <span className={`bg-emerald-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full ml-1 ${val === 0 ? "hidden" : ""}`}>
                    {val > 0 ? `+${val}` : val}
                  </span>
                </div>
                <button
                  type="button"
                  title={`Reset ${conf.n}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    resetFilter(key);
                  }}
                  className="p-1 hover:bg-gray-200 rounded text-base cursor-pointer text-gray-500"
                >
                  {conf.i}
                </button>
              </div>
              <div className={`p-3 w-full border-t border-gray-200 ${sliderOpen ? "" : "hidden"}`}>
                <input
                  type="range"
                  min={conf.min}
                  max={conf.max}
                  value={val}
                  onChange={(e) => updateFilter(key, parseInt(e.target.value, 10))}
                  onWheel={(e) => {
                    const step = Math.max(1, Math.round((conf.max - conf.min) / 20));
                    updateFilter(key, val + (e.deltaY < 0 ? step : -step));
                  }}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-gray-400 mt-2">
                  <span>{conf.min}</span>
                  <span>0</span>
                  <span>{conf.max}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div ref={rootRef} className="fixed inset-0 bg-white z-[100] flex flex-col">
      <style>{`
        .cropper-point { background-color: white !important; opacity: 1 !important; box-shadow: 0 1px 4px rgba(0,0,0,0.4); }
        .cropper-point.point-nw, .cropper-point.point-ne, .cropper-point.point-sw, .cropper-point.point-se { width: 14px !important; height: 14px !important; border-radius: 50% !important; }
        .cropper-point.point-nw { top: -7px !important; left: -7px !important; }
        .cropper-point.point-ne { top: -7px !important; right: -7px !important; }
        .cropper-point.point-sw { bottom: -7px !important; left: -7px !important; }
        .cropper-point.point-se { bottom: -7px !important; right: -7px !important; }
        .cropper-point.point-n, .cropper-point.point-s { width: 24px !important; height: 6px !important; border-radius: 4px !important; margin-left: -12px !important; left: 50% !important; }
        .cropper-point.point-n { top: -3px !important; }
        .cropper-point.point-s { bottom: -3px !important; }
        .cropper-point.point-e, .cropper-point.point-w { width: 6px !important; height: 24px !important; border-radius: 4px !important; margin-top: -12px !important; top: 50% !important; }
        .cropper-point.point-e { right: -3px !important; }
        .cropper-point.point-w { left: -3px !important; }
        .cropper-view-box { outline: 2px solid white !important; }
        .cropper-dashed, .cropper-center { display: none !important; }
        .cropper-crop-box { overflow: visible !important; }
        /* Tombol putar di LUAR sudut (diagonal), sesuai foto contoh user:
           titik resize sudut tetap terlihat & bisa dipakai, tombol putar
           tidak lagi menutupi titik sudut seperti sebelumnya. */
        .custom-rotate-handle { position: absolute; z-index: 10; width: 28px; height: 28px; background-color: white; color: black; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 16px; cursor: grab; box-shadow: 0 1px 4px rgba(0,0,0,0.4); touch-action: none; }
        .custom-rotate-handle:active { cursor: grabbing; }
        .rotate-handle-tl { top: 0; left: 0; transform: translate(-160%, -160%); }
        .rotate-handle-tr { top: 0; right: 0; transform: translate(160%, -160%); }
        .rotate-handle-bl { bottom: 0; left: 0; transform: translate(-160%, 160%); }
        .rotate-handle-br { bottom: 0; right: 0; transform: translate(160%, 160%); }
        .hide-scrollbar { scrollbar-width: none; }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
      `}</style>

      <div className="h-14 bg-gray-100 border-b flex justify-between items-center px-4 shrink-0 shadow-sm">
        <div className="flex items-center gap-2">
          <button type="button" onClick={handleClose} className="text-gray-500 hover:text-red-600 p-2" title="Batal">
            <X size={24} />
          </button>
          <button
            type="button"
            onClick={goBackToCrop}
            className={`text-xs px-3 py-1.5 bg-gray-200 text-gray-700 rounded font-medium hover:bg-gray-300 ${stage === "enhance" ? "" : "hidden"}`}
          >
            Kembali
          </button>
        </div>
        <span className="font-semibold text-gray-700">{stage === "crop" ? "Crop Gambar" : "Edit & Sempurnakan"}</span>
        <button
          type="button"
          onClick={() => (stage === "crop" ? goToEnhance() : saveToForm())}
          className="px-4 py-1.5 bg-emerald-600 text-white rounded font-medium shadow-sm"
        >
          {stage === "crop" ? "Lanjut" : "Simpan ke Form"}
        </button>
      </div>

      {/* Tahap Crop */}
      <div className={`flex-1 relative bg-gray-900 flex items-center justify-center overflow-hidden ${stage === "crop" ? "" : "hidden"}`}>
        <img ref={imgRef} src={imageDataUrl} onLoad={initCropper} className="max-w-full max-h-full block" alt="Foto tanda tangan untuk diedit" />
        <div className="absolute bottom-6 z-10 flex flex-col items-center gap-2 bg-black/60 px-5 py-3 rounded-xl shadow-lg w-80">
          <div className="flex w-full justify-between items-center mb-1">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCanvasMode("move")}
                className={`px-3 py-1 rounded text-xs font-bold transition-colors ${cropMode === "move" ? "text-white bg-emerald-600" : "text-gray-300 bg-gray-700 hover:bg-gray-600"}`}
              >
                🖐️ Geser
              </button>
              <button
                type="button"
                onClick={() => setCanvasMode("rotate")}
                className={`px-3 py-1 rounded text-xs font-bold transition-colors ${cropMode === "rotate" ? "text-white bg-emerald-600" : "text-gray-300 bg-gray-700 hover:bg-gray-600"}`}
              >
                🔄 Putar
              </button>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => rotateTo(rotate - 90)} className="text-white hover:text-emerald-400 text-lg font-bold px-2" title="Putar Kiri">
                ↺
              </button>
              <button type="button" onClick={() => rotateTo(rotate + 90)} className="text-white hover:text-emerald-400 text-lg font-bold px-2" title="Putar Kanan">
                ↻
              </button>
            </div>
          </div>
          <div className="w-full flex items-center gap-2">
            <span className="text-white text-xs">-180°</span>
            <input
              type="range"
              min={-180}
              max={180}
              value={rotate}
              onChange={(e) => rotateTo(parseInt(e.target.value, 10))}
              className="w-full h-1 bg-gray-300 rounded-lg appearance-none cursor-pointer"
            />
            <span className="text-white text-xs">180°</span>
          </div>
        </div>
      </div>

      {/* Tahap Edit & Sempurnakan */}
      <div className={`flex-1 flex-col md:flex-row bg-gray-100 overflow-hidden ${stage === "enhance" ? "flex" : "hidden"}`}>
        <div
          ref={enhanceWrapRef}
          onPointerDown={onPanDown}
          onPointerMove={onPanMove}
          onPointerUp={onPanUp}
          onPointerCancel={onPanUp}
          onPointerLeave={onPanUp}
          className="flex-1 overflow-hidden relative flex items-center justify-center cursor-grab active:cursor-grabbing w-full h-full"
          style={CHECKERBOARD}
        >
          <canvas
            ref={enhanceCanvasRef}
            className="shadow border border-gray-300 origin-center"
            style={{ touchAction: "none", transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})` }}
          />
          <div className="absolute bottom-4 left-4 z-20 flex flex-col items-center bg-white/90 p-2 rounded-lg shadow-md backdrop-blur-sm border border-gray-200">
            <span className="text-[10px] font-bold text-gray-700 mb-2">{Math.round(scale * 100)}%</span>
            <input
              type="range"
              min={0.1}
              max={3}
              step={0.1}
              value={scale}
              onChange={(e) => setScale(parseFloat(e.target.value))}
              className="cursor-pointer"
            />
            <span className="text-sm mt-2">🔍</span>
          </div>
        </div>

        <div className="p-4 bg-white border-t md:border-t-0 md:border-l border-gray-200 shrink-0 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] md:shadow-[-4px_0_6px_-1px_rgba(0,0,0,0.05)] z-10 w-full md:w-72 h-1/2 md:h-full flex flex-col md:max-h-full">
          <div className="w-full flex-1 flex flex-col min-h-0">
            <button
              type="button"
              disabled={autoTuning}
              onClick={autoTune}
              className="mb-3 w-full py-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2 shadow-sm transition-all shrink-0 disabled:opacity-50"
            >
              <span>✨</span> <span>{autoTuning ? "Menganalisis..." : "Auto Tune AI"}</span>
            </button>
            {autoNote && <p className="mb-3 text-xs text-gray-600 shrink-0">{autoNote}</p>}
            <div className="w-full flex flex-col overflow-y-auto gap-1 pb-4 pr-1 hide-scrollbar flex-1">
              <button
                type="button"
                onClick={resetAllFilters}
                className="mb-3 w-full py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-sm font-semibold transition-all shrink-0 flex items-center justify-center gap-2"
              >
                <span>🔄</span> Reset All
              </button>
              {renderFilterGroup("Advanced", ADVANCED_KEYS, advOpen, setAdvOpen)}
              {renderFilterGroup("Basic", BASIC_KEYS, basOpen, setBasOpen)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SignatureEditorModal;
