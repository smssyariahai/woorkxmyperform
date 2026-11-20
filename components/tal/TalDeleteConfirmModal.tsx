// components/tal/TalDeleteConfirmModal.tsx — porting src/components/tal/TalDeleteConfirmModal.tsx backup.
'use client';

import React, { useState } from 'react';
import { Trash2, X, AlertTriangle } from 'lucide-react';

interface TalDeleteConfirmModalProps {
  isOpen: boolean;
  title?: string;
  message?: string;
  itemCount?: number;
  itemNames?: string[];
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

export const TalDeleteConfirmModal: React.FC<TalDeleteConfirmModalProps> = ({
  isOpen,
  title = 'Hapus Tugas',
  message,
  itemCount = 1,
  itemNames = [],
  onConfirm,
  onClose
}) => {
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm();
      onClose();
    } catch (e) {
      console.error('Failed to delete:', e);
    } finally {
      setLoading(false);
    }
  };

  const isBulk = itemCount > 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-rose-100 bg-rose-50/80">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-rose-100 text-rose-600 rounded-xl">
              <Trash2 size={20} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">{title}</h3>
              <p className="text-[11px] text-rose-600 font-semibold">
                {isBulk ? `${itemCount} Tugas Terpilih` : 'Konfirmasi Penghapusan'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-rose-100/60 transition cursor-pointer"
            title="Tutup"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-3.5">
          <div className="flex items-start gap-3 p-3 bg-rose-50/60 border border-rose-200/80 rounded-xl text-xs text-rose-900">
            <AlertTriangle size={18} className="text-rose-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold">
                {message || (isBulk
                  ? `Apakah Anda yakin ingin menghapus ${itemCount} tugas yang dipilih?`
                  : 'Apakah Anda yakin ingin menghapus tugas ini?')}
              </p>
              <p className="text-[11px] text-rose-700/90 leading-relaxed">
                Tindakan ini tidak dapat dibatalkan. Tugas yang dihapus akan hilang secara permanen dari daftar Anda.
              </p>
            </div>
          </div>

          {/* List of items to delete if provided */}
          {itemNames && itemNames.length > 0 && (
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                {isBulk ? 'Daftar Tugas yang akan dihapus:' : 'Tugas:'}
              </label>
              <div className="max-h-36 overflow-y-auto border border-slate-200 rounded-xl p-2 bg-slate-50 divide-y divide-slate-100 space-y-1">
                {itemNames.map((name, idx) => (
                  <div key={idx} className="text-xs font-semibold text-slate-700 py-1 px-1.5 truncate flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0" />
                    <span className="truncate">{name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer (Yes or No) */}
        <div className="flex items-center justify-end gap-2 px-5 py-3.5 bg-slate-50 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition cursor-pointer disabled:opacity-50"
          >
            Batal (No)
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            className="px-5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition shadow-xs disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
          >
            {loading ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Menghapus...</span>
              </>
            ) : (
              <>
                <Trash2 size={14} />
                <span>Ya, Hapus (Yes)</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TalDeleteConfirmModal;
