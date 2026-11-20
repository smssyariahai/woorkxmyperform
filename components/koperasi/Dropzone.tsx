// components/koperasi/Dropzone.tsx — port dari backup MyPerform
// (src/components/koperasi/Dropzone.tsx, 74 baris): kotak upload ala modul
// Kalkulator Gadai Emas — border putus-putus, klik membuka galeri, berkas
// bisa dijatuhkan (drag & drop).
'use client';

import React, { useRef, useState } from 'react';
import { Upload } from 'lucide-react';

interface DropzoneProps {
  mainText: string;
  subText?: string;
  onFile: (file: File) => void;
  disabled?: boolean;
}

export const Dropzone: React.FC<DropzoneProps> = ({
  mainText,
  subText = 'Mendukung JPG, PNG, WEBP',
  onFile,
  disabled,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const acceptFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Hanya berkas gambar (JPG, PNG, WEBP) yang bisa diunggah.');
      return;
    }
    onFile(file);
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          acceptFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragOver(false);
          if (!disabled) acceptFile(e.dataTransfer.files?.[0]);
        }}
        onClick={() => {
          if (!disabled) inputRef.current?.click();
        }}
        className={`border-2 border-dashed rounded-xl sm:rounded-2xl p-3 sm:p-4 text-center cursor-pointer transition ${
          disabled
            ? 'opacity-50 cursor-wait'
            : isDragOver
              ? 'border-emerald-500 bg-emerald-50/50'
              : 'border-slate-200 hover:border-emerald-400 bg-slate-50/60'
        }`}
      >
        <Upload size={20} className="mx-auto text-slate-400 mb-1" />
        <p className="text-xs font-semibold text-slate-700">{mainText}</p>
        <p className="text-[10px] sm:text-[11px] text-slate-400 mt-0.5">{subText}</p>
      </div>
    </div>
  );
};

export default Dropzone;
