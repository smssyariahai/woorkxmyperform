'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { 
  BookOpen, Search, Bookmark, BookmarkCheck, Globe, Volume2, 
  Settings2, ChevronLeft, ChevronRight, Play, Pause, Copy, 
  Check, Clock, Share2, Sparkles, AlertCircle, ArrowLeft,
  BookMarked, Eye, ListFilter, SlidersHorizontal, Trash2,
  BookOpenText, X
} from 'lucide-react';
import { 
  SurahInfo, AyahData, QuranBookmarkItem, 
  LastReadPosition, QuranReaderSettings 
} from '@/lib/islami/types/quran';
import {
  getSurahsInfo, getSurahDetail,
  AUDIO_RECITERS, QURAN_ARABIC_FONTS,
} from '@/lib/islami/quranStorage';
import {
  subscribeUserBookmarks, subscribePublicQuranNotes,
  fetchUserBookmarks, fetchPublicQuranNotes,
  saveLastRead, getLastRead,
} from '@/lib/islami/quranBookmarks';
import { QURAN_JUZ_LIST } from '@/lib/islami/data/quranJuzData';
import { QuranAudioPlayer } from '@/components/islami/quran/QuranAudioPlayer';
import { QuranBookmarkModal } from '@/components/islami/quran/QuranBookmarkModal';
import { QuranSettingsModal } from '@/components/islami/quran/QuranSettingsModal';
import { QuranTafsirModal } from '@/components/islami/quran/QuranTafsirModal';
import { AyahOrnament } from '@/components/islami/quran/AyahOrnament';

export default function AlQuranPage() {

  // Navigation and view state
  const [activeTab, setActiveTab] = useState<'surah' | 'juz' | 'bookmarks' | 'public_notes'>('surah');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedSurah, setSelectedSurah] = useState<SurahInfo | null>(null);
  const [ayahs, setAyahs] = useState<AyahData[]>([]);
  const [isLoadingAyahs, setIsLoadingAyahs] = useState<boolean>(false);
  const [allSurahs, setAllSurahs] = useState<SurahInfo[]>([]);
  const [isLoadingSurahs, setIsLoadingSurahs] = useState<boolean>(true);

  // Bookmarks state
  const [userBookmarks, setUserBookmarks] = useState<QuranBookmarkItem[]>([]);
  const [publicNotes, setPublicNotes] = useState<QuranBookmarkItem[]>([]);
  const [lastRead, setLastRead] = useState<LastReadPosition | null>(null);

  // Audio player state
  const [isPlayerOpen, setIsPlayerOpen] = useState<boolean>(false);
  const [currentPlayingAyah, setCurrentPlayingAyah] = useState<number>(1);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  // Reader settings state
  const [settings, setSettings] = useState<QuranReaderSettings>({
    arabicFontSize: 'medium',
    latinFontSize: 'medium',
    translationFontSize: 'medium',
    arabicFont: 'amiri-quran',
    showAyahOrnament: true,
    showLatin: true,
    showTranslation: true,
    selectedReciter: 'alafasy',
    autoPlayNextAyah: true,
    playbackSpeed: 1,
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  // Bookmark Modal state
  const [bookmarkModalData, setBookmarkModalData] = useState<{
    isOpen: boolean;
    surah: SurahInfo | null;
    ayah: AyahData | null;
    existingBookmark: QuranBookmarkItem | null;
  }>({
    isOpen: false,
    surah: null,
    ayah: null,
    existingBookmark: null,
  });

  // Tafsir Modal state
  const [tafsirModalData, setTafsirModalData] = useState<{
    isOpen: boolean;
    surah: SurahInfo | null;
    ayah: AyahData | null;
  }>({
    isOpen: false,
    surah: null,
    ayah: null,
  });

  const handleOpenTafsir = (surah: SurahInfo, ayah: AyahData) => {
    setTafsirModalData({
      isOpen: true,
      surah,
      ayah,
    });
  };

  const handleSelectTafsirAyah = (newAyahNumber: number) => {
    const targetAyah = ayahs.find((a) => a.ayah === newAyahNumber);
    if (targetAyah && selectedSurah) {
      setTafsirModalData({
        isOpen: true,
        surah: selectedSurah,
        ayah: targetAyah,
      });
      ayahRefs.current[newAyahNumber]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  // UI Toast notification
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const ayahRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 2800);
  };

  // Load initial surahs info and last read position
  useEffect(() => {
    async function init() {
      try {
        setIsLoadingSurahs(true);
        const list = await getSurahsInfo();
        setAllSurahs(list);
      } catch (err) {
        console.error('Error loading surahs:', err);
      } finally {
        setIsLoadingSurahs(false);
      }
    }
    init();

    const savedLastRead = getLastRead();
    if (savedLastRead) {
      setLastRead(savedLastRead);
    }

    // Load saved settings
    try {
      const savedSettings = localStorage.getItem('quran_reader_settings');
      if (savedSettings) {
        setSettings(JSON.parse(savedSettings));
      }
    } catch {
      // ignore
    }
  }, []);

  // Muat bookmark pengguna dari API WOORK (/api/islami/bookmarks)
  useEffect(() => {
    const unsub = subscribeUserBookmarks((list) => {
      setUserBookmarks(list);
    });
    return () => unsub();
  }, []);

  // Subscribe to public notes
  useEffect(() => {
    const unsub = subscribePublicQuranNotes((notes) => {
      setPublicNotes(notes);
    });
    return () => unsub();
  }, []);

  const updateSettings = (newSettings: Partial<QuranReaderSettings>) => {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    try {
      localStorage.setItem('quran_reader_settings', JSON.stringify(updated));
    } catch {
      // ignore
    }
  };

  // Open a specific surah
  const openSurah = async (surah: SurahInfo, targetAyahNumber?: number) => {
    setSelectedSurah(surah);
    setIsLoadingAyahs(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });

    try {
      const data = await getSurahDetail(surah.id);
      setAyahs(data);

      if (targetAyahNumber) {
        setTimeout(() => {
          const el = ayahRefs.current[targetAyahNumber];
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 300);
      }
    } catch (err) {
      console.error('Error opening surah:', err);
      showToast('Gagal memuat ayat Al-Qur\'an.');
    } finally {
      setIsLoadingAyahs(false);
    }
  };

  // Mark as Last Read
  const handleSetLastRead = (surah: SurahInfo, ayahNumber: number) => {
    const pos: LastReadPosition = {
      surahId: surah.id,
      surahName: surah.latin,
      surahArabic: surah.arabic,
      ayahNumber,
      updatedAt: new Date().toISOString(),
    };
    saveLastRead(pos);
    setLastRead(pos);
    showToast(`Posisi terakhir disimpan: QS. ${surah.latin} ayat ${ayahNumber}`);
  };

  // Close / Dismiss banner Terakhir Dibaca
  const handleCloseLastRead = (e: React.MouseEvent) => {
    e.stopPropagation();
    setLastRead(null);
    try {
      localStorage.removeItem('quran_last_read_position');
    } catch {
      // ignore
    }
  };

  // Play audio for a specific verse
  const handlePlayAyahAudio = (ayahNumber: number) => {
    setCurrentPlayingAyah(ayahNumber);
    setIsPlaying(true);
    setIsPlayerOpen(true);

    const el = ayahRefs.current[ayahNumber];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  // Copy verse text to clipboard
  const handleCopyAyah = (surah: SurahInfo, ayah: AyahData) => {
    const textToCopy = `QS. ${surah.latin} [${surah.id}:${ayah.ayah}]\n\n${ayah.arabic}\n\n${ayah.latin}\n\nArtinya:\n"${ayah.translation}"\n\n(Al-Qur'an Kemenag RI)`;
    navigator.clipboard.writeText(textToCopy).then(() => {
      showToast(`Ayat ${ayah.ayah} berhasil disalin ke clipboard!`);
    }).catch(() => {
      showToast('Gagal menyalin teks.');
    });
  };

  // Open bookmark modal
  const handleOpenBookmarkModal = (surah: SurahInfo, ayah: AyahData) => {
    const existing = userBookmarks.find(
      (b) => b.surahId === surah.id && b.ayahNumber === ayah.ayah
    );
    setBookmarkModalData({
      isOpen: true,
      surah,
      ayah,
      existingBookmark: existing || null,
    });
  };

  // Muat ulang bookmark (dipanggil setelah simpan/hapus di modal)
  const refreshBookmarks = async () => {
    try {
      const [mine, pub] = await Promise.all([fetchUserBookmarks(), fetchPublicQuranNotes()]);
      setUserBookmarks(mine);
      setPublicNotes(pub);
    } catch (err) {
      console.error('Error refreshing bookmarks:', err);
    }
  };

  // Filter surahs
  const filteredSurahs = allSurahs.filter((s) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      s.latin.toLowerCase().includes(q) ||
      s.translation.toLowerCase().includes(q) ||
      s.arabic.includes(q) ||
      String(s.id) === q
    );
  });

  // Arabic font size classes
  const getArabicFontSizeClass = () => {
    switch (settings.arabicFontSize) {
      case 'small':
        return 'text-xl sm:text-2xl leading-loose sm:leading-[2.4]';
      case 'large':
        return 'text-3xl sm:text-4xl leading-[2.5] sm:leading-[2.8]';
      case 'xlarge':
        return 'text-4xl sm:text-5xl leading-[2.8] sm:leading-[3.2]';
      case 'medium':
      default:
        return 'text-2xl sm:text-3xl leading-[2.3] sm:leading-[2.6]';
    }
  };

  // Latin font size classes
  const getLatinFontSizeClass = () => {
    switch (settings.latinFontSize) {
      case 'small':
        return 'text-[11px] sm:text-xs leading-relaxed';
      case 'large':
        return 'text-sm sm:text-base leading-relaxed';
      case 'xlarge':
        return 'text-base sm:text-lg leading-relaxed';
      case 'medium':
      default:
        return 'text-xs sm:text-sm leading-relaxed';
    }
  };

  // Translation font size classes
  const getTranslationFontSizeClass = () => {
    switch (settings.translationFontSize) {
      case 'small':
        return 'text-[11px] sm:text-xs leading-relaxed';
      case 'large':
        return 'text-sm sm:text-base leading-relaxed';
      case 'xlarge':
        return 'text-base sm:text-lg leading-relaxed';
      case 'medium':
      default:
        return 'text-xs sm:text-sm leading-relaxed';
    }
  };

  // Font Arab: tidak ada class font-quran-* di WOORK (font Arab tidak
  // di-bundle), pakai fontFamily inline dari QURAN_ARABIC_FONTS.
  const arabicFontFamily =
    QURAN_ARABIC_FONTS.find((f) => f.id === settings.arabicFont)?.fontFamily ||
    QURAN_ARABIC_FONTS[0].fontFamily;

  return (
    <div className="min-h-screen bg-slate-50/50 text-slate-800 pb-28 -mx-4 sm:-mx-6 lg:-mx-8">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-slate-900/90 backdrop-blur-md text-white px-4 py-2.5 rounded-full text-xs sm:text-sm font-medium shadow-xl flex items-center gap-2 animate-in fade-in slide-in-from-top-3">
          <Check size={16} className="text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* VIEW 1: SURAH LIST / JUZ / BOOKMARKS / PUBLIC NOTES EXPLORER */}
      {/* ------------------------------------------------------------- */}
      {!selectedSurah ? (
        <div className="max-w-5xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-5">
          {/* Header Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs">
            <div className="flex items-center gap-3">
              <Link
                href="/islami"
                className="p-2 text-slate-500 hover:text-emerald-700 hover:bg-slate-100 rounded-xl transition shrink-0"
                title="Kembali ke Dashboard"
              >
                <ArrowLeft size={20} />
              </Link>
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white flex items-center justify-center shadow-md shadow-emerald-700/20 shrink-0">
                <BookOpen size={24} />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  Al-Qur'an Indonesia
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 font-medium">
                  Mushaf standar Kemenag RI, transliterasi Latin, murottal & bookmark multi-perangkat
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              <button
                type="button"
                onClick={() => setIsSettingsOpen(true)}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                title="Pengaturan & Kelola Cache"
              >
                <Settings2 size={16} />
                <span>Pengaturan</span>
              </button>
            </div>
          </div>

          {/* Banner: Terakhir Dibaca (Last Read) */}
          {lastRead && (
            <div className="bg-gradient-to-r from-emerald-800 via-teal-900 to-emerald-950 text-white p-4 sm:p-5 rounded-2xl shadow-lg relative overflow-hidden flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              {/* Tombol Close (X) di Pojok Kanan Atas KHUSUS TAMPILAN MOBILE */}
              <button
                type="button"
                onClick={handleCloseLastRead}
                aria-label="Tutup"
                title="Tutup Terakhir Dibaca"
                className="sm:hidden absolute top-3 right-3 p-1.5 rounded-full text-emerald-200/70 hover:text-white bg-black/20 hover:bg-black/40 backdrop-blur-xs transition z-20 cursor-pointer"
              >
                <X size={16} />
              </button>

              <div className="space-y-1 relative z-10 pr-8 sm:pr-0">
                <div className="flex items-center gap-2 text-emerald-300 text-xs font-bold uppercase tracking-wider">
                  <Clock size={14} />
                  <span>Terakhir Dibaca</span>
                </div>
                <div className="text-lg sm:text-xl font-bold flex items-center gap-2">
                  <span>QS. {lastRead.surahName}</span>
                  <span className="text-emerald-300 text-sm font-normal">Ayat {lastRead.ayahNumber}</span>
                </div>
                <p className="text-xs text-emerald-100/70">
                  Lanjutkan tilawah Anda dari bacaan sebelumnya
                </p>
              </div>

              {/* Action Container: Lanjutkan Membaca + Tombol Close di bawahnya pada Tablet & PC */}
              <div className="flex flex-col items-stretch sm:items-end gap-1.5 z-10 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => {
                    const s = allSurahs.find((item) => item.id === lastRead.surahId);
                    if (s) {
                      openSurah(s, lastRead.ayahNumber);
                    }
                  }}
                  className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs shadow-md transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>Lanjutkan Membaca</span>
                  <ChevronRight size={16} />
                </button>

                {/* Tombol Close di bawah Lanjutkan Membaca pada Tablet & PC */}
                <button
                  type="button"
                  onClick={handleCloseLastRead}
                  className="hidden sm:inline-flex items-center justify-center gap-1.5 px-3 py-1 text-xs text-emerald-200/80 hover:text-white hover:bg-white/10 rounded-lg transition cursor-pointer self-end"
                >
                  <X size={13} />
                  <span>Close</span>
                </button>
              </div>

              {/* Decorative Arabic watermark */}
              <div className="absolute -right-4 -bottom-6 text-7xl font-serif text-white/5 select-none pointer-events-none">
                {lastRead.surahArabic || 'القرآن'}
              </div>
            </div>
          )}

          {/* Search Box */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama surah (cth: Al-Kahf, Yasin), terjemahan, atau nomor surah..."
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

          {/* Navigation Tabs */}
          <div className="flex border-b border-slate-200 gap-1 sm:gap-2 overflow-x-auto pb-0.5">
            <button
              type="button"
              onClick={() => setActiveTab('surah')}
              className={`px-3.5 sm:px-4 py-2.5 font-bold text-xs sm:text-sm border-b-2 transition whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'surah'
                  ? 'border-emerald-600 text-emerald-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <BookOpen size={16} />
              <span>Surah ({allSurahs.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('juz')}
              className={`px-3.5 sm:px-4 py-2.5 font-bold text-xs sm:text-sm border-b-2 transition whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'juz'
                  ? 'border-emerald-600 text-emerald-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <ListFilter size={16} />
              <span>30 Juz</span>
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
              <span>Bookmark Saya ({userBookmarks.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('public_notes')}
              className={`px-3.5 sm:px-4 py-2.5 font-bold text-xs sm:text-sm border-b-2 transition whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'public_notes'
                  ? 'border-emerald-600 text-emerald-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Globe size={16} />
              <span>Catatan Publik ({publicNotes.length})</span>
            </button>
          </div>

          {/* TAB CONTENT: SURAH LIST */}
          {activeTab === 'surah' && (
            <div>
              {isLoadingSurahs ? (
                <div className="text-center py-16">
                  <div className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-xs text-slate-500 font-medium">Memuat mushaf Al-Qur'an...</p>
                </div>
              ) : filteredSurahs.length === 0 ? (
                <div className="bg-white rounded-2xl p-10 text-center border border-slate-200 text-slate-500 space-y-2">
                  <Search size={32} className="mx-auto text-slate-300" />
                  <p className="font-bold text-slate-700 text-sm">Surah tidak ditemukan</p>
                  <p className="text-xs">Coba kata kunci pencarian yang lain.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {filteredSurahs.map((surah) => (
                    <div
                      key={surah.id}
                      onClick={() => openSurah(surah)}
                      className="group bg-white hover:bg-emerald-50/40 p-4 rounded-2xl border border-slate-200/90 hover:border-emerald-400 hover:shadow-md transition-all cursor-pointer flex items-center justify-between gap-3 relative overflow-hidden"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Surah Number Hexagon/Badge */}
                        <div className="w-10 h-10 rounded-xl bg-slate-100 group-hover:bg-emerald-600 group-hover:text-white text-slate-700 font-bold text-xs flex items-center justify-center shrink-0 transition-colors shadow-2xs">
                          {surah.id}
                        </div>

                        <div className="min-w-0">
                          <h3 className="font-bold text-slate-900 group-hover:text-emerald-900 text-sm truncate">
                            {surah.latin}
                          </h3>
                          <p className="text-xs text-slate-500 truncate">
                            {surah.translation}
                          </p>
                          <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-0.5">
                            <span className="capitalize">{surah.location}</span>
                            <span>•</span>
                            <span>{surah.num_ayah} Ayat</span>
                          </div>
                        </div>
                      </div>

                      {/* Arabic Title */}
                      <div className="text-right shrink-0">
                        <span className="font-serif text-xl font-bold text-emerald-800 group-hover:text-emerald-700 block">
                          {surah.arabic}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          Juz {surah.juz_start}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB CONTENT: 30 JUZ */}
          {activeTab === 'juz' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {QURAN_JUZ_LIST.map((juz) => (
                <div
                  key={juz.juz}
                  onClick={() => {
                    const s = allSurahs.find((item) => item.id === juz.startSurahId);
                    if (s) {
                      openSurah(s, juz.startAyah);
                    }
                  }}
                  className="group bg-white hover:bg-emerald-50/40 p-4 rounded-2xl border border-slate-200/90 hover:border-emerald-400 hover:shadow-md transition-all cursor-pointer flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-900 font-black text-xs flex items-center justify-center shrink-0">
                      Juz {juz.juz}
                    </div>

                    <div className="min-w-0">
                      <div className="font-bold text-slate-900 group-hover:text-emerald-900 text-xs sm:text-sm truncate">
                        Mulai: {juz.startSurahName} : {juz.startAyah}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">
                        Hingga: {juz.endSurahName} : {juz.endAyah}
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="font-serif text-lg font-bold text-emerald-800">
                      {juz.arabicPhrase}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* TAB CONTENT: BOOKMARK SAYA */}
          {activeTab === 'bookmarks' && (
            <div className="space-y-4">

              {userBookmarks.length === 0 ? (
                <div className="bg-white rounded-2xl p-10 text-center border border-slate-200 text-slate-500 space-y-2">
                  <Bookmark size={36} className="mx-auto text-slate-300" />
                  <p className="font-bold text-slate-700 text-sm">Belum ada bookmark tersimpan</p>
                  <p className="text-xs max-w-sm mx-auto">
                    Saat membaca ayat, tekan ikon Bookmark untuk menandai dan menyimpan catatan tadabbur Anda.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {userBookmarks.map((bm) => (
                    <div
                      key={bm.id}
                      className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs hover:border-emerald-300 transition space-y-2.5"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-slate-900">
                            QS. {bm.surahName} : {bm.ayahNumber}
                          </span>
                          {bm.isPublic ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                              <Globe size={11} /> Publik
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                              Pribadi
                            </span>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            const s = allSurahs.find((item) => item.id === bm.surahId);
                            if (s) openSurah(s, bm.ayahNumber);
                          }}
                          className="text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 cursor-pointer"
                        >
                          <span>Buka Ayat</span>
                          <ChevronRight size={14} />
                        </button>
                      </div>

                      <p className="text-right text-lg font-serif text-slate-800 leading-loose" dir="rtl">
                        {bm.ayahArabic}
                      </p>

                      <p className="text-xs text-slate-600 italic">
                        "{bm.ayahTranslation}"
                      </p>

                      {bm.note && (
                        <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-100 text-xs text-emerald-950 flex items-start gap-2">
                          <Sparkles size={14} className="text-emerald-700 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-bold block text-[11px] text-emerald-800">Catatan Refleksi:</span>
                            <p className="whitespace-pre-wrap">{bm.note}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB CONTENT: CATATAN PUBLIK */}
          {activeTab === 'public_notes' && (
            <div className="space-y-4">
              <div className="p-3.5 bg-emerald-50 border border-emerald-200/80 rounded-2xl text-xs text-emerald-900 flex items-center gap-2">
                <Globe size={18} className="text-emerald-700 shrink-0" />
                <span>
                  Catatan tadabbur dan refleksi ayat yang dibagikan secara terbuka oleh sahabat Al-Qur'an.
                </span>
              </div>

              {publicNotes.length === 0 ? (
                <div className="bg-white rounded-2xl p-10 text-center border border-slate-200 text-slate-500 space-y-2">
                  <Globe size={36} className="mx-auto text-slate-300" />
                  <p className="font-bold text-slate-700 text-sm">Belum ada catatan publik</p>
                  <p className="text-xs max-w-sm mx-auto">
                    Jadilah yang pertama membagikan tadabbur ayat dengan menandai bookmark sebagai "Publik".
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {publicNotes.map((note) => (
                    <div
                      key={note.id}
                      className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-2.5"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-emerald-600 text-white font-bold text-xs flex items-center justify-center">
                            {note.userName ? note.userName.charAt(0).toUpperCase() : 'U'}
                          </div>
                          <div>
                            <span className="text-xs font-bold text-slate-800 block">
                              {note.userName}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              QS. {note.surahName} : {note.ayahNumber}
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            const s = allSurahs.find((item) => item.id === note.surahId);
                            if (s) openSurah(s, note.ayahNumber);
                          }}
                          className="text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 cursor-pointer"
                        >
                          <span>Buka Ayat</span>
                          <ChevronRight size={14} />
                        </button>
                      </div>

                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/70 text-xs text-slate-700 space-y-1">
                        <p className="text-right text-base font-serif text-slate-800 leading-relaxed" dir="rtl">
                          {note.ayahArabic}
                        </p>
                        <p className="text-[11px] text-slate-500 italic line-clamp-2">
                          "{note.ayahTranslation}"
                        </p>
                      </div>

                      <div className="p-3 bg-emerald-50/50 rounded-xl border border-emerald-100/80 text-xs text-slate-800">
                        <p className="whitespace-pre-wrap">{note.note}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        /* ------------------------------------------------------------- */
        /* VIEW 2: MUSHAF READER VIEW (BACA SURAH LENGKAP DENGAN AYAT)  */
        /* ------------------------------------------------------------- */
        <div className="max-w-4xl mx-auto px-0 sm:px-6 pt-0 sm:pt-6 pb-6 space-y-4 sm:space-y-5">
          {/* Reader Top Navigation Bar */}
          <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-md px-3 sm:px-4 py-2.5 sm:py-4 rounded-none sm:rounded-2xl border-b sm:border border-slate-200/90 shadow-xs sm:shadow-md flex items-center justify-between gap-1.5 sm:gap-2">
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
              <button
                type="button"
                onClick={() => setSelectedSurah(null)}
                className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition cursor-pointer flex items-center gap-1 text-xs font-bold shrink-0"
                title="Kembali ke Daftar Surah"
              >
                <ArrowLeft size={16} />
                <span className="hidden sm:inline">Daftar Surah</span>
              </button>

              {/* Surah Dropdown Switcher (Auto-expands to fill space between Back and Play button with exact same gap) */}
              <div className="min-w-0 flex-1">
                <select
                  value={selectedSurah.id}
                  onChange={(e) => {
                    const targetId = parseInt(e.target.value, 10);
                    const s = allSurahs.find((item) => item.id === targetId);
                    if (s) openSurah(s);
                  }}
                  className="w-full bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-800 font-bold text-xs sm:text-sm rounded-xl px-2 sm:px-2.5 py-2 outline-none cursor-pointer truncate"
                >
                  {allSurahs.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.id}. {s.latin} ({s.num_ayah} Ayat)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {/* Play Murottal Full Surah */}
              <button
                type="button"
                onClick={() => handlePlayAyahAudio(1)}
                className="px-2.5 sm:px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer shrink-0"
                title="Putar Murottal Surah Ini"
              >
                <Play size={14} />
                <span className="hidden sm:inline">Murottal</span>
              </button>

              {/* Settings button */}
              <button
                type="button"
                onClick={() => setIsSettingsOpen(true)}
                className="p-2 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer shrink-0"
                title="Pengaturan Tampilan Teks & Cache"
              >
                <Settings2 size={18} />
              </button>
            </div>
          </div>

          {/* Reader Content Body (with mobile horizontal padding) */}
          <div className="px-3 sm:px-0 space-y-4 sm:space-y-5">
            {/* Surah Banner Card */}
            <div className="bg-gradient-to-br from-emerald-800 via-teal-900 to-emerald-950 text-white rounded-3xl p-6 sm:p-8 shadow-xl relative overflow-hidden text-center space-y-2 border border-emerald-700/40">
            <span className="text-4xl sm:text-5xl font-bold block text-emerald-200 mb-1" style={{ fontFamily: arabicFontFamily }} dir="rtl">
              {selectedSurah.arabic}
            </span>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight">
              {selectedSurah.latin}
            </h2>
            <p className="text-emerald-100/90 text-sm font-medium">
              "{selectedSurah.translation}"
            </p>
            <div className="flex items-center justify-center gap-2 text-xs text-emerald-200/80 pt-2 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-full bg-white/10 backdrop-blur-xs">
                {selectedSurah.location}
              </span>
              <span>•</span>
              <span className="px-2.5 py-0.5 rounded-full bg-white/10 backdrop-blur-xs">
                {selectedSurah.num_ayah} Ayat
              </span>
              <span>•</span>
              <span className="px-2.5 py-0.5 rounded-full bg-white/10 backdrop-blur-xs">
                Juz {selectedSurah.juz_start}
              </span>
            </div>
          </div>

          {/* Bismillah Card (Except for Surah 9 At-Taubah) */}
          {selectedSurah.id !== 9 && selectedSurah.id !== 1 && (
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 text-center shadow-2xs">
              <p className="text-2xl sm:text-3xl text-emerald-900" style={{ fontFamily: arabicFontFamily }} dir="rtl">
                بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيْمِ
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Dengan nama Allah Yang Maha Pengasih lagi Maha Penyayang
              </p>
            </div>
          )}

          {/* Ayah List */}
          {isLoadingAyahs ? (
            <div className="text-center py-20 bg-white rounded-2xl border border-slate-200">
              <div className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-xs text-slate-500 font-medium">Memuat teks ayat mushaf...</p>
            </div>
          ) : (
            <div className="space-y-4">
              {ayahs.map((ayah) => {
                const isCurrentlyPlaying = isPlayerOpen && currentPlayingAyah === ayah.ayah;
                const isBookmarked = userBookmarks.some(
                  (b) => b.surahId === selectedSurah.id && b.ayahNumber === ayah.ayah
                );

                return (
                  <div
                    key={ayah.ayah}
                    ref={(el) => {
                      ayahRefs.current[ayah.ayah] = el;
                    }}
                    id={`ayah-${ayah.ayah}`}
                    className={`bg-white rounded-2xl border transition-all p-4 sm:p-6 space-y-4 relative ${
                      isCurrentlyPlaying
                        ? 'border-emerald-500 ring-2 ring-emerald-500/20 shadow-md bg-emerald-50/20'
                        : 'border-slate-200/90 shadow-2xs hover:border-slate-300'
                    }`}
                  >
                    {/* Top verse actions bar */}
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      {/* Verse Number Badge */}
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 font-bold text-xs flex items-center justify-center">
                          {ayah.ayah}
                        </div>
                        <span className="text-[11px] text-slate-400 font-medium">
                          QS. {selectedSurah.id}:{ayah.ayah}
                        </span>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-1">
                        {/* Play Ayah Audio */}
                        <button
                          type="button"
                          onClick={() => handlePlayAyahAudio(ayah.ayah)}
                          className={`p-2 rounded-xl transition cursor-pointer ${
                            isCurrentlyPlaying && isPlaying
                              ? 'bg-emerald-600 text-white'
                              : 'text-slate-500 hover:text-emerald-700 hover:bg-slate-100'
                          }`}
                          title="Putar Murottal Ayat Ini"
                        >
                          <Volume2 size={16} />
                        </button>

                        {/* Bookmark Button */}
                        <button
                          type="button"
                          onClick={() => handleOpenBookmarkModal(selectedSurah, ayah)}
                          className={`p-2 rounded-xl transition cursor-pointer ${
                            isBookmarked
                              ? 'text-emerald-600 bg-emerald-50'
                              : 'text-slate-500 hover:text-emerald-700 hover:bg-slate-100'
                          }`}
                          title={isBookmarked ? 'Edit Bookmark / Catatan' : 'Simpan Bookmark'}
                        >
                          {isBookmarked ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
                        </button>

                        {/* Tafsir Kemenag Button */}
                        <button
                          type="button"
                          onClick={() => handleOpenTafsir(selectedSurah, ayah)}
                          className="p-2 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-xl transition cursor-pointer"
                          title="Baca Tafsir Kemenag RI"
                        >
                          <BookOpenText size={16} />
                        </button>

                        {/* Copy Verse */}
                        <button
                          type="button"
                          onClick={() => handleCopyAyah(selectedSurah, ayah)}
                          className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                          title="Salin Ayat"
                        >
                          <Copy size={16} />
                        </button>

                        {/* Mark Last Read */}
                        <button
                          type="button"
                          onClick={() => handleSetLastRead(selectedSurah, ayah.ayah)}
                          className="p-2 text-slate-500 hover:text-amber-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                          title="Tandai Posisi Terakhir Dibaca"
                        >
                          <BookMarked size={16} />
                        </button>
                      </div>
                    </div>

                    {/* Arabic Text */}
                    <div className="pt-2">
                      <p
                        className={`text-right text-slate-900 ${getArabicFontSizeClass()}`}
                        style={{ fontFamily: arabicFontFamily }}
                        dir="rtl"
                      >
                        {ayah.arabic}
                        {settings.showAyahOrnament !== false ? (
                          <AyahOrnament
                            number={ayah.ayah}
                            size={
                              settings.arabicFontSize === 'xlarge'
                                ? 38
                                : settings.arabicFontSize === 'large'
                                ? 34
                                : settings.arabicFontSize === 'small'
                                ? 26
                                : 30
                            }
                          />
                        ) : (
                          <span className="inline-block text-emerald-700 font-sans text-xs px-2 py-0.5 mx-1 border border-emerald-300 rounded-full select-none align-middle font-normal">
                            {ayah.ayah}
                          </span>
                        )}
                      </p>
                    </div>

                    {/* Transliteration Latin (Optional) */}
                    {settings.showLatin && (
                      <div className={`text-emerald-800/90 font-medium ${getLatinFontSizeClass()}`}>
                        {ayah.latin}
                      </div>
                    )}

                    {/* Indonesian Translation (Optional) */}
                    {settings.showTranslation && (
                      <div className={`text-slate-600 border-t border-slate-100 pt-2.5 ${getTranslationFontSizeClass()}`}>
                        {ayah.translation}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Bottom Next/Prev Surah Navigation */}
          <div className="flex items-center justify-between gap-3 pt-6 border-t border-slate-200">
            {selectedSurah.id > 1 ? (
              <button
                type="button"
                onClick={() => {
                  const prev = allSurahs.find((s) => s.id === selectedSurah.id - 1);
                  if (prev) openSurah(prev);
                }}
                className="px-4 py-2.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
              >
                <ChevronLeft size={16} />
                <span>Surah Sebelumnya</span>
              </button>
            ) : <div />}

            {selectedSurah.id < 114 ? (
              <button
                type="button"
                onClick={() => {
                  const next = allSurahs.find((s) => s.id === selectedSurah.id + 1);
                  if (next) openSurah(next);
                }}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-xs"
              >
                <span>Surah Selanjutnya</span>
                <ChevronRight size={16} />
              </button>
            ) : <div />}
          </div>
        </div>
      </div>
    )}

      {/* Floating Audio Player (When active) */}
      {isPlayerOpen && selectedSurah && ayahs.length > 0 && (
        <QuranAudioPlayer
          currentSurah={selectedSurah}
          ayahs={ayahs}
          currentAyahNumber={currentPlayingAyah}
          isPlaying={isPlaying}
          reciterId={settings.selectedReciter}
          autoPlayNext={settings.autoPlayNextAyah}
          playbackSpeed={settings.playbackSpeed}
          onAyahChange={(newAyah) => {
            setCurrentPlayingAyah(newAyah);
            const el = ayahRefs.current[newAyah];
            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }}
          onPlayPauseToggle={() => setIsPlaying(!isPlaying)}
          onClosePlayer={() => {
            setIsPlayerOpen(false);
            setIsPlaying(false);
          }}
          onReciterChange={(reciterId) => updateSettings({ selectedReciter: reciterId })}
          onAutoPlayToggle={() => updateSettings({ autoPlayNextAyah: !settings.autoPlayNextAyah })}
          onSpeedChange={(speed) => updateSettings({ playbackSpeed: speed })}
        />
      )}

      {/* Bookmark Modal */}
      {bookmarkModalData.isOpen && bookmarkModalData.surah && bookmarkModalData.ayah && (
        <QuranBookmarkModal
          isOpen={bookmarkModalData.isOpen}
          onClose={() => setBookmarkModalData((prev) => ({ ...prev, isOpen: false }))}
          surah={bookmarkModalData.surah}
          ayah={bookmarkModalData.ayah}
          existingBookmark={bookmarkModalData.existingBookmark}
          onSuccess={() => {
            showToast('Bookmark berhasil diperbarui!');
            void refreshBookmarks();
          }}
        />
      )}

      {/* Settings Modal (Including Cache Manager) */}
      <QuranSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onUpdateSettings={updateSettings}
      />

      {/* Tafsir Modal */}
      <QuranTafsirModal
        isOpen={tafsirModalData.isOpen}
        onClose={() => setTafsirModalData((prev) => ({ ...prev, isOpen: false }))}
        surah={tafsirModalData.surah}
        ayah={tafsirModalData.ayah}
        allAyahs={ayahs}
        onSelectAyah={handleSelectTafsirAyah}
        arabicFont={settings.arabicFont}
      />
    </div>
  );
};
