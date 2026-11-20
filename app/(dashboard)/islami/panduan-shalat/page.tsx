'use client';

import { useState, useEffect, Suspense, type MouseEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { 
  ArrowLeft, Search, Compass, BookOpen, Sparkles, Check, 
  ChevronDown, ChevronUp, Copy, X, ArrowRight, Clock, 
  Share2, Info, ChevronRight, ChevronLeft
} from 'lucide-react';
import { getNiatById, getFardhuNiatList, getSunnahNiatList } from '@/lib/islami/data/niatShalatData';

interface PrayerStepItem {
  id: string;
  order: number;
  title: string | { id?: string; en?: string };
  description?: string | { id?: string; en?: string };
  context?: string | { id?: string; en?: string };
  content?: {
    arabic?: string;
    latin?: string;
    translation?: string | { id?: string; en?: string };
  };
}

function PanduanShalatContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const niatId = searchParams.get('niat');

  const [activeTab, setActiveTab] = useState<'fardhu' | 'sunnah'>(
    (searchParams.get('tab') as 'fardhu' | 'sunnah') || 'fardhu'
  );
  const [fardhuSteps, setFardhuSteps] = useState<PrayerStepItem[]>([]);
  const [sunnahList, setSunnahList] = useState<PrayerStepItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // For Detail Niat View Accordions & Copy
  const [expandedVariantIds, setExpandedVariantIds] = useState<Set<string>>(new Set());
  const [copiedVariantId, setCopiedVariantId] = useState<string | null>(null);
  const [copiedAllNiat, setCopiedAllNiat] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch('/data/islamic/prayer-guide/data/obligatory-prayer.json')
        .then((r) => r.json())
        .catch(() => ({ items: [] })),
      fetch('/data/islamic/sunnah-prayers/data/sunnah-prayers.json')
        .then((r) => r.json())
        .catch(() => ({ items: [] })),
    ])
      .then(([fardhuData, sunnahData]) => {
        const fardhu = fardhuData.items || [];
        const sunnah = sunnahData.items || [];
        setFardhuSteps(fardhu);
        setSunnahList(sunnah);
        if (fardhu.length > 0) {
          setExpandedIds(new Set([fardhu[0].id]));
        }
      })
      .finally(() => setLoading(false));
  }, []);

  // Initialize expanded variants when niatId changes & scroll to top
  useEffect(() => {
    if (niatId) {
      const current = getNiatById(niatId);
      if (current && current.variants.length > 0) {
        // Expand all variants by default so users can read them immediately, or first if many
        setExpandedVariantIds(new Set(current.variants.map((v) => v.id)));
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [niatId]);

  const getText = (val: any): string => {
    if (!val) return '';
    if (typeof val === 'string') return val;
    return val.id || val.en || '';
  };

  const currentItems = activeTab === 'fardhu' ? fardhuSteps : sunnahList;

  const filtered = currentItems.filter((item) => {
    const q = search.toLowerCase();
    const title = getText(item.title).toLowerCase();
    const desc = getText(item.description).toLowerCase();
    const translation = getText(item.content?.translation).toLowerCase();
    return title.includes(q) || desc.includes(q) || translation.includes(q);
  });

  const toggleAccordion = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const isAllExpanded = filtered.length > 0 && filtered.every((item) => expandedIds.has(item.id));

  const toggleExpandAll = () => {
    if (isAllExpanded) {
      setExpandedIds(new Set());
    } else {
      setExpandedIds(new Set(filtered.map((item) => item.id)));
    }
  };

  const handleCopy = (item: PrayerStepItem, e?: MouseEvent) => {
    if (e) e.stopPropagation();
    const titleStr = getText(item.title);
    const arabic = item.content?.arabic || '';
    const latin = item.content?.latin || '';
    const trans = getText(item.content?.translation);
    const text = `[${titleStr}]\n${arabic ? `${arabic}\n\n` : ''}${latin ? `Latin: ${latin}\n` : ''}${trans ? `Arti: "${trans}"` : ''}`;
    navigator.clipboard.writeText(text);
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // ================= DEDICATED NIAT DETAIL VIEW =================
  if (niatId) {
    const currentNiat = getNiatById(niatId);

    if (!currentNiat) {
      return (
        <div className="min-h-screen bg-slate-50 text-slate-800 pb-28 -mx-4 sm:-mx-6 lg:-mx-8">
          <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-slate-200">
            <div className="max-w-3xl mx-auto px-4 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between">
              <button
                onClick={() => router.push('/islami/panduan-shalat')}
                className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-emerald-700 transition cursor-pointer"
              >
                <ArrowLeft size={18} />
                <span>Kembali ke Panduan Shalat</span>
              </button>
            </div>
          </div>
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 text-center">
            <h2 className="text-xl font-bold text-slate-800 mb-2">Niat Shalat Tidak Ditemukan</h2>
            <p className="text-sm text-slate-500 mb-6">Data niat shalat yang Anda cari tidak tersedia.</p>
            <button
              onClick={() => router.push('/islami/panduan-shalat')}
              className="px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 transition cursor-pointer"
            >
              Lihat Semua Panduan Shalat
            </button>
          </div>
        </div>
      );
    }

    const categoryList = currentNiat.category === 'fardhu' ? getFardhuNiatList() : getSunnahNiatList();
    const currentIdx = categoryList.findIndex((item) => item.id === currentNiat.id);
    const prevNiat = currentIdx > 0 ? categoryList[currentIdx - 1] : null;
    const nextNiat = currentIdx < categoryList.length - 1 ? categoryList[currentIdx + 1] : null;

    const toggleVariantAccordion = (variantId: string) => {
      setExpandedVariantIds((prev) => {
        const next = new Set(prev);
        if (next.has(variantId)) {
          next.delete(variantId);
        } else {
          next.add(variantId);
        }
        return next;
      });
    };

    const isAllVariantsExpanded =
      currentNiat.variants.length > 0 &&
      currentNiat.variants.every((v) => expandedVariantIds.has(v.id));

    const toggleAllVariants = () => {
      if (isAllVariantsExpanded) {
        setExpandedVariantIds(new Set());
      } else {
        setExpandedVariantIds(new Set(currentNiat.variants.map((v) => v.id)));
      }
    };

    const handleCopyVariant = (v: typeof currentNiat.variants[0], e?: MouseEvent) => {
      if (e) e.stopPropagation();
      const text = `[${currentNiat.name} - ${v.name}]\n\n${v.arabic}\n\nLatin:\n${v.latin}\n\nArtinya:\n"${v.translation}"${v.note ? `\n\nCatatan:\n${v.note}` : ''}\n\n(Sumber: Panduan Shalat)`;
      navigator.clipboard.writeText(text);
      setCopiedVariantId(v.id);
      setTimeout(() => setCopiedVariantId(null), 2000);
    };

    const handleCopyAll = () => {
      const parts = currentNiat.variants.map((v) => 
        `[${v.name}]\n${v.arabic}\nLatin: ${v.latin}\nArtinya: "${v.translation}"${v.note ? `\nCatatan: ${v.note}` : ''}`
      );
      const text = `== ${currentNiat.name} (${currentNiat.rakaat}) ==\n\n${parts.join('\n\n---\n\n')}\n\n(Sumber: Panduan Shalat)`;
      navigator.clipboard.writeText(text);
      setCopiedAllNiat(true);
      setTimeout(() => setCopiedAllNiat(false), 2000);
    };

    const handleShareAll = async () => {
      const shareData = {
        title: `${currentNiat.name} - Panduan Niat Shalat`,
        text: `Lafadz Niat ${currentNiat.name} (${currentNiat.rakaat}):\n\n${currentNiat.variants[0].arabic}\n\n"${currentNiat.variants[0].translation}"`,
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

    return (
      <div className="min-h-screen bg-slate-50 text-slate-800 pb-28 -mx-4 sm:-mx-6 lg:-mx-8">
        {/* Detail Top Header */}
        <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-slate-200">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <button
                onClick={() => router.push(`/islami/panduan-shalat?tab=${currentNiat.category}`)}
                className="p-1.5 text-slate-500 hover:text-emerald-700 hover:bg-slate-100 rounded-xl transition cursor-pointer shrink-0"
                title="Kembali ke Panduan Shalat"
              >
                <ArrowLeft size={18} />
              </button>
              <div className="min-w-0">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 block">
                  {currentNiat.category === 'fardhu' ? 'Niat Shalat Fardhu' : 'Niat Shalat Sunnah'}
                </span>
                <h1 className="text-base sm:text-lg font-bold text-slate-900 truncate">
                  {currentNiat.name}
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={handleCopyAll}
                className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-xl border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/60 text-slate-700 hover:text-emerald-800 transition cursor-pointer shadow-sm"
                title="Salin Semua Niat"
              >
                {copiedAllNiat ? (
                  <>
                    <Check size={14} className="text-emerald-600" />
                    <span>Tersalin</span>
                  </>
                ) : (
                  <>
                    <Copy size={14} />
                    <span className="hidden sm:inline">Salin Semua</span>
                  </>
                )}
              </button>
              <button
                onClick={handleShareAll}
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
          {/* Main Info Card */}
          <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200/90 shadow-sm p-5 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-1 bg-emerald-100/80 text-emerald-800 rounded-lg text-xs font-bold">
                {currentNiat.rakaat}
              </span>
              <span className="px-2.5 py-1 bg-teal-50 text-teal-700 border border-teal-100 rounded-lg text-xs font-semibold">
                {currentNiat.category === 'fardhu' ? 'Wajib (Fardhu)' : 'Sunnah'}
              </span>
              {currentNiat.variants.length > 1 && (
                <span className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg text-xs font-medium">
                  {currentNiat.variants.length} Macam Niat
                </span>
              )}
            </div>

            <div>
              <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 mb-1.5">
                {currentNiat.name}
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                {currentNiat.description}
              </p>
            </div>

            {currentNiat.timeInfo && (
              <div className="flex items-start gap-2.5 p-3 sm:p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 text-xs text-slate-600">
                <Clock size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-slate-800 block mb-0.5">Waktu Pelaksanaan:</span>
                  <p className="leading-relaxed">{currentNiat.timeInfo}</p>
                </div>
              </div>
            )}
          </div>

          {/* Header & Toggle for Accordion List */}
          <div className="flex items-center justify-between px-1 pt-1">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
              <Sparkles size={14} className="text-emerald-600" />
              <span>
                {currentNiat.variants.length > 1 
                  ? `Lafadz Niat (${currentNiat.variants.length} Macam/Posisi):`
                  : 'Lafadz Niat:'}
              </span>
            </h3>
            {currentNiat.variants.length > 1 && (
              <button
                type="button"
                onClick={toggleAllVariants}
                className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 cursor-pointer bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200/70 hover:bg-emerald-100/60 transition"
              >
                {isAllVariantsExpanded ? (
                  <>
                    <ChevronUp size={14} />
                    <span>Tutup Semua</span>
                  </>
                ) : (
                  <>
                    <ChevronDown size={14} />
                    <span>Buka Semua</span>
                  </>
                )}
              </button>
            )}
          </div>

          {/* Individual Accordion Cards for each Variant */}
          <div className="space-y-3 sm:space-y-4">
            {currentNiat.variants.map((v, vIdx) => {
              const isExpanded = expandedVariantIds.has(v.id);
              const isCopied = copiedVariantId === v.id;

              return (
                <div
                  key={v.id || vIdx}
                  className={`bg-white rounded-2xl sm:rounded-3xl border transition-all duration-200 overflow-hidden ${
                    isExpanded
                      ? 'border-emerald-300 shadow-md ring-1 ring-emerald-100'
                      : 'border-slate-200/90 shadow-sm hover:border-slate-300 hover:shadow-sm'
                  }`}
                >
                  {/* Accordion Card Header */}
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleVariantAccordion(v.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleVariantAccordion(v.id);
                      }
                    }}
                    className="w-full p-4 sm:p-5 flex items-center justify-between gap-3 text-left cursor-pointer hover:bg-slate-50/70 transition select-none"
                    aria-expanded={isExpanded}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div
                        className={`w-8 h-8 rounded-xl text-xs font-bold flex items-center justify-center shrink-0 transition ${
                          isExpanded
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'bg-emerald-50 text-emerald-800 border border-emerald-100'
                        }`}
                      >
                        {vIdx + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="font-bold text-slate-900 text-sm sm:text-base truncate">
                          {v.name}
                        </h4>
                        {!isExpanded && (
                          <p className="text-xs text-slate-500 truncate mt-0.5">
                            {v.latin}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => handleCopyVariant(v, e)}
                        className="p-1.5 sm:px-2.5 sm:py-1 rounded-xl border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50 text-slate-600 hover:text-emerald-800 text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                        title="Salin Lafadz Niat Ini"
                      >
                        {isCopied ? (
                          <>
                            <Check size={13} className="text-emerald-600" />
                            <span className="hidden sm:inline text-emerald-600 font-bold">Tersalin</span>
                          </>
                        ) : (
                          <>
                            <Copy size={13} />
                            <span className="hidden sm:inline">Salin</span>
                          </>
                        )}
                      </button>
                      <div
                        className={`p-1.5 rounded-xl transition ${
                          isExpanded
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'
                        }`}
                      >
                        {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </div>
                    </div>
                  </div>

                  {/* Accordion Card Body */}
                  {isExpanded && (
                    <div className="px-4 sm:px-6 pb-5 pt-1 border-t border-slate-100 space-y-4 ">
                      {/* Arabic Text */}
                      <div className="py-2.5 sm:py-3">
                        <p
                          className="font-serif text-2xl sm:text-3xl lg:text-4xl text-emerald-950 text-right leading-loose sm:leading-[2.6] select-text"
                          dir="rtl"
                        >
                          {v.arabic}
                        </p>
                      </div>

                      {/* Latin Transliteration */}
                      <div className="p-3.5 sm:p-4 bg-emerald-50/50 rounded-2xl border border-emerald-100/80 space-y-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 block">
                          Transliterasi Latin:
                        </span>
                        <p className="text-xs sm:text-sm font-mono text-emerald-900 font-medium leading-relaxed select-text">
                          {v.latin}
                        </p>
                      </div>

                      {/* Indonesian Translation */}
                      <div className="p-3.5 sm:p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                          Artinya (Terjemahan):
                        </span>
                        <p className="text-xs sm:text-sm text-slate-800 leading-relaxed italic border-l-2 border-emerald-500 pl-3 select-text">
                          "{v.translation}"
                        </p>
                      </div>

                      {/* Note / Keutamaan if available */}
                      {v.note && (
                        <div className="p-3 bg-amber-50/80 rounded-xl border border-amber-200/70 text-xs text-amber-900 flex items-start gap-2">
                          <Info size={15} className="text-amber-700 shrink-0 mt-0.5" />
                          <p className="leading-relaxed">{v.note}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Quick Nav Between Prayers */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            {prevNiat ? (
              <button
                onClick={() => router.push(`/islami/panduan-shalat?niat=${prevNiat.id}`)}
                className="p-3 bg-white hover:bg-slate-50 border border-slate-200 rounded-2xl text-left transition cursor-pointer shadow-sm group flex items-center gap-2"
              >
                <ChevronLeft size={18} className="text-slate-400 group-hover:text-emerald-600 transition shrink-0" />
                <div className="min-w-0">
                  <span className="text-[10px] text-slate-400 block font-medium">Sebelumnya</span>
                  <span className="text-xs font-bold text-slate-800 group-hover:text-emerald-700 truncate block">
                    {prevNiat.name}
                  </span>
                </div>
              </button>
            ) : <div />}

            {nextNiat ? (
              <button
                onClick={() => router.push(`/islami/panduan-shalat?niat=${nextNiat.id}`)}
                className="p-3 bg-white hover:bg-slate-50 border border-slate-200 rounded-2xl text-right transition cursor-pointer shadow-sm group flex items-center justify-end gap-2"
              >
                <div className="min-w-0">
                  <span className="text-[10px] text-slate-400 block font-medium">Berikutnya</span>
                  <span className="text-xs font-bold text-slate-800 group-hover:text-emerald-700 truncate block">
                    {nextNiat.name}
                  </span>
                </div>
                <ChevronRight size={18} className="text-slate-400 group-hover:text-emerald-600 transition shrink-0" />
              </button>
            ) : <div />}
          </div>

          {/* Back button to full guide */}
          <div className="pt-3 text-center">
            <button
              onClick={() => router.push(`/islami/panduan-shalat?tab=${currentNiat.category}`)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs sm:text-sm font-bold rounded-xl transition cursor-pointer"
            >
              <ArrowLeft size={16} />
              <span>Kembali ke Panduan Shalat Lengkap</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ================= MAIN PRAYER GUIDE VIEW =================
  const fardhuNiatList = getFardhuNiatList();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-28 -mx-4 sm:-mx-6 lg:-mx-8">
      {/* Top Header */}
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
                <Compass size={16} />
              </span>
              <h1 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">
                Panduan Shalat
              </h1>
            </div>
          </div>

          <button
            onClick={toggleExpandAll}
            className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-xl border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/60 text-slate-700 hover:text-emerald-800 transition shrink-0 cursor-pointer shadow-sm"
            title={isAllExpanded ? 'Tutup semua langkah shalat' : 'Buka semua langkah shalat'}
          >
            {isAllExpanded ? (
              <>
                <ChevronUp size={13} className="text-slate-500" />
                <span>Tutup Semua</span>
              </>
            ) : (
              <>
                <ChevronDown size={13} className="text-slate-500" />
                <span>Buka Semua</span>
              </>
            )}
          </button>
        </div>

        {/* Tab Selection & Search Container */}
        <div className="max-w-4xl mx-auto px-4 sm:px-6 pb-2.5 sm:pb-3 space-y-2">
          {/* Segmented Tab Control */}
          <div className="bg-slate-100/90 p-1 rounded-xl flex gap-1">
            <button
              onClick={() => {
                setActiveTab('fardhu');
                setExpandedIds(new Set(fardhuSteps.slice(0, 1).map((x) => x.id)));
              }}
              className={`flex-1 py-1.5 sm:py-2 px-3 rounded-lg text-xs sm:text-sm font-bold transition cursor-pointer flex items-center justify-center gap-1.5 ${
                activeTab === 'fardhu'
                  ? 'bg-white text-emerald-800 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>Shalat Fardhu</span>
              <span className="hidden sm:inline font-normal text-xs opacity-75">(Rukun & Gerakan)</span>
            </button>
            <button
              onClick={() => {
                setActiveTab('sunnah');
                setExpandedIds(new Set(sunnahList.slice(0, 1).map((x) => x.id)));
              }}
              className={`flex-1 py-1.5 sm:py-2 px-3 rounded-lg text-xs sm:text-sm font-bold transition cursor-pointer flex items-center justify-center gap-1.5 ${
                activeTab === 'sunnah'
                  ? 'bg-white text-emerald-800 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>Shalat Sunnah</span>
              <span className="hidden sm:inline font-normal text-xs opacity-75">(Tahajjud, Dhuha, dll)</span>
            </button>
          </div>

          {/* Compact Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Cari ${activeTab === 'fardhu' ? 'rukun & gerakan shalat fardhu' : 'shalat sunnah'}...`}
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

      <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-4 sm:pt-5">
        {loading ? (
          <div className="py-20 text-center text-slate-400">
            <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
            <p className="text-sm">Memuat panduan shalat...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-slate-500 bg-white rounded-2xl border border-slate-200">
            <p className="font-medium text-slate-700">Tidak ada hasil yang cocok</p>
          </div>
        ) : (
          <div className="space-y-3 sm:space-y-4">
            {filtered.map((item, idx) => {
              const titleStr = getText(item.title);
              const descStr = getText(item.description);
              const contextStr = getText(item.context);
              const transStr = getText(item.content?.translation);
              const hasArabic = Boolean(item.content?.arabic && item.content.arabic.trim().length > 0);
              const isExpanded = expandedIds.has(item.id);
              const isIntentionCard = activeTab === 'fardhu' && item.id === 'intention';
              const matchedSunnahNiat = activeTab === 'sunnah' ? getNiatById(item.id) : null;

              return (
                <div
                  key={item.id || idx}
                  className={`bg-white rounded-2xl sm:rounded-3xl border transition-all duration-200 overflow-hidden ${
                    isExpanded
                      ? 'border-emerald-300 shadow-md ring-1 ring-emerald-100'
                      : 'border-slate-200/90 shadow-sm hover:border-slate-300 hover:shadow-sm'
                  }`}
                >
                  {/* Clickable Header Accordion Toggle */}
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleAccordion(item.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleAccordion(item.id);
                      }
                    }}
                    className="w-full p-4 sm:p-5 flex items-center justify-between gap-3 text-left cursor-pointer hover:bg-slate-50/70 transition select-none"
                    aria-expanded={isExpanded}
                  >
                    <div className="flex items-center gap-3.5 min-w-0 flex-1">
                      <div
                        className={`w-9 h-9 rounded-xl text-xs font-bold flex items-center justify-center shrink-0 transition ${
                          isExpanded
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'bg-emerald-50 text-emerald-800 border border-emerald-100'
                        }`}
                      >
                        {item.order || idx + 1}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-bold text-slate-900 text-base sm:text-lg truncate">
                            {titleStr}
                          </h3>
                          {contextStr && (
                            <span className="text-[11px] font-semibold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-full border border-teal-100">
                              {contextStr}
                            </span>
                          )}
                        </div>
                        {!isExpanded && descStr && (
                          <p className="text-xs text-slate-500 truncate mt-0.5">
                            {descStr}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-xs text-slate-400 hidden sm:inline">
                        {isExpanded ? 'Tutup' : 'Rincian'}
                      </span>
                      <div
                        className={`p-1.5 rounded-xl transition ${
                          isExpanded
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'
                        }`}
                      >
                        {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                      </div>
                    </div>
                  </div>

                  {/* Accordion Expanded Content */}
                  {isExpanded && (
                    <div className="px-4 sm:px-6 pb-5 pt-1 border-t border-slate-100 space-y-4 ">
                      {/* Description Explanation */}
                      {descStr && (
                        <div className="pt-2">
                          <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                            Penjelasan & Tata Cara
                          </h4>
                          <p className="text-sm text-slate-700 leading-relaxed">
                            {descStr}
                          </p>
                        </div>
                      )}

                      {/* SPECIAL: Links for 5 Fardhu Prayers & Jumat in Intention Card */}
                      {isIntentionCard && (
                        <div className="pt-2 space-y-2.5">
                          <div className="flex items-center justify-between">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                              <Sparkles size={14} className="text-emerald-600" />
                              <span>Lafadz Niat Shalat Fardhu & Jumat:</span>
                            </h4>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-2.5">
                            {fardhuNiatList.map((niat) => (
                              <Link
                                key={niat.id}
                                href={`/islami/panduan-shalat?niat=${niat.id}`}
                                className="group px-3.5 sm:px-4 py-2.5 sm:py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl sm:rounded-2xl transition shadow-sm hover:shadow-md flex items-center justify-between gap-2.5 cursor-pointer"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <BookOpen size={16} className="text-emerald-200 group-hover:text-white transition shrink-0" />
                                  <span className="font-bold text-sm text-white truncate">
                                    {niat.name}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <span className="px-1.5 py-0.5 bg-emerald-700 text-emerald-100 rounded-md text-[11px] font-semibold">
                                    {niat.rakaat}
                                  </span>
                                  <ArrowRight size={14} className="text-emerald-200 group-hover:text-white group-hover:translate-x-0.5 transition" />
                                </div>
                              </Link>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* SPECIAL: Link for Sunnah Prayer Intention */}
                      {activeTab === 'sunnah' && (
                        <div className="pt-1">
                          <Link
                            href={`/islami/panduan-shalat?niat=${matchedSunnahNiat ? matchedSunnahNiat.id : item.id}`}
                            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs sm:text-sm font-bold transition shadow-sm hover:shadow-md cursor-pointer group"
                          >
                            <BookOpen size={15} />
                            <span>Lihat Lafadz Niat {titleStr} (Arab, Latin & Terjemah)</span>
                            <ArrowRight size={15} className="group-hover:translate-x-0.5 transition" />
                          </Link>
                        </div>
                      )}

                      {/* Arabic recitation if present in item content */}
                      {hasArabic && (
                        <div className="p-4 sm:p-5 bg-emerald-50/40 rounded-2xl border border-emerald-100/80 space-y-3">
                          <div className="flex items-center justify-between text-xs text-emerald-800">
                            <span className="font-bold uppercase tracking-wider text-[10px] text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-md">
                              Lafadz Doa / Bacaan
                            </span>
                            <button
                              type="button"
                              onClick={(e) => handleCopy(item, e)}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-900 cursor-pointer p-1 rounded-lg hover:bg-emerald-100/60 transition"
                            >
                              {copiedId === item.id ? (
                                <>
                                  <Check size={14} className="text-emerald-600" />
                                  <span>Tersalin</span>
                                </>
                              ) : (
                                <>
                                  <Copy size={14} />
                                  <span>Salin Bacaan</span>
                                </>
                              )}
                            </button>
                          </div>

                          <p
                            className="font-serif text-2xl sm:text-3xl text-emerald-950 text-right leading-loose sm:leading-[2.5]"
                            dir="rtl"
                          >
                            {item.content?.arabic}
                          </p>

                          {item.content?.latin && (
                            <div className="pt-2 border-t border-emerald-100/60">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                                Bacaan Latin:
                              </span>
                              <p className="text-xs sm:text-sm font-mono text-emerald-800 font-medium leading-relaxed">
                                {item.content.latin}
                              </p>
                            </div>
                          )}

                          {transStr && (
                            <div className="pt-2 border-t border-emerald-100/60">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                                Terjemahan:
                              </span>
                              <p className="text-xs sm:text-sm text-slate-700 leading-relaxed italic">
                                "{transStr}"
                              </p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* If no arabic recitation, but has translation / note (and not intention card where links are shown) */}
                      {!hasArabic && !isIntentionCard && transStr && (
                        <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                            Keterangan:
                          </span>
                          <p className="text-xs sm:text-sm text-slate-700 leading-relaxed italic border-l-2 border-emerald-500 pl-3">
                            "{transStr}"
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};


export default function PanduanShalatPage() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-slate-400 text-sm">Memuat...</div>}>
      <PanduanShalatContent />
    </Suspense>
  );
}
