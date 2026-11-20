// components/koperasi/ImagePicker.tsx — port dari backup MyPerform
// (src/components/koperasi/ImagePicker.tsx, 156 baris): pilih foto dari
// galeri (klik dropzone / seret & lepas) ATAU langsung dari kamera
// (CameraCapture). Foto selalu diperkecil (maks 1280px, JPEG) sebelum
// disimpan. Bila perspectiveCrop, tampil tombol "Sesuaikan" (potong
// perspektif ala modul gadai) — dipakai khusus foto KTP.
'use client';

import React, { useRef, useState } from 'react';
import { Camera, Crop, Image as ImageIcon, RotateCw, X } from 'lucide-react';
import { downscaleFileToJpeg, rotateImageDataUrl } from '@/lib/koperasi/imageUtils';
import { Dropzone } from './Dropzone';
import { CameraCapture } from './CameraCapture';
import { KtpPerspectiveCropModal } from './KtpPerspectiveCropModal';

interface ImagePickerProps {
  label: string;
  value: string;
  onChange: (dataUrl: string) => void;
  hint?: string;
  // Kata benda untuk teks dropzone, mis. "foto KTP" / "foto diri".
  dropNoun?: string;
  // Bila true, tampil tombol "Sesuaikan" (potong perspektif ala modul gadai).
  // Dipakai khusus foto KTP.
  perspectiveCrop?: boolean;
}

export const ImagePicker: React.FC<ImagePickerProps> = ({
  label,
  value,
  onChange,
  hint,
  dropNoun = 'foto',
  perspectiveCrop = false,
}) => {
  const [busy, setBusy] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cropOpen, setCropOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      onChange(await downscaleFileToJpeg(file));
    } catch (err: any) {
      alert(err?.message || 'Foto tidak bisa diproses.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <span className="block text-xs sm:text-sm font-semibold text-slate-700 mb-1.5">{label}</span>
      {hint && <p className="text-[11px] text-slate-500 mb-1.5">{hint}</p>}
      {value ? (
        <div className="relative">
          <img src={value} alt={label} className="w-full max-h-56 object-contain rounded-xl border border-slate-200 bg-slate-50" />
          <button
            type="button"
            onClick={() => onChange('')}
            aria-label="Hapus foto"
            className="absolute top-2 right-2 p-1.5 rounded-full bg-white border border-slate-200 text-slate-500 hover:text-red-600 shadow-sm"
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <Dropzone
          mainText={`Atau seret dan lepas ${dropNoun} di sini`}
          onFile={(f) => onFile(f)}
          disabled={busy}
        />
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            onFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        {value && (
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <ImageIcon size={14} /> Ganti dari Galeri
          </button>
        )}
        {value && (
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                onChange(await rotateImageDataUrl(value));
              } catch (err: any) {
                alert(err?.message || 'Foto tidak bisa diputar.');
              } finally {
                setBusy(false);
              }
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RotateCw size={14} /> Putar 90°
          </button>
        )}
        {value && perspectiveCrop && (
          <button
            type="button"
            disabled={busy}
            onClick={() => setCropOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-300 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
          >
            <Crop size={14} /> Sesuaikan
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => setCameraOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          <Camera size={14} /> {value ? 'Foto Ulang dengan Kamera' : 'Foto dengan Kamera'}
        </button>
      </div>
      <CameraCapture
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(f) => {
          setCameraOpen(false);
          onFile(f);
        }}
        onGalleryFile={(f) => {
          setCameraOpen(false);
          onFile(f);
        }}
      />
      <KtpPerspectiveCropModal
        open={cropOpen}
        imageDataUrl={value}
        onClose={() => setCropOpen(false)}
        onConfirm={(warped) => {
          setCropOpen(false);
          onChange(warped);
        }}
      />
    </div>
  );
};

export default ImagePicker;
