import React, { useState } from 'react';
import { X, Bookmark, Trash2, Check, Sparkles } from 'lucide-react';

interface MaulidBookmarkModalProps {
  isOpen: boolean;
  onClose: () => void;
  kitabNama: string;
  fashlJudul: string;
  baitNomor: number;
  teksArab: string;
  terjemahan: string;
  existingNote?: string;
  onSave: (catatan: string) => void;
  onDelete?: () => void;
}

export const MaulidBookmarkModal: React.FC<MaulidBookmarkModalProps> = ({
  isOpen,
  onClose,
  kitabNama,
  fashlJudul,
  baitNomor,
  teksArab,
  terjemahan,
  existingNote,
  onSave,
  onDelete
}) => {
  const [catatan, setCatatan] = useState<string>(existingNote ?? '');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-amber-50/60 dark:bg-amber-950/30">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Bookmark className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Simpan Tanda Baca / Favorit</h3>
              <p className="text-[11px] text-slate-500">{kitabNama} • Bait #{baitNomor}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Bait Preview */}
          <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
            <div className="text-right font-serif text-lg text-emerald-800 dark:text-emerald-300 mb-2 leading-relaxed">
              {teksArab}
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-300 italic line-clamp-2">
              "{terjemahan}"
            </div>
          </div>

          {/* Notes Input */}
          <div>
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1.5">
              Catatan Pribadi / Refleksi (Opsional):
            </label>
            <textarea
              rows={3}
              value={catatan}
              onChange={(e) => setCatatan(e.target.value)}
              placeholder="Tuliskan catatan, fadhilah, atau pengingat terkait bait maulid ini..."
              className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 flex items-center justify-between">
          {onDelete && existingNote !== undefined ? (
            <button
              onClick={() => {
                onDelete();
                onClose();
              }}
              className="px-3 py-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Hapus</span>
            </button>
          ) : <div />}

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-xs font-medium transition"
            >
              Batal
            </button>
            <button
              onClick={() => {
                onSave(catatan);
                onClose();
              }}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-sm transition flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Simpan Bookmark</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
