// components/tal/TalApplyTemplateModal.tsx — terapkan template rutinitas ke
// periode. Porting src/components/tal/TalApplyTemplateModal.tsx backup.
// Versi WOORK: simpan lewat POST /api/tal/routine-templates/apply
// (applyTalRoutineTemplate, client.ts) — tanpa userId/email (session-scoped).
// Kompatibilitas pemanggil lama dipertahankan: prop `template` (opsional,
// template yang sudah dipilih — mis. dari halaman Tasks/Hub/Templates) akan
// jadi pilihan awal di katalog; `targetDateStr`/`targetWeek*`/`targetMonth*`
// menentukan periode acuan; onSuccess(count, skipped).
'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  X,
  Sparkles,
  Calendar,
  Clock,
  CheckCircle2,
  ChevronRight,
  ChevronDown,
  Building2,
  FolderKanban,
  Sliders,
  Info,
} from 'lucide-react';
import type { TalRoutineTemplate, TalTaskType } from '@/lib/tal/types';
import { applyTalRoutineTemplate, fetchTalRoutineTemplates } from '@/lib/tal/client';
import {
  INDONESIAN_DAYS,
  INDONESIAN_MONTHS,
  formatCurrencyIDR,
  formatDateKey,
  getWeekNumberAndYear,
  parseDateKey,
} from '@/lib/tal/date';

export interface TalApplyTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  scopeType: TalTaskType;
  /** Tanggal acuan periode (YYYY-MM-DD). Alias backup: currentDateStr. */
  targetDateStr?: string;
  currentDateStr?: string;
  targetWeekNumber?: number;
  targetWeekYear?: number;
  targetMonth?: number;
  targetYear?: number;
  /** Template yang sudah dipilih pemanggil (opsional) — jadi pilihan awal. */
  template?: TalRoutineTemplate | null;
  onSuccess?: (count: number, skipped: string[]) => void;
  onOpenManageTemplates?: () => void;
}

export default function TalApplyTemplateModal({
  isOpen,
  onClose,
  scopeType,
  targetDateStr,
  currentDateStr,
  targetWeekNumber,
  targetWeekYear,
  targetMonth,
  targetYear,
  template,
  onSuccess,
  onOpenManageTemplates,
}: TalApplyTemplateModalProps) {
  const router = useRouter();
  const [templates, setTemplates] = useState<TalRoutineTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Package toggles (Multi-level 9.7)
  const [includeMonthly, setIncludeMonthly] = useState(true);
  const [includeWeekly, setIncludeWeekly] = useState(true);
  const [includeDaily, setIncludeDaily] = useState(true);
  const [dailyMappingMode, setDailyMappingMode] = useState<'current_day_only' | 'full_work_week'>('full_work_week');

  // Expanded accordion sections in preview
  const [expandedTiers, setExpandedTiers] = useState<{
    monthly: boolean;
    weekly: boolean;
    daily: boolean;
  }>({
    monthly: true,
    weekly: true,
    daily: true,
  });

  const [applying, setApplying] = useState(false);
  const [appliedResult, setAppliedResult] = useState<{ count: number; skippedCount?: number; skippedDetails?: string[] } | null>(null);
  const [error, setError] = useState('');

  const today = new Date();
  const dateStr = targetDateStr ?? currentDateStr ?? formatDateKey(today);
  const parsedDate = parseDateKey(dateStr);
  const weekInfo = getWeekNumberAndYear(parsedDate);
  const weekNumber = targetWeekNumber ?? weekInfo.weekNumber;
  const weekYear = targetWeekYear ?? weekInfo.weekYear;
  const month = targetMonth ?? parsedDate.getMonth() + 1;
  const year = targetYear ?? parsedDate.getFullYear();

  useEffect(() => {
    if (isOpen) {
      loadTemplates();
      setAppliedResult(null);
      setError('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Template dari pemanggil (mis. halaman Templates/Tasks) jadi pilihan awal.
  useEffect(() => {
    if (isOpen && template?.id) {
      setSelectedTemplateId(template.id);
    }
  }, [isOpen, template?.id]);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const list = await fetchTalRoutineTemplates();
      setTemplates(list);
      if (list.length > 0 && !selectedTemplateId) {
        setSelectedTemplateId(list[0].id);
      }
    } catch (err) {
      console.error('Failed to load templates:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const categories = ['all', ...Array.from(new Set(templates.map((t) => t.categoryTag || 'Umum')))];

  const filteredTemplates = templates.filter((t) => {
    const matchesSearch =
      !searchKeyword ||
      t.name.toLowerCase().includes(searchKeyword.toLowerCase()) ||
      (t.description || '').toLowerCase().includes(searchKeyword.toLowerCase());
    const matchesCat = selectedCategory === 'all' || (t.categoryTag || 'Umum') === selectedCategory;
    return matchesSearch && matchesCat;
  });

  const selectedTemplate =
    templates.find((t) => t.id === selectedTemplateId) ||
    (template && templates.some((t) => t.id === template.id) ? template : undefined) ||
    filteredTemplates[0] ||
    templates[0];

  const handleApply = async () => {
    if (!selectedTemplate) return;
    setApplying(true);
    setError('');
    try {
      const res = await applyTalRoutineTemplate(selectedTemplate.id, {
        scopeType,
        targetDateStr: dateStr,
        targetWeekNumber: weekNumber,
        targetWeekYear: weekYear,
        targetMonth: month,
        targetYear: year,
        includeMonthly,
        includeWeekly,
        includeDaily,
        dailyMappingMode,
      });

      setAppliedResult({ count: res.count, skippedCount: res.skipped.length, skippedDetails: res.skipped });
      onSuccess?.(res.count, res.skipped);
      setTimeout(
        () => {
          onClose();
        },
        res.skipped.length > 0 ? 2500 : 1400
      );
    } catch (err: any) {
      console.error('Failed to apply template:', err);
      setError(err?.message ?? 'Gagal menerapkan template.');
    } finally {
      setApplying(false);
    }
  };

  const totalMonthlyCount = selectedTemplate?.monthlyTasks?.length || 0;
  const totalWeeklyCount = selectedTemplate?.weeklyTasks?.length || 0;
  const totalDailyCount = selectedTemplate?.dailyTasks?.length || 0;
  const grandTotalTasks =
    (includeMonthly ? totalMonthlyCount : 0) +
    (includeWeekly ? totalWeeklyCount : 0) +
    (includeDaily ? totalDailyCount : 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200/90 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-4 py-3 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between shadow-xs shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-amber-300 flex items-center justify-center border border-indigo-400/30">
              <Sparkles size={16} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>Terapkan Template Rutinitas</span>
              </h3>
              <p className="text-[11px] text-slate-300">
                {scopeType === 'daily'
                  ? `Harian • ${parsedDate.getDate()} ${INDONESIAN_MONTHS[parsedDate.getMonth()]} ${parsedDate.getFullYear()}`
                  : scopeType === 'weekly'
                    ? `Mingguan • Week ${weekNumber} (${weekYear})`
                    : `Bulanan • ${INDONESIAN_MONTHS[month - 1]} ${year}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                onClose();
                if (onOpenManageTemplates) {
                  onOpenManageTemplates();
                } else {
                  router.push('/tal/templates');
                }
              }}
              className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-medium text-slate-200 hover:text-white transition cursor-pointer"
              title="Kelola Katalog Template Rutinitas"
            >
              <Sliders size={13} />
              <span className="hidden sm:inline">Kelola Katalog</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {error && (
          <div className="px-4 py-2 bg-rose-50 border-b border-rose-200 text-rose-800 text-xs font-semibold shrink-0">
            {error}
          </div>
        )}

        {/* Modal Body: Left sidebar (Desktop) + Right Preview & Settings */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-12 md:divide-x divide-slate-200 min-h-0">
          {/* Left Column (Desktop Only): Template Selection List (5 cols) */}
          <div className="hidden md:flex md:col-span-5 flex-col bg-slate-50/70 p-3 overflow-hidden">
            {/* Search & Filter */}
            <div className="space-y-2 mb-2.5 shrink-0">
              <input
                type="text"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                placeholder="Cari rutinitas kerja..."
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition"
              />

              {/* Category pills */}
              <div className="flex items-center gap-1 overflow-x-auto pb-0.5 no-scrollbar text-xs">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-2 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap transition cursor-pointer ${
                      selectedCategory === cat
                        ? 'bg-indigo-600 text-white shadow-2xs'
                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {cat === 'all' ? 'Semua' : cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Template items scroll list */}
            <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5 custom-scrollbar">
              {loading ? (
                <div className="py-6 text-center text-xs text-slate-400">Memuat katalog...</div>
              ) : filteredTemplates.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-400">Tidak ditemukan template.</div>
              ) : (
                filteredTemplates.map((tmpl) => {
                  const isSelected = selectedTemplate?.id === tmpl.id;
                  const mCount = tmpl.monthlyTasks?.length || 0;
                  const wCount = tmpl.weeklyTasks?.length || 0;
                  const dCount = tmpl.dailyTasks?.length || 0;

                  return (
                    <div
                      key={tmpl.id}
                      onClick={() => setSelectedTemplateId(tmpl.id)}
                      className={`p-2.5 rounded-lg border text-left transition cursor-pointer flex flex-col gap-1 relative ${
                        isSelected
                          ? 'bg-indigo-50/50 border-indigo-500 ring-1 ring-indigo-500 shadow-2xs'
                          : 'bg-white border-slate-200/80 hover:border-slate-300 hover:bg-slate-50/50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: tmpl.color || '#4f46e5' }}
                          />
                          <h4 className="text-xs font-bold text-slate-800 truncate">{tmpl.name}</h4>
                        </div>
                        {tmpl.isPreset && (
                          <span className="text-[9px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.2 rounded shrink-0">
                            Preset
                          </span>
                        )}
                      </div>

                      {tmpl.description && (
                        <p className="text-[11px] text-slate-500 line-clamp-1 leading-normal">{tmpl.description}</p>
                      )}

                      {/* Package summary chips */}
                      <div className="flex items-center gap-1 text-[10px] text-slate-500 pt-0.5">
                        <span className="bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded font-medium">{mCount}B</span>
                        <span className="bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded font-medium">{wCount}M</span>
                        <span className="bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded font-medium">{dCount}H</span>
                        <span className="text-slate-400 ml-auto font-mono text-[10px]">{mCount + wCount + dCount} tugas</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Column: Template Preview & Settings (7 cols desktop, full width mobile) */}
          <div className="col-span-1 md:col-span-7 flex flex-col overflow-hidden bg-white p-3 sm:p-3.5 min-h-0">
            {/* Mobile-Only Compact Dropdown Selector */}
            <div className="block md:hidden pb-2 mb-2 border-b border-slate-100 shrink-0">
              <div className="grid grid-cols-12 gap-2">
                <div className="col-span-4">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Grup Rutinitas
                  </label>
                  <select
                    value={selectedCategory}
                    onChange={(e) => {
                      const newCat = e.target.value;
                      setSelectedCategory(newCat);
                      const firstInCat = templates.find((t) => newCat === 'all' || (t.categoryTag || 'Umum') === newCat);
                      if (firstInCat) setSelectedTemplateId(firstInCat.id);
                    }}
                    className="w-full px-2 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg font-semibold text-slate-700 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                  >
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat === 'all' ? 'Semua Grup' : cat}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-span-8">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Pilih Template
                  </label>
                  <select
                    value={selectedTemplateId || selectedTemplate?.id || ''}
                    onChange={(e) => setSelectedTemplateId(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs bg-indigo-50/50 border border-indigo-300 rounded-lg font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none truncate"
                  >
                    {filteredTemplates.length === 0 ? (
                      <option disabled>Tidak ada template</option>
                    ) : (
                      filteredTemplates.map((tmpl) => {
                        const total =
                          (tmpl.monthlyTasks?.length || 0) + (tmpl.weeklyTasks?.length || 0) + (tmpl.dailyTasks?.length || 0);
                        return (
                          <option key={tmpl.id} value={tmpl.id}>
                            {tmpl.name} ({total} tugas)
                          </option>
                        );
                      })
                    )}
                  </select>
                </div>
              </div>
            </div>

            {selectedTemplate ? (
              <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                {/* Header Summary (Desktop only or clean summary) */}
                <div className="hidden md:block pb-2.5 border-b border-slate-100 shrink-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: selectedTemplate.color || '#4f46e5' }}
                      />
                      <h3 className="text-sm font-bold text-slate-900 truncate">{selectedTemplate.name}</h3>
                    </div>
                    <span className="text-[11px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md shrink-0">
                      {selectedTemplate.categoryTag || 'Operasional'}
                    </span>
                  </div>
                  {selectedTemplate.description && (
                    <p className="text-[11px] text-slate-500 mt-1 line-clamp-1 leading-normal">
                      {selectedTemplate.description}
                    </p>
                  )}
                </div>

                {/* Compact Package Selection Controls */}
                <div className="my-2.5 p-2 bg-slate-50 rounded-lg border border-slate-200/70 space-y-1.5 shrink-0">
                  <div className="grid grid-cols-3 gap-1.5">
                    {/* Bulanan */}
                    <label
                      className={`flex items-center gap-1.5 p-1.5 rounded-md border text-xs cursor-pointer transition ${
                        includeMonthly
                          ? 'bg-indigo-50/80 border-indigo-300 text-indigo-950 font-semibold'
                          : 'bg-white border-slate-200 text-slate-600'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={includeMonthly}
                        onChange={(e) => setIncludeMonthly(e.target.checked)}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 shrink-0"
                      />
                      <div className="min-w-0 truncate">
                        <span className="text-xs">Bulanan</span>
                        <span className="ml-1 text-[10px] text-slate-500 font-normal">({totalMonthlyCount})</span>
                      </div>
                    </label>

                    {/* Mingguan */}
                    <label
                      className={`flex items-center gap-1.5 p-1.5 rounded-md border text-xs cursor-pointer transition ${
                        includeWeekly
                          ? 'bg-indigo-50/80 border-indigo-300 text-indigo-950 font-semibold'
                          : 'bg-white border-slate-200 text-slate-600'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={includeWeekly}
                        onChange={(e) => setIncludeWeekly(e.target.checked)}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 shrink-0"
                      />
                      <div className="min-w-0 truncate">
                        <span className="text-xs">Mingguan</span>
                        <span className="ml-1 text-[10px] text-slate-500 font-normal">({totalWeeklyCount})</span>
                      </div>
                    </label>

                    {/* Harian */}
                    <label
                      className={`flex items-center gap-1.5 p-1.5 rounded-md border text-xs cursor-pointer transition ${
                        includeDaily
                          ? 'bg-indigo-50/80 border-indigo-300 text-indigo-950 font-semibold'
                          : 'bg-white border-slate-200 text-slate-600'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={includeDaily}
                        onChange={(e) => setIncludeDaily(e.target.checked)}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 shrink-0"
                      />
                      <div className="min-w-0 truncate">
                        <span className="text-xs">Harian</span>
                        <span className="ml-1 text-[10px] text-slate-500 font-normal">({totalDailyCount})</span>
                      </div>
                    </label>
                  </div>

                  {/* Mode Pemetaan Harian (Single compact line) */}
                  {scopeType === 'daily' && includeDaily && (
                    <div className="pt-1.5 border-t border-slate-200/50 flex items-center justify-between text-[11px] gap-2 flex-wrap">
                      <span className="text-slate-500">Mapping Harian:</span>
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-1 cursor-pointer text-slate-700">
                          <input
                            type="radio"
                            name="dailyMappingMode"
                            checked={dailyMappingMode === 'full_work_week'}
                            onChange={() => setDailyMappingMode('full_work_week')}
                            className="text-indigo-600 focus:ring-indigo-500 w-3 h-3"
                          />
                          <span>Pekan Penuh (Senin-Sabtu)</span>
                        </label>
                        <label className="flex items-center gap-1 cursor-pointer text-slate-700">
                          <input
                            type="radio"
                            name="dailyMappingMode"
                            checked={dailyMappingMode === 'current_day_only'}
                            onChange={() => setDailyMappingMode('current_day_only')}
                            className="text-indigo-600 focus:ring-indigo-500 w-3 h-3"
                          />
                          <span>Hari Ini Saja</span>
                        </label>
                      </div>
                    </div>
                  )}
                </div>

                {/* Detailed Tasks Preview Accordion (Compact & streamlined) */}
                <div className="flex-1 overflow-y-auto space-y-2 pr-0.5 custom-scrollbar min-h-0">
                  {/* Bulanan */}
                  {includeMonthly && totalMonthlyCount > 0 && (
                    <div className="border border-slate-200/90 rounded-lg overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setExpandedTiers((prev) => ({ ...prev, monthly: !prev.monthly }))}
                        className="w-full px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-800 flex items-center justify-between text-xs font-bold transition cursor-pointer"
                      >
                        <div className="flex items-center gap-1.5">
                          <Building2 size={13} className="text-indigo-600" />
                          <span>Target Bulanan ({totalMonthlyCount})</span>
                        </div>
                        {expandedTiers.monthly ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                      </button>

                      {expandedTiers.monthly && (
                        <div className="p-2 space-y-1 bg-white divide-y divide-slate-100 text-xs">
                          {selectedTemplate.monthlyTasks.map((task, idx) => (
                            <div key={task.id || idx} className="pt-1 first:pt-0 flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="font-medium text-slate-800 text-[11px]">{task.title}</div>
                                {task.description && (
                                  <div className="text-[10px] text-slate-500 truncate">{task.description}</div>
                                )}
                              </div>
                              <div className="shrink-0 text-[10px]">
                                {task.category === 'result' ? (
                                  <span className="bg-amber-50 text-amber-800 border border-amber-200/80 px-1.5 py-0.2 rounded font-bold">
                                    {task.targetUnit === 'Rupiah'
                                      ? formatCurrencyIDR(task.targetValue || 0)
                                      : `${task.targetValue} ${task.targetUnit || ''}`}
                                  </span>
                                ) : (
                                  <span className="bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded text-[9px]">
                                    Non Result
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Mingguan */}
                  {includeWeekly && totalWeeklyCount > 0 && (
                    <div className="border border-slate-200/90 rounded-lg overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setExpandedTiers((prev) => ({ ...prev, weekly: !prev.weekly }))}
                        className="w-full px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-800 flex items-center justify-between text-xs font-bold transition cursor-pointer"
                      >
                        <div className="flex items-center gap-1.5">
                          <FolderKanban size={13} className="text-blue-600" />
                          <span>Target Mingguan ({totalWeeklyCount})</span>
                        </div>
                        {expandedTiers.weekly ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                      </button>

                      {expandedTiers.weekly && (
                        <div className="p-2 space-y-1 bg-white divide-y divide-slate-100 text-xs">
                          {selectedTemplate.weeklyTasks.map((task, idx) => (
                            <div key={task.id || idx} className="pt-1 first:pt-0 flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="font-medium text-slate-800 text-[11px]">{task.title}</div>
                                {task.description && (
                                  <div className="text-[10px] text-slate-500 truncate">{task.description}</div>
                                )}
                              </div>
                              <div className="shrink-0 text-[10px]">
                                {task.category === 'result' ? (
                                  <span className="bg-amber-50 text-amber-800 border border-amber-200/80 px-1.5 py-0.2 rounded font-bold">
                                    {task.targetUnit === 'Rupiah'
                                      ? formatCurrencyIDR(task.targetValue || 0)
                                      : `${task.targetValue} ${task.targetUnit || ''}`}
                                  </span>
                                ) : (
                                  <span className="bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded text-[9px]">
                                    Non Result
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Harian */}
                  {includeDaily && totalDailyCount > 0 && (
                    <div className="border border-slate-200/90 rounded-lg overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setExpandedTiers((prev) => ({ ...prev, daily: !prev.daily }))}
                        className="w-full px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-800 flex items-center justify-between text-xs font-bold transition cursor-pointer"
                      >
                        <div className="flex items-center gap-1.5">
                          <Clock size={13} className="text-emerald-600" />
                          <span>Rutinitas Harian ({totalDailyCount})</span>
                        </div>
                        {expandedTiers.daily ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                      </button>

                      {expandedTiers.daily && (
                        <div className="p-2 space-y-1.5 bg-white text-xs">
                          {[1, 2, 3, 4, 5, 6].map((offset) => {
                            const dayTasks = selectedTemplate.dailyTasks.filter((t) => t.dayOffset === offset);
                            if (dayTasks.length === 0) return null;
                            const dayName = INDONESIAN_DAYS[offset];

                            return (
                              <div key={offset} className="bg-slate-50/70 rounded-md p-1.5 border border-slate-200/60">
                                <div className="text-[10px] font-bold text-slate-700 mb-1 flex items-center justify-between">
                                  <span>
                                    {dayName} (Hari ke-{offset})
                                  </span>
                                  <span className="text-slate-400 font-normal">{dayTasks.length} tugas</span>
                                </div>
                                <div className="space-y-0.5">
                                  {dayTasks.map((t, idx) => (
                                    <div
                                      key={t.id || idx}
                                      className="flex items-center justify-between gap-1 text-[10px] bg-white px-1.5 py-1 rounded border border-slate-200/40"
                                    >
                                      <div className="flex items-center gap-1 min-w-0">
                                        <span className="font-mono text-[9px] text-slate-400 shrink-0">
                                          {t.time || '08:00'}
                                        </span>
                                        <span className="truncate text-slate-700 font-medium">{t.title}</span>
                                      </div>
                                      {t.priority === 'high' && (
                                        <span className="text-[8px] px-1 py-0.2 rounded font-semibold bg-rose-50 text-rose-700 border border-rose-200/60 shrink-0">
                                          High
                                        </span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-400 text-xs">
                Pilih template untuk melihat detail.
              </div>
            )}
          </div>
        </div>

        {appliedResult && appliedResult.skippedCount && appliedResult.skippedCount > 0 ? (
          <div className="px-4 py-2 bg-amber-50 border-t border-amber-200 text-amber-900 text-xs flex items-center gap-2">
            <Info size={14} className="text-amber-600 shrink-0" />
            <span className="truncate">
              <strong>{appliedResult.count} tugas dibuat.</strong> {appliedResult.skippedCount} tugas harian otomatis
              dilewati karena bertepatan dengan tanggal merah/hari libur atau cuti.
            </span>
          </div>
        ) : null}

        {/* Modal Footer */}
        <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 truncate">
            <Calendar size={13} className="text-indigo-600 shrink-0" />
            <span className="truncate">Tugas baru ditambahkan dengan perlindungan otomatis tanggal merah &amp; cuti.</span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200/70 rounded-lg transition cursor-pointer"
            >
              Batal
            </button>

            <button
              type="button"
              onClick={handleApply}
              disabled={applying || grandTotalTasks === 0 || !selectedTemplate}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold text-white flex items-center gap-1.5 shadow-2xs transition cursor-pointer ${
                appliedResult ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-indigo-600 hover:bg-indigo-700'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {applying ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Menerapkan...</span>
                </>
              ) : appliedResult ? (
                <>
                  <CheckCircle2 size={14} />
                  <span>Selesai ({appliedResult.count})</span>
                </>
              ) : (
                <>
                  <Sparkles size={14} className="text-amber-300" />
                  <span>Terapkan ({grandTotalTasks} Tugas)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
