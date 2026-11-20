'use client';

import { useState } from 'react';

interface CompassCalibrationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CompassCalibrationModal: React.FC<CompassCalibrationModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [dontShowAgain, setDontShowAgain] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (dontShowAgain) {
      try {
        localStorage.setItem('hide_qibla_calibration_modal', 'true');
      } catch (e) {
        console.error(e);
      }
    }
    onClose();
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/65 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={handleConfirm}
    >
      <div 
        className="bg-white rounded-3xl w-full max-w-[340px] sm:max-w-[370px] shadow-2xl border border-slate-100 overflow-hidden flex flex-col p-5 sm:p-6 cursor-default relative animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Text */}
        <div className="text-left mb-2">
          <h3 className="font-extrabold text-slate-900 text-lg sm:text-xl tracking-tight">
            Kalibrasi Kompas Anda
          </h3>
          <p className="text-xs sm:text-sm text-slate-600 mt-1 leading-relaxed">
            Lakukan gerakan 3 kali, seperti gambar berikut:
          </p>
        </div>

        {/* Animation Container with User Uploaded GIF */}
        <div className="my-3 w-full flex items-center justify-center select-none overflow-hidden rounded-2xl bg-white">
          <img
            src="/images/kalibrasi_kompas%201x.gif"
            alt="Animasi Kalibrasi Kompas Angka 8"
            className="w-full h-auto max-h-[235px] sm:max-h-[255px] object-contain scale-y-[1.03] origin-center"
            style={{ clipPath: 'inset(4px 0)' }}
            loading="eager"
          />
        </div>

        {/* Checkbox Don't show again */}
        <label className="flex items-center gap-2 text-[11px] text-slate-500 hover:text-slate-700 cursor-pointer select-none my-1">
          <input
            type="checkbox"
            checked={dontShowAgain}
            onChange={(e) => setDontShowAgain(e.target.checked)}
            className="w-3.5 h-3.5 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 cursor-pointer"
          />
          <span>Jangan tampilkan lagi saat membuka kompas</span>
        </label>

        {/* Confirm Button "Oke" */}
        <button
          type="button"
          onClick={handleConfirm}
          className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white font-bold text-sm sm:text-base rounded-xl transition-colors shadow-sm cursor-pointer mt-2 text-center"
        >
          Oke
        </button>
      </div>
    </div>
  );
};
