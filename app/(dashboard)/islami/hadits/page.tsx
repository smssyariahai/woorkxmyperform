'use client';

import { useState, useEffect, useMemo } from "react";
import {
  BookOpen,
  Search,
  Bookmark,
  Share2,
  Copy,
  Check,
  ArrowRight,
  Database,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  CheckCircle2,
  FileCode,
  BookText,
  X,
  RotateCcw,
  Hash
} from "lucide-react";
import { HaditsDatabaseService, BookmarkItem } from "@/lib/islami/haditsClient";
import { KitabInfo, HaditsItem, HaditsGroupType, HaditsDatabaseReport } from "@/lib/islami/types/hadits";

type TabView = "katalog" | "pembaca" | "bookmark" | "audit_db";

export default function HaditsDatabasePage() {
  const [activeTab, setActiveTab] = useState<TabView>("katalog");
  const [selectedGrup, setSelectedGrup] = useState<HaditsGroupType | "all">("all");
  const [selectedKitabId, setSelectedKitabId] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [inputHaditsNomor, setInputHaditsNomor] = useState<string>("");
  const [activeNomorFilter, setActiveNomorFilter] = useState<number | null>(null);

  // Reader State
  const [activeKitab, setActiveKitab] = useState<KitabInfo | null>(null);
  const [haditsList, setHaditsList] = useState<HaditsItem[]>([]);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalItems, setTotalItems] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Settings & Interactivity
  const [fontSize, setFontSize] = useState<number>(() => HaditsDatabaseService.getFontSize());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>(() => HaditsDatabaseService.getBookmarks());
  const [exportFormat, setExportFormat] = useState<"postgres" | "firestore" | "rag_ai">("postgres");
  const [copiedExport, setCopiedExport] = useState(false);

  // Metadata kitab & statistik dimuat dari API WOORK (/api/hadits/books, /api/hadits/stats)
  const [allKitab, setAllKitab] = useState<KitabInfo[]>([]);
  const [auditReport, setAuditReport] = useState<HaditsDatabaseReport | null>(null);

  useEffect(() => {
    let mounted = true;
    HaditsDatabaseService.getKitabList().then((list) => {
      if (mounted) setAllKitab(list);
    });
    HaditsDatabaseService.getAuditReport().then((rep) => {
      if (mounted) setAuditReport(rep);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const totalHaditsAll = useMemo(
    () => allKitab.reduce((acc, k) => acc + k.totalHadits, 0),
    [allKitab]
  );
  const countByGrup = useMemo(
    () => (grup: HaditsGroupType) => allKitab.filter((k) => k.grup === grup).length,
    [allKitab]
  );

  // Filtered books in catalog
  const displayedKitabList = useMemo(() => {
    let list = allKitab;
    if (selectedGrup !== "all") {
      list = list.filter(k => k.grup === selectedGrup);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(k =>
        k.nama.toLowerCase().includes(q) ||
        k.namaArab.includes(q) ||
        k.pengarang.toLowerCase().includes(q) ||
        k.deskripsi.toLowerCase().includes(q)
      );
    }
    return list;
  }, [allKitab, selectedGrup, searchQuery]);

  // Load hadiths when entering reader or changing filter/page/nomor
  useEffect(() => {
    if (activeTab !== "pembaca") return;

    let isMounted = true;
    const fetchHadits = async () => {
      setIsLoading(true);
      const res = await HaditsDatabaseService.queryHadits({
        kitabId: selectedKitabId !== "all" ? selectedKitabId : undefined,
        grup: selectedGrup !== "all" ? selectedGrup : undefined,
        search: searchQuery.trim() || undefined,
        nomor: activeNomorFilter !== null ? activeNomorFilter : undefined,
        page: currentPage,
        limit: 20
      });

      if (isMounted) {
        setHaditsList(res.items);
        setTotalPages(res.pagination.totalPages || 1);
        setTotalItems(res.pagination.total || 0);
        setIsLoading(false);
      }
    };

    fetchHadits();
    return () => {
      isMounted = false;
    };
  }, [activeTab, selectedKitabId, selectedGrup, searchQuery, activeNomorFilter, currentPage]);

  const handleOpenKitab = (kitab: KitabInfo) => {
    setActiveKitab(kitab);
    setSelectedKitabId(kitab.id);
    setActiveNomorFilter(null);
    setInputHaditsNomor("");
    setCurrentPage(1);
    setActiveTab("pembaca");
  };

  const handleCopyHadits = async (item: HaditsItem) => {
    const kNama = item.kitabNama || item.nama_kitab || "Hadits";
    const hNo = item.nomor ?? item.nomor_hadits ?? 0;
    const hArab = item.arab || item.teks_arab || "";
    const hTerjemahan = item.terjemahan || item.terjemahan_indonesia || "";

    const text = `Hadits ${kNama} No. ${hNo}:\n\n${hArab}\n\nArtinya:\n"${hTerjemahan}"\n\n(Kitab Hadits Terpadu)`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(item.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      console.error("Gagal menyalin hadits");
    }
  };

  const handleShareHadits = async (item: HaditsItem) => {
    const kNama = item.kitabNama || item.nama_kitab || "Hadits";
    const hNo = item.nomor ?? item.nomor_hadits ?? 0;
    const hArab = item.arab || item.teks_arab || "";
    const hTerjemahan = item.terjemahan || item.terjemahan_indonesia || "";

    const text = `Hadits ${kNama} No. ${hNo}:\n\n${hArab}\n\nArtinya:\n"${hTerjemahan}"`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Hadits ${kNama} No. ${hNo}`,
          text: text,
          url: window.location.href
        });
      } catch {}
    } else {
      handleCopyHadits(item);
    }
  };

  const handleToggleBookmark = (item: HaditsItem) => {
    HaditsDatabaseService.toggleBookmark(item);
    setBookmarks(HaditsDatabaseService.getBookmarks());
  };

  const handleJumpToNumber = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanInput = inputHaditsNomor.trim();
    if (!cleanInput) {
      setActiveNomorFilter(null);
      setCurrentPage(1);
      return;
    }

    const num = parseInt(cleanInput, 10);
    if (!isNaN(num) && num > 0) {
      // Default to Bukhari if 'all' is currently selected and user didn't choose a specific book
      if (selectedKitabId === "all" && allKitab.length > 0) {
        setSelectedKitabId("bukhari");
        const k = allKitab.find(item => item.id === "bukhari");
        if (k) setActiveKitab(k);
      }
      setActiveNomorFilter(num);
      setCurrentPage(1);
      setActiveTab("pembaca");
    }
  };

  const handleResetNomorFilter = () => {
    setActiveNomorFilter(null);
    setInputHaditsNomor("");
    setCurrentPage(1);
  };

  const handleChangeFontSize = (delta: number) => {
    const newSize = Math.max(18, Math.min(36, fontSize + delta));
    setFontSize(newSize);
    HaditsDatabaseService.setFontSize(newSize);
  };

  const handleCopyExport = async () => {
    let content = "";
    if (exportFormat === "postgres") content = HaditsDatabaseService.generatePostgresSqlScript(allKitab.length, totalHaditsAll);
    else if (exportFormat === "firestore") content = HaditsDatabaseService.generateFirestoreExportData(allKitab, totalHaditsAll);
    else content = HaditsDatabaseService.generateRagSemanticExport(allKitab);

    try {
      await navigator.clipboard.writeText(content);
      setCopiedExport(true);
      setTimeout(() => setCopiedExport(false), 2000);
    } catch {}
  };

  return (
    <div className="w-full min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 pb-16 -mx-4 sm:-mx-6 lg:-mx-8">
      {/* Header Banner (Compact) */}
      <div className="bg-gradient-to-br from-emerald-800 via-teal-900 to-slate-900 text-white shadow-md border-b border-emerald-700/30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-emerald-300 text-xs sm:text-sm font-semibold tracking-wide uppercase">
              <BookOpen className="w-4 h-4" />
              <span>Koleksi Hadits Lengkap & Terpadu</span>
            </div>

            {/* Navigation Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            <button
              onClick={() => setActiveTab("katalog")}
              className={`px-3.5 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === "katalog"
                  ? "bg-emerald-500 text-white shadow-md shadow-emerald-900/40"
                  : "bg-white/10 hover:bg-white/20 text-emerald-100"
              }`}
            >
              <BookText className="w-4 h-4" />
              <span>Katalog Kitab ({allKitab.length})</span>
            </button>

            <button
              onClick={() => {
                setActiveTab("pembaca");
                if (selectedKitabId === "all" && allKitab.length > 0) {
                  setSelectedKitabId("bukhari");
                  setActiveKitab(allKitab[0]);
                }
              }}
              className={`px-3.5 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === "pembaca"
                  ? "bg-emerald-500 text-white shadow-md shadow-emerald-900/40"
                  : "bg-white/10 hover:bg-white/20 text-emerald-100"
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span>Pembaca Hadits</span>
            </button>

            <button
              onClick={() => setActiveTab("bookmark")}
              className={`px-3.5 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === "bookmark"
                  ? "bg-emerald-500 text-white shadow-md shadow-emerald-900/40"
                  : "bg-white/10 hover:bg-white/20 text-emerald-100"
              }`}
            >
              <Bookmark className="w-4 h-4" />
              <span>Tanda Baca ({bookmarks.length})</span>
            </button>

            <button
              onClick={() => setActiveTab("audit_db")}
              className={`px-3.5 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === "audit_db"
                  ? "bg-emerald-500 text-white shadow-md shadow-emerald-900/40"
                  : "bg-white/10 hover:bg-white/20 text-emerald-100"
              }`}
            >
              <Database className="w-4 h-4" />
              <span>Audit & Ekspor DB</span>
            </button>
          </div>
        </div>
      </div>
    </div>

      {/* Main Content Area */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {/* ========================================== */}
        {/* TAB 1: KATALOG KITAB */}
        {/* ========================================== */}
        {activeTab === "katalog" && (
          <div className="space-y-6">
            {/* Filter Bar & Quick Number Jump */}
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
              {/* Search Box */}
              <div className="relative w-full md:w-72">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Cari nama kitab, pengarang..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Quick Hadith Number Input */}
              <form onSubmit={handleJumpToNumber} className="flex items-center gap-1.5 w-full md:w-auto">
                <div className="relative flex-1 md:w-44">
                  <Hash className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="number"
                    min="1"
                    placeholder="Buka No. Hadits..."
                    value={inputHaditsNomor}
                    onChange={(e) => setInputHaditsNomor(e.target.value)}
                    className="w-full pl-8 pr-2.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <button
                  type="submit"
                  className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors flex items-center gap-1"
                >
                  <span>Buka</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </form>

              {/* Group Pill Switcher */}
              <div className="flex items-center gap-1.5 w-full md:w-auto overflow-x-auto pb-1 md:pb-0 scrollbar-none">
                <button
                  onClick={() => setSelectedGrup("all")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                    selectedGrup === "all"
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                  }`}
                >
                  Semua ({allKitab.length})
                </button>
                <button
                  onClick={() => setSelectedGrup("kutub_sittah")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                    selectedGrup === "kutub_sittah"
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                  }`}
                >
                  Kutub al-Sittah ({countByGrup("kutub_sittah")})
                </button>
                <button
                  onClick={() => setSelectedGrup("kutub_tisah")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                    selectedGrup === "kutub_tisah"
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                  }`}
                >
                  Kutub al-Tis'ah ({countByGrup("kutub_tisah")})
                </button>
                <button
                  onClick={() => setSelectedGrup("lainnya")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                    selectedGrup === "lainnya"
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                  }`}
                >
                  Kitab Lainnya ({countByGrup("lainnya")})
                </button>
              </div>
            </div>

            {/* Books Card Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {displayedKitabList.map((kitab, idx) => (
                <div
                  key={kitab.id}
                  onClick={() => handleOpenKitab(kitab)}
                  className="group bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm hover:shadow-md hover:border-emerald-500/50 dark:hover:border-emerald-500/50 transition-all cursor-pointer flex flex-col justify-between"
                >
                  <div>
                    {/* Header: Number Badge & Group Label */}
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-400 font-bold text-xs flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                          {kitab.grupLabel}
                        </span>
                      </div>
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                        {kitab.derajat || "Shahih & Hasan"}
                      </span>
                    </div>

                    {/* Book Title & Arabic */}
                    <div className="mt-2">
                      <h3 className="font-bold text-base sm:text-lg text-slate-900 dark:text-slate-100 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                        {kitab.nama}
                      </h3>
                      <div className="text-right text-emerald-800 dark:text-emerald-300 text-lg sm:text-xl mt-1 tracking-wide" style={{ fontFamily: "'Amiri', 'Traditional Arabic', serif" }}>
                        {kitab.namaArab}
                      </div>
                    </div>

                    {/* Author & Description */}
                    <div className="mt-3 text-xs text-slate-500 dark:text-slate-400 space-y-1">
                      <div>
                        <span className="font-medium text-slate-700 dark:text-slate-300">Pengarang:</span> {kitab.pengarang} ({kitab.wafat})
                      </div>
                      <p className="line-clamp-2 text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed mt-1">
                        {kitab.deskripsi}
                      </p>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs">
                    <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                      {kitab.totalHadits.toLocaleString("id-ID")} Hadits
                    </span>
                    <div className="flex items-center gap-1 text-slate-400 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 font-medium transition-colors">
                      <span>Buka Kitab</span>
                      <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ========================================== */}
        {/* TAB 2: PEMBACA HADITS */}
        {/* ========================================== */}
        {activeTab === "pembaca" && (
          <div className="space-y-4">
            {/* Top Reader Controls */}
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
              {/* Select Kitab Dropdown */}
              <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                <select
                  value={selectedKitabId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setSelectedKitabId(id);
                    const k = allKitab.find(item => item.id === id);
                    if (k) setActiveKitab(k);
                    else setActiveKitab(null);
                    setCurrentPage(1);
                  }}
                  className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="all">Semua Kitab ({allKitab.length} Kitab - {totalHaditsAll.toLocaleString("id-ID")} Hadits)</option>
                  <optgroup label="1. Kutub al-Sittah (6 Kitab)">
                    {allKitab.filter(k => k.grup === "kutub_sittah").map(k => (
                      <option key={k.id} value={k.id}>
                        {k.nama} ({k.totalHadits.toLocaleString("id-ID")} Hadits)
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="2. Kutub al-Tis'ah (3 Kitab)">
                    {allKitab.filter(k => k.grup === "kutub_tisah").map(k => (
                      <option key={k.id} value={k.id}>
                        {k.nama} ({k.totalHadits.toLocaleString("id-ID")} Hadits)
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="3. Kitab Lainnya (6 Kitab)">
                    {allKitab.filter(k => k.grup === "lainnya").map(k => (
                      <option key={k.id} value={k.id}>
                        {k.nama} ({k.totalHadits.toLocaleString("id-ID")} Hadits)
                      </option>
                    ))}
                  </optgroup>
                </select>

                {/* Jump to hadits number form */}
                <form onSubmit={handleJumpToNumber} className="flex items-center gap-1">
                  <div className="relative">
                    <Hash className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="number"
                      min="1"
                      placeholder="No. Hadits..."
                      value={inputHaditsNomor}
                      onChange={(e) => setInputHaditsNomor(e.target.value)}
                      className="w-28 pl-6 pr-2 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <button
                    type="submit"
                    className="px-2.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
                  >
                    Buka
                  </button>
                </form>
              </div>

              {/* Font Size & Search Controls */}
              <div className="flex items-center justify-between w-full md:w-auto gap-2">
                {/* Search in Reader */}
                <div className="relative flex-1 md:w-60">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Cari teks/terjemahan..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="w-full pl-8 pr-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Font Size Adjuster */}
                <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                  <button
                    onClick={() => handleChangeFontSize(-2)}
                    className="px-2 py-1 text-xs font-bold hover:bg-white dark:hover:bg-slate-700 rounded transition-colors"
                    title="Perkecil Font"
                  >
                    A-
                  </button>
                  <span className="text-[11px] font-mono px-1">{fontSize}px</span>
                  <button
                    onClick={() => handleChangeFontSize(2)}
                    className="px-2 py-1 text-xs font-bold hover:bg-white dark:hover:bg-slate-700 rounded transition-colors"
                    title="Perbesar Font"
                  >
                    A+
                  </button>
                </div>
              </div>
            </div>

            {/* Active Nomor Filter Banner if Active */}
            {activeNomorFilter !== null && (
              <div className="bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/60 px-4 py-2.5 rounded-xl flex items-center justify-between text-xs text-emerald-900 dark:text-emerald-200">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-emerald-600 text-white rounded font-bold">
                    No. {activeNomorFilter}
                  </span>
                  <span>
                    Menampilkan Hadits No. <strong>{activeNomorFilter}</strong>
                    {selectedKitabId !== "all" && ` pada ${activeKitab?.nama || selectedKitabId}`}
                  </span>
                </div>
                <button
                  onClick={handleResetNomorFilter}
                  className="flex items-center gap-1 px-2.5 py-1 bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-700 rounded-lg text-emerald-700 dark:text-emerald-300 font-medium hover:bg-emerald-100 dark:hover:bg-slate-700 transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Tampilkan Semua Hadits</span>
                </button>
              </div>
            )}

            {/* Total Results Summary */}
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 px-1">
              <div>
                Menampilkan <span className="font-semibold text-emerald-600 dark:text-emerald-400">{haditsList.length}</span> dari <span className="font-semibold">{totalItems.toLocaleString("id-ID")}</span> hadits
                {searchQuery && ` (kata kunci: "${searchQuery}")`}
              </div>
              <div>Halaman {currentPage} dari {totalPages}</div>
            </div>

            {/* Hadits Items List */}
            {isLoading ? (
              <div className="py-16 text-center space-y-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-xs text-slate-500">Memuat hadits...</p>
              </div>
            ) : haditsList.length > 0 ? (
              <div className="space-y-4">
                {haditsList.map((item) => {
                  const isSaved = bookmarks.some(b => b.id === item.id);
                  const itemNomor = item.nomor ?? item.nomor_hadits ?? 0;
                  const itemKitabNama = item.kitabNama || item.nama_kitab || "Hadits";
                  const itemArab = item.arab || item.teks_arab || "";
                  const itemTerjemahan = item.terjemahan || item.terjemahan_indonesia || "";

                  return (
                    <div
                      key={item.id}
                      className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 sm:p-6 shadow-sm space-y-4 hover:border-emerald-500/30 transition-all"
                    >
                      {/* Hadits Item Header */}
                      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-1 rounded-md bg-emerald-600 text-white font-bold text-xs tracking-wide">
                            No. {itemNomor}
                          </span>
                          <span className="font-semibold text-xs sm:text-sm text-slate-800 dark:text-slate-200">
                            {itemKitabNama}
                          </span>
                          {item.derajat && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                              {item.derajat}
                            </span>
                          )}
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleToggleBookmark(item)}
                            className={`p-1.5 rounded-lg transition-colors ${
                              isSaved
                                ? "bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400"
                                : "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600"
                            }`}
                            title={isSaved ? "Hapus Tanda Baca" : "Simpan Tanda Baca"}
                          >
                            <Bookmark className="w-4 h-4" fill={isSaved ? "currentColor" : "none"} />
                          </button>

                          <button
                            onClick={() => handleCopyHadits(item)}
                            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 transition-colors"
                            title="Salin Teks Hadits"
                          >
                            {copiedId === item.id ? (
                              <Check className="w-4 h-4 text-emerald-600" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                          </button>

                          <button
                            onClick={() => handleShareHadits(item)}
                            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 transition-colors"
                            title="Bagikan Hadits"
                          >
                            <Share2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Arabic Text */}
                      <div
                        dir="rtl"
                        className="text-right leading-loose text-slate-900 dark:text-slate-100 tracking-wide font-normal pt-2"
                        style={{ fontSize: `${fontSize}px`, fontFamily: "'Amiri', 'Traditional Arabic', serif" }}
                      >
                        {itemArab}
                      </div>

                      {/* Indonesian Translation */}
                      <div className="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-lg text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed border-l-2 border-emerald-500">
                        <div className="font-semibold text-[11px] text-emerald-700 dark:text-emerald-400 uppercase tracking-wider mb-1">
                          Terjemahan:
                        </div>
                        <p>{itemTerjemahan}</p>
                      </div>
                    </div>
                  );
                })}

                {/* Pagination Controls */}
                {totalPages > 1 && (
                  <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                    <button
                      onClick={() => {
                        setCurrentPage(p => Math.max(1, p - 1));
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                      disabled={currentPage <= 1}
                      className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 disabled:pointer-events-none font-medium flex items-center gap-1 transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      <span>Sebelumnya</span>
                    </button>

                    <div className="font-medium text-slate-600 dark:text-slate-300">
                      Halaman {currentPage} / {totalPages}
                    </div>

                    <button
                      onClick={() => {
                        setCurrentPage(p => Math.min(totalPages, p + 1));
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                      disabled={currentPage >= totalPages}
                      className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 disabled:pointer-events-none font-medium flex items-center gap-1 transition-colors"
                    >
                      <span>Selanjutnya</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white dark:bg-slate-900 p-12 rounded-xl border border-slate-200 dark:border-slate-800 text-center text-slate-500 space-y-3">
                <BookOpen className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-700" />
                <p className="font-medium text-slate-800 dark:text-slate-200">
                  {activeNomorFilter !== null
                    ? `Hadits No. ${activeNomorFilter} tidak ditemukan pada kitab ini.`
                    : "Tidak ada hadits yang ditemukan."}
                </p>
                <p className="text-xs text-slate-400">
                  {activeNomorFilter !== null
                    ? "Pastikan nomor hadits berada dalam rentang nomor kitab yang dipilih, atau coba pilih kitab lain."
                    : "Coba ganti filter kitab atau gunakan kata kunci pencarian yang berbeda."}
                </p>
                {activeNomorFilter !== null && (
                  <button
                    onClick={handleResetNomorFilter}
                    className="px-3 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 transition-colors inline-flex items-center gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Kembali ke Semua Hadits</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ========================================== */}
        {/* TAB 3: TANDA BACA / FAVORIT */}
        {/* ========================================== */}
        {activeTab === "bookmark" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Tanda Baca Hadits Tersimpan
              </h2>
              <span className="text-xs text-slate-500">
                Total: {bookmarks.length} Hadits
              </span>
            </div>

            {bookmarks.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {bookmarks.map((b) => (
                  <div
                    key={b.id}
                    className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm space-y-2 hover:border-emerald-500/50 transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">
                          {b.kitabNama} • No. {b.nomor}
                        </span>
                        <button
                          onClick={() => {
                            HaditsDatabaseService.toggleBookmark({
                              id: b.id,
                              kitabId: b.kitabId,
                              kitabNama: b.kitabNama,
                              nomor: b.nomor,
                              arab: "",
                              terjemahan: ""
                            });
                            setBookmarks(HaditsDatabaseService.getBookmarks());
                          }}
                          className="text-slate-400 hover:text-red-500 text-xs transition-colors"
                          title="Hapus bookmark"
                        >
                          Hapus
                        </button>
                      </div>

                      <div dir="rtl" className="text-right text-slate-800 dark:text-slate-200 text-sm line-clamp-2 my-1" style={{ fontFamily: "'Amiri', 'Traditional Arabic', serif" }}>
                        {b.arabPreview}...
                      </div>

                      <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2">
                        {b.terjemahanPreview}...
                      </p>
                    </div>

                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                      <span className="text-[10px] text-slate-400">
                        Disimpan: {new Date(b.savedAt).toLocaleDateString("id-ID")}
                      </span>
                      <button
                        onClick={() => {
                          setSelectedKitabId(b.kitabId);
                          const k = allKitab.find(item => item.id === b.kitabId);
                          if (k) setActiveKitab(k);
                          setActiveNomorFilter(b.nomor);
                          setInputHaditsNomor(b.nomor.toString());
                          setActiveTab("pembaca");
                        }}
                        className="text-emerald-600 dark:text-emerald-400 font-semibold hover:underline flex items-center gap-1"
                      >
                        <span>Buka Hadits</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white dark:bg-slate-900 p-12 rounded-xl border border-slate-200 dark:border-slate-800 text-center text-slate-500 space-y-2">
                <Bookmark className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-700" />
                <p className="font-medium">Belum ada tanda baca tersimpan.</p>
                <p className="text-xs text-slate-400">Klik ikon bookmark pada kartu hadits di tab Pembaca untuk menyimpan.</p>
              </div>
            )}
          </div>
        )}

        {/* ========================================== */}
        {/* TAB 4: AUDIT & EKSPOR DATABASE */}
        {/* ========================================== */}
        {activeTab === "audit_db" && (
          <div className="space-y-6">
            {/* Group Breakdown Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {(auditReport?.grupBreakdown || []).map((grup) => (
                <div
                  key={grup.grup}
                  className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                      {grup.grup.replace("_", " ")}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-semibold">
                      {grup.totalKitab} Kitab
                    </span>
                  </div>
                  <div className="text-xl font-bold text-slate-900 dark:text-slate-100">
                    {grup.totalHadits.toLocaleString("id-ID")} <span className="text-xs font-normal text-slate-500">Hadits</span>
                  </div>
                  <ul className="text-[11px] text-slate-600 dark:text-slate-400 space-y-1 pt-2 border-t border-slate-100 dark:border-slate-800">
                    {grup.kitabList.map((item, idx) => (
                      <li key={idx} className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                        <span className="truncate">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            {/* Deduplication & Source Policy Audit */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold text-sm">
                <ShieldCheck className="w-5 h-5" />
                <span>Audit Integritas Data & Pencegahan Duplikasi</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="p-3 bg-emerald-50/60 dark:bg-emerald-950/40 rounded-lg border border-emerald-200 dark:border-emerald-800/60 space-y-1">
                  <div className="font-bold text-emerald-900 dark:text-emerald-200">
                    MASTER SOURCE (irsyadulibad/hadits-database)
                  </div>
                  <p className="text-emerald-700 dark:text-emerald-300">
                    {(auditReport?.masterSourceKitab || []).length} Kitab diimpor sebagai sumber primer: {(auditReport?.masterSourceKitab || []).join(', ')}.
                  </p>
                </div>

                <div className="p-3 bg-blue-50/60 dark:bg-blue-950/40 rounded-lg border border-blue-200 dark:border-blue-800/60 space-y-1">
                  <div className="font-bold text-blue-900 dark:text-blue-200">
                    SECONDARY SOURCE (edi-mj/hadits-dataset)
                  </div>
                  <p className="text-blue-700 dark:text-blue-300">
                    HANYA {(auditReport?.secondarySourceKitab || []).length} Kitab unik yang tidak ada di master source yang diimpor: {(auditReport?.secondarySourceKitab || []).join(', ')}. Duplikat kitab lain otomatis diabaikan.
                  </p>
                </div>
              </div>

              {/* Table of 15 Books */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                  <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold">
                    <tr>
                      <th className="p-2.5">No</th>
                      <th className="p-2.5">Nama Kitab</th>
                      <th className="p-2.5">Aksara Arab</th>
                      <th className="p-2.5">Grup</th>
                      <th className="p-2.5">Jumlah Hadits</th>
                      <th className="p-2.5">Sumber Impor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {allKitab.map((k, idx) => (
                      <tr key={k.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="p-2.5 font-bold">{idx + 1}</td>
                        <td className="p-2.5 font-medium">{k.nama}</td>
                        <td className="p-2.5 text-sm" style={{ fontFamily: "'Amiri', 'Traditional Arabic', serif" }}>{k.namaArab}</td>
                        <td className="p-2.5">
                          <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-semibold uppercase">
                            {k.grupLabel}
                          </span>
                        </td>
                        <td className="p-2.5 font-bold text-emerald-600 dark:text-emerald-400">
                          {k.totalHadits.toLocaleString("id-ID")}
                        </td>
                        <td className="p-2.5 text-slate-500 text-[11px]">
                          {k.sumberData}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Schema Generator & Code Exporter */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-bold text-sm text-slate-900 dark:text-slate-100">
                  <FileCode className="w-4 h-4 text-emerald-500" />
                  <span>Generator Schema Database & Integrasi Eksternal</span>
                </div>

                {/* Exporter Mode Switcher */}
                <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg text-xs">
                  <button
                    onClick={() => setExportFormat("postgres")}
                    className={`px-2.5 py-1 rounded font-medium transition-all ${
                      exportFormat === "postgres" ? "bg-emerald-600 text-white" : "text-slate-600 dark:text-slate-400"
                    }`}
                  >
                    PostgreSQL DDL
                  </button>
                  <button
                    onClick={() => setExportFormat("firestore")}
                    className={`px-2.5 py-1 rounded font-medium transition-all ${
                      exportFormat === "firestore" ? "bg-emerald-600 text-white" : "text-slate-600 dark:text-slate-400"
                    }`}
                  >
                    Firestore Schema
                  </button>
                  <button
                    onClick={() => setExportFormat("rag_ai")}
                    className={`px-2.5 py-1 rounded font-medium transition-all ${
                      exportFormat === "rag_ai" ? "bg-emerald-600 text-white" : "text-slate-600 dark:text-slate-400"
                    }`}
                  >
                    RAG / AI Corpus
                  </button>
                </div>
              </div>

              {/* Code Box */}
              <div className="relative">
                <pre className="bg-slate-950 text-slate-100 p-4 rounded-lg text-xs font-mono overflow-x-auto max-h-80 scrollbar-thin">
                  {exportFormat === "postgres" && HaditsDatabaseService.generatePostgresSqlScript(allKitab.length, totalHaditsAll)}
                  {exportFormat === "firestore" && HaditsDatabaseService.generateFirestoreExportData(allKitab, totalHaditsAll)}
                  {exportFormat === "rag_ai" && HaditsDatabaseService.generateRagSemanticExport(allKitab)}
                </pre>

                <button
                  onClick={handleCopyExport}
                  className="absolute top-3 right-3 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-md shadow flex items-center gap-1.5 transition-colors"
                >
                  {copiedExport ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Tersalin!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Salin Script</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

