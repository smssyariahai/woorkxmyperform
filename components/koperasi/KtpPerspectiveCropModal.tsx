// components/koperasi/KtpPerspectiveCropModal.tsx — port dari backup MyPerform
// (src/components/koperasi/KtpPerspectiveCropModal.tsx, 55 baris):
// pembungkus modal untuk PhotoPerspectiveEditor, dipakai ulang untuk foto
// KTP — geser 4 sudut + titik tengah sisi, zoom, putar, reset, lalu
// "Potong & Ekstrak". Bingkai header emerald polos khas form anggota.
'use client';

import React from 'react';
import { X } from 'lucide-react';
import { PhotoPerspectiveEditor } from './PhotoPerspectiveEditor';

interface KtpPerspectiveCropModalProps {
  open: boolean;
  imageDataUrl: string;
  onClose: () => void;
  // Foto hasil potong perspektif (JPEG) — pemanggil yang menyimpan/meneruskannya.
  onConfirm: (warpedDataUrl: string) => void;
}

export const KtpPerspectiveCropModal: React.FC<KtpPerspectiveCropModalProps> = ({
  open,
  imageDataUrl,
  onClose,
  onConfirm,
}) => {
  if (!open || !imageDataUrl) return null;

  return (
    <div className="fixed inset-0 z-[95] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full max-w-3xl h-full sm:h-auto sm:max-h-[92vh] flex flex-col overflow-hidden sm:rounded-2xl shadow-2xl">
        <div className="bg-emerald-600 text-white px-4 py-3 flex items-center justify-between gap-3 shrink-0">
          <h2 className="text-base sm:text-lg font-bold">Sesuaikan Foto KTP</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="shrink-0 p-1.5 rounded-full hover:bg-white/20"
          >
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 min-h-0 flex flex-col">
          <PhotoPerspectiveEditor
            initialImageBase64={imageDataUrl}
            onCancel={onClose}
            onConfirm={(warped) => {
              onConfirm(warped);
              onClose();
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default KtpPerspectiveCropModal;
