import React, { useState } from 'react';
import { 
  X, Settings2, Type, Eye, ChevronDown, ChevronUp, Palette, 
  Sparkles, Check, Flame, MoveVertical
} from 'lucide-react';
import { MaulidReaderSettings } from '@/lib/islami/types/maulid';

interface MaulidSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: MaulidReaderSettings;
  onUpdateSettings: (newSettings: Partial<MaulidReaderSettings>) => void;
}

export const MAULID_ARABIC_FONTS = [
  {
    id: 'amiri' as const,
    name: 'Amiri Classic',
    subname: 'Naskh Tradisional',
    tagline: 'Gaya kaligrafi klasik yang anggun, harakat sangat jelas dan proporsional.',
    sampleArabic: 'يَا رَبِّ صَلِّ عَلَى مُحَمَّدْ يَا رَبِّ صَلِّ عَلَيْهِ وَسَلِّمْ',
    fontFamily: '"Amiri", "Traditional Arabic", serif',
    badge: 'Standar'
  },
  {
    id: 'scheherazade' as const,
    name: 'Scheherazade New',
    subname: 'Tradisi Timur Tengah',
    tagline: 'Gaya naskh lembut dengan kurva melengkung yang nyaman dibaca berlama-lama.',
    sampleArabic: 'يَا رَبِّ صَلِّ عَلَى مُحَمَّدْ يَا رَبِّ صَلِّ عَلَيْهِ وَسَلِّمْ',
    fontFamily: '"Scheherazade New", serif'
  },
  {
    id: 'uthmani' as const,
    name: 'Uthmani Naskh',
    subname: 'Madinah Style',
    tagline: 'Tipografi modern yang tegas, terinspirasi dari percetakan mushaf modern.',
    sampleArabic: 'يَا رَبِّ صَلِّ عَلَى مُحَمَّدْ يَا رَبِّ صَلِّ عَلَيْهِ وَسَلِّمْ',
    fontFamily: '"Noto Naskh Arabic", sans-serif'
  },
  {
    id: 'indopak' as const,
    name: 'IndoPak Madinah',
    subname: 'Lateef Rasm',
    tagline: 'Gaya tulisan tebal dengan ketegasan harakat, sangat populer di Asia Selatan & Tenggara.',
    sampleArabic: 'يَا رَبِّ صَلِّ عَلَى مُحَمَّدْ يَا رَبِّ صَلِّ عَلَيْهِ وَسَلِّمْ',
    fontFamily: '"Lateef", cursive'
  }
];

export const MaulidSettingsModal: React.FC<MaulidSettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings
}) => {
  const [openAccordions, setOpenAccordions] = useState<{
    font: boolean;
    size: boolean;
    display: boolean;
    scroll: boolean;
  }>({
    font: true,
    size: false,
    display: false,
    scroll: false
  });

  const toggleAccordion = (key: keyof typeof openAccordions) => {
    setOpenAccordions((prev) => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  if (!isOpen) return null;

  const currentFont = MAULID_ARABIC_FONTS.find((f) => f.id === settings.arabicFont) || MAULID_ARABIC_FONTS[0];

  const fontSizeLabels: Record<string, string> = {
    small: 'Kecil',
    medium: 'Sedang (Standar)',
    large: 'Besar',
    extralarge: 'Ekstra Besar'
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
                Pengaturan Kitab Maulid
              </h3>
              <p className="text-xs text-slate-500">
                Pilihan variasi font Arab, ukuran teks, transliterasi & fitur baca
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

        {/* Modal Body with Accordions (Identical to Al-Quran UI) */}
        <div className="p-4 sm:p-5 space-y-3.5 overflow-y-auto">
          
          {/* ACCORDION 1: Gaya & Variasi Font Arab */}
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
                  Pilih gaya kaligrafi teks bait maulid. Setiap font memiliki keunikan visual untuk kenyamanan melantunkan shalawat.
                </p>

                <div className="space-y-2">
                  {MAULID_ARABIC_FONTS.map((f) => {
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
                        { id: 'small', label: 'Kecil', preview: 'يَا رَبِّ' },
                        { id: 'medium', label: 'Sedang', preview: 'يَا رَبِّ' },
                        { id: 'large', label: 'Besar', preview: 'يَا رَبِّ' },
                        { id: 'extralarge', label: 'Ekstra', preview: 'يَا رَبِّ' },
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

                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        { id: 'small', label: 'Kecil', preview: 'Aa' },
                        { id: 'medium', label: 'Sedang', preview: 'Aa' },
                        { id: 'large', label: 'Besar', preview: 'Aa' },
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
                            f.id === 'small' ? 'text-xs' : f.id === 'medium' ? 'text-sm' : 'text-base'
                          }`}>
                            {f.preview}
                          </div>
                          <div className="text-[10px]">{f.label}</div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="p-2 bg-slate-50 rounded-lg border border-slate-200/70 text-emerald-800 font-medium italic">
                    <span className={
                      (settings.latinFontSize || 'medium') === 'small'
                        ? 'text-[11px]'
                        : (settings.latinFontSize || 'medium') === 'large'
                        ? 'text-sm'
                        : 'text-xs'
                    }>
                      Contoh: Yā Rabbi shalli \'alā Muhammad, Yā Rabbi shalli \'alayhi wa sallim
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

                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        { id: 'small', label: 'Kecil', preview: 'Arti' },
                        { id: 'medium', label: 'Sedang', preview: 'Arti' },
                        { id: 'large', label: 'Besar', preview: 'Arti' },
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
                            f.id === 'small' ? 'text-xs' : f.id === 'medium' ? 'text-sm' : 'text-base'
                          }`}>
                            {f.preview}
                          </div>
                          <div className="text-[10px]">{f.label}</div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="p-2 bg-slate-50 rounded-lg border border-slate-200/70 text-slate-600">
                    <span className={
                      (settings.translationFontSize || 'medium') === 'small'
                        ? 'text-[11px]'
                        : (settings.translationFontSize || 'medium') === 'large'
                        ? 'text-sm'
                        : 'text-xs'
                    }>
                      Contoh: Wahai Tuhanku, limpahkanlah shalawat dan salam keselamatan atas Baginda Muhammad.
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
                    Tampilan Terjemahan, Latin & Mahalul Qiyam
                  </span>
                  <span className="text-[11px] text-emerald-700 font-medium">
                    {settings.showLatin ? 'Latin Aktif' : 'Latin Nonaktif'} • {settings.showTranslation ? 'Terjemah Aktif' : 'Terjemah Nonaktif'}
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
                    <div className="text-xs font-bold text-slate-800">Terjemahan Indonesia</div>
                    <p className="text-[11px] text-slate-500">Memahami makna luhur pujian dan sirah Rasulullah ﷺ</p>
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

                {/* Highlight Mahalul Qiyam */}
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Flame className="w-4 h-4 text-amber-600 shrink-0" />
                    <div>
                      <div className="text-xs font-bold text-amber-900">Sorot Khusus Mahalul Qiyam</div>
                      <p className="text-[11px] text-amber-700">Beri aksen emas pada fashal berdiri</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onUpdateSettings({ highlightMahalulQiyam: !settings.highlightMahalulQiyam })}
                    className={`w-10 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-200 ${
                      settings.highlightMahalulQiyam ? 'bg-amber-600' : 'bg-slate-300'
                    }`}
                  >
                    <div
                      className={`bg-white w-4 h-4 rounded-full shadow-xs transform transition-transform duration-200 ${
                        settings.highlightMahalulQiyam ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ACCORDION 4: Gulir Otomatis (Auto-Scroll) */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs transition">
            <button
              type="button"
              onClick={() => toggleAccordion('scroll')}
              className="w-full p-3.5 bg-slate-50/80 hover:bg-slate-100/80 flex items-center justify-between text-left transition cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-teal-100 text-teal-700 flex items-center justify-center">
                  <MoveVertical size={15} />
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-800 block">
                    Gulir Otomatis (Auto-Scroll)
                  </span>
                  <span className="text-[11px] text-teal-700 font-medium">
                    {settings.autoScroll ? `Aktif (${settings.scrollSpeed}x)` : 'Nonaktif'}
                  </span>
                </div>
              </div>
              <div className="text-slate-400">
                {openAccordions.scroll ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </div>
            </button>

            {openAccordions.scroll && (
              <div className="p-3.5 bg-white border-t border-slate-100 space-y-3">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-slate-800">Aktifkan Gulir Otomatis</div>
                    <p className="text-[11px] text-slate-500">Layar bergulir perlahan otomatis saat membaca</p>
                  </div>

                  <button
                    type="button"
                    onClick={() => onUpdateSettings({ autoScroll: !settings.autoScroll })}
                    className={`w-10 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-200 ${
                      settings.autoScroll ? 'bg-teal-600' : 'bg-slate-300'
                    }`}
                  >
                    <div
                      className={`bg-white w-4 h-4 rounded-full shadow-xs transform transition-transform duration-200 ${
                        settings.autoScroll ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {settings.autoScroll && (
                  <div className="p-3 bg-teal-50/60 rounded-xl border border-teal-200/80 space-y-2">
                    <div className="flex justify-between text-xs text-teal-900 font-semibold">
                      <span>Kecepatan Gulir</span>
                      <span>{settings.scrollSpeed}x</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="5"
                      step="1"
                      value={settings.scrollSpeed}
                      onChange={(e) => onUpdateSettings({ scrollSpeed: parseInt(e.target.value) })}
                      className="w-full accent-teal-600 cursor-pointer"
                    />
                  </div>
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
    </div>
  );
};
