// components/tal/TalLockPlanModal.tsx — porting src/components/tal/TalLockPlanModal.tsx backup.
'use client';

import React, { useState } from 'react';
import { Lock, X } from 'lucide-react';
import type { TalTaskType } from '@/lib/tal/types';

interface TalLockPlanModalProps {
  isOpen: boolean;
  type: TalTaskType;
  periodLabel: string;
  totalTasks: number;
  onConfirm: (notes?: string) => Promise<void>;
  onClose: () => void;
}

export const TalLockPlanModal: React.FC<TalLockPlanModalProps> = ({
  isOpen,
  type,
  periodLabel,
  totalTasks,
  onConfirm,
  onClose
}) => {
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleLock = async () => {
    setLoading(true);
    try {
      await onConfirm(notes);
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/50 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-amber-50/70">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-100 text-amber-700 rounded-xl">
              <Lock size={20} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Konfirmasi Kunci Plan</h3>
              <p className="text-[11px] text-amber-700 font-semibold">{periodLabel}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-amber-100/50 transition cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-3.5">
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <p className="text-xs font-bold text-slate-800">
              Data Perencanaan yang Akan Dikunci:
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2 bg-white rounded-lg border border-slate-200">
                <span className="text-[10px] text-slate-500 font-medium">Info Periode</span>
                <p className="font-bold text-slate-800 truncate" title={periodLabel}>{periodLabel}</p>
              </div>
              <div className="p-2 bg-white rounded-lg border border-slate-200">
                <span className="text-[10px] text-slate-500 font-medium">Jumlah Tugas</span>
                <p className="font-bold text-slate-800">{totalTasks} tugas</p>
              </div>
            </div>
          </div>

          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1">
            <p className="font-bold text-amber-950">Aturan Tahap Realisasi:</p>
            <ul className="list-disc list-inside text-[11px] space-y-0.5 text-amber-800">
              <li>Detail tugas (judul, waktu, kategori, target) <b>tidak dapat diubah atau dihapus</b>.</li>
              <li>Tugas baru yang ditambahkan akan berstatus sebagai <b>Tugas Tambahan</b>.</li>
              <li>Anda tetap dapat memperbarui <b>Status (Progress Realisasi)</b> dan mengisi catatan capaian.</li>
            </ul>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Catatan Komitmen Plan (Opsional)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Tuliskan catatan komitmen target..."
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3.5 bg-slate-50 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-xl transition cursor-pointer"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={handleLock}
            className="px-5 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl transition shadow-xs disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
          >
            <Lock size={14} />
            <span>{loading ? 'Mengunci Plan...' : 'Ya, Kunci Plan'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default TalLockPlanModal;
