'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, CalendarDays, Moon, Sparkles, Star, ChevronRight, Info } from 'lucide-react';

interface HijriMonth {
  id: string;
  order: number;
  name: { id?: string; en?: string; ar?: string } | string;
  description: { id?: string; en?: string } | string;
  references?: any[];
}

interface HijriEvent {
  id: string;
  order: number;
  title: { id?: string; en?: string; ar?: string } | string;
  date: { month: number; day: number };
  description: { id?: string; en?: string } | string;
}

const getText = (val: any, fallback = ''): string => {
  if (!val) return fallback;
  if (typeof val === 'string') return val;
  if (typeof val === 'object') {
    return val.id || val.en || val.ar || Object.values(val)[0] || fallback;
  }
  return String(val);
};

const KalenderHijriah: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'months' | 'events'>('months');
  const [months, setMonths] = useState<HijriMonth[]>([]);
  const [events, setEvents] = useState<HijriEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/data/islamic/islamic-calendar/calendar.json')
      .then((r) => r.json())
      .then((data) => {
        if (data.months) setMonths(data.months);
        if (data.events) setEvents(data.events);
      })
      .catch((err) => console.error('Failed to load calendar data:', err))
      .finally(() => setLoading(false));
  }, []);

  const getMonthNameByIdx = (idx: number) => {
    const m = months.find((x) => x.order === idx);
    return m ? getText(m.name) : `Bulan ${idx}`;
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-28 -mx-4 sm:-mx-6 lg:-mx-8">
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
                <CalendarDays size={16} />
              </span>
              <h1 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">
                Kalender Hijriah & Hari Besar
              </h1>
            </div>
          </div>
        </div>

        {/* Tab Selection */}
        <div className="max-w-4xl mx-auto px-4 sm:px-6 pb-2.5 sm:pb-3">
          <div className="bg-slate-100/90 p-1 rounded-xl flex gap-1">
            <button
              onClick={() => setActiveTab('months')}
              className={`flex-1 py-1.5 sm:py-2 px-3 rounded-lg text-xs sm:text-sm font-bold transition cursor-pointer flex items-center justify-center gap-1.5 ${
                activeTab === 'months'
                  ? 'bg-white text-emerald-800 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              12 Bulan Hijriah
            </button>
            <button
              onClick={() => setActiveTab('events')}
              className={`flex-1 py-1.5 sm:py-2 px-3 rounded-lg text-xs sm:text-sm font-bold transition cursor-pointer flex items-center justify-center gap-1.5 ${
                activeTab === 'events'
                  ? 'bg-white text-emerald-800 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Hari Besar & Peristiwa Islam
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-4 sm:pt-5">
        {/* Banner */}
        <div className="bg-gradient-to-r from-emerald-800 via-teal-900 to-emerald-950 text-white rounded-3xl p-6 sm:p-7 shadow-lg relative overflow-hidden mb-6 border border-emerald-700/40">
          <div className="relative z-10 max-w-2xl space-y-1.5">
            <span className="text-xs uppercase font-bold tracking-widest text-emerald-300">
              Bulan Suci (Al-Asyhur Al-Hurum)
            </span>
            <h2 className="text-lg sm:text-xl font-black">
              "Sesungguhnya bilangan bulan pada sisi Allah adalah dua belas bulan, di antaranya empat bulan haram."
            </h2>
            <p className="text-xs text-emerald-200/90 italic">
              (QS. At-Taubah: 36 &bull; Dzulqa'dah, Dzulhijjah, Muharram, Rajab)
            </p>
          </div>
        </div>

        {loading ? (
          <div className="py-20 text-center text-slate-400">
            <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
            <p className="text-sm">Memuat data kalender Hijriah...</p>
          </div>
        ) : activeTab === 'months' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {months.map((m) => {
              const isHaram = ['muharram', 'rajab', 'dhu-al-qidah', 'dhu-al-hijjah'].includes(m.id);
              return (
                <div
                  key={m.id}
                  className={`bg-white rounded-3xl p-5 border shadow-sm transition space-y-3 ${
                    isHaram ? 'border-amber-200 bg-amber-50/20' : 'border-slate-200/80'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <span className={`w-8 h-8 rounded-xl text-xs font-bold flex items-center justify-center border ${
                        isHaram ? 'bg-amber-100 text-amber-900 border-amber-200' : 'bg-emerald-50 text-emerald-800 border-emerald-100'
                      }`}>
                        {m.order}
                      </span>
                      <div>
                        <h3 className="font-bold text-slate-900 text-base">
                          {getText(m.name)}
                        </h3>
                        {isHaram && (
                          <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">
                            Bulan Haram (Suci)
                          </span>
                        )}
                      </div>
                    </div>

                    {typeof m.name === 'object' && m.name?.ar && (
                      <p className="font-serif text-2xl text-emerald-900" dir="rtl">
                        {m.name.ar}
                      </p>
                    )}
                  </div>

                  <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                    {getText(m.description)}
                  </p>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-4">
            {events.map((ev, idx) => (
              <div
                key={ev.id || idx}
                className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/90 shadow-sm space-y-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-2xl bg-emerald-100 text-emerald-800 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                      {ev.date.day}
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 text-base sm:text-lg">
                        {getText(ev.title)}
                      </h3>
                      <p className="text-xs font-semibold text-emerald-700">
                        {ev.date.day} {getMonthNameByIdx(ev.date.month)}
                      </p>
                    </div>
                  </div>

                  {typeof ev.title === 'object' && ev.title?.ar && (
                    <p className="font-serif text-xl text-emerald-900" dir="rtl">
                      {ev.title.ar}
                    </p>
                  )}
                </div>

                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed pl-12">
                  {getText(ev.description)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
export default KalenderHijriah;
