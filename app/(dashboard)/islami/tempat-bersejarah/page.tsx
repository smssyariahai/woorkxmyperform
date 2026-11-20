'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  ArrowLeft, Landmark, MapPin, Search, BookOpen, ExternalLink, 
  ChevronRight, ChevronLeft, Copy, Check, Share2, ArrowRight, Sparkles, X 
} from 'lucide-react';

interface IslamicPlace {
  id: string;
  order: number;
  name: { id?: string; en?: string; ar?: string } | string;
  description: { id?: string; en?: string } | string;
  location?: {
    city?: { id?: string; en?: string } | string;
    country?: { id?: string; en?: string } | string;
  };
  coordinates?: {
    latitude: number;
    longitude: number;
  };
  references?: Array<{ source_id: string; verses?: string[] }>;
}

const getText = (val: any, fallback = ''): string => {
  if (!val) return fallback;
  if (typeof val === 'string') return val;
  if (typeof val === 'object') {
    return val.id || val.en || val.ar || Object.values(val)[0] || fallback;
  }
  return String(val);
};

const TempatBersejarah: React.FC = () => {
  const [places, setPlaces] = useState<IslamicPlace[]>([]);
  const [search, setSearch] = useState('');
  const [selectedPlace, setSelectedPlace] = useState<IslamicPlace | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch('/data/islamic/islamic-places/places.json')
      .then((r) => r.json())
      .then((data) => {
        if (data.items && Array.isArray(data.items)) {
          setPlaces(data.items);
        }
      })
      .catch((err) => console.error('Failed to load places:', err))
      .finally(() => setLoading(false));
  }, []);

  // Scroll to top when selecting place
  useEffect(() => {
    if (selectedPlace) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [selectedPlace]);

  const filtered = places.filter((p) => {
    const q = search.toLowerCase();
    const nameStr = getText(p.name).toLowerCase();
    const arStr = typeof p.name === 'object' && p.name ? p.name.ar || '' : '';
    const descStr = getText(p.description).toLowerCase();
    const city = getText(p.location?.city).toLowerCase();
    const country = getText(p.location?.country).toLowerCase();
    return (
      nameStr.includes(q) ||
      arStr.includes(q) ||
      descStr.includes(q) ||
      city.includes(q) ||
      country.includes(q)
    );
  });

  const selectedIndex = selectedPlace ? filtered.findIndex((p) => p.id === selectedPlace.id) : -1;

  const handlePrev = () => {
    if (selectedIndex > 0) {
      setSelectedPlace(filtered[selectedIndex - 1]);
    }
  };

  const handleNext = () => {
    if (selectedIndex >= 0 && selectedIndex < filtered.length - 1) {
      setSelectedPlace(filtered[selectedIndex + 1]);
    }
  };

  const handleCopy = (p: IslamicPlace) => {
    const name = getText(p.name);
    const city = getText(p.location?.city);
    const country = getText(p.location?.country);
    const loc = [city, country].filter(Boolean).join(', ');
    const desc = getText(p.description);
    const text = `[${name}${loc ? ` - ${loc}` : ''}]\n\n${desc}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = (p: IslamicPlace) => {
    const name = getText(p.name);
    const city = getText(p.location?.city);
    const country = getText(p.location?.country);
    const loc = [city, country].filter(Boolean).join(', ');
    const desc = getText(p.description);
    const text = `[${name}${loc ? ` - ${loc}` : ''}]\n\n${desc}`;

    if (navigator.share) {
      navigator.share({
        title: name,
        text: text,
      }).catch(() => handleCopy(p));
    } else {
      handleCopy(p);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-28 -mx-4 sm:-mx-6 lg:-mx-8">
      {/* ------------------------------------------------------------- */}
      {/* VIEW 1: DAFTAR TEMPAT BERSEJARAH (LIST VIEW)                  */}
      {/* ------------------------------------------------------------- */}
      {!selectedPlace ? (
        <>
          {/* Top Header */}
          <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-slate-200">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5 sm:gap-3">
                <Link
                  href="/islami"
                  className="p-1.5 text-slate-500 hover:text-emerald-700 hover:bg-slate-100 rounded-xl transition"
                  title="Kembali ke Dashboard"
                >
                  <ArrowLeft size={18} />
                </Link>
                <div className="flex items-center gap-2">
                  <span className="p-1.5 bg-emerald-100 text-emerald-700 rounded-lg shrink-0">
                    <Landmark size={16} />
                  </span>
                  <h1 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">
                    Tempat Bersejarah Islam
                  </h1>
                </div>
              </div>
            </div>

            {/* Search */}
            <div className="max-w-4xl mx-auto px-4 sm:px-6 pb-2.5 sm:pb-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cari tempat bersejarah (Masjidil Haram, Nabawi, Al-Aqsa, Makkah, Madinah)..."
                  className="w-full pl-9 pr-8 py-1.5 sm:py-2 bg-slate-100/80 hover:bg-slate-100 focus:bg-white text-xs sm:text-sm rounded-xl border border-transparent focus:border-emerald-500 focus:outline-none transition shadow-sm"
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
            {/* Banner */}
            <div className="bg-gradient-to-r from-emerald-800 via-teal-900 to-emerald-950 text-white rounded-3xl p-5 sm:p-6 shadow-lg relative overflow-hidden mb-5 border border-emerald-700/40">
              <div className="relative z-10 max-w-2xl space-y-1">
                <span className="text-xs uppercase font-bold tracking-widest text-emerald-300">
                  Tiga Masjid Utama
                </span>
                <h2 className="text-base sm:text-lg font-black leading-snug">
                  "Janganlah bersusah payah melakukan perjalanan kecuali ke tiga masjid: Masjidil Haram, Masjid Rasul ini (Nabawi), dan Masjid Al-Aqsa."
                </h2>
                <p className="text-xs text-emerald-200/90 italic">
                  (HR. Bukhari no. 1189 & Muslim no. 1397)
                </p>
              </div>
            </div>

            {loading ? (
              <div className="py-20 text-center text-slate-400">
                <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                <p className="text-sm">Memuat tempat bersejarah...</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center text-slate-500 bg-white rounded-2xl border border-slate-200">
                <BookOpen size={32} className="mx-auto text-slate-300 mb-2" />
                <p className="font-medium text-slate-700">Tempat tidak ditemukan</p>
                <p className="text-xs text-slate-400 mt-1">Coba gunakan kata kunci pencarian lain</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
                {filtered.map((place, idx) => {
                  const cityStr = getText(place.location?.city);
                  const countryStr = getText(place.location?.country);
                  const nameStr = getText(place.name);
                  const arStr = typeof place.name === 'object' && place.name ? place.name.ar : '';
                  const descStr = getText(place.description);

                  return (
                    <button
                      key={place.id || idx}
                      type="button"
                      onClick={() => setSelectedPlace(place)}
                      className="w-full bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 hover:border-emerald-400 hover:shadow-md transition-all text-left group flex flex-col justify-between gap-3 cursor-pointer shadow-sm"
                    >
                      <div className="space-y-2 w-full">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className="font-bold text-slate-900 text-sm sm:text-base group-hover:text-emerald-700 transition">
                              {nameStr}
                            </h3>
                            {(cityStr || countryStr) && (
                              <div className="flex items-center gap-1 text-xs text-emerald-700 mt-0.5 font-medium">
                                <MapPin size={12} className="shrink-0" />
                                <span className="truncate">{[cityStr, countryStr].filter(Boolean).join(', ')}</span>
                              </div>
                            )}
                          </div>

                          {arStr && (
                            <span className="font-serif text-lg text-emerald-900 shrink-0" dir="rtl">
                              {arStr}
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                          {descStr}
                        </p>
                      </div>

                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-emerald-700 font-semibold group-hover:translate-x-0.5 transition-transform w-full">
                        <span>Lihat Detail Tempat</span>
                        <ChevronRight size={15} />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </>
      ) : (
        /* ------------------------------------------------------------- */
        /* VIEW 2: HALAMAN DETAIL TEMPAT BERSEJARAH (DETAIL VIEW)       */
        /* ------------------------------------------------------------- */
        <div>
          {/* Detail Sticky Header */}
          <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200">
            <div className="max-w-3xl mx-auto px-4 py-2.5 sm:py-3 flex items-center justify-between gap-2">
              <button
                onClick={() => setSelectedPlace(null)}
                className="inline-flex items-center gap-1 text-slate-600 hover:text-emerald-700 px-2 py-1.5 rounded-xl hover:bg-slate-100 transition text-xs sm:text-sm font-semibold shrink-0 cursor-pointer"
              >
                <ArrowLeft size={17} />
                <span>Daftar Tempat</span>
              </button>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={handlePrev}
                  disabled={selectedIndex <= 0}
                  className="p-1.5 text-slate-500 hover:text-emerald-700 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none rounded-xl transition cursor-pointer"
                  title="Tempat Sebelumnya"
                >
                  <ChevronLeft size={18} />
                </button>
                <span className="text-xs font-semibold text-slate-500 px-1">
                  {selectedIndex + 1} / {filtered.length}
                </span>
                <button
                  onClick={handleNext}
                  disabled={selectedIndex >= filtered.length - 1}
                  className="p-1.5 text-slate-500 hover:text-emerald-700 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none rounded-xl transition cursor-pointer"
                  title="Tempat Selanjutnya"
                >
                  <ChevronRight size={18} />
                </button>

                <div className="h-4 w-[1px] bg-slate-200 mx-1"></div>

                <button
                  onClick={() => handleCopy(selectedPlace)}
                  className="p-1.5 text-slate-500 hover:text-emerald-700 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                  title="Salin deskripsi"
                >
                  {copied ? <Check size={17} className="text-emerald-600" /> : <Copy size={17} />}
                </button>

                <button
                  onClick={() => handleShare(selectedPlace)}
                  className="p-1.5 text-slate-500 hover:text-emerald-700 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                  title="Bagikan"
                >
                  <Share2 size={17} />
                </button>
              </div>
            </div>
          </div>

          {/* Detail Content */}
          <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-5 sm:pt-6 space-y-5">
            {/* Place Hero Card */}
            <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200 shadow-sm text-center space-y-3">
              {(selectedPlace.location?.city || selectedPlace.location?.country) && (
                <div className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-800 text-xs font-bold px-3 py-1 rounded-full border border-emerald-100">
                  <MapPin size={13} />
                  <span>
                    {[
                      getText(selectedPlace.location?.city),
                      getText(selectedPlace.location?.country)
                    ].filter(Boolean).join(', ')}
                  </span>
                </div>
              )}

              {typeof selectedPlace.name === 'object' && selectedPlace.name?.ar && (
                <div className="py-2">
                  <p className="font-serif text-4xl sm:text-5xl text-emerald-950" dir="rtl">
                    {selectedPlace.name.ar}
                  </p>
                </div>
              )}

              <div>
                <h1 className="text-xl sm:text-2xl font-black text-slate-900">
                  {getText(selectedPlace.name)}
                </h1>
                <p className="text-xs text-slate-500 mt-1">
                  Situs & Tempat Bersejarah dalam Peradaban Islam
                </p>
              </div>

              {selectedPlace.coordinates && (
                <div className="pt-2">
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${selectedPlace.coordinates.latitude},${selectedPlace.coordinates.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50/70 hover:bg-emerald-100 border border-emerald-200/80 px-3.5 py-1.5 rounded-xl transition"
                  >
                    <ExternalLink size={13} />
                    <span>Lihat Lokasi di Google Maps</span>
                  </a>
                </div>
              )}
            </div>

            {/* History & Significance Section */}
            <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200 shadow-sm space-y-3">
              <div className="flex items-center gap-2 text-emerald-700 font-bold text-sm">
                <Sparkles size={16} />
                <h2>Sejarah & Keutamaan</h2>
              </div>
              <p className="text-sm sm:text-base text-slate-700 leading-relaxed sm:leading-loose whitespace-pre-line">
                {getText(selectedPlace.description)}
              </p>
            </div>

            {/* References Section */}
            {selectedPlace.references && selectedPlace.references.length > 0 && (
              <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200 shadow-sm space-y-3">
                <div className="flex items-center gap-2 text-emerald-700 font-bold text-sm">
                  <BookOpen size={16} />
                  <h2>Rujukan Ayat Al-Qur'an</h2>
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  {selectedPlace.references.flatMap((ref, i) =>
                    (ref.verses || []).map((v, vi) => (
                      <span
                        key={`${i}_${vi}`}
                        className="text-xs font-mono font-medium bg-emerald-50 text-emerald-900 border border-emerald-200/80 px-3 py-1.5 rounded-xl shadow-sm"
                      >
                        QS. {v}
                      </span>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Bottom Nav Buttons */}
            <div className="flex items-center justify-between gap-3 pt-4">
              <button
                onClick={handlePrev}
                disabled={selectedIndex <= 0}
                className="flex-1 py-2.5 px-4 rounded-2xl bg-white border border-slate-200 text-xs sm:text-sm font-bold text-slate-700 hover:border-emerald-300 hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none transition flex items-center justify-center gap-2 cursor-pointer shadow-sm"
              >
                <ChevronLeft size={16} />
                <span>Tempat Sebelumnya</span>
              </button>

              <button
                onClick={handleNext}
                disabled={selectedIndex >= filtered.length - 1}
                className="flex-1 py-2.5 px-4 rounded-2xl bg-emerald-600 text-white text-xs sm:text-sm font-bold hover:bg-emerald-700 disabled:opacity-40 disabled:pointer-events-none transition flex items-center justify-center gap-2 cursor-pointer shadow-sm"
              >
                <span>Tempat Selanjutnya</span>
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default TempatBersejarah;
