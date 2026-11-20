'use client';

import { useState, useEffect, type MouseEvent } from 'react';
import Link from 'next/link';
import { 
  ArrowLeft, Search, Copy, Check, Heart, BookOpen, Share2, 
  Sparkles, ChevronRight, ChevronLeft, X
} from 'lucide-react';

interface DuaItem {
  title: string;
  arabic: string;
  latin: string;
  translation: string;
  notes?: string | null;
  fawaid?: string | null;
  source?: string | null;
}

export default function DoaHarianPage() {
  const [duas, setDuas] = useState<DuaItem[]>([]);
  const [search, setSearch] = useState('');
  const [favorites, setFavorites] = useState<string[]>([]);
  const [filterFav, setFilterFav] = useState(false);
  const [copiedTitle, setCopiedTitle] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDua, setSelectedDua] = useState<DuaItem | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('fav_duas');
      if (saved) setFavorites(JSON.parse(saved));
    } catch {}

    fetch('/data/islamic/dua/data/daily-dua.json')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setDuas(data);
      })
      .catch((err) => console.error('Failed to load duas:', err))
      .finally(() => setLoading(false));
  }, []);

  const toggleFav = (title: string, e?: MouseEvent) => {
    if (e) e.stopPropagation();
    setFavorites((prev) => {
      const next = prev.includes(title) ? prev.filter((t) => t !== title) : [...prev, title];
      try {
        localStorage.setItem('fav_duas', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const handleCopy = (dua: DuaItem, e?: MouseEvent) => {
    if (e) e.stopPropagation();
    const text = `[${dua.title}]\n\n${dua.arabic}\n\nLatin: ${dua.latin}\nArtinya: "${dua.translation}"\n${
      dua.source ? `\nSumber: ${dua.source}` : ''
    }${dua.fawaid ? `\nFaedah: ${dua.fawaid}` : ''}`;

    navigator.clipboard.writeText(text);
    setCopiedTitle(dua.title);
    setTimeout(() => setCopiedTitle(null), 2000);
  };

  const handleShare = (dua: DuaItem, e?: MouseEvent) => {
    if (e) e.stopPropagation();
    const text = `[${dua.title}]\n\n${dua.arabic}\n\nLatin: ${dua.latin}\nArtinya: "${dua.translation}"\n${
      dua.source ? `\nSumber: ${dua.source}` : ''
    }${dua.fawaid ? `\nFaedah: ${dua.fawaid}` : ''}`;

    if (navigator.share) {
      navigator.share({
        title: dua.title,
        text: text,
      }).catch(() => {
        handleCopy(dua);
      });
    } else {
      handleCopy(dua);
    }
  };

  const filtered = duas.filter((d) => {
    const q = search.toLowerCase();
    const match =
      d.title.toLowerCase().includes(q) ||
      d.translation.toLowerCase().includes(q) ||
      d.latin.toLowerCase().includes(q) ||
      (d.fawaid && d.fawaid.toLowerCase().includes(q)) ||
      (d.source && d.source.toLowerCase().includes(q));

    if (filterFav) return match && favorites.includes(d.title);
    return match;
  });

  const selectedIndex = selectedDua ? filtered.findIndex((d) => d.title === selectedDua.title) : -1;

  const handlePrevDua = () => {
    if (selectedIndex > 0) {
      setSelectedDua(filtered[selectedIndex - 1]);
    }
  };

  const handleNextDua = () => {
    if (selectedIndex >= 0 && selectedIndex < filtered.length - 1) {
      setSelectedDua(filtered[selectedIndex + 1]);
    }
  };

  // Scroll to top when changing selected dua
  useEffect(() => {
    if (selectedDua) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [selectedDua]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-28 -mx-4 sm:-mx-6 lg:-mx-8">
      {/* ------------------------------------------------------------- */}
      {/* VIEW 1: DAFTAR NAMA DOA (LIST VIEW)                           */}
      {/* ------------------------------------------------------------- */}
      {!selectedDua ? (
        <>
          {/* Top Header */}
          <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-slate-200">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3.5 sm:py-4 flex items-center justify-between gap-3 sm:gap-4">
              <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
                <Link
                  href="/islami"
                  className="p-2 text-slate-500 hover:text-emerald-700 hover:bg-slate-100 rounded-xl transition"
                  title="Kembali ke Dashboard"
                >
                  <ArrowLeft size={20} />
                </Link>
                <div className="flex items-center gap-2">
                  <span className="p-1.5 bg-emerald-100 text-emerald-700 rounded-lg shrink-0">
                    <BookOpen size={18} />
                  </span>
                  <h1 className="text-base sm:text-xl font-bold text-slate-900 leading-tight">
                    Kumpulan Doa Harian
                  </h1>
                </div>
              </div>

              <div className="flex items-center gap-2 sm:gap-3 justify-end flex-1 max-w-lg">
                {/* Search Input for Tablet & Desktop (di samping kiri tombol favorit) */}
                <div className="relative hidden sm:block w-full max-w-xs md:max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Cari doa harian..."
                    className="w-full pl-9 pr-8 py-2 bg-slate-100/90 hover:bg-slate-100 focus:bg-white text-xs sm:text-sm rounded-xl border border-slate-200/60 focus:border-emerald-500 focus:outline-none transition shadow-sm"
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

                {/* Tombol Favorit */}
                <button
                  onClick={() => setFilterFav(!filterFav)}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition cursor-pointer border shrink-0 ${
                    filterFav
                      ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <Heart size={14} className={filterFav ? 'fill-current' : ''} />
                  <span>Favorit ({favorites.length})</span>
                </button>
              </div>
            </div>

            {/* Search Bar Khusus Tampilan Ponsel (tetap seperti semula) */}
            <div className="sm:hidden max-w-4xl mx-auto px-4 pb-3.5">
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cari doa harian (tidur, makan, keluar rumah, dll)..."
                  className="w-full pl-10 pr-8 py-2.5 bg-slate-100/80 hover:bg-slate-100 focus:bg-white text-sm rounded-2xl border border-transparent focus:border-emerald-500 focus:outline-none transition"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 rounded cursor-pointer"
                    title="Hapus pencarian"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-6">
            {/* Banner Adab Doa */}
            <div className="bg-gradient-to-r from-teal-800 via-emerald-900 to-teal-950 text-white rounded-3xl p-5 sm:p-6 shadow-md relative overflow-hidden mb-6 border border-teal-700/40">
              <div className="relative z-10 max-w-2xl space-y-1">
                <span className="text-[11px] uppercase font-bold tracking-wider text-teal-300">
                  Adab Berdoa
                </span>
                <h2 className="text-base sm:text-lg font-bold">
                  "Doa adalah senjata orang beriman, tiang agama, dan cahaya langit serta bumi."
                </h2>
                <p className="text-xs text-teal-200/90 italic">
                  (HR. Al-Hakim no. 1812)
                </p>
              </div>
            </div>

            {/* Counter info */}
            <div className="flex items-center justify-between mb-3 text-xs text-slate-500 px-1">
              <span>Menampilkan <strong>{filtered.length}</strong> doa harian</span>
              {filterFav && (
                <button 
                  onClick={() => setFilterFav(false)}
                  className="text-emerald-700 hover:underline font-semibold cursor-pointer"
                >
                  Tampilkan Semua
                </button>
              )}
            </div>

            {loading ? (
              <div className="py-20 text-center text-slate-400">
                <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                <p className="text-sm">Memuat daftar doa harian...</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center text-slate-500 bg-white rounded-2xl border border-slate-200">
                <BookOpen size={32} className="mx-auto text-slate-300 mb-2" />
                <p className="font-medium text-slate-700">Doa tidak ditemukan</p>
                <p className="text-xs text-slate-400 mt-1">Gunakan kata kunci pencarian yang lain</p>
              </div>
            ) : (
              /* List of Prayer Titles */
              <div className="space-y-2.5">
                {filtered.map((dua, idx) => {
                  const isFav = favorites.includes(dua.title);
                  return (
                    <div
                      key={dua.title || idx}
                      onClick={() => setSelectedDua(dua)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedDua(dua);
                        }
                      }}
                      className="group bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/90 hover:border-emerald-300 hover:shadow-md transition-all duration-200 flex items-center justify-between gap-3 cursor-pointer select-none"
                    >
                      <div className="flex items-center gap-3.5 min-w-0 flex-1">
                        <div className="w-9 h-9 rounded-xl bg-teal-50 group-hover:bg-emerald-600 text-teal-800 group-hover:text-white text-xs font-bold flex items-center justify-center shrink-0 border border-teal-100 group-hover:border-emerald-600 transition">
                          {idx + 1}
                        </div>

                        <div className="min-w-0 flex-1">
                          <h3 className="font-bold text-slate-900 group-hover:text-emerald-800 text-base sm:text-lg truncate transition-colors">
                            {dua.title}
                          </h3>
                          <p className="text-xs text-slate-500 truncate mt-0.5">
                            {dua.translation}
                          </p>
                          {dua.source && (
                            <span className="inline-block mt-1 text-[10px] font-medium text-slate-400">
                              {dua.source}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => toggleFav(dua.title, e)}
                          className={`p-2 rounded-xl transition cursor-pointer ${
                            isFav ? 'text-amber-500 bg-amber-50' : 'text-slate-300 hover:text-amber-500 hover:bg-slate-100'
                          }`}
                          title={isFav ? 'Hapus favorit' : 'Simpan favorit'}
                        >
                          <Heart size={18} className={isFav ? 'fill-current' : ''} />
                        </button>

                        <div className="p-2 text-slate-400 group-hover:text-emerald-700 group-hover:translate-x-0.5 transition-all">
                          <ChevronRight size={20} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      ) : (
        /* ------------------------------------------------------------- */
        /* VIEW 2: HALAMAN LENGKAP DOA (DETAIL VIEW)                     */
        /* ------------------------------------------------------------- */
        <div>
          {/* Top Header Detail */}
          <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-slate-200">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
              <button
                onClick={() => setSelectedDua(null)}
                className="inline-flex items-center gap-2 text-sm font-bold text-slate-700 hover:text-emerald-800 py-1.5 px-3 rounded-xl hover:bg-slate-100 transition cursor-pointer"
                title="Kembali ke Daftar Doa"
              >
                <ArrowLeft size={18} />
                <span>Kembali ke Daftar Doa</span>
              </button>

              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-slate-500 mr-1 hidden sm:inline">
                  {selectedIndex >= 0 ? `${selectedIndex + 1} / ${filtered.length}` : ''}
                </span>

                <button
                  onClick={(e) => toggleFav(selectedDua.title, e)}
                  className={`p-2 rounded-xl transition cursor-pointer ${
                    favorites.includes(selectedDua.title)
                      ? 'text-amber-500 bg-amber-50 border border-amber-200'
                      : 'text-slate-400 hover:text-amber-500 hover:bg-slate-100 border border-slate-200'
                  }`}
                  title={favorites.includes(selectedDua.title) ? 'Hapus favorit' : 'Simpan favorit'}
                >
                  <Heart size={18} className={favorites.includes(selectedDua.title) ? 'fill-current' : ''} />
                </button>

                <button
                  onClick={(e) => handleCopy(selectedDua, e)}
                  className="p-2 text-slate-500 hover:text-emerald-700 hover:bg-slate-100 rounded-xl transition cursor-pointer border border-slate-200"
                  title="Salin Doa"
                >
                  {copiedTitle === selectedDua.title ? <Check size={18} className="text-emerald-600" /> : <Copy size={18} />}
                </button>

                <button
                  onClick={(e) => handleShare(selectedDua, e)}
                  className="p-2 text-slate-500 hover:text-emerald-700 hover:bg-slate-100 rounded-xl transition cursor-pointer border border-slate-200"
                  title="Bagikan Doa"
                >
                  <Share2 size={18} />
                </button>
              </div>
            </div>
          </div>

          {/* Full Prayer Content Card */}
          <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-6 space-y-6">
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/90 shadow-sm space-y-6">
              {/* Header Title & Riwayat */}
              <div className="border-b border-slate-100 pb-5 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  {selectedIndex >= 0 && (
                    <span className="text-xs font-bold text-teal-800 bg-teal-50 px-2.5 py-0.5 rounded-lg border border-teal-100">
                      Doa #{selectedIndex + 1}
                    </span>
                  )}
                  {selectedDua.source && (
                    <span className="text-xs font-semibold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-lg border border-emerald-100">
                      Riwayat: {selectedDua.source}
                    </span>
                  )}
                </div>

                <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  {selectedDua.title}
                </h2>
              </div>

              {/* Arabic Text */}
              <div className="py-4 px-4 sm:px-6 bg-emerald-50/30 rounded-2xl border border-emerald-100/70">
                <p 
                  className="font-serif text-3xl sm:text-4xl text-emerald-950 text-right leading-[2.5] sm:leading-[2.8]" 
                  dir="rtl"
                >
                  {selectedDua.arabic}
                </p>
              </div>

              {/* Latin Transliteration */}
              {selectedDua.latin && (
                <div className="p-4 sm:p-5 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                    Bacaan Latin
                  </span>
                  <p className="text-sm sm:text-base font-mono text-emerald-900 font-medium leading-relaxed">
                    {selectedDua.latin}
                  </p>
                </div>
              )}

              {/* Translation / Arti */}
              <div className="p-4 sm:p-5 bg-emerald-50/50 rounded-2xl border-l-4 border-emerald-600 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 block">
                  Artinya
                </span>
                <p className="text-sm sm:text-base text-slate-800 leading-relaxed italic">
                  "{selectedDua.translation}"
                </p>
              </div>

              {/* Faedah & Keutamaan */}
              {selectedDua.fawaid && (
                <div className="p-4 sm:p-5 bg-amber-50/60 rounded-2xl border border-amber-200/80 space-y-1.5 text-amber-950">
                  <div className="flex items-center gap-1.5 text-amber-800">
                    <Sparkles size={16} />
                    <span className="text-xs font-bold uppercase tracking-wider">
                      Faedah & Keutamaan
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-amber-900 leading-relaxed">
                    {selectedDua.fawaid}
                  </p>
                </div>
              )}

              {/* Additional notes */}
              {selectedDua.notes && (
                <div className="text-xs text-slate-500 pt-2 border-t border-slate-100">
                  <span className="font-semibold">Catatan: </span>
                  <span>{selectedDua.notes}</span>
                </div>
              )}
            </div>

            {/* Bottom Navigation Buttons (Previous & Next) */}
            <div className="flex items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={handlePrevDua}
                disabled={selectedIndex <= 0}
                className={`flex-1 py-3 px-4 rounded-2xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition border ${
                  selectedIndex > 0
                    ? 'bg-white text-slate-800 border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/50 cursor-pointer shadow-sm'
                    : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-50'
                }`}
              >
                <ChevronLeft size={18} />
                <span>Doa Sebelumnya</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedDua(null)}
                className="py-3 px-4 rounded-2xl text-xs font-bold text-slate-600 hover:text-emerald-800 hover:bg-slate-100 transition border border-slate-200 hidden sm:inline-flex items-center justify-center"
              >
                Daftar Doa
              </button>

              <button
                type="button"
                onClick={handleNextDua}
                disabled={selectedIndex < 0 || selectedIndex >= filtered.length - 1}
                className={`flex-1 py-3 px-4 rounded-2xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition border ${
                  selectedIndex >= 0 && selectedIndex < filtered.length - 1
                    ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700 cursor-pointer shadow-md shadow-emerald-600/20'
                    : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-50'
                }`}
              >
                <span>Doa Selanjutnya</span>
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

