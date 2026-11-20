import React, { useEffect, useState } from 'react';
import { X, BookOpen, Copy, Check, ChevronLeft, ChevronRight, Loader2, Share2 } from 'lucide-react';
import { SurahInfo, AyahData, QuranArabicFontId } from '@/lib/islami/types/quran';
import { QURAN_ARABIC_FONTS } from '@/lib/islami/quranStorage';

interface QuranTafsirModalProps {
  isOpen: boolean;
  onClose: () => void;
  surah: SurahInfo | null;
  ayah: AyahData | null;
  allAyahs?: AyahData[];
  onSelectAyah?: (ayahNumber: number) => void;
  arabicFont?: QuranArabicFontId;
}

export const QuranTafsirModal: React.FC<QuranTafsirModalProps> = ({
  isOpen,
  onClose,
  surah,
  ayah,
  allAyahs = [],
  onSelectAyah,
  arabicFont = 'amiri-quran',
}) => {
  const [tafsirText, setTafsirText] = useState<string | null>(null);
  const [sourceName, setSourceName] = useState<string>('Tafsir Kemenag RI');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen || !surah || !ayah) return;

    let isMounted = true;
    setIsLoading(true);
    setTafsirText(null);

    fetch(`/data/quran/tafsir/${surah.id}.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!isMounted) return;
        setSourceName(data.source || data.name || 'Kementerian Agama Republik Indonesia');
        const text = data.tafsir?.[ayah.ayah] || data.tafsir?.[`${ayah.ayah}`] || null;
        setTafsirText(text || 'Penjelasan tafsir untuk ayat ini belum tersedia.');
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error('Failed to load tafsir:', err);
        setTafsirText('Gagal memuat data tafsir. Silakan periksa koneksi atau coba lagi nanti.');
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, surah, ayah]);

  if (!isOpen || !surah || !ayah) return null;

  // Font Arab tidak di-bundle di WOORK (tidak ada class font-quran-*),
  // pakai fontFamily inline dari QURAN_ARABIC_FONTS (fallback serif sistem).
  const arabicFontFamily =
    QURAN_ARABIC_FONTS.find((f) => f.id === arabicFont)?.fontFamily ||
    QURAN_ARABIC_FONTS[0].fontFamily;

  const handleCopy = () => {
    const textToCopy = `[Tafsir QS. ${surah.latin} (${surah.id}): ${ayah.ayah}]\n\n` +
      `Lafadz:\n${ayah.arabic}\n\n` +
      `Artinya:\n"${ayah.translation}"\n\n` +
      `Tafsir Kemenag RI:\n${tafsirText || ''}`;

    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrev = () => {
    if (ayah.ayah > 1 && onSelectAyah) {
      onSelectAyah(ayah.ayah - 1);
    }
  };

  const handleNext = () => {
    if (ayah.ayah < surah.num_ayah && onSelectAyah) {
      onSelectAyah(ayah.ayah + 1);
    }
  };

  // Split paragraphs safely
  const paragraphs = tafsirText ? tafsirText.split('\n\n').filter((p) => p.trim().length > 0) : [];

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl border border-slate-200 flex flex-col max-h-[90vh] overflow-hidden transform animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-emerald-50 via-teal-50 to-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-600/20">
              <BookOpen size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-800 text-base sm:text-lg">
                  Tafsir QS. {surah.latin}: Ayat {ayah.ayah}
                </h3>
                <span className="bg-emerald-100 text-emerald-800 text-[11px] font-semibold px-2.5 py-0.5 rounded-full">
                  Kemenag RI
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Surah ke-{surah.id} &bull; {surah.translation} ({surah.num_ayah} Ayat)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition cursor-pointer"
            title="Tutup"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 divide-y divide-slate-100">
          {/* Ayah Snippet Box */}
          <div className="bg-slate-50 rounded-2xl p-4 sm:p-5 border border-slate-200/80 space-y-3">
            <p className="text-right text-emerald-950 text-2xl sm:text-3xl leading-loose" style={{ fontFamily: arabicFontFamily }} dir="rtl">
              {ayah.arabic}
            </p>
            {ayah.latin && (
              <p className="text-xs font-mono text-emerald-700 font-medium">
                {ayah.latin}
              </p>
            )}
            <p className="text-sm text-slate-700 italic border-l-2 border-emerald-500 pl-3 leading-relaxed">
              "{ayah.translation}"
            </p>
          </div>

          {/* Tafsir Content */}
          <div className="pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
                Uraian Tafsir Kemenag RI
              </h4>
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-xl transition cursor-pointer"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? 'Tersalin!' : 'Salin Tafsir'}
              </button>
            </div>

            {isLoading ? (
              <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
                <Loader2 size={32} className="animate-spin text-emerald-600" />
                <p className="text-sm">Memuat teks tafsir resmi Kemenag...</p>
              </div>
            ) : paragraphs.length > 0 ? (
              <div className="space-y-4 text-slate-800 text-sm sm:text-base leading-relaxed">
                {paragraphs.map((para, idx) => (
                  <p key={idx} className="text-justify font-normal leading-relaxed text-slate-700">
                    {para}
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500 italic py-4 text-center">
                Penjelasan tafsir tidak ditemukan untuk ayat ini.
              </p>
            )}
          </div>
        </div>

        {/* Modal Footer / Navigation */}
        <div className="px-5 py-3.5 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <button
            type="button"
            onClick={handlePrev}
            disabled={ayah.ayah <= 1}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 hover:text-emerald-700 hover:bg-white rounded-xl border border-slate-200 transition disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
          >
            <ChevronLeft size={16} />
            Ayat Sebelumnya
          </button>

          <span className="text-xs text-slate-500 font-medium">
            Ayat {ayah.ayah} dari {surah.num_ayah}
          </span>

          <button
            type="button"
            onClick={handleNext}
            disabled={ayah.ayah >= surah.num_ayah}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 hover:text-emerald-700 hover:bg-white rounded-xl border border-slate-200 transition disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
          >
            Ayat Selanjutnya
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};
