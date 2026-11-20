// components/tal/TalCutiModal.tsx — porting src/components/tal/TalCutiModal.tsx backup.
// PERBEDAAN WOORK (dipertahankan): menandai cuti HANYA memberi peringatan —
// tugas pada tanggal itu TIDAK dihapus (berbeda dengan backup yang menghapus
// task di tahap planning / menandai pending+report di tahap realisasi).
// Karena itu `action` selalu 'normal' dan teks peringatan disesuaikan.
'use client';

import React, { useState } from 'react';
import { Palmtree, X, AlertTriangle } from 'lucide-react';

interface TalCutiModalProps {
  isOpen: boolean;
  dateStr: string;
  isAlreadyCuti: boolean;
  existingReason?: string;
  existingTasksCount?: number;
  stage?: 'planning' | 'realization' | 'reported';
  onConfirm: (isCuti: boolean, reason?: string, action?: 'delete_tasks' | 'mark_pending_report' | 'normal') => Promise<void>;
  onClose: () => void;
}

export const TalCutiModal: React.FC<TalCutiModalProps> = ({
  isOpen,
  dateStr,
  isAlreadyCuti,
  existingReason = '',
  existingTasksCount = 0,
  stage = 'planning',
  onConfirm,
  onClose
}) => {
  const [reason, setReason] = useState(existingReason || '');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleToggleCuti = async (setAsCuti: boolean) => {
    setLoading(true);
    try {
      // WOORK: selalu 'normal' — cuti hanya penanda + peringatan, tugas tidak dihapus.
      await onConfirm(setAsCuti, reason, 'normal');
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
              <Palmtree size={20} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                {isAlreadyCuti
                  ? 'Kelola Status Cuti'
                  : stage === 'realization'
                  ? 'Pengajuan Cuti (Tahap Realisasi)'
                  : 'Tandai Sebagai Hari Cuti'}
              </h3>
              <p className="text-[11px] text-amber-800 font-semibold">Tanggal: {dateStr}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer">
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-3.5">
          {/* Stage & Task Count Warnings — WOORK: tugas TIDAK dihapus, hanya peringatan */}
          {!isAlreadyCuti && existingTasksCount > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-amber-800 text-xs">
              <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-amber-900 mb-0.5">Perhatian: Terdapat {existingTasksCount} Tugas</p>
                <p>
                  Terdapat <b>{existingTasksCount} tugas</b> yang sudah direncanakan pada tanggal ini.
                  Menandai cuti <b>tidak menghapus tugas</b> — tugas tetap tersimpan dan hanya diberi
                  peringatan bahwa tanggal ini adalah hari cuti.
                </p>
              </div>
            </div>
          )}

          <p className="text-xs text-slate-600">
            {isAlreadyCuti
              ? 'Tanggal ini saat ini ditandai sebagai hari cuti Anda. Anda dapat membatalkan atau memperbarui keterangan cuti.'
              : 'Menandai tanggal ini sebagai cuti akan mengecualikan hari ini dari kewajiban tugas harian.'}
          </p>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Alasan / Keterangan Cuti (Opsional)
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Contoh: Cuti tahunan / Keperluan keluarga / Izin sakit"
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

          {isAlreadyCuti ? (
            <button
              type="button"
              disabled={loading}
              onClick={() => handleToggleCuti(false)}
              className="px-4 py-2 text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition disabled:opacity-50 cursor-pointer"
            >
              {loading ? 'Memproses...' : 'Batalkan Cuti'}
            </button>
          ) : (
            <button
              type="button"
              disabled={loading}
              onClick={() => handleToggleCuti(true)}
              className="px-5 py-2 text-xs font-bold text-white rounded-xl transition shadow-xs disabled:opacity-50 cursor-pointer bg-amber-600 hover:bg-amber-700"
            >
              {loading ? 'Menyimpan...' : 'Tandai Cuti'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default TalCutiModal;
