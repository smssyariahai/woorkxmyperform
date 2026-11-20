'use client';

import React, { useState, useEffect } from 'react';
import {
  X, Bookmark, BookmarkCheck, Globe, Lock, Trash2,
  Save, Sparkles, Check, AlertCircle
} from 'lucide-react';
import { AyahData, QuranBookmarkItem, SurahInfo } from '@/lib/islami/types/quran';
import { saveQuranBookmark, deleteQuranBookmark } from '@/lib/islami/quranBookmarks';

interface QuranBookmarkModalProps {
  isOpen: boolean;
  onClose: () => void;
  surah: SurahInfo;
  ayah: AyahData;
  existingBookmark?: QuranBookmarkItem | null;
  onSuccess?: () => void;
}

export const QuranBookmarkModal: React.FC<QuranBookmarkModalProps> = ({
  isOpen,
  onClose,
  surah,
  ayah,
  existingBookmark,
  onSuccess,
}) => {
  const [note, setNote] = useState<string>('');
  const [isPublic, setIsPublic] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (existingBookmark) {
      setNote(existingBookmark.note || '');
      setIsPublic(!!existingBookmark.isPublic);
    } else {
      setNote('');
      setIsPublic(false);
    }
    setErrorMessage(null);
    setSuccessMessage(null);
  }, [existingBookmark, isOpen]);

  if (!isOpen) return null;

  const handleSave = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await saveQuranBookmark({
        surahId: surah.id,
        surahName: surah.latin,
        surahArabic: surah.arabic,
        ayahNumber: ayah.ayah,
        ayahArabic: ayah.arabic,
        ayahTranslation: ayah.translation,
        note: note.trim(),
        isPublic: isPublic,
      });

      setSuccessMessage('Bookmark dan catatan berhasil disimpan ke database!');
      setTimeout(() => {
        if (onSuccess) onSuccess();
        onClose();
      }, 700);
    } catch (err: unknown) {
      console.error('Error saving bookmark:', err);
      setErrorMessage('Gagal menyimpan bookmark. Pastikan koneksi internet aktif.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!existingBookmark) return;
    setIsSubmitting(true);
    try {
      await deleteQuranBookmark(existingBookmark.id);
      setSuccessMessage('Bookmark berhasil dihapus.');
      setTimeout(() => {
        if (onSuccess) onSuccess();
        onClose();
      }, 500);
    } catch (err) {
      console.error('Error deleting bookmark:', err);
      setErrorMessage('Gagal menghapus bookmark.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl w-full max-w-lg shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-emerald-50/40">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
              <BookmarkCheck size={20} />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">
                {existingBookmark ? 'Edit Bookmark & Catatan' : 'Simpan Bookmark Ayat'}
              </h3>
              <p className="text-xs text-emerald-800 font-medium">
                QS. {surah.latin} : Ayat {ayah.ayah}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto">
          {/* Ayat Preview Card */}
          <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2">
            <p className="text-right text-lg text-slate-900 font-serif leading-loose" dir="rtl">
              {ayah.arabic}
            </p>
            <p className="text-xs text-slate-600 line-clamp-2 italic">
              "{ayah.translation}"
            </p>
          </div>

          {/* Feedback messages */}
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-xs text-rose-700 font-medium">
              <AlertCircle size={16} className="shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-xs text-emerald-700 font-medium">
              <Check size={16} className="shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Reflection Note Field */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Sparkles size={14} className="text-amber-500" />
              Catatan Tadabbur / Refleksi Ayat (Opsional)
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Tuliskan catatan pemahaman, doa, atau renungan Anda terhadap ayat ini..."
              rows={4}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition resize-none"
            />
          </div>

          {/* Public / Private Sharing Option */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isPublic ? (
                  <Globe size={16} className="text-emerald-600" />
                ) : (
                  <Lock size={16} className="text-slate-500" />
                )}
                <div>
                  <div className="text-xs font-bold text-slate-800">
                    {isPublic ? 'Catatan Terbuka / Publik' : 'Catatan Pribadi'}
                  </div>
                  <p className="text-[11px] text-slate-500">
                    {isPublic
                      ? 'Dapat dibaca oleh pengguna lain di tab Catatan Publik'
                      : 'Hanya dapat diakses oleh akun Anda di semua perangkat'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsPublic(!isPublic)}
                className={`w-11 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-200 ${
                  isPublic ? 'bg-emerald-600' : 'bg-slate-300'
                }`}
              >
                <div
                  className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                    isPublic ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between gap-2">
          {existingBookmark ? (
            <button
              type="button"
              onClick={handleDelete}
              disabled={isSubmitting}
              className="px-3 py-2 text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
            >
              <Trash2 size={15} />
              Hapus Bookmark
            </button>
          ) : <div />}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-600 hover:bg-slate-200/60 rounded-xl text-xs font-semibold transition cursor-pointer"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSubmitting}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Save size={15} />
              )}
              {existingBookmark ? 'Perbarui' : 'Simpan'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
