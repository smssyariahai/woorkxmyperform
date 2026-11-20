// components/tal/TalBlockerModal.tsx — porting src/components/tal/TalBlockerModal.tsx backup.
// Adaptasi WOORK: tipe + TAL_BLOCKER_CATEGORIES dari lib/tal/types.
'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  AlertTriangle,
  Building2,
  CalendarClock,
  Cpu,
  FileQuestion,
  Flame,
  HelpCircle,
  Check,
  ShieldAlert,
  Info,
  Lock
} from 'lucide-react';
import { TAL_BLOCKER_CATEGORIES, type TalBlockerCategory, type TalTaskItem } from '@/lib/tal/types';

interface TalBlockerModalProps {
  isOpen: boolean;
  taskTitle?: string;
  task?: TalTaskItem | null;
  initialCategory?: string;
  initialDescription?: string;
  isReadOnly?: boolean;
  onConfirm: (category: string, description: string) => Promise<void> | void;
  onClose: () => void;
}

const CATEGORY_ICONS: Record<TalBlockerCategory, React.ReactNode> = {
  'Menunggu Vendor/Pihak Ketiga': <Building2 size={16} className="text-amber-600 shrink-0" />,
  'Klien Reschedule': <CalendarClock size={16} className="text-blue-600 shrink-0" />,
  'Kendala Teknis/Sistem': <Cpu size={16} className="text-rose-600 shrink-0" />,
  'Kekurangan Data/Dokumen': <FileQuestion size={16} className="text-indigo-600 shrink-0" />,
  'Interupsi Tugas Urgent': <Flame size={16} className="text-orange-600 shrink-0" />,
  'Lain-lain': <HelpCircle size={16} className="text-slate-600 shrink-0" />
};

export const TalBlockerModal: React.FC<TalBlockerModalProps> = ({
  isOpen,
  taskTitle = '',
  task,
  initialCategory = '',
  initialDescription = '',
  isReadOnly = false,
  onConfirm,
  onClose
}) => {
  const displayTitle = task?.title || taskTitle;
  const [category, setCategory] = useState<string>(task?.blockerCategory || initialCategory);
  const [description, setDescription] = useState<string>(task?.blockerDescription || initialDescription);
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setCategory(task?.blockerCategory || initialCategory || '');
      setDescription(task?.blockerDescription || initialDescription || '');
      setTouched(false);
      setLoading(false);
    }
  }, [isOpen, task, initialCategory, initialDescription]);

  if (!isOpen) return null;

  const charCount = description.trim().length;
  const isMinCharMet = charCount >= 10;
  const isValid = !!category && isMinCharMet;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) return;
    setTouched(true);
    if (!isValid) return;

    setLoading(true);
    try {
      await onConfirm(category, description.trim());
      onClose();
    } catch (err) {
      console.error('Error saving blocker:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-5 py-4 border-b shrink-0 ${isReadOnly ? 'bg-slate-50 border-slate-200' : 'bg-amber-50/80 border-amber-100'}`}>
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-xl shadow-xs text-white ${isReadOnly ? 'bg-slate-700' : 'bg-amber-500'}`}>
              {isReadOnly ? <Lock size={20} /> : <ShieldAlert size={20} />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900 leading-tight">
                  {isReadOnly ? 'Rincian Kendala & Blocker Tugas' : 'Catat Kendala & Blocker Tugas'}
                </h3>
                {isReadOnly && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-full">
                    <Lock size={9} /> Read Only
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 font-medium">
                {isReadOnly ? 'Tugas telah dilaporkan (Reported) dan tidak dapat diubah' : 'Mekanisme Alih Tugas & Pelacakan Status Pending (Wajib Diisi)'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* Target Task Title Info */}
          <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">
              Tugas Ditandai Pending / Kendala
            </span>
            <p className="text-xs font-bold text-slate-800 break-words">
              {displayTitle || 'Tugas Terpilih'}
            </p>
          </div>

          {/* 1. Kategori Blocker Selection */}
          <div>
            <label className="block text-xs font-bold text-slate-800 mb-2 flex items-center justify-between">
              <span>
                1. Kategori Blocker {!isReadOnly && <span className="text-rose-500">*</span>}
              </span>
              {category ? (
                <span className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
                  <Check size={12} /> Kategori Dipilih
                </span>
              ) : (
                !isReadOnly && <span className="text-[10px] text-amber-600 font-medium">Wajib pilih salah satu</span>
              )}
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {TAL_BLOCKER_CATEGORIES.map((cat) => {
                const isSelected = category === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    disabled={isReadOnly}
                    onClick={() => !isReadOnly && setCategory(cat)}
                    className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-left transition-all text-xs ${
                      isSelected
                        ? 'bg-amber-50/90 border-amber-500 ring-2 ring-amber-500/20 text-amber-950 font-bold shadow-xs'
                        : isReadOnly
                          ? 'bg-slate-50/50 border-slate-200 text-slate-400 opacity-60'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 cursor-pointer'
                    } ${isReadOnly ? 'cursor-default' : ''}`}
                  >
                    <div className="p-1 rounded-lg bg-slate-100 shrink-0">
                      {CATEGORY_ICONS[cat]}
                    </div>
                    <span className="flex-1 leading-snug">{cat}</span>
                    {isSelected && (
                      <div className="w-4 h-4 rounded-full bg-amber-500 text-white flex items-center justify-center shrink-0">
                        <Check size={11} strokeWidth={3} />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            {touched && !category && !isReadOnly && (
              <p className="text-[11px] text-rose-600 font-medium mt-1.5 flex items-center gap-1">
                <AlertTriangle size={12} /> Silakan pilih kategori blocker terlebih dahulu.
              </p>
            )}
          </div>

          {/* 2. Deskripsi Kendala Textarea */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold text-slate-800">
                2. Deskripsi Kendala {!isReadOnly && <span className="text-rose-500">*</span>}
              </label>
              {!isReadOnly && (
                <div className="flex items-center gap-1.5 text-[11px]">
                  <span className={`font-bold ${isMinCharMet ? 'text-emerald-600' : 'text-slate-400'}`}>
                    {charCount} / 10
                  </span>
                  <span className={`text-[10px] ${isMinCharMet ? 'text-emerald-600 font-medium' : 'text-amber-700'}`}>
                    {isMinCharMet ? '(Terpenuhi)' : '(Minimal 10 karakter)'}
                  </span>
                </div>
              )}
            </div>

            <textarea
              rows={3}
              value={description}
              readOnly={isReadOnly}
              disabled={isReadOnly}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={isReadOnly ? 'Tidak ada rincian kendala' : 'Jelaskan secara detail kendala/alasan mengapa tugas ini tidak dapat diselesaikan saat ini (minimal 10 karakter)...'}
              className={`w-full px-3.5 py-2.5 text-xs rounded-xl border transition ${
                isReadOnly
                  ? 'bg-slate-50 border-slate-200 text-slate-800 cursor-default focus:outline-none'
                  : touched && !isMinCharMet
                    ? 'border-rose-400 focus:ring-2 focus:ring-rose-400 bg-rose-50/20 focus:outline-none'
                    : 'border-slate-200 focus:ring-2 focus:ring-amber-500 bg-white focus:outline-none'
              }`}
            />

            {isReadOnly ? (
              <div className="flex items-start gap-1.5 mt-2 p-2.5 bg-amber-50/70 border border-amber-200/80 rounded-xl text-[11px] text-amber-900">
                <Lock size={13} className="text-amber-600 shrink-0 mt-0.5" />
                <p className="leading-relaxed font-medium">
                  Tugas ini sudah dalam status dilaporkan (Reported) atau terkunci. Rincian kendala/blocker ini hanya dapat dilihat (read-only) dan tidak dapat diubah.
                </p>
              </div>
            ) : (
              <div className="flex items-start gap-1.5 mt-2 p-2.5 bg-blue-50 border border-blue-200/80 rounded-xl text-[11px] text-blue-900">
                <Info size={14} className="text-blue-600 shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  Informasi blocker ini akan dicatat untuk evaluasi tim dan wajib ditentukan tindak lanjut alih tugasnya (Rollover ke Besok / Tanggal Lain / Tutup) saat pelaporan report harian/mingguan.
                </p>
              </div>
            )}
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3.5 bg-slate-50 border-t border-slate-100 shrink-0">
          {isReadOnly ? (
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 text-xs font-bold text-white bg-slate-800 hover:bg-slate-900 rounded-xl transition cursor-pointer shadow-xs"
            >
              Tutup
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-xl transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={!isValid || loading}
                onClick={handleSubmit}
                className="px-5 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl transition shadow-xs disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1.5"
              >
                {loading ? (
                  <span>Menyimpan...</span>
                ) : (
                  <>
                    <ShieldAlert size={14} />
                    <span>Simpan & Jadikan Pending</span>
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default TalBlockerModal;
