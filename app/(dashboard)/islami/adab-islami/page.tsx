'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  ArrowLeft, Award, Utensils, Moon, Landmark, Home, 
  Plane, Users, Search, ChevronDown, ChevronUp, BookOpen, X 
} from 'lucide-react';

interface MannerItem {
  id: string;
  order: number;
  title: { id?: string; en?: string } | string;
  description: { id?: string; en?: string } | string;
  sources?: any[];
}

const getText = (val: any, fallback = ''): string => {
  if (!val) return fallback;
  if (typeof val === 'string') return val;
  if (typeof val === 'object') {
    return val.id || val.en || Object.values(val)[0] || fallback;
  }
  return String(val);
};

const formatSource = (s: any): string => {
  if (!s) return '';
  if (typeof s === 'string') return s;
  if (typeof s === 'object') {
    if (s.reference) {
      if (s.type === 'quran') return `QS. ${s.reference}`;
      if (s.type === 'hadith') return `HR. ${s.reference}`;
      return s.reference;
    }
    if (s.title) return getText(s.title);
    if (s.name) return getText(s.name);
    return Object.values(s)
      .filter((v) => typeof v === 'string')
      .join(' ') || '';
  }
  return String(s);
};

type MannerCategory = 'eating' | 'sleeping' | 'mosque' | 'visiting' | 'travelling' | 'social';

const AdabIslami: React.FC = () => {
  const [activeCategory, setActiveCategory] = useState<MannerCategory>('eating');
  const [items, setItems] = useState<MannerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const categories: { id: MannerCategory; label: string; file: string; icon: any }[] = [
    { id: 'eating', label: 'Makan & Minum', file: 'eating.json', icon: Utensils },
    { id: 'sleeping', label: 'Tidur & Istirahat', file: 'sleeping.json', icon: Moon },
    { id: 'mosque', label: 'Di Masjid', file: 'mosque.json', icon: Landmark },
    { id: 'visiting', label: 'Bertamu', file: 'visiting.json', icon: Home },
    { id: 'travelling', label: 'Safar / Bepergian', file: 'travelling.json', icon: Plane },
    { id: 'social', label: 'Sosial & Muamalah', file: 'social.json', icon: Users },
  ];

  useEffect(() => {
    const current = categories.find((c) => c.id === activeCategory);
    if (!current) return;

    setLoading(true);
    fetch(`/data/islamic/manners/${current.file}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setItems(data);
          if (data.length > 0) {
            const firstId = data[0].id || `adab-${activeCategory}-0`;
            setExpandedIds(new Set([firstId]));
          } else {
            setExpandedIds(new Set());
          }
        }
      })
      .catch((err) => console.error('Failed to load manners:', err))
      .finally(() => setLoading(false));
  }, [activeCategory]);

  const filtered = items.filter((item) => {
    const q = search.toLowerCase();
    const title = getText(item.title).toLowerCase();
    const desc = getText(item.description).toLowerCase();
    return title.includes(q) || desc.includes(q);
  });

  const getItemId = (item: MannerItem, idx: number) => item.id || `adab-${activeCategory}-${idx}`;

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

  const isAllExpanded = filtered.length > 0 && filtered.every((item, idx) => expandedIds.has(getItemId(item, idx)));

  const toggleExpandAll = () => {
    if (isAllExpanded) {
      setExpandedIds(new Set());
    } else {
      setExpandedIds(new Set(filtered.map((item, idx) => getItemId(item, idx))));
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-28 -mx-4 sm:-mx-6 lg:-mx-8">
      {/* Top Header */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between gap-3">
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
                <Award size={16} />
              </span>
              <h1 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">
                Adab & Akhlak Islami
              </h1>
            </div>
          </div>

          <button
            onClick={toggleExpandAll}
            className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-xl border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/60 text-slate-700 hover:text-emerald-800 transition shrink-0 cursor-pointer shadow-sm"
            title={isAllExpanded ? 'Tutup semua akordeon' : 'Buka semua akordeon'}
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

        {/* Categories Bar */}
        <div className="max-w-4xl mx-auto px-4 sm:px-6 flex gap-2 overflow-x-auto pb-2.5 scrollbar-none">
          {categories.map((cat) => {
            const Icon = cat.icon;
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`inline-flex items-center gap-2 px-3.5 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-semibold transition whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80'
                }`}
              >
                <Icon size={15} />
                {cat.label}
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="max-w-4xl mx-auto px-4 sm:px-6 pb-2.5 sm:pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari etika dan panduan adab..."
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
              Misi Kerasulan
            </span>
            <h2 className="text-base sm:text-lg font-black leading-snug">
              "Sesungguhnya aku diutus hanya untuk menyempurnakan akhlak yang mulia."
            </h2>
            <p className="text-xs text-emerald-200/90 italic">
              (HR. Ahmad no. 8952 & Al-Bukhari dalam Al-Adab Al-Mufrad no. 273)
            </p>
          </div>
        </div>

        {loading ? (
          <div className="py-20 text-center text-slate-400">
            <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
            <p className="text-sm">Memuat panduan adab...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-slate-500 bg-white rounded-2xl border border-slate-200">
            <BookOpen size={32} className="mx-auto text-slate-300 mb-2" />
            <p className="font-medium text-slate-700">Tidak ada adab yang cocok</p>
            <p className="text-xs text-slate-400 mt-1">Coba gunakan kata kunci pencarian lain</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((item, idx) => {
              const itemId = getItemId(item, idx);
              const isExpanded = expandedIds.has(itemId);
              const titleStr = getText(item.title);
              const descStr = getText(item.description);

              return (
                <div
                  key={itemId}
                  className={`bg-white rounded-2xl border transition-all duration-200 overflow-hidden ${
                    isExpanded
                      ? 'border-emerald-300 shadow-sm ring-1 ring-emerald-100'
                      : 'border-slate-200 hover:border-slate-300 shadow-sm'
                  }`}
                >
                  {/* Accordion Header */}
                  <button
                    type="button"
                    onClick={() => toggleAccordion(itemId)}
                    className="w-full p-4 sm:p-5 flex items-center justify-between gap-3 text-left transition-colors hover:bg-slate-50/80 cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span
                        className={`w-7 h-7 sm:w-8 sm:h-8 rounded-xl text-xs font-bold flex items-center justify-center shrink-0 border transition ${
                          isExpanded
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-emerald-50 text-emerald-800 border-emerald-100'
                        }`}
                      >
                        {item.order || idx + 1}
                      </span>

                      <div className="min-w-0 flex-1">
                        <h3 className="font-bold text-slate-900 text-sm sm:text-base leading-snug">
                          {titleStr}
                        </h3>
                        {!isExpanded && (
                          <p className="text-xs text-slate-400 truncate mt-0.5">
                            {descStr}
                          </p>
                        )}
                      </div>
                    </div>

                    <div
                      className={`p-1.5 rounded-lg text-slate-400 transition-transform duration-200 shrink-0 ${
                        isExpanded ? 'rotate-180 text-emerald-700 bg-emerald-50' : 'hover:bg-slate-100'
                      }`}
                    >
                      <ChevronDown size={18} />
                    </div>
                  </button>

                  {/* Accordion Body */}
                  {isExpanded && (
                    <div className="px-4 sm:px-5 pb-4 pt-1 sm:pb-5 border-t border-slate-100 space-y-3 bg-slate-50/40">
                      <div className="pl-10 sm:pl-11 space-y-3 pt-2">
                        <p className="text-xs sm:text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                          {descStr}
                        </p>

                        {item.sources && item.sources.length > 0 && (
                          <div className="pt-2.5 border-t border-slate-200/70 text-xs text-slate-500 flex flex-wrap items-center gap-1.5">
                            <span className="font-semibold text-slate-700">Rujukan:</span>
                            {item.sources.map((s, si) => {
                              const text = formatSource(s);
                              if (!text) return null;
                              return (
                                <span
                                  key={si}
                                  className="bg-white border border-slate-200 text-slate-700 px-2 py-0.5 rounded-md text-[11px] font-medium"
                                >
                                  {text}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
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
export default AdabIslami;
