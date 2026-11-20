'use client';

import { useState, useEffect, Suspense, type MouseEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { 
  ArrowLeft, Search, Moon, CheckCircle2, AlertTriangle, 
  HeartHandshake, BookOpen, X, ArrowRight, Clock, 
  Share2, Copy, Check, Sparkles, ChevronLeft, ChevronRight,
  Info, BookMarked, Layers
} from 'lucide-react';
import { PUASA_DATA, getPuasaByTab, getPuasaById } from '@/lib/islami/data/puasaData';

type TabType = 'types' | 'recommended' | 'invalidators' | 'exemptions';

function PanduanPuasaContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const itemId = searchParams.get('item');

  const [activeTab, setActiveTab] = useState<TabType>(
    (searchParams.get('tab') as TabType) || 'types'
  );
  const [search, setSearch] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  // Accordion toggle states inside detail view
  const [openSectionIds, setOpenSectionIds] = useState<Set<string>>(new Set(['niat', 'penjelasan', 'dalil', 'hukum', 'rujukan']));

  const tabs: { id: TabType; label: string; subLabel: string; icon: any; color: string }[] = [
    { id: 'types', label: 'Jenis-Jenis Puasa', subLabel: 'Ramadan, Sunnah, Nazar, dll', icon: Moon, color: 'text-emerald-600' },
    { id: 'recommended', label: 'Amalan Sunnah', subLabel: 'Sahur, Berbuka, Qur\'an, dll', icon: CheckCircle2, color: 'text-teal-600' },
    { id: 'invalidators', label: 'Hal Membatalkan', subLabel: 'Makan, Minum, Jima\', dll', icon: AlertTriangle, color: 'text-rose-600' },
    { id: 'exemptions', label: 'Rukhsah & Fidyah', subLabel: 'Sakit, Safar, Lansia, dll', icon: HeartHandshake, color: 'text-amber-600' },
  ];

  // Scroll to top on route change
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [itemId, activeTab]);

  const toggleSection = (sectionId: string) => {
    setOpenSectionIds((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  };

  // ================= DEDICATED DETAIL VIEW =================
  if (itemId) {
    const currentItem = getPuasaById(itemId) || PUASA_DATA.find((p) => p.id.includes(itemId) || itemId.includes(p.id));

    if (!currentItem) {
      return (
        <div className="min-h-screen bg-slate-50 text-slate-800 pb-28 -mx-4 sm:-mx-6 lg:-mx-8">
          <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-slate-200">
            <div className="max-w-3xl mx-auto px-4 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between">
              <button
                onClick={() => router.push(`/islami/panduan-puasa?tab=${activeTab}`)}
                className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-emerald-700 transition cursor-pointer"
              >
                <ArrowLeft size={18} />
                <span>Kembali ke Panduan Puasa</span>
              </button>
            </div>
          </div>
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 text-center">
            <h2 className="text-xl font-bold text-slate-800 mb-2">Panduan Tidak Ditemukan</h2>
            <p className="text-sm text-slate-500 mb-6">Data materi puasa yang Anda cari tidak tersedia.</p>
            <button
              onClick={() => router.push('/islami/panduan-puasa')}
              className="px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 transition cursor-pointer"
            >
              Lihat Semua Panduan Puasa
            </button>
          </div>
        </div>
      );
    }

    const currentTabItems = getPuasaByTab(currentItem.tab);
    const currentIdx = currentTabItems.findIndex((item) => item.id === currentItem.id);
    const prevItem = currentIdx > 0 ? currentTabItems[currentIdx - 1] : null;
    const nextItem = currentIdx < currentTabItems.length - 1 ? currentTabItems[currentIdx + 1] : null;

    const getTabTitle = (tab: TabType) => {
      switch (tab) {
        case 'types': return 'Jenis-Jenis Puasa';
        case 'recommended': return 'Amalan Sunnah Puasa';
        case 'invalidators': return 'Hal yang Membatalkan Puasa';
        case 'exemptions': return 'Rukhsah & Fidyah Puasa';
      }
    };

    const handleCopyAll = () => {
      let text = `== ${currentItem.title} (${currentItem.badge}) ==\n\n${currentItem.summary}\n\n`;
      
      if (currentItem.detailExplanation && currentItem.detailExplanation.length > 0) {
        text += `[Penjelasan & Ketentuan]:\n` + currentItem.detailExplanation.map((p, i) => `${i + 1}. ${p}`).join('\n') + `\n\n`;
      }

      if (currentItem.niatList && currentItem.niatList.length > 0) {
        text += `[Lafadz Niat]:\n` + currentItem.niatList.map((n) => `${n.name}\n${n.arabic}\nLatin: ${n.latin}\nArtinya: "${n.translation}"`).join('\n\n') + `\n\n`;
      }

      if (currentItem.doaList && currentItem.doaList.length > 0) {
        text += `[Doa Terkait]:\n` + currentItem.doaList.map((d) => `${d.name}\n${d.arabic}\nLatin: ${d.latin}\nArtinya: "${d.translation}"`).join('\n\n') + `\n\n`;
      }

      if (currentItem.dalilList && currentItem.dalilList.length > 0) {
        text += `[Dalil & Rujukan]:\n` + currentItem.dalilList.map((d) => `${d.source}\n${d.arabic}\nLatin: ${d.latin}\nArtinya: "${d.translation}"`).join('\n\n') + `\n\n`;
      }

      text += `(Sumber: Panduan & Fiqih Puasa)`;

      navigator.clipboard.writeText(text);
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
    };

    const handleShare = async () => {
      const shareData = {
        title: `${currentItem.title} - Panduan Puasa`,
        text: `${currentItem.title}: ${currentItem.summary}`,
        url: window.location.href,
      };
      if (navigator.share) {
        try {
          await navigator.share(shareData);
        } catch {
          // cancelled
        }
      } else {
        handleCopyAll();
      }
    };

    const handleCopySnippet = (title: string, arabic: string, latin: string, translation: string, id: string) => {
      const text = `[${title}]\n\n${arabic}\n\nLatin:\n${latin}\n\nArtinya:\n"${translation}"\n\n(Sumber: Panduan & Fiqih Puasa)`;
      navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    };

    return (
      <div className="min-h-screen bg-slate-50 text-slate-800 pb-28 -mx-4 sm:-mx-6 lg:-mx-8">
        {/* Top Header */}
        <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-slate-200">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <button
                onClick={() => router.push(`/islami/panduan-puasa?tab=${currentItem.tab}`)}
                className="p-1.5 text-slate-500 hover:text-emerald-700 hover:bg-slate-100 rounded-xl transition cursor-pointer shrink-0"
                title="Kembali ke Panduan Puasa"
              >
                <ArrowLeft size={18} />
              </button>
              <div className="min-w-0">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 block truncate">
                  {getTabTitle(currentItem.tab)}
                </span>
                <h1 className="text-base sm:text-lg font-bold text-slate-900 truncate">
                  {currentItem.title}
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={handleCopyAll}
                className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-xl border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/60 text-slate-700 hover:text-emerald-800 transition cursor-pointer shadow-sm"
                title="Salin Semua Materi"
              >
                {copiedAll ? (
                  <>
                    <Check size={14} className="text-emerald-600" />
                    <span>Tersalin</span>
                  </>
                ) : (
                  <>
                    <Copy size={14} />
                    <span className="hidden sm:inline">Salin Lengkap</span>
                  </>
                )}
              </button>
              <button
                onClick={handleShare}
                className="p-1.5 rounded-xl border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/60 text-slate-700 hover:text-emerald-800 transition cursor-pointer shadow-sm"
                title="Bagikan"
              >
                <Share2 size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Detail Content Container */}
        <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-5 sm:pt-6 space-y-4 sm:space-y-5">
          {/* Main Hero Card */}
          <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200/90 shadow-sm p-5 sm:p-6 space-y-3.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-1 bg-emerald-600 text-white rounded-lg text-xs font-bold shadow-sm">
                {currentItem.badge}
              </span>
              <span className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg text-xs font-medium">
                {getTabTitle(currentItem.tab)}
              </span>
            </div>

            <div>
              <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 mb-2">
                {currentItem.title}
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                {currentItem.summary}
              </p>
            </div>

            {currentItem.timeInfo && (
              <div className="flex items-start gap-2.5 p-3 sm:p-3.5 bg-emerald-50/50 rounded-xl border border-emerald-100 text-xs text-slate-700">
                <Clock size={16} className="text-emerald-700 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-emerald-950 block mb-0.5">Waktu / Ketentuan Pelaksanaan:</span>
                  <p className="leading-relaxed text-slate-700">{currentItem.timeInfo}</p>
                </div>
              </div>
            )}
          </div>

          {/* Section: Lafadz Niat (jika ada) */}
          {currentItem.niatList && currentItem.niatList.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                  <Sparkles size={14} className="text-emerald-600" />
                  <span>Lafadz Niat Puasa ({currentItem.niatList.length} Pilihan):</span>
                </h3>
              </div>

              <div className="space-y-3">
                {currentItem.niatList.map((niat, nIdx) => {
                  const isCopied = copiedId === `niat-${niat.id}`;
                  return (
                    <div
                      key={niat.id || nIdx}
                      className="bg-white rounded-2xl sm:rounded-3xl border border-emerald-200/90 shadow-md ring-1 ring-emerald-100 p-5 sm:p-6 space-y-4"
                    >
                      <div className="flex items-center justify-between pb-3 border-b border-emerald-100/80">
                        <span className="text-xs font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-100">
                          {niat.name}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopySnippet(niat.name, niat.arabic, niat.latin, niat.translation, `niat-${niat.id}`)}
                          className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 hover:text-emerald-900 cursor-pointer p-1.5 rounded-lg hover:bg-emerald-50 transition"
                        >
                          {isCopied ? (
                            <>
                              <Check size={14} className="text-emerald-600" />
                              <span>Tersalin</span>
                            </>
                          ) : (
                            <>
                              <Copy size={14} />
                              <span>Salin Niat</span>
                            </>
                          )}
                        </button>
                      </div>

                      {/* Arabic */}
                      <div className="py-2">
                        <p
                          className="font-serif text-2xl sm:text-3xl lg:text-4xl text-emerald-950 text-right leading-loose sm:leading-[2.6] select-text"
                          dir="rtl"
                        >
                          {niat.arabic}
                        </p>
                      </div>

                      {/* Latin */}
                      <div className="p-3.5 sm:p-4 bg-emerald-50/50 rounded-2xl border border-emerald-100/80 space-y-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 block">
                          Transliterasi Latin:
                        </span>
                        <p className="text-xs sm:text-sm font-mono text-emerald-900 font-medium leading-relaxed select-text">
                          {niat.latin}
                        </p>
                      </div>

                      {/* Translation */}
                      <div className="p-3.5 sm:p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                          Artinya (Terjemahan):
                        </span>
                        <p className="text-xs sm:text-sm text-slate-800 leading-relaxed italic border-l-2 border-emerald-500 pl-3 select-text">
                          "{niat.translation}"
                        </p>
                      </div>

                      {niat.note && (
                        <div className="p-3 bg-amber-50/80 rounded-xl border border-amber-200/70 text-xs text-amber-900 flex items-start gap-2">
                          <Info size={15} className="text-amber-700 shrink-0 mt-0.5" />
                          <p className="leading-relaxed">{niat.note}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Section: Doa Terkait (jika ada) */}
          {currentItem.doaList && currentItem.doaList.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                  <Sparkles size={14} className="text-teal-600" />
                  <span>Lafadz Doa Terkait:</span>
                </h3>
              </div>

              <div className="space-y-3">
                {currentItem.doaList.map((doa, dIdx) => {
                  const isCopied = copiedId === `doa-${doa.id}`;
                  return (
                    <div
                      key={doa.id || dIdx}
                      className="bg-white rounded-2xl sm:rounded-3xl border border-teal-200/90 shadow-md ring-1 ring-teal-100 p-5 sm:p-6 space-y-4"
                    >
                      <div className="flex items-center justify-between pb-3 border-b border-teal-100/80">
                        <span className="text-xs font-bold text-teal-800 bg-teal-50 px-2.5 py-1 rounded-lg border border-teal-100">
                          {doa.name}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopySnippet(doa.name, doa.arabic, doa.latin, doa.translation, `doa-${doa.id}`)}
                          className="inline-flex items-center gap-1.5 text-xs font-bold text-teal-700 hover:text-teal-900 cursor-pointer p-1.5 rounded-lg hover:bg-teal-50 transition"
                        >
                          {isCopied ? (
                            <>
                              <Check size={14} className="text-teal-600" />
                              <span>Tersalin</span>
                            </>
                          ) : (
                            <>
                              <Copy size={14} />
                              <span>Salin Doa</span>
                            </>
                          )}
                        </button>
                      </div>

                      <div className="py-2">
                        <p
                          className="font-serif text-2xl sm:text-3xl text-teal-950 text-right leading-loose sm:leading-[2.6] select-text"
                          dir="rtl"
                        >
                          {doa.arabic}
                        </p>
                      </div>

                      <div className="p-3.5 sm:p-4 bg-teal-50/50 rounded-2xl border border-teal-100/80 space-y-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-teal-800 block">
                          Transliterasi Latin:
                        </span>
                        <p className="text-xs sm:text-sm font-mono text-teal-900 font-medium leading-relaxed select-text">
                          {doa.latin}
                        </p>
                      </div>

                      <div className="p-3.5 sm:p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                          Artinya (Terjemahan):
                        </span>
                        <p className="text-xs sm:text-sm text-slate-800 leading-relaxed italic border-l-2 border-teal-500 pl-3 select-text">
                          "{doa.translation}"
                        </p>
                      </div>

                      {doa.note && (
                        <div className="p-3 bg-amber-50/80 rounded-xl border border-amber-200/70 text-xs text-amber-900 flex items-start gap-2">
                          <Info size={15} className="text-amber-700 shrink-0 mt-0.5" />
                          <p className="leading-relaxed">{doa.note}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Section: Penjelasan & Fiqih Lengkap */}
          {currentItem.detailExplanation && currentItem.detailExplanation.length > 0 && (
            <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200/90 shadow-sm p-5 sm:p-6 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5 pb-2 border-b border-slate-100">
                <BookOpen size={15} className="text-emerald-600" />
                <span>Penjelasan & Ketentuan Fiqih Lengkap:</span>
              </h3>

              <div className="space-y-2.5 pt-1">
                {currentItem.detailExplanation.map((point, pIdx) => (
                  <div key={pIdx} className="flex items-start gap-3">
                    <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                      {pIdx + 1}
                    </span>
                    <p className="text-xs sm:text-sm text-slate-700 leading-relaxed flex-1">
                      {point}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section: Dalil & Rujukan Al-Qur'an / Hadits */}
          {currentItem.dalilList && currentItem.dalilList.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                  <BookMarked size={14} className="text-emerald-600" />
                  <span>Dalil Al-Qur'an & As-Sunnah ({currentItem.dalilList.length} Dalil):</span>
                </h3>
              </div>

              <div className="space-y-3 sm:space-y-4">
                {currentItem.dalilList.map((dalil, dIdx) => {
                  const isCopied = copiedId === `dalil-${dIdx}`;
                  return (
                    <div
                      key={dIdx}
                      className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200/90 shadow-sm p-5 sm:p-6 space-y-4"
                    >
                      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                            dalil.type === 'quran'
                              ? 'bg-emerald-100 text-emerald-800'
                              : dalil.type === 'hadith'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}>
                            {dalil.type === 'quran' ? "Al-Qur'an" : dalil.type === 'hadith' ? 'Hadits Shahih' : 'Kaidah Fiqih'}
                          </span>
                          <span className="font-bold text-xs sm:text-sm text-slate-900">
                            {dalil.source}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleCopySnippet(dalil.source, dalil.arabic, dalil.latin, dalil.translation, `dalil-${dIdx}`)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-emerald-800 cursor-pointer p-1 rounded-lg hover:bg-slate-100 transition"
                          title="Salin Dalil Ini"
                        >
                          {isCopied ? (
                            <>
                              <Check size={13} className="text-emerald-600" />
                              <span className="text-emerald-600 font-bold">Tersalin</span>
                            </>
                          ) : (
                            <>
                              <Copy size={13} />
                              <span className="hidden sm:inline">Salin</span>
                            </>
                          )}
                        </button>
                      </div>

                      {/* Arabic recitation */}
                      <div className="py-2">
                        <p
                          className="font-serif text-2xl sm:text-3xl text-emerald-950 text-right leading-loose sm:leading-[2.6] select-text"
                          dir="rtl"
                        >
                          {dalil.arabic}
                        </p>
                      </div>

                      {/* Latin */}
                      <div className="p-3 sm:p-3.5 bg-emerald-50/50 rounded-2xl border border-emerald-100/70 space-y-0.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 block">
                          Transliterasi Latin:
                        </span>
                        <p className="text-xs sm:text-sm font-mono text-emerald-900 font-medium leading-relaxed select-text">
                          {dalil.latin}
                        </p>
                      </div>

                      {/* Translation */}
                      <div className="p-3 sm:p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-0.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                          Artinya (Terjemahan):
                        </span>
                        <p className="text-xs sm:text-sm text-slate-800 leading-relaxed italic border-l-2 border-emerald-500 pl-3 select-text">
                          "{dalil.translation}"
                        </p>
                      </div>

                      {dalil.explanation && (
                        <p className="text-xs text-slate-500 leading-relaxed pt-1">
                          <span className="font-semibold text-slate-700">Keterangan:</span> {dalil.explanation}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Section: Rujukan Kitab & Sumber Fatwa */}
          {currentItem.rujukan && currentItem.rujukan.length > 0 && (
            <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200/90 shadow-sm p-4 sm:p-5 space-y-2.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Layers size={14} className="text-emerald-600" />
                <span>Rujukan Kitab & Literatur Fiqih:</span>
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {currentItem.rujukan.map((ref, rIdx) => (
                  <span
                    key={rIdx}
                    className="px-2.5 py-1 bg-slate-100 border border-slate-200/80 text-slate-700 rounded-lg text-xs font-medium"
                  >
                    {ref}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Quick Nav Between Items in same Tab */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            {prevItem ? (
              <button
                onClick={() => router.push(`/islami/panduan-puasa?item=${prevItem.id}&tab=${currentItem.tab}`)}
                className="p-3 bg-white hover:bg-slate-50 border border-slate-200 rounded-2xl text-left transition cursor-pointer shadow-sm group flex items-center gap-2"
              >
                <ChevronLeft size={18} className="text-slate-400 group-hover:text-emerald-600 transition shrink-0" />
                <div className="min-w-0">
                  <span className="text-[10px] text-slate-400 block font-medium">Sebelumnya</span>
                  <span className="text-xs font-bold text-slate-800 group-hover:text-emerald-700 truncate block">
                    {prevItem.title}
                  </span>
                </div>
              </button>
            ) : <div />}

            {nextItem ? (
              <button
                onClick={() => router.push(`/islami/panduan-puasa?item=${nextItem.id}&tab=${currentItem.tab}`)}
                className="p-3 bg-white hover:bg-slate-50 border border-slate-200 rounded-2xl text-right transition cursor-pointer shadow-sm group flex items-center justify-end gap-2"
              >
                <div className="min-w-0">
                  <span className="text-[10px] text-slate-400 block font-medium">Berikutnya</span>
                  <span className="text-xs font-bold text-slate-800 group-hover:text-emerald-700 truncate block">
                    {nextItem.title}
                  </span>
                </div>
                <ChevronRight size={18} className="text-slate-400 group-hover:text-emerald-600 transition shrink-0" />
              </button>
            ) : <div />}
          </div>

          {/* Back button to full guide */}
          <div className="pt-3 text-center">
            <button
              onClick={() => router.push(`/islami/panduan-puasa?tab=${currentItem.tab}`)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs sm:text-sm font-bold rounded-xl transition cursor-pointer"
            >
              <ArrowLeft size={16} />
              <span>Kembali ke Panduan Puasa Lengkap</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ================= MAIN LIST VIEW =================
  const currentTabItems = getPuasaByTab(activeTab);

  const filteredItems = currentTabItems.filter((item) => {
    const q = search.toLowerCase();
    const title = item.title.toLowerCase();
    const summary = item.summary.toLowerCase();
    const badge = item.badge.toLowerCase();
    return title.includes(q) || summary.includes(q) || badge.includes(q);
  });

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-28 -mx-4 sm:-mx-6 lg:-mx-8">
      {/* Top Sticky Header */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Link
              href="/islami"
              className="p-1.5 text-slate-500 hover:text-emerald-700 hover:bg-slate-100 rounded-xl transition"
              title="Kembali ke Dashboard"
            >
              <ArrowLeft size={18} />
            </Link>
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-emerald-100 text-emerald-700 rounded-lg shrink-0">
                <Moon size={16} />
              </span>
              <h1 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">
                Panduan & Fiqih Puasa
              </h1>
            </div>
          </div>
        </div>

        {/* Tab Selection & Search Container */}
        <div className="max-w-4xl mx-auto px-4 sm:px-6 pb-2.5 sm:pb-3 space-y-2">
          {/* Segmented Tab Control */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 bg-slate-100/90 p-1.5 rounded-2xl">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-2 px-2.5 rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer flex items-center justify-center gap-1.5 text-center ${
                    isActive
                      ? 'bg-white text-emerald-800 shadow-sm ring-1 ring-emerald-200'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                  }`}
                >
                  <Icon size={14} className={isActive ? 'text-emerald-600' : 'text-slate-400'} />
                  <span className="truncate">{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Cari dalam ${tabs.find((t) => t.id === activeTab)?.label.toLowerCase()}...`}
              className="w-full pl-8 pr-8 py-1.5 sm:py-2 bg-slate-100/80 hover:bg-slate-100 focus:bg-white text-xs sm:text-sm rounded-xl border border-transparent focus:border-emerald-500 focus:outline-none transition shadow-sm"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
                title="Hapus pencarian"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main List Body: Compact Uniform Buttons without Subtitles */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-4 sm:pt-5 space-y-3">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Daftar {tabs.find((t) => t.id === activeTab)?.label} ({filteredItems.length} Materi):
          </span>
          <span className="text-[11px] text-slate-400">
            Klik untuk melihat materi & dalil lengkap
          </span>
        </div>

        {filteredItems.length === 0 ? (
          <div className="py-16 text-center text-slate-500 bg-white rounded-2xl border border-slate-200">
            <BookOpen size={32} className="mx-auto text-slate-300 mb-2" />
            <p className="font-medium text-slate-700">Tidak ada materi yang cocok</p>
            <p className="text-xs text-slate-400 mt-1">Coba gunakan kata kunci pencarian lain</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {filteredItems.map((item, idx) => (
              <Link
                key={item.id || idx}
                href={`/islami/panduan-puasa?item=${item.id}&tab=${activeTab}`}
                className="group px-4 py-3 sm:py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl sm:rounded-2xl transition shadow-sm hover:shadow-md flex items-center justify-between gap-3 cursor-pointer"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span className="w-7 h-7 rounded-lg bg-emerald-700/90 text-emerald-100 text-xs font-bold flex items-center justify-center shrink-0">
                    {item.order || idx + 1}
                  </span>
                  <span className="font-bold text-sm sm:text-base text-white truncate group-hover:text-emerald-50">
                    {item.title}
                  </span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="px-2 py-0.5 sm:py-1 bg-emerald-700/80 text-emerald-100 rounded-md text-[11px] font-semibold whitespace-nowrap">
                    {item.badge}
                  </span>
                  <ArrowRight size={16} className="text-emerald-200 group-hover:text-white group-hover:translate-x-0.5 transition" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};


export default function PanduanPuasaPage() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-slate-400 text-sm">Memuat...</div>}>
      <PanduanPuasaContent />
    </Suspense>
  );
}
