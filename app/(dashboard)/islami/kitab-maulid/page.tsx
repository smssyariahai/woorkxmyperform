'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { 
  BookOpen, Search, Bookmark, BookmarkCheck, Volume2, 
  Settings2, ChevronLeft, ChevronRight, Copy, Check, 
  Sparkles, ArrowLeft, Share2, Info, X
} from 'lucide-react';
import { DAFTAR_KITAB_MAULID } from '@/lib/islami/data/maulidData';
import { KitabMaulidInfo, FashlMaulid, BaitMaulid, MaulidBookmarkItem, MaulidReaderSettings } from '@/lib/islami/types/maulid';
import { MaulidStorageService } from '@/lib/islami/maulidStorage';
import { MaulidSettingsModal } from '@/components/islami/maulid/MaulidSettingsModal';
import { MaulidAudioPlayer } from '@/components/islami/maulid/MaulidAudioPlayer';
import { MaulidBookmarkModal } from '@/components/islami/maulid/MaulidBookmarkModal';

export default function KitabMaulidPage() {
  // Navigation & View State
  const [selectedKitab, setSelectedKitab] = useState<KitabMaulidInfo>(() => DAFTAR_KITAB_MAULID[0]);
  const [selectedFashlIndex, setSelectedFashlIndex] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<'katalog' | 'reader' | 'bookmarks' | 'biografi'>('katalog');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Settings State
  const [settings, setSettings] = useState<MaulidReaderSettings>(() => MaulidStorageService.getSettings());
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  // Audio Player State
  const [isAudioPlayerOpen, setIsAudioPlayerOpen] = useState<boolean>(false);

  // Bookmarks State
  const [bookmarks, setBookmarks] = useState<MaulidBookmarkItem[]>(() => MaulidStorageService.getBookmarks());
  const [bookmarkModalData, setBookmarkModalData] = useState<{
    isOpen: boolean;
    kitabId: string;
    kitabNama: string;
    fashlId: string;
    fashlJudul: string;
    baitNomor: number;
    teksArab: string;
    terjemahan: string;
    existingNote?: string;
  } | null>(null);

  // Toast / Notification
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Auto-scroll ref
  const autoScrollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    MaulidStorageService.saveSettings(settings);
  }, [settings]);

  // Handle Auto-Scroll
  useEffect(() => {
    if (settings.autoScroll && activeTab === 'reader' && selectedKitab) {
      const scrollStep = settings.scrollSpeed * 0.75;
      autoScrollIntervalRef.current = setInterval(() => {
        window.scrollBy({ top: scrollStep, behavior: 'smooth' });
      }, 50);
    } else {
      if (autoScrollIntervalRef.current) {
        clearInterval(autoScrollIntervalRef.current);
      }
    }
    return () => {
      if (autoScrollIntervalRef.current) {
        clearInterval(autoScrollIntervalRef.current);
      }
    };
  }, [settings.autoScroll, settings.scrollSpeed, activeTab, selectedKitab]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2800);
  };

  const handleCopyBait = (bait: BaitMaulid, kitabNama: string, fashlJudul: string) => {
    const textToCopy = `[${kitabNama} - ${fashlJudul} (Bait ${bait.nomorBait})]\n\n${bait.teksArab}\n\n${bait.latin ? `${bait.latin}\n\n` : ''}"${bait.terjemahan}"\n\n(Dibaca via Kitab Maulid Nabi)`;
    navigator.clipboard.writeText(textToCopy).then(() => {
      showToast(`Bait ${bait.nomorBait} berhasil disalin ke clipboard!`);
    }).catch(() => {
      showToast('Gagal menyalin bait.');
    });
  };

  const handleShareBait = (bait: BaitMaulid, kitabNama: string) => {
    const textToShare = `Lantunan Maulid ${kitabNama} (Bait ${bait.nomorBait}):\n\n${bait.teksArab}\n\n"${bait.terjemahan}"\n\nDibaca via Fitur Islami MyPerform`;
    if (navigator.share) {
      navigator.share({
        title: `Maulid ${kitabNama}`,
        text: textToShare
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(textToShare);
      showToast('Teks berhasil disalin untuk dibagikan!');
    }
  };

  const handleOpenBookmarkModal = (kitab: KitabMaulidInfo, fashl: FashlMaulid, bait: BaitMaulid) => {
    const existing = bookmarks.find(
      b => b.kitabId === kitab.id && b.fashlId === fashl.id && b.baitNomor === bait.nomorBait
    );
    setBookmarkModalData({
      isOpen: true,
      kitabId: kitab.id,
      kitabNama: kitab.nama,
      fashlId: fashl.id,
      fashlJudul: fashl.judul,
      baitNomor: bait.nomorBait,
      teksArab: bait.teksArab,
      terjemahan: bait.terjemahan,
      existingNote: existing?.catatan
    });
  };

  const handleSaveBookmark = (catatan: string) => {
    if (!bookmarkModalData) return;
    MaulidStorageService.saveBookmark({
      kitabId: bookmarkModalData.kitabId,
      kitabNama: bookmarkModalData.kitabNama,
      fashlId: bookmarkModalData.fashlId,
      fashlJudul: bookmarkModalData.fashlJudul,
      baitNomor: bookmarkModalData.baitNomor,
      teksArab: bookmarkModalData.teksArab,
      terjemahan: bookmarkModalData.terjemahan,
      catatan
    });
    setBookmarks(MaulidStorageService.getBookmarks());
    showToast('Bait berhasil ditambahkan ke bookmark!');
  };

  const handleDeleteBookmark = () => {
    if (!bookmarkModalData) return;
    const existing = bookmarks.find(
      b => b.kitabId === bookmarkModalData.kitabId && 
           b.fashlId === bookmarkModalData.fashlId && 
           b.baitNomor === bookmarkModalData.baitNomor
    );
    if (existing) {
      MaulidStorageService.removeBookmark(existing.id);
      setBookmarks(MaulidStorageService.getBookmarks());
      showToast('Bookmark berhasil dihapus');
    }
  };

  // Filter kitab by search query
  const filteredKitabList = DAFTAR_KITAB_MAULID.filter(k => 
    k.nama.toLowerCase().includes(searchQuery.toLowerCase()) ||
    k.pengarang.toLowerCase().includes(searchQuery.toLowerCase()) ||
    k.deskripsi.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const activeFashl = selectedKitab.fashls[selectedFashlIndex] || selectedKitab.fashls[0];

  // Font styling helpers based on settings
  const getArabicSizeClass = () => {
    switch (settings.arabicFontSize) {
      case 'small': return 'text-xl sm:text-2xl leading-loose sm:leading-[2.4]';
      case 'large': return 'text-3xl sm:text-4xl leading-[2.5] sm:leading-[2.8]';
      case 'extralarge': return 'text-4xl sm:text-5xl leading-[2.8] sm:leading-[3.2]';
      case 'medium':
      default: return 'text-2xl sm:text-3xl leading-[2.3] sm:leading-[2.6]';
    }
  };

  const getArabicFontFamilyStyle = () => {
    switch (settings.arabicFont) {
      case 'scheherazade': return { fontFamily: '"Scheherazade New", serif' };
      case 'uthmani': return { fontFamily: '"Noto Naskh Arabic", sans-serif' };
      case 'indopak': return { fontFamily: '"Lateef", cursive' };
      case 'amiri':
      default: return { fontFamily: '"Amiri", "Traditional Arabic", serif' };
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/50 text-slate-800 pb-28 -mx-4 sm:-mx-6 lg:-mx-8">
      {/* Toast Notification (Modeled after Al-Quran) */}
      {toastMessage && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-slate-900/90 backdrop-blur-md text-white px-4 py-2.5 rounded-full text-xs sm:text-sm font-medium shadow-xl flex items-center gap-2 animate-in fade-in slide-in-from-top-3">
          <Check size={16} className="text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* VIEW 1: KATALOG KITAB MAULID / TANDA BACA / BIOGRAFI          */}
      {/* ------------------------------------------------------------- */}
      {activeTab !== 'reader' ? (
        <div className="max-w-5xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-5">
          {/* Header Bar (Modeled exactly after Al-Quran) */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs">
            <div className="flex items-center gap-3">
              <Link
                href="/islami"
                className="p-2 text-slate-500 hover:text-emerald-700 hover:bg-slate-100 rounded-xl transition shrink-0"
                title="Kembali ke Islami"
              >
                <ArrowLeft size={20} />
              </Link>
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white flex items-center justify-center shadow-md shadow-emerald-700/20 shrink-0">
                <BookOpen size={24} />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  Kitab Maulid Nabi ﷺ
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 font-medium">
                  Kumpulan Kitab Maulid Klasik, Simtudduror, Barzanji, Diba'i, Burdah, Dhiya'ul Lami', Syaroful Anam & Al-Azab
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              <button
                type="button"
                onClick={() => setIsAudioPlayerOpen(true)}
                className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer border border-emerald-200"
                title="Putar Audio Shalawat"
              >
                <Volume2 size={16} className="text-emerald-600" />
                <span className="hidden sm:inline">Audio Maulid</span>
              </button>
              <button
                type="button"
                onClick={() => setIsSettingsOpen(true)}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                title="Pengaturan Tampilan"
              >
                <Settings2 size={16} />
                <span>Pengaturan</span>
              </button>
            </div>
          </div>

          {/* Banner: Lanjutkan Membaca Maulid (Modeled after Al-Quran Terakhir Dibaca) */}
          <div className="bg-gradient-to-r from-emerald-800 via-teal-900 to-emerald-950 text-white p-4 sm:p-5 rounded-2xl shadow-lg relative overflow-hidden flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1 relative z-10 pr-8 sm:pr-0">
              <div className="flex items-center gap-2 text-emerald-300 text-xs font-bold uppercase tracking-wider">
                <Sparkles size={14} />
                <span>Sirah & Madah Nabawiyyah</span>
              </div>
              <div className="text-lg sm:text-xl font-bold flex items-center gap-2">
                <span>{selectedKitab.nama}</span>
                <span className="text-emerald-300 text-sm font-normal">Fashal {selectedFashlIndex + 1}</span>
              </div>
              <p className="text-xs text-emerald-100/80">
                Lantunkan bait-bait shalawat agung dan pelajari riwayat kemuliaan baginda Rasulullah ﷺ
              </p>
            </div>

            <div className="flex flex-col items-stretch sm:items-end gap-1.5 z-10 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => setActiveTab('reader')}
                className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs shadow-md transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Buka Pembaca Maulid</span>
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          {/* Search Box */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari kitab (cth: Simtudduror, Barzanji, Diba'i), pengarang, atau bait..."
              className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200/90 rounded-2xl text-sm text-slate-800 placeholder:text-slate-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15 outline-none shadow-2xs transition"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                Reset
              </button>
            )}
          </div>

          {/* Navigation Tabs (Modeled exactly after Al-Quran) */}
          <div className="flex border-b border-slate-200 gap-1 sm:gap-2 overflow-x-auto pb-0.5">
            <button
              type="button"
              onClick={() => setActiveTab('katalog')}
              className={`px-3.5 sm:px-4 py-2.5 font-bold text-xs sm:text-sm border-b-2 transition whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'katalog'
                  ? 'border-emerald-600 text-emerald-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <BookOpen size={16} />
              <span>Daftar Kitab ({DAFTAR_KITAB_MAULID.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('bookmarks')}
              className={`px-3.5 sm:px-4 py-2.5 font-bold text-xs sm:text-sm border-b-2 transition whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'bookmarks'
                  ? 'border-emerald-600 text-emerald-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Bookmark size={16} />
              <span>Tanda Baca ({bookmarks.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('biografi')}
              className={`px-3.5 sm:px-4 py-2.5 font-bold text-xs sm:text-sm border-b-2 transition whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'biografi'
                  ? 'border-emerald-600 text-emerald-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Info size={16} />
              <span>Biografi Ulama ({DAFTAR_KITAB_MAULID.length})</span>
            </button>
          </div>

          {/* TAB 1: KATALOG KITAB MAULID (COMPACT 3-COL GRID EXACTLY LIKE AL-QURAN) */}
          {activeTab === 'katalog' && (
            <div>
              {filteredKitabList.length === 0 ? (
                <div className="bg-white rounded-2xl p-10 text-center border border-slate-200 text-slate-500 space-y-2">
                  <Search size={32} className="mx-auto text-slate-300" />
                  <p className="font-bold text-slate-700 text-sm">Kitab Maulid tidak ditemukan</p>
                  <p className="text-xs">Coba kata kunci pencarian yang lain.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {filteredKitabList.map((kitab, index) => (
                    <div
                      key={kitab.id}
                      onClick={() => {
                        setSelectedKitab(kitab);
                        setSelectedFashlIndex(0);
                        setActiveTab('reader');
                      }}
                      className="group bg-white hover:bg-emerald-50/40 p-3.5 sm:p-4 rounded-2xl border border-slate-200/90 hover:border-emerald-400 hover:shadow-md transition-all cursor-pointer flex items-center justify-between gap-3 relative overflow-hidden"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Number Badge */}
                        <div className="w-10 h-10 rounded-xl bg-slate-100 group-hover:bg-emerald-600 group-hover:text-white text-slate-700 font-bold text-xs flex items-center justify-center shrink-0 transition-colors shadow-2xs font-mono">
                          {index + 1}
                        </div>

                        <div className="min-w-0 flex-1">
                          <h3 className="font-bold text-slate-900 group-hover:text-emerald-900 text-sm truncate">
                            {kitab.nama}
                          </h3>
                        </div>
                      </div>

                      {/* Right Action */}
                      <div className="flex items-center shrink-0">
                        <div className="w-8 h-8 rounded-lg bg-slate-100 group-hover:bg-emerald-100 text-slate-500 group-hover:text-emerald-700 flex items-center justify-center transition">
                          <ChevronRight size={16} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: TANDA BACA (BOOKMARKS) */}
          {activeTab === 'bookmarks' && (
            <div className="space-y-3">
              {bookmarks.length === 0 ? (
                <div className="bg-white rounded-2xl p-10 text-center border border-slate-200 text-slate-500 space-y-2">
                  <Bookmark size={36} className="mx-auto text-slate-300" />
                  <p className="font-bold text-slate-700 text-sm">Belum ada tanda baca tersimpan</p>
                  <p className="text-xs max-w-sm mx-auto">
                    Saat membaca fashal maulid, tekan ikon Bookmark pada bait untuk menyimpannya ke daftar tanda baca.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {bookmarks.map((bm) => (
                    <div
                      key={bm.id}
                      className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs hover:border-emerald-300 transition space-y-2.5"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-slate-900">
                            {bm.kitabNama} • {bm.fashlJudul}
                          </span>
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                            Bait #{bm.baitNomor}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              const targetKitab = DAFTAR_KITAB_MAULID.find(k => k.id === bm.kitabId);
                              if (targetKitab) {
                                setSelectedKitab(targetKitab);
                                const fashlIdx = targetKitab.fashls.findIndex(f => f.id === bm.fashlId);
                                setSelectedFashlIndex(fashlIdx >= 0 ? fashlIdx : 0);
                                setActiveTab('reader');
                              }
                            }}
                            className="text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 cursor-pointer"
                          >
                            <span>Buka Bait</span>
                            <ChevronRight size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              MaulidStorageService.removeBookmark(bm.id);
                              setBookmarks(MaulidStorageService.getBookmarks());
                              showToast('Bookmark berhasil dihapus');
                            }}
                            className="text-xs text-rose-500 hover:text-rose-700 px-2 py-1 hover:bg-rose-50 rounded-lg transition"
                          >
                            Hapus
                          </button>
                        </div>
                      </div>

                      <p className="text-right text-lg text-slate-800 leading-loose" dir="rtl" style={getArabicFontFamilyStyle()}>
                        {bm.teksArab}
                      </p>

                      <p className="text-xs text-slate-600 italic">
                        "{bm.terjemahan}"
                      </p>

                      {bm.catatan && (
                        <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-100 text-xs text-emerald-950 flex items-start gap-2">
                          <Sparkles size={14} className="text-emerald-700 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-bold block text-[11px] text-emerald-800">Catatan Refleksi:</span>
                            <p className="whitespace-pre-wrap">{bm.catatan}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: BIOGRAFI ULAMA PENYUSUN */}
          {activeTab === 'biografi' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {DAFTAR_KITAB_MAULID.map((kitab, index) => (
                <div 
                  key={kitab.id}
                  className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-2xs space-y-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-900 font-bold text-xs flex items-center justify-center shrink-0">
                      {index + 1}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-slate-900 text-sm truncate">{kitab.pengarang}</h3>
                      <p className="text-xs text-emerald-700 font-medium truncate">{kitab.pengarangGelar}</p>
                    </div>
                  </div>

                  <div className="space-y-1.5 text-xs text-slate-600 leading-relaxed border-t border-slate-100 pt-3">
                    <div>
                      <span className="font-semibold text-slate-800">Karya Agung: </span>
                      {kitab.nama}
                    </div>
                    <div>
                      <span className="font-semibold text-slate-800">Masa Hidup / Wafat: </span>
                      {kitab.tahunWafat} • {kitab.kotaKelahiran}
                    </div>
                    <p className="text-slate-500 pt-1 line-clamp-3">
                      {kitab.latarBelakang}
                    </p>
                  </div>

                  <div className="pt-2">
                    <button
                      onClick={() => {
                        setSelectedKitab(kitab);
                        setSelectedFashlIndex(0);
                        setActiveTab('reader');
                      }}
                      className="w-full py-2 bg-slate-50 hover:bg-emerald-50 text-slate-700 hover:text-emerald-800 border border-slate-200 hover:border-emerald-300 rounded-xl text-xs font-semibold transition flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <BookOpen size={14} />
                      <span>Baca Kitab {kitab.nama}</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* ------------------------------------------------------------- */
        /* VIEW 2: READER VIEW (MODELED EXACTLY AFTER AL-QURAN READER)   */
        /* ------------------------------------------------------------- */
        <div className="max-w-4xl mx-auto px-0 sm:px-6 pt-0 sm:pt-6 pb-6 space-y-4 sm:space-y-5">
          {/* Reader Top Navigation Bar */}
          <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-md px-3 sm:px-4 py-2.5 sm:py-4 rounded-none sm:rounded-2xl border-b sm:border border-slate-200/90 shadow-xs sm:shadow-md flex items-center justify-between gap-1.5 sm:gap-2">
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
              <button
                type="button"
                onClick={() => setActiveTab('katalog')}
                className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition cursor-pointer flex items-center gap-1 text-xs font-bold shrink-0"
                title="Kembali ke Daftar Kitab"
              >
                <ArrowLeft size={16} />
                <span className="hidden sm:inline">Daftar Kitab</span>
              </button>

              {/* Kitab Dropdown Switcher */}
              <div className="min-w-0 flex-1">
                <select
                  value={selectedKitab.id}
                  onChange={(e) => {
                    const found = DAFTAR_KITAB_MAULID.find(k => k.id === e.target.value);
                    if (found) {
                      setSelectedKitab(found);
                      setSelectedFashlIndex(0);
                    }
                  }}
                  className="w-full bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-800 font-bold text-xs sm:text-sm rounded-xl px-2 sm:px-2.5 py-2 outline-none cursor-pointer truncate"
                >
                  {DAFTAR_KITAB_MAULID.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.nama} ({k.totalFashl} Fashal)
                    </option>
                  ))}
                </select>
              </div>

              {/* Fashal Dropdown Switcher */}
              <div className="min-w-0 flex-1 hidden md:block">
                <select
                  value={selectedFashlIndex}
                  onChange={(e) => setSelectedFashlIndex(Number(e.target.value))}
                  className="w-full bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-800 font-bold text-xs sm:text-sm rounded-xl px-2 sm:px-2.5 py-2 outline-none cursor-pointer truncate"
                >
                  {selectedKitab.fashls.map((f, idx) => (
                    <option key={f.id} value={idx}>
                      Fashal {f.nomor}: {f.judul}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {/* Prev/Next Fashal */}
              <button
                type="button"
                onClick={() => setSelectedFashlIndex(Math.max(0, selectedFashlIndex - 1))}
                disabled={selectedFashlIndex <= 0}
                className="p-2 border border-slate-200 rounded-xl hover:bg-slate-100 text-slate-700 disabled:opacity-30 transition cursor-pointer"
                title="Fashal Sebelumnya"
              >
                <ChevronLeft size={16} />
              </button>

              <span className="text-xs font-bold text-slate-500 px-1 font-mono">
                {selectedFashlIndex + 1}/{selectedKitab.fashls.length}
              </span>

              <button
                type="button"
                onClick={() => setSelectedFashlIndex(Math.min(selectedKitab.fashls.length - 1, selectedFashlIndex + 1))}
                disabled={selectedFashlIndex >= selectedKitab.fashls.length - 1}
                className="p-2 border border-slate-200 rounded-xl hover:bg-slate-100 text-slate-700 disabled:opacity-30 transition cursor-pointer"
                title="Fashal Selanjutnya"
              >
                <ChevronRight size={16} />
              </button>

              {/* Audio Button */}
              <button
                type="button"
                onClick={() => setIsAudioPlayerOpen(true)}
                className="px-2.5 sm:px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer shrink-0"
                title="Putar Audio Shalawat"
              >
                <Volume2 size={14} />
                <span className="hidden sm:inline">Audio</span>
              </button>

              {/* Settings button */}
              <button
                type="button"
                onClick={() => setIsSettingsOpen(true)}
                className="p-2 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer shrink-0"
                title="Pengaturan Tampilan Teks"
              >
                <Settings2 size={18} />
              </button>
            </div>
          </div>

          {/* Reader Content Body (with mobile horizontal padding) */}
          <div className="px-3 sm:px-0 space-y-4 sm:space-y-5">
            {/* Kitab Banner Card (Modeled after Surah Banner Card) */}
            <div className="bg-gradient-to-br from-emerald-800 via-teal-900 to-emerald-950 text-white rounded-3xl p-6 sm:p-8 shadow-xl relative overflow-hidden text-center space-y-2 border border-emerald-700/40">
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight">
              {selectedKitab.nama}
            </h2>
            <p className="text-emerald-100/90 text-sm font-medium">
              Karya {selectedKitab.pengarang} ({selectedKitab.tahunWafat})
            </p>
            <div className="flex items-center justify-center gap-2 text-xs text-emerald-200/80 pt-2 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-full bg-white/10 backdrop-blur-xs">
                {selectedKitab.kotaKelahiran}
              </span>
              <span>•</span>
              <span className="px-2.5 py-0.5 rounded-full bg-white/10 backdrop-blur-xs">
                {selectedKitab.totalFashl} Fashal
              </span>
              <span>•</span>
              <span className="px-2.5 py-0.5 rounded-full bg-white/10 backdrop-blur-xs">
                {selectedKitab.totalBait} Bait
              </span>
            </div>
          </div>

          {/* Current Fashal Card Heading */}
          <div className={`p-4 sm:p-5 rounded-2xl border text-center transition ${
            activeFashl.isMahalulQiyam && settings.highlightMahalulQiyam
              ? 'bg-amber-50/80 border-amber-300 shadow-2xs'
              : 'bg-white border-slate-200/80 shadow-2xs'
          }`}>
            {activeFashl.isMahalulQiyam && (
              <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-500/20 text-amber-800 text-xs font-bold rounded-full mb-2 border border-amber-500/30">
                <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                <span>MAHALUL QIYAM (BERDIRI)</span>
              </div>
            )}
            <div className="text-xs sm:text-sm font-bold text-slate-800">
              Fashal {activeFashl.nomor}: {activeFashl.judul}
            </div>
          </div>

          {/* Baits List (Modeled after Ayah Cards in Al-Quran) */}
          <div className="space-y-4">
            {activeFashl.baits.map((bait) => {
              const isBookmarked = bookmarks.some(
                b => b.kitabId === selectedKitab.id && b.fashlId === activeFashl.id && b.baitNomor === bait.nomorBait
              );

              return (
                <div
                  key={bait.nomorBait}
                  className={`bg-white rounded-2xl border transition-all p-4 sm:p-6 space-y-4 relative ${
                    bait.isMahalulQiyam && settings.highlightMahalulQiyam
                      ? 'border-amber-400 bg-amber-50/20 ring-1 ring-amber-400/20'
                      : 'border-slate-200/90 shadow-2xs hover:border-slate-300'
                  }`}
                >
                  {/* Top bait actions bar */}
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 font-bold text-xs flex items-center justify-center font-mono">
                        {bait.nomorBait}
                      </div>
                      <span className="text-[11px] text-slate-400 font-medium">
                        {selectedKitab.nama} • Fashal {activeFashl.nomor}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      {/* Copy Bait */}
                      <button
                        type="button"
                        onClick={() => handleCopyBait(bait, selectedKitab.nama, activeFashl.judul)}
                        className="p-2 text-slate-400 hover:text-emerald-700 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                        title="Salin Bait"
                      >
                        <Copy size={16} />
                      </button>

                      {/* Share Bait */}
                      <button
                        type="button"
                        onClick={() => handleShareBait(bait, selectedKitab.nama)}
                        className="p-2 text-slate-400 hover:text-emerald-700 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                        title="Bagikan Bait"
                      >
                        <Share2 size={16} />
                      </button>

                      {/* Bookmark Button */}
                      <button
                        type="button"
                        onClick={() => handleOpenBookmarkModal(selectedKitab, activeFashl, bait)}
                        className={`p-2 rounded-xl transition cursor-pointer ${
                          isBookmarked 
                            ? 'text-amber-500 hover:text-amber-600 bg-amber-50' 
                            : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                        }`}
                        title={isBookmarked ? 'Bait telah disimpan (Klik untuk ubah)' : 'Simpan Tanda Baca'}
                      >
                        {isBookmarked ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
                      </button>
                    </div>
                  </div>

                  {/* Arabic Text */}
                  <div 
                    dir="rtl"
                    style={getArabicFontFamilyStyle()}
                    className={`text-right text-slate-900 tracking-wide py-2 ${getArabicSizeClass()}`}
                  >
                    {bait.teksArab}
                  </div>

                  {/* Transliteration Latin */}
                  {settings.showLatin && bait.latin && (
                    <div className="text-xs sm:text-sm font-medium text-emerald-800 pt-2 border-t border-slate-100 leading-relaxed">
                      {bait.latin}
                    </div>
                  )}

                  {/* Indonesian Translation */}
                  {settings.showTranslation && (
                    <div className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                      "{bait.terjemahan}"
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Bottom Pagination */}
          <div className="flex items-center justify-between p-4 bg-white border border-slate-200/90 rounded-2xl shadow-xs">
            <button
              onClick={() => {
                setSelectedFashlIndex(Math.max(0, selectedFashlIndex - 1));
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              disabled={selectedFashlIndex <= 0}
              className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold hover:bg-slate-50 disabled:opacity-40 transition flex items-center gap-1.5 cursor-pointer"
            >
              <ChevronLeft size={16} />
              <span>Fashal Sebelumnya</span>
            </button>

            <div className="text-xs text-slate-500 font-medium hidden sm:block">
              Fashal {activeFashl.nomor} dari {selectedKitab.fashls.length}
            </div>

            <button
              onClick={() => {
                setSelectedFashlIndex(Math.min(selectedKitab.fashls.length - 1, selectedFashlIndex + 1));
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              disabled={selectedFashlIndex >= selectedKitab.fashls.length - 1}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold disabled:opacity-40 transition flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <span>Fashal Berikutnya</span>
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
    )}

      {/* Settings Modal */}
      <MaulidSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onUpdateSettings={(newSettings) => setSettings({ ...settings, ...newSettings })}
      />

      {/* Bookmark Modal */}
      {bookmarkModalData && (
        <MaulidBookmarkModal
          isOpen={bookmarkModalData.isOpen}
          onClose={() => setBookmarkModalData(null)}
          kitabNama={bookmarkModalData.kitabNama}
          fashlJudul={bookmarkModalData.fashlJudul}
          baitNomor={bookmarkModalData.baitNomor}
          teksArab={bookmarkModalData.teksArab}
          terjemahan={bookmarkModalData.terjemahan}
          existingNote={bookmarkModalData.existingNote}
          onSave={handleSaveBookmark}
          onDelete={handleDeleteBookmark}
        />
      )}

      {/* Audio Player Drawer */}
      {selectedKitab && activeFashl && (
        <MaulidAudioPlayer
          isOpen={isAudioPlayerOpen}
          onClose={() => setIsAudioPlayerOpen(false)}
          kitab={selectedKitab}
          currentFashl={activeFashl}
          onSelectFashl={(idx) => setSelectedFashlIndex(idx)}
        />
      )}
    </div>
  );
};

