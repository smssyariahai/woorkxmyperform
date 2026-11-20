'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import {
  ArrowLeft,
  Search,
  BookOpen,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  Copy,
  Check,
  Share2,
  ArrowRight,
  X,
  ScrollText,
  Shield,
  Layers,
  Award,
  BookMarked,
  Clock,
  Compass,
  CheckCircle2
} from 'lucide-react';
import {
  ANGELS_DATA,
  BOOKS_DATA,
  SUHUF_DATA,
  ALL_MALAIKAT_KITAB,
  MalaikatItem,
  KitabSuhufItem,
  MalaikatKitabItem,
  getMalaikatKitabById
} from '@/lib/islami/data/malaikatKitab';

function MalaikatKitabContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const itemId = searchParams.get('item');

  const [activeTab, setActiveTab] = useState<'angels' | 'books' | 'suhuf'>('angels');
  const [search, setSearch] = useState('');
  const [copiedAll, setCopiedAll] = useState(false);

  // Scroll to top whenever route or selected item changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [itemId]);

  // Find active item if itemId parameter is present in URL
  const currentItem: MalaikatKitabItem | null = itemId
    ? getMalaikatKitabById(itemId) || ALL_MALAIKAT_KITAB.find((i) => `${i.id}` === itemId) || null
    : null;

  // Filter items based on active tab and search query
  const getTabItems = () => {
    switch (activeTab) {
      case 'angels':
        return ANGELS_DATA;
      case 'books':
        return BOOKS_DATA;
      case 'suhuf':
        return SUHUF_DATA;
      default:
        return ANGELS_DATA;
    }
  };

  const currentTabItems = getTabItems();

  const filteredItems = currentTabItems.filter((item) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;

    const isAngel = item.category === 'angel';
    const angel = item as MalaikatItem;
    const book = item as KitabSuhufItem;

    return (
      item.name.toLowerCase().includes(q) ||
      item.arabicName.includes(q) ||
      item.briefSummary.toLowerCase().includes(q) ||
      item.fullExplanation.toLowerCase().includes(q) ||
      (isAngel && angel.duty.toLowerCase().includes(q)) ||
      (isAngel && angel.title.toLowerCase().includes(q)) ||
      (!isAngel && book.recipient.toLowerCase().includes(q)) ||
      (!isAngel && book.language.toLowerCase().includes(q)) ||
      `${item.order}` === q
    );
  });

  // ================= DEDICATED DETAIL VIEW =================
  if (currentItem) {
    const isAngel = currentItem.category === 'angel';
    const angel = isAngel ? (currentItem as MalaikatItem) : null;
    const book = !isAngel ? (currentItem as KitabSuhufItem) : null;

    // Find siblings for prev/next navigation within same category
    let siblingList: MalaikatKitabItem[] = [];
    if (currentItem.category === 'angel') siblingList = ANGELS_DATA;
    else if (currentItem.category === 'book') siblingList = BOOKS_DATA;
    else siblingList = SUHUF_DATA;

    const currentIdx = siblingList.findIndex((i) => i.id === currentItem.id);
    const prevItem = currentIdx > 0 ? siblingList[currentIdx - 1] : null;
    const nextItem = currentIdx < siblingList.length - 1 ? siblingList[currentIdx + 1] : null;

    const categoryLabel = 
      currentItem.category === 'angel' 
        ? '10 Malaikat Allah' 
        : currentItem.category === 'book' 
        ? '4 Kitab Suci Allah' 
        : 'Suhuf Para Nabi';

    const handleCopyAll = () => {
      let text = `== ${currentItem.name} (${currentItem.arabicName}) ==\n`;
      text += `Kategori: ${categoryLabel}\n`;
      if (isAngel && angel) {
        text += `Gelar/Tugas Pokok: ${angel.duty}\n\n`;
      } else if (book) {
        text += `Penerima: ${book.recipient} | Bahasa: ${book.language} | Masa: ${book.era}\n\n`;
      }

      text += `[Ringkasan]:\n${currentItem.briefSummary}\n\n`;

      if (isAngel && angel?.characteristics && angel.characteristics.length > 0) {
        text += `[Karakteristik & Ciri Khusus]:\n` + angel.characteristics.map((c, i) => `${i + 1}. ${c}`).join('\n') + `\n\n`;
      } else if (book?.coreContents && book.coreContents.length > 0) {
        text += `[Pokok-Pokok Ajaran]:\n` + book.coreContents.map((c, i) => `${i + 1}. ${c}`).join('\n') + `\n\n`;
      }

      text += `[Penjelasan Lengkap]:\n${currentItem.fullExplanation}\n\n`;

      if (currentItem.quranVerses && currentItem.quranVerses.length > 0) {
        text += `[Ayat Al-Qur'an]:\n` + currentItem.quranVerses.map((v) => `QS. ${v.surah}: ${v.ayah}\n${v.arabic}\nArtinya: "${v.translation}"`).join('\n\n') + `\n\n`;
      }

      if (isAngel && angel?.hadiths && angel.hadiths.length > 0) {
        text += `[Dalil Hadits Shahih]:\n` + angel.hadiths.map((h) => `${h.narrator} (${h.reference}):\n"${h.translation}"`).join('\n\n') + `\n\n`;
      }

      if (currentItem.wisdoms && currentItem.wisdoms.length > 0) {
        text += `[Hikmah & Pelajaran Beriman]:\n` + currentItem.wisdoms.map((w, i) => `${i + 1}. ${w}`).join('\n') + `\n\n`;
      }

      if (currentItem.references && currentItem.references.length > 0) {
        text += `[Rujukan Terpercaya]:\n` + currentItem.references.map((r) => `- ${r}`).join('\n') + `\n\n`;
      }

      text += `(Sumber: Aplikasi Muslim - Malaikat & Kitab-Kitab Allah)`;

      navigator.clipboard.writeText(text);
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
    };

    const handleShare = async () => {
      const shareData = {
        title: `${currentItem.name} - ${categoryLabel}`,
        text: `${currentItem.name} (${currentItem.arabicName}): ${currentItem.briefSummary}`,
        url: window.location.href,
      };
      if (navigator.share) {
        try {
          await navigator.share(shareData);
        } catch {
          // ignore share cancel
        }
      } else {
        handleCopyAll();
      }
    };

    return (
      <div className="min-h-screen bg-slate-50 text-slate-800 pb-28 -mx-4 sm:-mx-6 lg:-mx-8">
        {/* Sticky Detail Header */}
        <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-slate-200">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between gap-3">
            <button
              onClick={() => router.push('/islami/malaikat-kitab')}
              className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-slate-600 hover:text-emerald-700 transition cursor-pointer"
            >
              <ArrowLeft size={18} />
              <span>Kembali ke Malaikat & Kitab</span>
            </button>

            <div className="flex items-center gap-1.5">
              <button
                onClick={handleCopyAll}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition cursor-pointer"
                title="Salin materi lengkap"
              >
                {copiedAll ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                <span className="hidden sm:inline">{copiedAll ? 'Tersalin' : 'Salin'}</span>
              </button>
              <button
                onClick={handleShare}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl text-xs font-semibold transition cursor-pointer"
                title="Bagikan materi"
              >
                <Share2 size={14} />
                <span className="hidden sm:inline">Bagikan</span>
              </button>
            </div>
          </div>
        </div>

        {/* Content Container */}
        <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-4 sm:pt-6 space-y-4 sm:space-y-6">
          {/* Main Hero Card */}
          <div className="bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 text-white rounded-2xl sm:rounded-3xl p-5 sm:p-7 shadow-sm relative overflow-hidden">
            <div className="absolute right-3 -bottom-6 text-emerald-500/20 text-7xl sm:text-9xl font-serif select-none pointer-events-none font-bold">
              {currentItem.arabicName}
            </div>

            <div className="relative z-10 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-xl bg-white/20 backdrop-blur-md text-white font-bold text-sm flex items-center justify-center border border-white/20">
                    {currentItem.order}
                  </span>
                  <span className="px-3 py-1 bg-emerald-900/40 backdrop-blur-md border border-white/10 rounded-full text-xs font-semibold text-emerald-100">
                    {categoryLabel}
                  </span>
                </div>
                <span className="text-2xl sm:text-3xl font-serif font-bold text-emerald-100 px-3 py-0.5 bg-black/20 rounded-xl">
                  {currentItem.arabicName}
                </span>
              </div>

              <div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                  {currentItem.name}
                </h1>
                {isAngel && angel && (
                  <p className="text-sm sm:text-base text-emerald-100 mt-1 font-medium">
                    {angel.title}
                  </p>
                )}
                {!isAngel && book && (
                  <p className="text-sm sm:text-base text-emerald-100 mt-1 font-medium">
                    Diturunkan kepada: <strong>{book.recipient}</strong>
                  </p>
                )}
              </div>

              <div className="pt-2 border-t border-emerald-500/40 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-emerald-100/90">
                {isAngel && angel ? (
                  <>
                    <div className="flex items-center gap-1.5 sm:col-span-2">
                      <Shield size={14} className="text-emerald-300 shrink-0" />
                      <span><strong>Tugas Pokok:</strong> {angel.duty}</span>
                    </div>
                  </>
                ) : book ? (
                  <>
                    <div className="flex items-center gap-1.5">
                      <Clock size={14} className="text-emerald-300 shrink-0" />
                      <span><strong>Masa & Lokasi:</strong> {book.era}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Compass size={14} className="text-emerald-300 shrink-0" />
                      <span><strong>Bahasa Wahyu:</strong> {book.language}</span>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          </div>

          {/* Section: Ringkasan Utama */}
          <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200/90 shadow-sm p-4 sm:p-6 space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <BookOpen size={15} className="text-emerald-600" />
              <span>{isAngel ? 'Ringkasan Tugas & Amanah Mulia' : 'Ringkasan & Profil Wahyu'}</span>
            </h3>
            <p className="text-sm sm:text-base text-slate-700 leading-relaxed font-medium">
              {currentItem.briefSummary}
            </p>
          </div>

          {/* Section: Karakteristik / Pokok Ajaran */}
          {isAngel && angel && angel.characteristics && angel.characteristics.length > 0 && (
            <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200/90 shadow-sm p-4 sm:p-6 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Sparkles size={15} className="text-amber-500" />
                <span>Karakteristik & Ciri-Ciri Utama dalam Nash Shahih</span>
              </h3>
              <div className="grid grid-cols-1 gap-2.5">
                {angel.characteristics.map((charItem, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-3 p-3 bg-amber-50/60 rounded-xl sm:rounded-2xl border border-amber-200/60"
                  >
                    <span className="w-6 h-6 rounded-lg bg-amber-500 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                      {idx + 1}
                    </span>
                    <p className="text-xs sm:text-sm text-slate-800 leading-relaxed">
                      {charItem}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!isAngel && book && book.coreContents && book.coreContents.length > 0 && (
            <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200/90 shadow-sm p-4 sm:p-6 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Sparkles size={15} className="text-amber-500" />
                <span>Pokok-Pokok Ajaran & Muatan Utama</span>
              </h3>
              <div className="grid grid-cols-1 gap-2.5">
                {book.coreContents.map((contentItem, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-3 p-3 bg-amber-50/60 rounded-xl sm:rounded-2xl border border-amber-200/60"
                  >
                    <span className="w-6 h-6 rounded-lg bg-amber-500 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                      {idx + 1}
                    </span>
                    <p className="text-xs sm:text-sm text-slate-800 leading-relaxed">
                      {contentItem}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section: Penjelasan Lengkap & Peristiwa Sejarah */}
          <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200/90 shadow-sm p-4 sm:p-6 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <BookMarked size={15} className="text-emerald-600" />
              <span>Uraian Lengkap & Kedudukan dalam Syariat</span>
            </h3>
            <div className="space-y-3.5 text-xs sm:text-sm text-slate-700 leading-relaxed select-text">
              {currentItem.fullExplanation.split('\n\n').map((paragraph, pIdx) => (
                <p key={pIdx} className="text-justify indent-4 sm:indent-6">
                  {paragraph}
                </p>
              ))}
            </div>
          </div>

          {/* Section: Ayat Al-Qur'an & Dalil */}
          {currentItem.quranVerses && currentItem.quranVerses.length > 0 && (
            <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200/90 shadow-sm p-4 sm:p-6 space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <BookOpen size={15} className="text-teal-600" />
                <span>Dalil Ayat Al-Qur'an Al-Karim</span>
              </h3>

              <div className="space-y-4">
                {currentItem.quranVerses.map((verse, vIdx) => (
                  <div
                    key={vIdx}
                    className="p-4 sm:p-5 bg-gradient-to-br from-emerald-50/60 to-slate-50 rounded-2xl border border-emerald-100/90 space-y-3"
                  >
                    <div className="flex items-center justify-between gap-2 border-b border-emerald-100 pb-2">
                      <span className="px-2.5 py-0.5 bg-emerald-700 text-white rounded-md text-[11px] font-bold">
                        QS. {verse.surah} : {verse.ayah}
                      </span>
                    </div>

                    {/* Arabic Verse */}
                    <div className="p-3.5 bg-white rounded-xl border border-emerald-100/80 shadow-sm">
                      <p
                        className="text-right text-lg sm:text-2xl font-serif text-slate-900 leading-loose select-text"
                        dir="rtl"
                      >
                        {verse.arabic}
                      </p>
                    </div>

                    {/* Translation */}
                    <div className="p-3 bg-white/80 rounded-xl border border-slate-200/70 space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                        Artinya (Terjemahan):
                      </span>
                      <p className="text-xs sm:text-sm text-slate-800 leading-relaxed italic border-l-2 border-emerald-500 pl-3 select-text">
                        "{verse.translation}"
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section: Dalil Hadits Shahih */}
          {isAngel && angel && angel.hadiths && angel.hadiths.length > 0 && (
            <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200/90 shadow-sm p-4 sm:p-6 space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <ScrollText size={15} className="text-emerald-600" />
                <span>Dalil Hadits Shahih & Atsar</span>
              </h3>

              <div className="space-y-3">
                {angel.hadiths.map((hadith, hIdx) => (
                  <div
                    key={hIdx}
                    className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-emerald-800">
                        {hadith.narrator}
                      </span>
                      <span className="text-[11px] px-2 py-0.5 bg-white rounded-md text-slate-500 border border-slate-200 font-medium">
                        {hadith.reference}
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-slate-800 leading-relaxed italic border-l-2 border-emerald-600 pl-3 select-text">
                      "{hadith.translation}"
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section: Pelajaran & Hikmah */}
          {currentItem.wisdoms && currentItem.wisdoms.length > 0 && (
            <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200/90 shadow-sm p-4 sm:p-6 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Award size={15} className="text-indigo-600" />
                <span>Pelajaran & Hikmah Beriman</span>
              </h3>
              <div className="space-y-2.5">
                {currentItem.wisdoms.map((wisdom, wIdx) => (
                  <div
                    key={wIdx}
                    className="flex items-start gap-3 p-3 bg-indigo-50/50 rounded-xl sm:rounded-2xl border border-indigo-100"
                  >
                    <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                      ✓
                    </span>
                    <p className="text-xs sm:text-sm text-slate-800 leading-relaxed">
                      {wisdom}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section: Rujukan Kitab Terpercaya */}
          {currentItem.references && currentItem.references.length > 0 && (
            <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200/90 shadow-sm p-4 sm:p-5 space-y-2.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Layers size={14} className="text-emerald-600" />
                <span>Rujukan Kitab & Sumber Terpercaya:</span>
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {currentItem.references.map((ref, rIdx) => (
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

          {/* Navigation Prev & Next */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            {prevItem ? (
              <button
                onClick={() => router.push(`/islami/malaikat-kitab?item=${prevItem.id}`)}
                className="p-3 bg-white hover:bg-slate-50 border border-slate-200 rounded-2xl text-left transition cursor-pointer shadow-sm group flex items-center gap-2"
              >
                <ChevronLeft size={18} className="text-slate-400 group-hover:text-emerald-600 transition shrink-0" />
                <div className="min-w-0">
                  <span className="text-[10px] text-slate-400 block font-medium">Sebelumnya</span>
                  <span className="text-xs font-bold text-slate-800 group-hover:text-emerald-700 truncate block">
                    {prevItem.name}
                  </span>
                </div>
              </button>
            ) : <div />}

            {nextItem ? (
              <button
                onClick={() => router.push(`/islami/malaikat-kitab?item=${nextItem.id}`)}
                className="p-3 bg-white hover:bg-slate-50 border border-slate-200 rounded-2xl text-right transition cursor-pointer shadow-sm group flex items-center justify-end gap-2"
              >
                <div className="min-w-0">
                  <span className="text-[10px] text-slate-400 block font-medium">Berikutnya</span>
                  <span className="text-xs font-bold text-slate-800 group-hover:text-emerald-700 truncate block">
                    {nextItem.name}
                  </span>
                </div>
                <ChevronRight size={18} className="text-slate-400 group-hover:text-emerald-600 transition shrink-0" />
              </button>
            ) : <div />}
          </div>

          {/* Back button to full list */}
          <div className="pt-3 text-center">
            <button
              onClick={() => router.push('/islami/malaikat-kitab')}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs sm:text-sm font-bold rounded-xl transition cursor-pointer"
            >
              <ArrowLeft size={16} />
              <span>Kembali ke Daftar Malaikat & Kitab</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ================= MAIN LIST VIEW =================
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
                <ScrollText size={16} />
              </span>
              <h1 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">
                Malaikat & Kitab-Kitab Allah
              </h1>
            </div>
          </div>
        </div>

        {/* Tab Selection & Search Container */}
        <div className="max-w-4xl mx-auto px-4 sm:px-6 pb-2.5 sm:pb-3 space-y-2">
          {/* 3 Categories Tab Switcher */}
          <div className="bg-slate-100 p-1 rounded-xl flex gap-1">
            <button
              onClick={() => { setActiveTab('angels'); setSearch(''); }}
              className={`flex-1 py-1.5 sm:py-2 px-2 sm:px-3 rounded-lg text-xs sm:text-sm font-bold transition cursor-pointer flex items-center justify-center ${
                activeTab === 'angels'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
              }`}
            >
              10 Malaikat
            </button>
            <button
              onClick={() => { setActiveTab('books'); setSearch(''); }}
              className={`flex-1 py-1.5 sm:py-2 px-2 sm:px-3 rounded-lg text-xs sm:text-sm font-bold transition cursor-pointer flex items-center justify-center ${
                activeTab === 'books'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
              }`}
            >
              4 Kitab Suci
            </button>
            <button
              onClick={() => { setActiveTab('suhuf'); setSearch(''); }}
              className={`flex-1 py-1.5 sm:py-2 px-2 sm:px-3 rounded-lg text-xs sm:text-sm font-bold transition cursor-pointer flex items-center justify-center ${
                activeTab === 'suhuf'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
              }`}
            >
              Suhuf Nabi
            </button>
          </div>

          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                activeTab === 'angels'
                  ? 'Cari nama malaikat, tugas, atau karakteristik...'
                  : activeTab === 'books'
                  ? 'Cari nama kitab suci, nabi penerima, atau bahasa...'
                  : 'Cari suhuf nabi, masa, atau ajaran...'
              }
              className="w-full pl-8 pr-8 py-2 bg-slate-100/80 hover:bg-slate-100 focus:bg-white text-xs sm:text-sm rounded-xl border border-transparent focus:border-emerald-500 focus:outline-none transition shadow-sm"
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

      {/* Main List Body: 2 Columns PC & Tablet, 1 Column Mobile, Compact Uniform Buttons without Subtitle */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-4 sm:pt-5 space-y-3">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
            {activeTab === 'angels'
              ? `Daftar 10 Malaikat Wajib (${filteredItems.length} Malaikat)`
              : activeTab === 'books'
              ? `Daftar 4 Kitab Suci Samawi (${filteredItems.length} Kitab)`
              : `Daftar Suhuf Para Nabi (${filteredItems.length} Suhuf)`}
          </span>
          <span className="text-[11px] text-slate-400 hidden sm:inline">
            Klik tombol untuk melihat uraian lengkap & dalil
          </span>
        </div>

        {filteredItems.length === 0 ? (
          <div className="py-16 text-center text-slate-500 bg-white rounded-2xl border border-slate-200">
            <BookOpen size={32} className="mx-auto text-slate-300 mb-2" />
            <p className="font-medium text-slate-700">Tidak ada data yang cocok</p>
            <p className="text-xs text-slate-400 mt-1">Coba gunakan kata kunci pencarian lain</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
            {filteredItems.map((item) => (
              <button
                key={item.id}
                onClick={() => router.push(`/islami/malaikat-kitab?item=${item.id}`)}
                className="group w-full px-3.5 py-3 sm:py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl sm:rounded-2xl transition shadow-sm hover:shadow-md flex items-center justify-between gap-3 cursor-pointer text-left"
              >
                <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                  <span className="w-7 h-7 rounded-lg bg-emerald-700/90 text-emerald-100 text-xs font-bold flex items-center justify-center shrink-0">
                    {item.order}
                  </span>
                  <span className="font-bold text-sm sm:text-base text-white truncate group-hover:text-emerald-50">
                    {item.name}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                  <span className="px-2.5 py-0.5 sm:py-1 bg-emerald-700/80 text-emerald-100 rounded-md text-xs font-serif font-bold whitespace-nowrap">
                    {item.arabicName}
                  </span>
                  <ArrowRight size={16} className="text-emerald-200 group-hover:text-white group-hover:translate-x-0.5 transition shrink-0" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default function MalaikatKitabPage() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-slate-400"><p className="text-sm">Memuat...</p></div>}>
      <MalaikatKitabContent />
    </Suspense>
  );
}
