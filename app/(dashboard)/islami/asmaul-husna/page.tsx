'use client';

import { useState, useEffect, type MouseEvent } from 'react';
import Link from 'next/link';
import { ArrowLeft, Search, Sparkles, Copy, Check, Heart, X } from 'lucide-react';

interface AsmaulHusnaItem {
  id: number;
  arab: string;
  latin: string;
  indo: string;
}

export default function AsmaulHusnaPage() {
  const [items, setItems] = useState<AsmaulHusnaItem[]>([]);
  const [search, setSearch] = useState('');
  const [favorites, setFavorites] = useState<number[]>([]);
  const [filterFav, setFilterFav] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [selectedItem, setSelectedItem] = useState<AsmaulHusnaItem | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load favorites from localStorage
    try {
      const saved = localStorage.getItem('fav_asmaul_husna');
      if (saved) setFavorites(JSON.parse(saved));
    } catch {}

    fetch('/data/islamic/asmaul-husna/asmaul-husna.json')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setItems(data);
        }
      })
      .catch((err) => console.error('Error loading Asmaul Husna:', err))
      .finally(() => setLoading(false));
  }, []);

  const toggleFav = (id: number, e: MouseEvent) => {
    e.stopPropagation();
    setFavorites((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try {
        localStorage.setItem('fav_asmaul_husna', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const handleCopy = (item: AsmaulHusnaItem, e?: MouseEvent) => {
    if (e) e.stopPropagation();
    const text = `${item.latin} (${item.arab})\nArtinya: "${item.indo}"\n#AsmaulHusna`;
    navigator.clipboard.writeText(text);
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filtered = items.filter((item) => {
    const matchSearch =
      item.latin.toLowerCase().includes(search.toLowerCase()) ||
      item.indo.toLowerCase().includes(search.toLowerCase()) ||
      item.arab.includes(search) ||
      `${item.id}` === search;
    if (filterFav) return matchSearch && favorites.includes(item.id);
    return matchSearch;
  });

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-28 -mx-4 sm:-mx-6 lg:-mx-8">
      {/* Top Header */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3.5 sm:py-4 flex items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
            <Link
              href="/islami"
              className="p-2 text-slate-500 hover:text-emerald-700 hover:bg-slate-100 rounded-xl transition"
              title="Kembali ke Dashboard"
            >
              <ArrowLeft size={20} />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-emerald-100 text-emerald-700 rounded-lg">
                  <Sparkles size={18} />
                </span>
                <h1 className="text-base sm:text-xl font-bold text-slate-900 leading-tight">
                  Asmaul Husna
                </h1>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-500 hidden sm:block">99 Nama-Nama Agung & Sifat Mulia Allah SWT</p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 justify-end flex-1 max-w-xl">
            {/* Search Input for Tablet & Desktop (samping kiri tombol favorit) */}
            <div className="relative hidden sm:block w-full max-w-xs md:max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari Asmaul Husna..."
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
              className={`inline-flex items-center gap-1.5 px-3 py-2 sm:py-2 rounded-xl text-xs font-semibold transition cursor-pointer border shrink-0 ${
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
        <div className="sm:hidden max-w-6xl mx-auto px-4 pb-3.5">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama, arti, atau nomor Asmaul Husna..."
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

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-3 sm:px-6 pt-4 sm:pt-6">
        {/* Banner Card */}
        <div className="bg-gradient-to-r from-emerald-800 via-teal-900 to-emerald-950 text-white rounded-2xl sm:rounded-3xl p-4 sm:p-8 shadow-xl relative overflow-hidden mb-5 sm:mb-8 border border-emerald-700/40">
          <div className="relative z-10 max-w-2xl space-y-1.5 sm:space-y-2">
            <span className="text-[10px] sm:text-xs uppercase font-bold tracking-widest text-emerald-300">
              Keutamaan Mempelajari
            </span>
            <h2 className="text-base sm:text-2xl font-black leading-snug">
              "Sesungguhnya Allah memiliki 99 nama, seratus kurang satu. Barangsiapa yang menghafalnya, ia akan masuk surga."
            </h2>
            <p className="text-[11px] sm:text-sm text-emerald-200/90 italic">
              (HR. Bukhari no. 2736 & Muslim no. 2677)
            </p>
          </div>
          <div className="absolute right-3 -bottom-5 sm:right-4 sm:-bottom-6 opacity-10 text-7xl sm:text-9xl font-serif select-none pointer-events-none text-white">
            اللّٰه
          </div>
        </div>

        {loading ? (
          <div className="py-20 text-center text-slate-400">
            <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
            <p className="text-sm">Memuat data 99 Asmaul Husna...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-slate-500 bg-white rounded-2xl border border-slate-200">
            <Sparkles size={32} className="mx-auto text-slate-300 mb-2" />
            <p className="font-medium text-slate-700">Nama tidak ditemukan</p>
            <p className="text-xs text-slate-400 mt-1">Coba kata kunci lain atau nonaktifkan filter favorit</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-4">
            {filtered.map((item) => {
              const isFav = favorites.includes(item.id);
              return (
                <div
                  key={item.id}
                  onClick={() => setSelectedItem(item)}
                  className="bg-white rounded-xl sm:rounded-2xl p-3 sm:p-5 border border-slate-200/80 hover:border-emerald-400/80 shadow-sm hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between gap-2.5 sm:gap-4"
                >
                  <div className="flex items-start justify-between">
                    <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-emerald-50 text-emerald-700 text-[10px] sm:text-xs font-bold flex items-center justify-center border border-emerald-100 group-hover:bg-emerald-600 group-hover:text-white transition shrink-0">
                      {item.id}
                    </div>
                    <div className="flex items-center gap-0.5 sm:gap-1">
                      <button
                        onClick={(e) => toggleFav(item.id, e)}
                        className={`p-1 sm:p-1.5 rounded-lg transition ${
                          isFav ? 'text-amber-500 hover:bg-amber-50' : 'text-slate-300 hover:text-amber-500 hover:bg-slate-100'
                        }`}
                        title={isFav ? 'Hapus dari favorit' : 'Tambah ke favorit'}
                      >
                        <Heart size={14} className={isFav ? 'fill-current' : ''} />
                      </button>
                      <button
                        onClick={(e) => handleCopy(item, e)}
                        className="p-1 sm:p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
                        title="Salin"
                      >
                        {copiedId === item.id ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                      </button>
                    </div>
                  </div>

                  <div className="text-right py-0.5 sm:py-1">
                    <p className="font-serif text-2xl sm:text-3xl lg:text-4xl text-emerald-950 group-hover:text-emerald-700 transition" dir="rtl">
                      {item.arab}
                    </p>
                  </div>

                  <div className="border-t border-slate-100 pt-2 sm:pt-3">
                    <h3 className="font-bold text-slate-800 text-xs sm:text-base group-hover:text-emerald-700 transition truncate">
                      {item.latin}
                    </h3>
                    <p className="text-[10px] sm:text-xs text-slate-500 mt-0.5 line-clamp-2 leading-snug sm:leading-normal">
                      {item.indo}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs "
          onClick={() => setSelectedItem(null)}
        >
          <div
            className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl border border-slate-200 text-center space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-800 text-sm font-bold flex items-center justify-center mx-auto">
              #{selectedItem.id}
            </div>

            <p className="font-serif text-5xl text-emerald-900 py-3" dir="rtl">
              {selectedItem.arab}
            </p>

            <div>
              <h3 className="text-2xl font-bold text-slate-900">{selectedItem.latin}</h3>
              <p className="text-sm font-semibold text-emerald-700 mt-1">
                "{selectedItem.indo}"
              </p>
            </div>

            <div className="bg-slate-50 rounded-2xl p-4 text-xs text-slate-600 text-left border border-slate-200/80 leading-relaxed">
              <span className="font-bold block text-slate-800 mb-1">Amalan & Hikmah:</span>
              Merenungi nama agung <strong>{selectedItem.latin}</strong> menanamkan rasa pengagungan kepada Allah SWT, memperkuat ketauhidan, dan mengundang rahmat-Nya dalam setiap doa dan dzikir harian.
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => handleCopy(selectedItem)}
                className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-700 transition cursor-pointer"
              >
                {copiedId === selectedItem.id ? <Check size={16} /> : <Copy size={16} />}
                {copiedId === selectedItem.id ? 'Tersalin!' : 'Salin Nama & Arti'}
              </button>
              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
