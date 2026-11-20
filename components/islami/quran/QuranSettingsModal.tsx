import React, { useState, useEffect } from 'react';
import { 
  X, Settings2, HardDrive, Trash2, Check, RefreshCw, 
  Volume2, Type, Eye, ChevronDown, ChevronUp, Palette, 
  Sparkles, Play, Pause, CheckSquare, Square, Filter,
  AlertTriangle
} from 'lucide-react';
import { QuranReaderSettings, CachedAudioItem, QuranArabicFontId } from '@/lib/islami/types/quran';
import { 
  AUDIO_RECITERS, QURAN_ARABIC_FONTS, 
  getMurottalCacheStats, clearMurottalAudioCache, 
  getCachedAudioList, deleteCachedAudioByUrls 
} from '@/lib/islami/quranStorage';
import { AyahOrnament } from './AyahOrnament';

interface QuranSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: QuranReaderSettings;
  onUpdateSettings: (newSettings: Partial<QuranReaderSettings>) => void;
}

export const QuranSettingsModal: React.FC<QuranSettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
}) => {
  // Accordion open states
  // By default, open 'font' or 'size'
  const [openAccordions, setOpenAccordions] = useState<{
    font: boolean;
    size: boolean;
    display: boolean;
    reciter: boolean;
  }>({
    font: true,
    size: false,
    display: false,
    reciter: false,
  });

  const toggleAccordion = (key: keyof typeof openAccordions) => {
    setOpenAccordions((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  // Cache stats and management state
  const [cacheStats, setCacheStats] = useState<{ count: number; formattedSize: string }>({
    count: 0,
    formattedSize: '0 MB'
  });
  const [isClearingCache, setIsClearingCache] = useState<boolean>(false);
  const [cacheClearedSuccess, setCacheClearedSuccess] = useState<string | null>(null);
  const [showConfirmClearAll, setShowConfirmClearAll] = useState<boolean>(false);
  const [showConfirmDeleteSelected, setShowConfirmDeleteSelected] = useState<boolean>(false);

  // Detailed cached audio list
  const [isDetailCacheOpen, setIsDetailCacheOpen] = useState<boolean>(false);
  const [cachedItems, setCachedItems] = useState<CachedAudioItem[]>([]);
  const [isLoadingCachedItems, setIsLoadingCachedItems] = useState<boolean>(false);
  const [selectedUrls, setSelectedUrls] = useState<string[]>([]);
  const [isDeletingSelected, setIsDeletingSelected] = useState<boolean>(false);

  // Audio preview playback for cache items
  const [previewAudioUrl, setPreviewAudioUrl] = useState<string | null>(null);
  const [previewAudioObj, setPreviewAudioObj] = useState<HTMLAudioElement | null>(null);

  const loadCacheData = async () => {
    const stats = await getMurottalCacheStats();
    setCacheStats({
      count: stats.count,
      formattedSize: stats.formattedSize
    });

    if (isDetailCacheOpen) {
      setIsLoadingCachedItems(true);
      const items = await getCachedAudioList();
      setCachedItems(items);
      setIsLoadingCachedItems(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadCacheData();
      setCacheClearedSuccess(null);
    } else {
      // stop audio preview if modal is closed
      if (previewAudioObj) {
        previewAudioObj.pause();
        setPreviewAudioObj(null);
        setPreviewAudioUrl(null);
      }
    }
  }, [isOpen, isDetailCacheOpen]);

  // Handle preview audio playback
  const handleTogglePreviewAudio = (url: string) => {
    if (previewAudioUrl === url && previewAudioObj) {
      if (!previewAudioObj.paused) {
        previewAudioObj.pause();
        setPreviewAudioUrl(null);
        return;
      }
    }

    if (previewAudioObj) {
      previewAudioObj.pause();
    }

    const audio = new Audio(url);
    audio.play().catch((e) => console.warn('Audio preview error:', e));
    audio.onended = () => {
      setPreviewAudioUrl(null);
    };

    setPreviewAudioObj(audio);
    setPreviewAudioUrl(url);
  };

  // Eksekusi hapus semua cache setelah konfirmasi
  const handleExecuteClearAllCache = async () => {
    setIsClearingCache(true);
    try {
      const res = await clearMurottalAudioCache();
      setIsClearingCache(false);
      setShowConfirmClearAll(false);
      if (res.success) {
        setCacheClearedSuccess(
          res.deletedCount > 0
            ? `Berhasil membersihkan seluruh cache (${res.deletedCount} file).`
            : 'Penyimpanan cache audio murottal berhasil dibersihkan.'
        );
        setSelectedUrls([]);
        setCachedItems([]);
        await loadCacheData();
        setTimeout(() => setCacheClearedSuccess(null), 3500);
      }
    } catch (err) {
      console.error('Error clearing cache:', err);
      setIsClearingCache(false);
      setShowConfirmClearAll(false);
    }
  };

  // Eksekusi hapus item-item terpilih setelah konfirmasi
  const handleExecuteDeleteSelected = async () => {
    if (selectedUrls.length === 0) {
      setShowConfirmDeleteSelected(false);
      return;
    }
    setIsDeletingSelected(true);
    try {
      const deletedCount = await deleteCachedAudioByUrls(selectedUrls);
      setIsDeletingSelected(false);
      setShowConfirmDeleteSelected(false);
      
      setCacheClearedSuccess(`Berhasil menghapus ${deletedCount} file audio terpilih.`);
      setSelectedUrls([]);
      
      // Refresh list
      const items = await getCachedAudioList();
      setCachedItems(items);
      const stats = await getMurottalCacheStats();
      setCacheStats({ count: stats.count, formattedSize: stats.formattedSize });
      
      setTimeout(() => setCacheClearedSuccess(null), 3500);
    } catch (err) {
      console.error('Error deleting selected audio:', err);
      setIsDeletingSelected(false);
      setShowConfirmDeleteSelected(false);
    }
  };

  const handleDeleteSingle = async (url: string) => {
    const count = await deleteCachedAudioByUrls([url]);
    if (count > 0) {
      setSelectedUrls((prev) => prev.filter((u) => u !== url));
      const items = await getCachedAudioList();
      setCachedItems(items);
      const stats = await getMurottalCacheStats();
      setCacheStats({ count: stats.count, formattedSize: stats.formattedSize });
    }
  };

  const handleToggleSelectUrl = (url: string) => {
    setSelectedUrls((prev) => 
      prev.includes(url) ? prev.filter((u) => u !== url) : [...prev, url]
    );
  };

  const handleSelectAll = () => {
    if (selectedUrls.length === cachedItems.length) {
      setSelectedUrls([]);
    } else {
      setSelectedUrls(cachedItems.map((item) => item.url));
    }
  };

  if (!isOpen) return null;

  // Selected summaries for accordion headers
  const currentFont = QURAN_ARABIC_FONTS.find((f) => f.id === settings.arabicFont) || QURAN_ARABIC_FONTS[0];
  const currentReciter = AUDIO_RECITERS.find((r) => r.id === settings.selectedReciter) || AUDIO_RECITERS[0];
  
  const fontSizeLabels: Record<string, string> = {
    small: 'Kecil',
    medium: 'Sedang (Standar)',
    large: 'Besar',
    xlarge: 'Ekstra Besar',
  };

  return (
    <div 
      className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-3xl w-full max-w-lg shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-emerald-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
              <Settings2 size={20} />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">
                Pengaturan Al-Qur'an
              </h3>
              <p className="text-xs text-slate-500">
                Variasi teks Arab, tampilan, murottal & kelola audio cache
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
          
          {/* ACCORDION 1: Gaya & Variasi Font Arab (Foto Rujukan) */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs transition">
            <button
              type="button"
              onClick={() => toggleAccordion('font')}
              className="w-full p-3.5 bg-slate-50/80 hover:bg-slate-100/80 flex items-center justify-between text-left transition cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <Palette size={15} />
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-800 block">
                    Pilihan Variasi Teks Arab (Font)
                  </span>
                  <span className="text-[11px] text-emerald-700 font-medium">
                    {currentFont.name} ({currentFont.subname})
                  </span>
                </div>
              </div>
              <div className="text-slate-400">
                {openAccordions.font ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </div>
            </button>

            {openAccordions.font && (
              <div className="p-3.5 bg-white border-t border-slate-100 space-y-3">
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Pilih gaya kaligrafi teks Al-Qur'an. Model <strong>Amiri Quran</strong> dirancang khusus sesuai bentuk mushaf klasik berharakat rapi seperti rujukan foto.
                </p>

                <div className="space-y-2">
                  {QURAN_ARABIC_FONTS.map((f) => {
                    const isSelected = settings.arabicFont === f.id;
                    return (
                      <div
                        key={f.id}
                        onClick={() => onUpdateSettings({ arabicFont: f.id })}
                        className={`p-3 rounded-xl border transition cursor-pointer relative ${
                          isSelected
                            ? 'bg-emerald-50/70 border-emerald-500 shadow-2xs'
                            : 'bg-slate-50/60 border-slate-200 hover:bg-slate-100/60'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-bold text-slate-900">
                                {f.name}
                              </span>
                              <span className="text-[10px] text-slate-500">
                                • {f.subname}
                              </span>
                              {f.badge && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-600 text-white">
                                  {f.badge}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500 mb-2">
                              {f.tagline}
                            </p>

                            {/* Live Arabic Font Preview */}
                            <div 
                              className="text-right text-lg sm:text-xl text-slate-900 leading-relaxed tracking-normal p-2 bg-white rounded-lg border border-slate-200/70"
                              dir="rtl"
                              style={{ fontFamily: f.fontFamily }}
                            >
                              <span>{f.sampleArabic}</span>
                              <AyahOrnament number={1} size={28} />
                            </div>
                          </div>

                          <div className="pt-1">
                            <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                              isSelected 
                                ? 'bg-emerald-600 border-emerald-600 text-white' 
                                : 'border-slate-300 bg-white'
                            }`}>
                              {isSelected && <Check size={12} strokeWidth={3} />}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Option for Ayah End Ornament */}
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AyahOrnament number={1} size={26} />
                    <div>
                      <div className="text-xs font-bold text-slate-800">Bingkai Ornamen Nomor Ayat</div>
                      <p className="text-[10px] text-slate-500">Lingkaran berukir khas mushaf di akhir setiap ayat</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onUpdateSettings({ showAyahOrnament: !settings.showAyahOrnament })}
                    className={`w-9 h-5 flex items-center rounded-full p-0.5 cursor-pointer transition-colors duration-200 ${
                      settings.showAyahOrnament !== false ? 'bg-emerald-600' : 'bg-slate-300'
                    }`}
                  >
                    <div
                      className={`bg-white w-4 h-4 rounded-full shadow-xs transform transition-transform duration-200 ${
                        settings.showAyahOrnament !== false ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ACCORDION 2: Ukuran Teks (Arab, Latin & Terjemahan) */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs transition">
            <button
              type="button"
              onClick={() => toggleAccordion('size')}
              className="w-full p-3.5 bg-slate-50/80 hover:bg-slate-100/80 flex items-center justify-between text-left transition cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <Type size={15} />
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-800 block">
                    Ukuran Teks (Arab, Latin & Terjemahan)
                  </span>
                  <span className="text-[11px] text-emerald-700 font-medium">
                    Arab: {fontSizeLabels[settings.arabicFontSize] || 'Sedang'} • Latin: {fontSizeLabels[settings.latinFontSize || 'medium'] || 'Sedang'} • Terjemah: {fontSizeLabels[settings.translationFontSize || 'medium'] || 'Sedang'}
                  </span>
                </div>
              </div>
              <div className="text-slate-400">
                {openAccordions.size ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </div>
            </button>

            {openAccordions.size && (
              <div className="p-3.5 bg-white border-t border-slate-100 space-y-4">
                {/* 1. Ukuran Teks Arab */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">
                      1. Ukuran Teks Arab
                    </span>
                    <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                      {fontSizeLabels[settings.arabicFontSize] || 'Sedang'}
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-2">
                    {(
                      [
                        { id: 'small', label: 'Kecil', preview: 'بِسْمِ' },
                        { id: 'medium', label: 'Sedang', preview: 'بِسْمِ' },
                        { id: 'large', label: 'Besar', preview: 'بِسْمِ' },
                        { id: 'xlarge', label: 'Ekstra', preview: 'بِسْمِ' },
                      ] as const
                    ).map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => onUpdateSettings({ arabicFontSize: f.id })}
                        className={`p-2 rounded-xl border text-center transition cursor-pointer ${
                          settings.arabicFontSize === f.id
                            ? 'bg-emerald-50 border-emerald-600 text-emerald-800 font-bold shadow-xs ring-1 ring-emerald-500/30'
                            : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <div className="text-sm leading-none font-serif mb-1">{f.preview}</div>
                        <div className="text-[10px]">{f.label}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 2. Ukuran Teks Transliterasi Latin */}
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">
                      2. Ukuran Teks Transliterasi Latin
                    </span>
                    <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                      {fontSizeLabels[settings.latinFontSize || 'medium'] || 'Sedang'}
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-2">
                    {(
                      [
                        { id: 'small', label: 'Kecil', preview: 'Aa' },
                        { id: 'medium', label: 'Sedang', preview: 'Aa' },
                        { id: 'large', label: 'Besar', preview: 'Aa' },
                        { id: 'xlarge', label: 'Ekstra', preview: 'Aa' },
                      ] as const
                    ).map((f) => {
                      const isSelected = (settings.latinFontSize || 'medium') === f.id;
                      return (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => onUpdateSettings({ latinFontSize: f.id })}
                          className={`p-2 rounded-xl border text-center transition cursor-pointer ${
                            isSelected
                              ? 'bg-emerald-50 border-emerald-600 text-emerald-800 font-bold shadow-xs ring-1 ring-emerald-500/30'
                              : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          <div className={`leading-none mb-1 font-semibold italic text-emerald-800 ${
                            f.id === 'small' ? 'text-xs' : f.id === 'medium' ? 'text-sm' : f.id === 'large' ? 'text-base' : 'text-lg'
                          }`}>
                            {f.preview}
                          </div>
                          <div className="text-[10px]">{f.label}</div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Latin live sample preview */}
                  <div className="p-2 bg-slate-50 rounded-lg border border-slate-200/70 text-emerald-800 font-medium italic">
                    <span className={
                      (settings.latinFontSize || 'medium') === 'small'
                        ? 'text-[11px]'
                        : (settings.latinFontSize || 'medium') === 'large'
                        ? 'text-sm'
                        : (settings.latinFontSize || 'medium') === 'xlarge'
                        ? 'text-base'
                        : 'text-xs'
                    }>
                      Contoh: Bismillāhir-raḥmānir-raḥīm
                    </span>
                  </div>
                </div>

                {/* 3. Ukuran Teks Terjemahan Indonesia */}
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">
                      3. Ukuran Teks Terjemahan Indonesia
                    </span>
                    <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                      {fontSizeLabels[settings.translationFontSize || 'medium'] || 'Sedang'}
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-2">
                    {(
                      [
                        { id: 'small', label: 'Kecil', preview: 'Arti' },
                        { id: 'medium', label: 'Sedang', preview: 'Arti' },
                        { id: 'large', label: 'Besar', preview: 'Arti' },
                        { id: 'xlarge', label: 'Ekstra', preview: 'Arti' },
                      ] as const
                    ).map((f) => {
                      const isSelected = (settings.translationFontSize || 'medium') === f.id;
                      return (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => onUpdateSettings({ translationFontSize: f.id })}
                          className={`p-2 rounded-xl border text-center transition cursor-pointer ${
                            isSelected
                              ? 'bg-emerald-50 border-emerald-600 text-emerald-800 font-bold shadow-xs ring-1 ring-emerald-500/30'
                              : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          <div className={`leading-none mb-1 font-semibold text-slate-700 ${
                            f.id === 'small' ? 'text-xs' : f.id === 'medium' ? 'text-sm' : f.id === 'large' ? 'text-base' : 'text-lg'
                          }`}>
                            {f.preview}
                          </div>
                          <div className="text-[10px]">{f.label}</div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Translation live sample preview */}
                  <div className="p-2 bg-slate-50 rounded-lg border border-slate-200/70 text-slate-600">
                    <span className={
                      (settings.translationFontSize || 'medium') === 'small'
                        ? 'text-[11px]'
                        : (settings.translationFontSize || 'medium') === 'large'
                        ? 'text-sm'
                        : (settings.translationFontSize || 'medium') === 'xlarge'
                        ? 'text-base'
                        : 'text-xs'
                    }>
                      Contoh: Dengan nama Allah Yang Maha Pengasih lagi Maha Penyayang.
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ACCORDION 3: Tampilan Terjemahan & Latin */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs transition">
            <button
              type="button"
              onClick={() => toggleAccordion('display')}
              className="w-full p-3.5 bg-slate-50/80 hover:bg-slate-100/80 flex items-center justify-between text-left transition cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <Eye size={15} />
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-800 block">
                    Tampilan Terjemahan & Latin
                  </span>
                  <span className="text-[11px] text-emerald-700 font-medium">
                    {settings.showLatin ? 'Latin Aktif' : 'Latin Nonaktif'} • {settings.showTranslation ? 'Terjemahan Aktif' : 'Terjemahan Nonaktif'}
                  </span>
                </div>
              </div>
              <div className="text-slate-400">
                {openAccordions.display ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </div>
            </button>

            {openAccordions.display && (
              <div className="p-3.5 bg-white border-t border-slate-100 space-y-2.5">
                {/* Transliterasi Latin */}
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-slate-800">Transliterasi Latin</div>
                    <p className="text-[11px] text-slate-500">Membantu cara baca lafaz Arab</p>
                  </div>

                  <button
                    type="button"
                    onClick={() => onUpdateSettings({ showLatin: !settings.showLatin })}
                    className={`w-10 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-200 ${
                      settings.showLatin ? 'bg-emerald-600' : 'bg-slate-300'
                    }`}
                  >
                    <div
                      className={`bg-white w-4 h-4 rounded-full shadow-xs transform transition-transform duration-200 ${
                        settings.showLatin ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* Terjemahan Indonesia */}
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-slate-800">Terjemahan Kemenag RI</div>
                    <p className="text-[11px] text-slate-500">Arti ayat dalam Bahasa Indonesia resmi</p>
                  </div>

                  <button
                    type="button"
                    onClick={() => onUpdateSettings({ showTranslation: !settings.showTranslation })}
                    className={`w-10 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-200 ${
                      settings.showTranslation ? 'bg-emerald-600' : 'bg-slate-300'
                    }`}
                  >
                    <div
                      className={`bg-white w-4 h-4 rounded-full shadow-xs transform transition-transform duration-200 ${
                        settings.showTranslation ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ACCORDION 4: Pilihan Qari Murottal */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs transition">
            <button
              type="button"
              onClick={() => toggleAccordion('reciter')}
              className="w-full p-3.5 bg-slate-50/80 hover:bg-slate-100/80 flex items-center justify-between text-left transition cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <Volume2 size={15} />
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-800 block">
                    Pilihan Qari Murottal
                  </span>
                  <span className="text-[11px] text-emerald-700 font-medium">
                    {currentReciter.name}
                  </span>
                </div>
              </div>
              <div className="text-slate-400">
                {openAccordions.reciter ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </div>
            </button>

            {openAccordions.reciter && (
              <div className="p-3.5 bg-white border-t border-slate-100 space-y-2">
                {AUDIO_RECITERS.map((r) => {
                  const isSelected = settings.selectedReciter === r.id;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => onUpdateSettings({ selectedReciter: r.id })}
                      className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between transition cursor-pointer ${
                        isSelected
                          ? 'bg-emerald-50 border-emerald-500 text-emerald-950 font-bold shadow-xs'
                          : 'bg-white border-slate-200/90 text-slate-800 hover:bg-slate-50'
                      }`}
                    >
                      <div>
                        <div className="text-xs">{r.name}</div>
                        <div className="text-[10px] text-slate-400">{r.arabicName}</div>
                      </div>
                      {isSelected && (
                        <div className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center">
                          <Check size={12} strokeWidth={3} />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* SECTION: Memori Cache Audio Murottal + LIHAT & PILIH FILE YANG INGIN DIHAPUS */}
          <div className="p-4 bg-amber-50/70 border border-amber-200/80 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-amber-900 font-bold text-xs">
                <HardDrive size={16} className="text-amber-700" />
                <span>Memori Cache Audio Murottal</span>
              </div>
              <button
                type="button"
                onClick={loadCacheData}
                className="text-amber-700 hover:text-amber-900 p-1 cursor-pointer transition"
                title="Muat Ulang Status Cache"
              >
                <RefreshCw size={13} />
              </button>
            </div>

            <p className="text-[11px] text-amber-800/90 leading-relaxed">
              Audio murottal hanya diunduh dan disimpan di memori browser saat Anda memutarnya agar hemat kuota dan bisa diputar offline.
            </p>

            <div className="p-3 bg-white/90 rounded-xl border border-amber-200 flex items-center justify-between text-xs">
              <span className="text-slate-600">Audio Tersimpan:</span>
              <span className="font-bold text-slate-800">
                {cacheStats.count} file ayat ({cacheStats.formattedSize})
              </span>
            </div>

            {cacheClearedSuccess && (
              <div className="p-2.5 bg-emerald-100 text-emerald-800 rounded-lg text-xs font-semibold flex items-center gap-1.5 animate-in fade-in">
                <Check size={14} />
                <span>{cacheClearedSuccess}</span>
              </div>
            )}

            {/* Action buttons: Lihat & Pilih Audio vs Bersihkan Semua */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsDetailCacheOpen(!isDetailCacheOpen)}
                className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  isDetailCacheOpen 
                    ? 'bg-amber-600 text-white border-amber-600' 
                    : 'bg-white text-amber-900 border-amber-300 hover:bg-amber-100/60'
                }`}
              >
                <Filter size={13} />
                <span>{isDetailCacheOpen ? 'Tutup Daftar Audio' : 'Pilih Audio yang Dihapus'}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowConfirmClearAll(true)}
                disabled={isClearingCache}
                className="py-2 px-3 bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition shadow-2xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                title="Hapus semua file audio murottal yang tersimpan"
              >
                {isClearingCache ? (
                  <div className="w-3.5 h-3.5 border-2 border-rose-600 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Trash2 size={13} />
                )}
                <span>Hapus Semua Cache</span>
              </button>
            </div>

            {/* DAFTAR PILIH AUDIO YANG INGIN DIHAPUS (FITUR BARU) */}
            {isDetailCacheOpen && (
              <div className="mt-3 p-3 bg-white rounded-xl border border-amber-200/90 space-y-3 animate-in fade-in duration-200">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <span>Daftar File Audio di Cache</span>
                    <span className="text-[10px] bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded-md">
                      {cachedItems.length} file
                    </span>
                  </div>

                  {cachedItems.length > 0 && (
                    <button
                      type="button"
                      onClick={handleSelectAll}
                      className="text-[11px] text-emerald-700 hover:text-emerald-800 font-semibold cursor-pointer"
                    >
                      {selectedUrls.length === cachedItems.length ? 'Batal Pilih Semua' : 'Pilih Semua'}
                    </button>
                  )}
                </div>

                {isLoadingCachedItems ? (
                  <div className="py-6 text-center text-xs text-slate-400">
                    <div className="w-5 h-5 border-2 border-amber-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    Memuat daftar file audio...
                  </div>
                ) : cachedItems.length === 0 ? (
                  <div className="py-4 text-center text-xs text-slate-500">
                    Tidak ada file audio di dalam cache.
                  </div>
                ) : (
                  <>
                    <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                      {cachedItems.map((item) => {
                        const isSelected = selectedUrls.includes(item.url);
                        const isPlayingThis = previewAudioUrl === item.url;

                        return (
                          <div
                            key={item.url}
                            className={`p-2 rounded-lg border text-xs flex items-center justify-between gap-2 transition ${
                              isSelected
                                ? 'bg-amber-50/80 border-amber-400'
                                : 'bg-slate-50/60 border-slate-200/80 hover:bg-slate-100/60'
                            }`}
                          >
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <button
                                type="button"
                                onClick={() => handleToggleSelectUrl(item.url)}
                                className="text-slate-500 hover:text-amber-700 cursor-pointer p-0.5"
                              >
                                {isSelected ? (
                                  <CheckSquare size={16} className="text-amber-600" />
                                ) : (
                                  <Square size={16} className="text-slate-400" />
                                )}
                              </button>

                              <div className="flex-1 min-w-0">
                                <div className="font-bold text-slate-800 truncate">
                                  {item.surahName} <span className="text-emerald-700">Ayat {item.ayahNumber}</span>
                                </div>
                                <div className="text-[10px] text-slate-500 truncate">
                                  {item.reciterName} • {item.formattedSize}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1">
                              {/* Preview Audio button */}
                              <button
                                type="button"
                                onClick={() => handleTogglePreviewAudio(item.url)}
                                className={`p-1.5 rounded-lg text-xs transition cursor-pointer ${
                                  isPlayingThis
                                    ? 'bg-amber-600 text-white'
                                    : 'text-slate-500 hover:bg-slate-200'
                                }`}
                                title="Dengarkan audio"
                              >
                                {isPlayingThis ? <Pause size={13} /> : <Play size={13} />}
                              </button>

                              {/* Delete single item */}
                              <button
                                type="button"
                                onClick={() => handleDeleteSingle(item.url)}
                                className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 hover:text-rose-700 transition cursor-pointer"
                                title="Hapus file ini dari cache"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Batch delete bar */}
                    {selectedUrls.length > 0 && (
                      <div className="p-2.5 bg-rose-50 rounded-xl border border-rose-200 flex items-center justify-between gap-2 animate-in fade-in">
                        <span className="text-xs font-semibold text-rose-900">
                          {selectedUrls.length} file dipilih
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowConfirmDeleteSelected(true)}
                          disabled={isDeletingSelected}
                          className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          {isDeletingSelected ? (
                            <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Trash2 size={12} />
                          )}
                          <span>Hapus {selectedUrls.length} File Terpilih</span>
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/60 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
          >
            Selesai
          </button>
        </div>
      </div>

      {/* POPUP KONFIRMASI: Hapus Semua Cache */}
      {showConfirmClearAll && (
        <div 
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setShowConfirmClearAll(false)}
        >
          <div 
            className="bg-white rounded-2xl w-full max-w-sm p-5 shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 size={20} />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-slate-900">
                  Hapus Semua Cache Audio?
                </h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {cacheStats.count > 0 ? (
                    <>
                      Tindakan ini akan menghapus <strong>{cacheStats.count} file</strong> murottal ({cacheStats.formattedSize}) dari memori perangkat browser ini.
                    </>
                  ) : (
                    'Memori cache saat ini belum menyimpan file audio. Apakah Anda tetap ingin me-reset dan membersihkan sisa cache?'
                  )}
                </p>
                <p className="text-[11px] text-amber-700 font-medium">
                  File audio murottal dapat diunduh kembali secara otomatis saat diputar online.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowConfirmClearAll(false)}
                disabled={isClearingCache}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition cursor-pointer disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleExecuteClearAllCache}
                disabled={isClearingCache}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isClearingCache ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Menghapus...</span>
                  </>
                ) : (
                  <>
                    <Trash2 size={13} />
                    <span>Ya, Hapus Semua</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* POPUP KONFIRMASI: Hapus File Terpilih */}
      {showConfirmDeleteSelected && (
        <div 
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setShowConfirmDeleteSelected(false)}
        >
          <div 
            className="bg-white rounded-2xl w-full max-w-sm p-5 shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 size={20} />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-slate-900">
                  Hapus File Audio Terpilih?
                </h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Apakah Anda yakin ingin menghapus <strong>{selectedUrls.length} file</strong> murottal yang dipilih dari cache memori?
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowConfirmDeleteSelected(false)}
                disabled={isDeletingSelected}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition cursor-pointer disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleExecuteDeleteSelected}
                disabled={isDeletingSelected}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isDeletingSelected ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Menghapus...</span>
                  </>
                ) : (
                  <>
                    <Trash2 size={13} />
                    <span>Ya, Hapus {selectedUrls.length} File</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
