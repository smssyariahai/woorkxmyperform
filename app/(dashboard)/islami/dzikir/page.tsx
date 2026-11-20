'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  ArrowLeft, Sun, Moon, Sparkles, Check, RotateCcw, Copy, 
  ShieldCheck, Settings2, X, ChevronDown, ChevronUp, Sliders,
  Eye, EyeOff, Type, AlertCircle
} from 'lucide-react';

interface DhikrItem {
  id: number | string;
  order?: number;
  title: string | { id?: string; en?: string; ar?: string };
  context?: string | { id?: string; en?: string };
  content: {
    arabic: string;
    latin?: string;
    translation: string | { id?: string; en?: string };
  };
  sources?: any;
}

type DhikrCategory = 'morning' | 'evening' | 'after-prayer' | 'general';

interface DhikrSettings {
  showLatin: boolean;
  showTranslation: boolean;
  arabicSize: number;
  latinSize: number;
  translationSize: number;
}

const DEFAULT_SETTINGS: DhikrSettings = {
  showLatin: true,
  showTranslation: true,
  arabicSize: 28,
  latinSize: 14,
  translationSize: 14,
};

const getText = (val: any, fallback = ''): string => {
  if (!val) return fallback;
  if (typeof val === 'string') return val;
  if (typeof val === 'object') {
    return val.id || val.en || val.ar || Object.values(val)[0] || fallback;
  }
  return String(val);
};

const getTodayDateString = (): string => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function DzikirPage() {
  const [activeTab, setActiveTab] = useState<DhikrCategory>('morning');
  const [items, setItems] = useState<DhikrItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [counters, setCounters] = useState<Record<string, number>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Accordion state: itemKey -> boolean (true = open, false = collapsed)
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});

  // Settings state
  const [settings, setSettings] = useState<DhikrSettings>(() => {
    try {
      const saved = localStorage.getItem('dhikr_view_settings');
      if (saved) return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
    } catch {}
    return DEFAULT_SETTINGS;
  });

  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);

  const tabConfigs: { id: DhikrCategory; label: string; icon: any; file: string }[] = [
    { id: 'morning', label: 'Dzikir Pagi', icon: Sun, file: 'morning-dhikr.json' },
    { id: 'evening', label: 'Dzikir Petang', icon: Moon, file: 'evening-dhikr.json' },
    { id: 'after-prayer', label: 'Sesudah Shalat', icon: Sparkles, file: 'after-prayer-dhikr.json' },
    { id: 'general', label: 'Dzikir Harian', icon: ShieldCheck, file: 'general-dhikr.json' },
  ];

  // Save settings whenever changed
  useEffect(() => {
    try {
      localStorage.setItem('dhikr_view_settings', JSON.stringify(settings));
    } catch {}
  }, [settings]);

  // Load counters & handle auto-reset on new day
  useEffect(() => {
    try {
      const today = getTodayDateString();
      const savedDate = localStorage.getItem('dhikr_counters_date');
      const savedCounters = localStorage.getItem('dhikr_counters');

      if (savedDate !== today) {
        // Pergantian hari baru terdeteksi: otomatis reset hitungan ke 0
        localStorage.setItem('dhikr_counters_date', today);
        localStorage.setItem('dhikr_counters', JSON.stringify({}));
        setCounters({});
      } else if (savedCounters) {
        setCounters(JSON.parse(savedCounters));
      }
    } catch (e) {
      console.error('Failed to load dhikr counters:', e);
    }
  }, []);

  // Fetch items for current tab
  useEffect(() => {
    const current = tabConfigs.find((t) => t.id === activeTab);
    if (!current) return;

    setLoading(true);
    fetch(`/data/islamic/dhikr/data/${current.file}`)
      .then((res) => res.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : data.items || [];
        setItems(list);
      })
      .catch((err) => console.error('Failed to load dhikr:', err))
      .finally(() => setLoading(false));
  }, [activeTab]);

  const updateCountersState = (updater: (prev: Record<string, number>) => Record<string, number>) => {
    setCounters((prev) => {
      const next = updater(prev);
      try {
        const today = getTodayDateString();
        localStorage.setItem('dhikr_counters_date', today);
        localStorage.setItem('dhikr_counters', JSON.stringify(next));
      } catch (e) {
        console.error('Failed to save dhikr counters:', e);
      }
      return next;
    });
  };

  const handleIncrement = (key: string, maxTarget?: number) => {
    updateCountersState((prev) => {
      const current = prev[key] || 0;
      if (maxTarget && current >= maxTarget) return prev;
      const next = current + 1;
      if (navigator.vibrate) {
        if (maxTarget && next === maxTarget) {
          navigator.vibrate([100, 50, 100]); // double vibrate on completion
        } else {
          navigator.vibrate(25);
        }
      }
      return { ...prev, [key]: next };
    });
  };

  const handleResetItem = (key: string) => {
    updateCountersState((prev) => ({ ...prev, [key]: 0 }));
  };

  const handleResetAll = () => {
    try {
      const today = getTodayDateString();
      localStorage.setItem('dhikr_counters_date', today);
      localStorage.setItem('dhikr_counters', JSON.stringify({}));
    } catch (e) {
      console.error('Failed to clear dhikr counters:', e);
    }
    setCounters({});
    setShowResetModal(false);
  };

  const parseTargetCount = (item: DhikrItem): number => {
    const ctx = getText(item.context);
    if (ctx) {
      const match = ctx.match(/(\d+)\s*x/i) || ctx.match(/(\d+)\s*kali/i);
      if (match && match[1]) {
        return parseInt(match[1], 10);
      }
    }

    const idStr = String(item.id).toLowerCase();
    const titleStr = getText(item.title).toLowerCase();

    if (
      idStr.includes('tasbih') ||
      idStr.includes('tahmid') ||
      idStr.includes('takbir') ||
      titleStr.includes('tasbih') ||
      titleStr.includes('tahmid') ||
      titleStr.includes('takbir')
    ) {
      return 33;
    }
    if (idStr.includes('istighfar') || idStr.includes('istigfar') || titleStr.includes('istigfar')) {
      return 3;
    }
    if (
      idStr.includes('ikhlas') ||
      idStr.includes('falaq') ||
      idStr.includes('nas') ||
      titleStr.includes('ikhlas') ||
      titleStr.includes('falaq') ||
      titleStr.includes('an-nas')
    ) {
      return 3;
    }
    if (idStr.includes('hawqala') || titleStr.includes('hawqala')) {
      return 33;
    }

    return 1;
  };

  const handleCopy = (item: DhikrItem) => {
    const title = getText(item.title);
    const translation = getText(item.content.translation);
    const ctx = getText(item.context);
    const text = `[${title}]\n\n${item.content.arabic}\n\nLatin: ${item.content.latin || ''}\nArtinya: "${translation}"${
      ctx ? `\nPetunjuk: ${ctx}` : ''
    }`;
    navigator.clipboard.writeText(text);
    setCopiedId(`${item.id}`);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleAccordion = (key: string) => {
    setExpandedItems((prev) => ({
      ...prev,
      // Default is open if undefined
      [key]: prev[key] === undefined ? false : !prev[key],
    }));
  };

  // Check if all items in active tab are currently expanded
  const isAllExpanded = items.length > 0 && items.every((item, idx) => {
    const key = `${activeTab}_${item.id || idx}`;
    return expandedItems[key] !== false;
  });

  const handleToggleAll = () => {
    const nextState = !isAllExpanded;
    const next: Record<string, boolean> = {};
    items.forEach((item, idx) => {
      next[`${activeTab}_${item.id || idx}`] = nextState;
    });
    setExpandedItems(next);
  };

  // Calculate current completion progress
  const completedCount = items.filter((item, idx) => {
    const key = `${activeTab}_${item.id || idx}`;
    const target = parseTargetCount(item);
    return (counters[key] || 0) >= target;
  }).length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-28 -mx-4 sm:-mx-6 lg:-mx-8">
      {/* Top Header */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/islami"
              className="p-2 text-slate-500 hover:text-emerald-700 hover:bg-slate-100 rounded-xl transition"
              title="Kembali ke Dashboard"
            >
              <ArrowLeft size={20} />
            </Link>
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-emerald-100 text-emerald-700 rounded-lg">
                <Sun size={18} />
              </span>
              <h1 className="text-lg sm:text-xl font-bold text-slate-900 leading-tight">
                Dzikir Pagi & Petang
              </h1>
            </div>
          </div>

          {/* Tombol Setting di Pojok Kanan Atas */}
          <button
            type="button"
            onClick={() => setShowSettingsModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 hover:border-emerald-300 transition cursor-pointer shadow-2xs"
            title="Pengaturan Tampilan Dzikir"
          >
            <Settings2 size={16} className="text-emerald-700" />
            <span className="hidden sm:inline">Pengaturan</span>
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="max-w-4xl mx-auto px-4 sm:px-6 flex gap-2 overflow-x-auto pb-3 scrollbar-none">
          {tabConfigs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-2xl text-xs sm:text-sm font-semibold transition whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80'
                }`}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-5">
        {loading ? (
          <div className="py-20 text-center text-slate-400">
            <div className="w-8 h-8 border-[3px] border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
            <p className="text-sm">Memuat bacaan dzikir...</p>
          </div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center text-slate-500 bg-white rounded-2xl border border-slate-200">
            <p className="font-medium text-slate-700">Data dzikir belum tersedia</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Summary & Accordion Quick Controls */}
            <div className="flex items-center justify-between gap-3 px-1 py-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-600">
                  Progres: {completedCount} dari {items.length} selesai
                </span>
                <span className="text-xs text-slate-400">•</span>
                <span className="text-xs text-emerald-600 font-medium">
                  {items.length > 0 ? Math.round((completedCount / items.length) * 100) : 0}%
                </span>
              </div>

              {/* Single Compact Toggle Button */}
              <button
                type="button"
                onClick={handleToggleAll}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white text-slate-700 border border-slate-200 hover:border-emerald-300 hover:bg-slate-50 transition cursor-pointer shadow-2xs"
                title={isAllExpanded ? 'Tutup semua card dzikir' : 'Buka semua card dzikir'}
              >
                {isAllExpanded ? (
                  <>
                    <ChevronUp size={14} className="text-slate-500" />
                    <span>Tutup Semua</span>
                  </>
                ) : (
                  <>
                    <ChevronDown size={14} className="text-slate-500" />
                    <span>Buka Semua</span>
                  </>
                )}
              </button>
            </div>

            {/* Accordion List */}
            {items.map((item, idx) => {
              const itemKey = `${activeTab}_${item.id || idx}`;
              const targetCount = parseTargetCount(item);
              const currentCount = counters[itemKey] || 0;
              const isCompleted = currentCount >= targetCount;
              const itemTitle = getText(item.title);
              const itemContext = getText(item.context);
              const itemTranslation = getText(item.content.translation);
              // Default is open unless explicitly set to false
              const isOpen = expandedItems[itemKey] !== false;

              return (
                <div
                  key={itemKey}
                  className={`bg-white rounded-2xl sm:rounded-3xl border transition-all duration-200 overflow-hidden ${
                    isCompleted
                      ? 'border-emerald-300 shadow-sm bg-emerald-50/15'
                      : 'border-slate-200/90 shadow-2xs hover:border-slate-300'
                  }`}
                >
                  {/* Accordion Header (Clickable to Expand/Collapse) */}
                  <div
                    onClick={() => toggleAccordion(itemKey)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleAccordion(itemKey);
                      }
                    }}
                    className={`p-4 sm:p-5 flex items-center justify-between gap-3 cursor-pointer select-none transition-colors ${
                      isOpen ? 'bg-slate-50/50' : 'hover:bg-slate-50/80'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div
                        className={`w-8 h-8 rounded-xl text-xs font-bold flex items-center justify-center shrink-0 transition-colors ${
                          isCompleted
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {isCompleted ? <Check size={16} /> : idx + 1}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-bold text-slate-900 text-sm sm:text-base leading-snug">
                            {itemTitle}
                          </h3>
                          {itemContext && (
                            <span className="inline-block text-[11px] font-semibold text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded-md">
                              {itemContext}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {/* Count badge on header */}
                      <span
                        className={`text-xs font-bold px-2.5 py-1 rounded-lg ${
                          isCompleted
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {currentCount} / {targetCount}
                      </span>

                      {/* Accordion Chevron */}
                      <div className="p-1 text-slate-400 hover:text-slate-600 transition">
                        {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </div>
                    </div>
                  </div>

                  {/* Accordion Body */}
                  {isOpen && (
                    <div className="px-4 sm:px-6 pb-5 pt-2 border-t border-slate-100 space-y-4 ">
                      {/* Arabic */}
                      <div className="pt-2">
                        <p
                          className="font-serif text-emerald-950 text-right leading-loose"
                          dir="rtl"
                          style={{
                            fontSize: `${settings.arabicSize}px`,
                            lineHeight: 1.85,
                          }}
                        >
                          {item.content.arabic}
                        </p>
                      </div>

                      {/* Latin Transliteration (Conditional) */}
                      {settings.showLatin && item.content.latin && (
                        <p
                          className="font-mono text-emerald-800 font-medium bg-emerald-50/70 p-3 rounded-xl border border-emerald-100/60 leading-relaxed"
                          style={{ fontSize: `${settings.latinSize}px` }}
                        >
                          {item.content.latin}
                        </p>
                      )}

                      {/* Translation (Conditional) */}
                      {settings.showTranslation && (
                        <p
                          className="text-slate-700 leading-relaxed italic border-l-[3px] border-emerald-500 pl-3"
                          style={{ fontSize: `${settings.translationSize}px` }}
                        >
                          "{itemTranslation}"
                        </p>
                      )}

                      {/* Counter & Action Bar */}
                      <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-slate-500">Hitungan:</span>
                          <span
                            className={`text-sm sm:text-base font-black px-3 py-1 rounded-xl ${
                              isCompleted
                                ? 'bg-emerald-600 text-white'
                                : 'bg-slate-100 text-slate-800'
                            }`}
                          >
                            {currentCount} / {targetCount}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          {/* Tombol Salin */}
                          <button
                            type="button"
                            onClick={() => handleCopy(item)}
                            className="p-2.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                            title="Salin Dzikir"
                          >
                            {copiedId === `${item.id}` ? (
                              <Check size={16} className="text-emerald-600" />
                            ) : (
                              <Copy size={16} />
                            )}
                          </button>

                          {/* Tombol Ulangi Item ini */}
                          {currentCount > 0 && (
                            <button
                              type="button"
                              onClick={() => handleResetItem(itemKey)}
                              className="p-2.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                              title="Ulangi hitungan doa ini"
                            >
                              <RotateCcw size={16} />
                            </button>
                          )}

                          {/* Tombol Hitung +1 */}
                          <button
                            type="button"
                            onClick={() => handleIncrement(itemKey, targetCount)}
                            disabled={isCompleted}
                            className={`inline-flex items-center gap-1.5 px-4 sm:px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition shadow-2xs cursor-pointer ${
                              isCompleted
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200 cursor-default'
                                : 'bg-emerald-600 hover:bg-emerald-700 text-white active:scale-95'
                            }`}
                          >
                            {isCompleted ? (
                              <>
                                <Check size={16} /> Selesai
                              </>
                            ) : (
                              <>Hitung +1</>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Tombol Reset All di Paling Bawah */}
            <div className="pt-8 pb-4 flex flex-col items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setShowResetModal(true)}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-white hover:bg-rose-50 text-rose-600 hover:text-rose-700 border border-rose-200 hover:border-rose-300 shadow-2xs hover:shadow-sm font-semibold text-sm transition cursor-pointer"
              >
                <RotateCcw size={16} />
                <span>Reset Semua Hitungan Dzikir</span>
              </button>
              <p className="text-xs text-slate-400 text-center max-w-md px-4">
                Hitungan dzikir tersimpan di perangkat dan akan di-reset otomatis ke 0 setiap pergantian hari (pukul 00:00).
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ============================================================= */}
      {/* MODAL PENGATURAN TAMPILAN                                     */}
      {/* ============================================================= */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs ">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-lg border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <span className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
                  <Sliders size={18} />
                </span>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">
                    Pengaturan Tampilan Dzikir
                  </h3>
                  <p className="text-xs text-slate-400">
                    Sesuaikan transliterasi, terjemahan & ukuran teks
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSettingsModal(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-6 overflow-y-auto">
              {/* Toggle Switches */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Visibilitas Teks
                </h4>

                {/* Switch Transliterasi */}
                <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-2xl border border-slate-200/70">
                  <div className="flex items-center gap-3">
                    {settings.showLatin ? (
                      <Eye size={18} className="text-emerald-600" />
                    ) : (
                      <EyeOff size={18} className="text-slate-400" />
                    )}
                    <div>
                      <p className="text-sm font-semibold text-slate-800">
                        Transliterasi Latin
                      </p>
                      <p className="text-xs text-slate-500">
                        Tampilkan teks bacaan dalam huruf latin
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setSettings((prev) => ({ ...prev, showLatin: !prev.showLatin }))
                    }
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      settings.showLatin ? 'bg-emerald-600' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                        settings.showLatin ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* Switch Terjemahan */}
                <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-2xl border border-slate-200/70">
                  <div className="flex items-center gap-3">
                    {settings.showTranslation ? (
                      <Eye size={18} className="text-emerald-600" />
                    ) : (
                      <EyeOff size={18} className="text-slate-400" />
                    )}
                    <div>
                      <p className="text-sm font-semibold text-slate-800">
                        Terjemahan Bahasa
                      </p>
                      <p className="text-xs text-slate-500">
                        Tampilkan arti/terjemahan dzikir
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setSettings((prev) => ({
                        ...prev,
                        showTranslation: !prev.showTranslation,
                      }))
                    }
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      settings.showTranslation ? 'bg-emerald-600' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                        settings.showTranslation ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Ukuran Teks */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Ukuran Teks
                </h4>

                {/* Ukuran Teks Arab */}
                <div className="space-y-2 p-3.5 bg-slate-50 rounded-2xl border border-slate-200/70">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700">
                      Teks Arab
                    </span>
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md">
                      {settings.arabicSize}px
                    </span>
                  </div>
                  <input
                    type="range"
                    min="22"
                    max="42"
                    step="2"
                    value={settings.arabicSize}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        arabicSize: Number(e.target.value),
                      }))
                    }
                    className="w-full accent-emerald-600 cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400">
                    <span>Kecil (22px)</span>
                    <span>Normal (28px)</span>
                    <span>Besar (42px)</span>
                  </div>
                </div>

                {/* Ukuran Teks Transliterasi Latin */}
                <div className="space-y-2 p-3.5 bg-slate-50 rounded-2xl border border-slate-200/70">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700">
                      Teks Transliterasi (Latin)
                    </span>
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md">
                      {settings.latinSize}px
                    </span>
                  </div>
                  <input
                    type="range"
                    min="12"
                    max="20"
                    step="1"
                    disabled={!settings.showLatin}
                    value={settings.latinSize}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        latinSize: Number(e.target.value),
                      }))
                    }
                    className="w-full accent-emerald-600 cursor-pointer disabled:opacity-40"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400">
                    <span>Kecil (12px)</span>
                    <span>Normal (14px)</span>
                    <span>Besar (20px)</span>
                  </div>
                </div>

                {/* Ukuran Teks Terjemahan */}
                <div className="space-y-2 p-3.5 bg-slate-50 rounded-2xl border border-slate-200/70">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700">
                      Teks Terjemahan
                    </span>
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md">
                      {settings.translationSize}px
                    </span>
                  </div>
                  <input
                    type="range"
                    min="12"
                    max="20"
                    step="1"
                    disabled={!settings.showTranslation}
                    value={settings.translationSize}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        translationSize: Number(e.target.value),
                      }))
                    }
                    className="w-full accent-emerald-600 cursor-pointer disabled:opacity-40"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400">
                    <span>Kecil (12px)</span>
                    <span>Normal (14px)</span>
                    <span>Besar (20px)</span>
                  </div>
                </div>
              </div>

              {/* Preview Box */}
              <div className="p-4 bg-emerald-50/40 rounded-2xl border border-emerald-100 space-y-2">
                <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider block">
                  Pratinjau Tampilan
                </span>
                <p
                  className="font-serif text-emerald-950 text-right leading-relaxed"
                  dir="rtl"
                  style={{ fontSize: `${settings.arabicSize}px` }}
                >
                  سُبْحَانَ اللَّهِ وَبِحَمْدِهِ
                </p>
                {settings.showLatin && (
                  <p
                    className="font-mono text-emerald-800"
                    style={{ fontSize: `${settings.latinSize}px` }}
                  >
                    Subhaanallaahi wa bihamdih
                  </p>
                )}
                {settings.showTranslation && (
                  <p
                    className="text-slate-600 italic"
                    style={{ fontSize: `${settings.translationSize}px` }}
                  >
                    "Maha Suci Allah dan segala puji bagi-Nya."
                  </p>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 px-6 border-t border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
              <button
                type="button"
                onClick={() => setSettings(DEFAULT_SETTINGS)}
                className="text-xs font-semibold text-slate-500 hover:text-slate-800 transition cursor-pointer"
              >
                Reset ke Default
              </button>
              <button
                type="button"
                onClick={() => setShowSettingsModal(false)}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition cursor-pointer shadow-sm"
              >
                Terapkan & Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* MODAL KONFIRMASI RESET ALL                                    */}
      {/* ============================================================= */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs ">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-sm border border-slate-100 p-6 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <RotateCcw size={24} />
            </div>

            <div className="text-center space-y-1">
              <h3 className="font-bold text-slate-900 text-base">
                Reset Semua Hitungan?
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Seluruh hitungan dzikir hari ini akan dikembalikan ke 0. Hitungan dzikir juga secara otomatis di-reset saat pergantian hari baru (00:00).
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowResetModal(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleResetAll}
                className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition cursor-pointer shadow-sm"
              >
                Ya, Reset Semua
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

