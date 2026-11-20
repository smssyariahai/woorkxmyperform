// components/koperasi/CameraCapture.tsx — port dari backup MyPerform
// (src/components/koperasi/CameraCapture.tsx, 436 baris): kamera di dalam
// aplikasi (getUserMedia) ala aplikasi kamera Android — flash, strip galeri
// sesi, tombol capture bulat, ganti kamera, pratinjau putar/ambil ulang/
// sesuaikan (crop perspektif). Batas web: strip hanya menampilkan foto
// yang dijepret di sesi ini; galeri lengkap lewat tombol Galeri.
'use client';

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Crop, Image as ImageIcon, RefreshCcw, RotateCcw, RotateCw, SwitchCamera, X, Zap, ZapOff } from "lucide-react";
import { KtpPerspectiveCropModal } from "./KtpPerspectiveCropModal";

interface SessionShot {
  thumb: string;
  full: string;
}

interface CameraCaptureProps {
  open: boolean;
  onClose: () => void;
  // Foto hasil jepret (sudah di-rotate sesuai pratinjau) sebagai File JPEG.
  onCapture: (file: File) => void;
  // Foto yang dipilih lewat tombol/petak Galeri di dalam modal kamera.
  onGalleryFile: (file: File) => void;
}

// Kamera di dalam aplikasi yang meniru aplikasi kamera bawaan Android:
// X kiri atas, flash kanan atas, strip galeri di atas bar kontrol, tombol
// Galeri (kiri), tombol bulat capture (tengah), ganti kamera (kanan), lalu
// halaman pratinjau dengan Putar / Ambil Ulang / OK.
//
// BATAS WEB (jujur): browser tidak boleh membaca isi galeri perangkat, jadi
// strip TIDAK bisa menampilkan foto-foto galeri asli. Strip menampilkan foto
// yang baru dijepret di sesi ini; galeri lengkap dibuka lewat tombol Galeri
// (pemilih galeri bawaan HP). Flash (torch) hanya jalan di sebagian perangkat
// Android + kamera belakang; bila tidak didukung, tombol memberi keterangan.
export const CameraCapture: React.FC<CameraCaptureProps> = ({
  open,
  onClose,
  onCapture,
  onGalleryFile,
}) => {
  const [stage, setStage] = useState<"camera" | "preview" | "error">("camera");
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [shots, setShots] = useState<SessionShot[]>([]);
  const [rotation, setRotation] = useState(0);
  const [cropOpen, setCropOpen] = useState(false);
  const [cropImage, setCropImage] = useState("");

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const capturedImgRef = useRef<HTMLImageElement | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(""), 3000);
  };

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setTorchSupported(false);
  }, []);

  const startCamera = useCallback(
    async (mode: "environment" | "user") => {
      setError("");
      setStage("camera");
      stopStream();
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: mode,
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => {});
        }
        const track = stream.getVideoTracks()[0];
        const caps = (track as any)?.getCapabilities?.() as { torch?: boolean } | undefined;
        setTorchSupported(!!caps?.torch);
        setTorchOn(false);
      } catch (err: any) {
        setError(
          err?.name === "NotAllowedError"
            ? "Izin kamera ditolak. Izinkan akses kamera di browser, atau pilih dari galeri."
            : "Kamera tidak bisa dibuka di perangkat ini. Silakan pilih dari galeri."
        );
        setStage("error");
      }
    },
    [stopStream]
  );

  useEffect(() => {
    if (!open) return;
    setStage("camera");
    setRotation(0);
    startCamera(facing);
    return () => stopStream();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open ]);

  // Gambar ulang pratinjau begitu stage pratinjau tampil (canvas baru ada
  // setelah render, jadi menggambar di sini lebih aman daripada menebak timing).
  useEffect(() => {
    if (stage === "preview" && capturedImgRef.current) {
      drawPreview(capturedImgRef.current, rotation);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  const drawPreview = (img: HTMLImageElement, rot: number) => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const swap = rot % 180 !== 0;
    canvas.width = swap ? img.height : img.width;
    canvas.height = swap ? img.width : img.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rot * Math.PI) / 180);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    ctx.restore();
  };

  const capture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Frame video mentah (tanpa mirror CSS) yang disimpan — seperti kamera bawaan.
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const full = canvas.toDataURL("image/jpeg", 0.92);
    // Thumbnail kecil untuk strip sesi.
    const thumbCanvas = document.createElement("canvas");
    const scale = Math.min(1, 160 / Math.max(canvas.width, canvas.height));
    thumbCanvas.width = Math.max(1, Math.round(canvas.width * scale));
    thumbCanvas.height = Math.max(1, Math.round(canvas.height * scale));
    thumbCanvas.getContext("2d")?.drawImage(canvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
    const thumb = thumbCanvas.toDataURL("image/jpeg", 0.8);
    setShots((s) => [{ thumb, full }, ...s]);
    const img = new Image();
    img.onload = () => {
      capturedImgRef.current = img;
      setRotation(0);
      // Kamera dimatikan saat pratinjau (hemat baterai); dinyalakan lagi saat Ambil Ulang.
      stopStream();
      setStage("preview");
      // Canvas pratinjau dirender setelah pindah stage.
      requestAnimationFrame(() => drawPreview(img, 0));
    };
    img.src = full;
  };

  const rotatePreview = (dir: 1 | -1) => {
    const img = capturedImgRef.current;
    if (!img) return;
    const next = (rotation + dir * 90 + 360) % 360;
    setRotation(next);
    drawPreview(img, next);
  };

  const retake = () => {
    setRotation(0);
    startCamera(facing);
  };

  const confirmPhoto = () => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        onCapture(new File([blob], "foto-kamera.jpg", { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.92
    );
  };

  const openCrop = () => {
    const dataUrl = previewCanvasRef.current?.toDataURL("image/jpeg", 0.92);
    if (!dataUrl) return;
    setCropImage(dataUrl);
    setCropOpen(true);
  };

  // Hasil potong perspektif menggantikan foto pratinjau (putaran di-nol-kan,
  // karena hasil crop sudah tegak); tombol OK kemudian menyimpan hasil ini.
  const confirmCrop = (warped: string) => {
    const img = new Image();
    img.onload = () => {
      capturedImgRef.current = img;
      setRotation(0);
      drawPreview(img, 0);
    };
    img.src = warped;
  };

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || !torchSupported) {
      showToast("Flash tidak tersedia di perangkat ini.");
      return;
    }
    try {
      await (track as any).applyConstraints({ advanced: [{ torch: !torchOn }] });
      setTorchOn(!torchOn);
    } catch {
      showToast("Flash tidak bisa dinyalakan di perangkat ini.");
    }
  };

  const switchCamera = () => {
    const next = facing === "environment" ? "user" : "environment";
    setFacing(next);
    setTorchOn(false);
    startCamera(next);
  };

  const openShotPreview = (shot: SessionShot) => {
    const img = new Image();
    img.onload = () => {
      capturedImgRef.current = img;
      setRotation(0);
      stopStream();
      setStage("preview");
      requestAnimationFrame(() => drawPreview(img, 0));
    };
    img.src = shot.full;
  };

  if (!open) return null;

  return (
    <>
    <div className="fixed inset-0 z-[80] bg-black flex flex-col">
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) onGalleryFile(f);
        }}
      />

      {stage === "error" ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6 text-center">
          <p className="text-white text-sm leading-relaxed">{error}</p>
          <button
            type="button"
            onClick={() => galleryInputRef.current?.click()}
            className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold"
          >
            Pilih dari Galeri
          </button>
          <button type="button" onClick={onClose} className="text-white/70 text-sm underline">
            Tutup
          </button>
        </div>
      ) : stage === "preview" ? (
        <>
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup"
              className="w-10 h-10 rounded-full bg-white/15 text-white flex items-center justify-center"
            >
              <X size={22} />
            </button>
            <span className="text-white text-sm font-medium">Pratinjau Foto</span>
            <span className="w-10" />
          </div>
          <div className="flex-1 min-h-0 flex items-center justify-center p-4">
            <canvas
              ref={previewCanvasRef}
              className="max-w-full max-h-full rounded-lg"
              style={{ width: "auto", height: "auto" }}
            />
          </div>
          <div className="bg-black/50 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => rotatePreview(-1)}
                className="flex-1 flex flex-col items-center gap-1 text-white text-[11px] font-medium px-1 py-2"
              >
                <RotateCcw size={22} /> Putar Kiri
              </button>
              <button
                type="button"
                onClick={() => rotatePreview(1)}
                className="flex-1 flex flex-col items-center gap-1 text-white text-[11px] font-medium px-1 py-2"
              >
                <RotateCw size={22} /> Putar Kanan
              </button>
              <button
                type="button"
                onClick={openCrop}
                className="flex-1 flex flex-col items-center gap-1 text-white text-[11px] font-medium px-1 py-2"
              >
                <Crop size={22} /> Sesuaikan
              </button>
              <button
                type="button"
                onClick={retake}
                className="flex-1 flex flex-col items-center gap-1 text-white text-[11px] font-medium px-1 py-2"
              >
                <RefreshCcw size={22} /> Ambil Ulang
              </button>
            </div>
            <button
              type="button"
              onClick={confirmPhoto}
              className="w-full py-3 rounded-xl bg-emerald-600 text-white text-sm font-bold shadow"
            >
              OK
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="flex-1 relative min-h-0 bg-black overflow-hidden">
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className="absolute inset-0 w-full h-full object-cover"
              style={{ transform: facing === "user" ? "scaleX(-1)" : "none" }}
            />
            <div className="absolute top-0 inset-x-0 z-10 flex items-center justify-between p-4 pt-[max(1rem,env(safe-area-inset-top))]">
              <button
                type="button"
                onClick={onClose}
                aria-label="Tutup kamera"
                className="w-10 h-10 rounded-full bg-black/50 text-white flex items-center justify-center"
              >
                <X size={22} />
              </button>
              <button
                type="button"
                onClick={toggleTorch}
                aria-label="Flash"
                className="w-10 h-10 rounded-full bg-black/50 text-white flex items-center justify-center"
              >
                {torchOn ? <Zap size={20} className="text-yellow-300" /> : <ZapOff size={20} />}
              </button>
            </div>
            {toast && (
              <div className="absolute top-16 inset-x-0 z-10 flex justify-center pointer-events-none">
                <span className="bg-white/90 text-black text-xs font-medium px-3 py-1.5 rounded-full shadow">
                  {toast}
                </span>
              </div>
            )}
          </div>

          <div className="bg-black/60 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div className="flex justify-center pb-2">
              <span className="w-10 h-1 rounded-full bg-white/40" />
            </div>
            <div className="flex gap-2 overflow-x-auto px-4 pb-2">
              <button
                type="button"
                onClick={() => galleryInputRef.current?.click()}
                className="shrink-0 w-16 h-16 rounded-lg bg-white/15 border border-white/25 flex flex-col items-center justify-center gap-1 text-white"
              >
                <ImageIcon size={20} />
                <span className="text-[10px] font-medium">Galeri</span>
              </button>
              {shots.map((s, i) => (
                <button key={i} type="button" onClick={() => openShotPreview(s)} className="shrink-0">
                  <img src={s.thumb} alt="" className="w-16 h-16 rounded-lg object-cover border-2 border-white/50" />
                </button>
              ))}
            </div>
            <div className="flex justify-center pb-1">
              <span className="bg-white/15 text-white text-xs font-medium px-4 py-1 rounded-full">Foto</span>
            </div>
            <div className="flex items-center justify-between px-8 py-2">
              <button
                type="button"
                onClick={() => galleryInputRef.current?.click()}
                aria-label="Buka galeri"
                className="w-12 h-12 rounded-full bg-white/20 text-white flex items-center justify-center"
              >
                <ImageIcon size={22} />
              </button>
              <button
                type="button"
                onClick={capture}
                aria-label="Ambil foto"
                className="w-20 h-20 rounded-full border-4 border-white bg-white/25 flex items-center justify-center active:scale-95 transition"
              >
                <span className="w-14 h-14 rounded-full bg-white" />
              </button>
              <button
                type="button"
                onClick={switchCamera}
                aria-label="Ganti kamera"
                className="w-12 h-12 rounded-full bg-white/20 text-white flex items-center justify-center"
              >
                <SwitchCamera size={22} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
      <KtpPerspectiveCropModal
        open={cropOpen}
        imageDataUrl={cropImage}
        onClose={() => setCropOpen(false)}
        onConfirm={confirmCrop}
      />
    </>
  );
};

export default CameraCapture;
