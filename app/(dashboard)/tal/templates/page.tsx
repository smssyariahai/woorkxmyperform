// app/(dashboard)/tal/templates/page.tsx — Template Rutinitas TAL.
// Porting src/pages/TalTemplates.tsx backup (1.226 baris) ke WOORK.
// Daftar + detail + editor (bulanan/mingguan/harian) + terapkan ke periode
// via TalApplyTemplateModal + preset bawaan TAL_DEFAULT_ROUTINE_TEMPLATES
// (digabung server-side oleh GET /api/tal/routine-templates).
// Adaptasi WOORK: useAuth/Firebase diganti session NextAuth (client.ts sudah
// session-scoped, tanpa userId/email), react-router diganti next/navigation.
// Layout backup (h-full + overflow-hidden) disesuaikan ke alur dokumen
// AppShell: grid sidebar + detail, bukan kolom tinggi penuh.
'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Sparkles,
  Plus,
  Trash2,
  Edit3,
  Save,
  ArrowLeft,
  Copy,
  CheckCircle2,
  Clock,
  Target,
  Search,
  X,
  Bell,
  FolderKanban,
} from 'lucide-react';
import type {
  TalRoutineTemplate,
  TalRoutineMonthlyTask,
  TalRoutineWeeklyTask,
  TalRoutineDailyTask,
  TalPriority,
  TalCategory,
  TalTargetUnit,
} from '@/lib/tal/types';
import {
  fetchTalRoutineTemplates,
  saveTalRoutineTemplate,
  deleteTalRoutineTemplate,
} from '@/lib/tal/client';
import {
  INDONESIAN_DAYS,
  formatCurrencyIDR,
  formatDateKey,
  getWeekNumberAndYear,
} from '@/lib/tal/date';
import TalApplyTemplateModal from '@/components/tal/TalApplyTemplateModal';

const CATEGORY_TAGS = ['Semua', 'Operasional', 'Bisnis', 'Audit', 'Custom'];
const COLOR_PRESETS = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#db2777', '#475569'];

export default function TalTemplatesPage() {
  const router = useRouter();

  const [templates, setTemplates] = useState<TalRoutineTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

  // Search & Filter
  const [searchKeyword, setSearchKeyword] = useState('');
  const [selectedTag, setSelectedTag] = useState('Semua');
  const [mobileTab, setMobileTab] = useState<'list' | 'detail'>('list');

  // Edit State
  const [isEditing, setIsEditing] = useState(false);
  const [editTab, setEditTab] = useState<'monthly' | 'weekly' | 'daily'>('monthly');

  // Form State
  const [formId, setFormId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formCategory, setFormCategory] = useState('Operasional');
  const [formColor, setFormColor] = useState('#2563eb');
  const [formMonthlyTasks, setFormMonthlyTasks] = useState<TalRoutineMonthlyTask[]>([]);
  const [formWeeklyTasks, setFormWeeklyTasks] = useState<TalRoutineWeeklyTask[]>([]);
  const [formDailyTasks, setFormDailyTasks] = useState<TalRoutineDailyTask[]>([]);

  // Apply Modal State
  const [isApplyModalOpen, setIsApplyModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleSelectTemplate = useCallback((tmpl: TalRoutineTemplate) => {
    setSelectedTemplateId(tmpl.id);
    setFormId(tmpl.id);
    setFormName(tmpl.name);
    setFormDescription(tmpl.description || '');
    setFormCategory(tmpl.categoryTag || 'Operasional');
    setFormColor(tmpl.color || '#2563eb');
    setFormMonthlyTasks(tmpl.monthlyTasks || []);
    setFormWeeklyTasks(tmpl.weeklyTasks || []);
    setFormDailyTasks(tmpl.dailyTasks || []);
    setIsEditing(false);
    setMobileTab('detail');
  }, []);

  const loadTemplates = useCallback(
    async (selectId?: string) => {
      setLoading(true);
      try {
        const list = await fetchTalRoutineTemplates();
        setTemplates(list);

        const targetId = selectId || selectedTemplateId || (list.length > 0 ? list[0].id : null);
        if (targetId && list.some((t) => t.id === targetId)) {
          handleSelectTemplate(list.find((t) => t.id === targetId)!);
        } else if (list.length > 0) {
          handleSelectTemplate(list[0]);
        } else {
          setSelectedTemplateId(null);
        }
      } catch (err) {
        console.error('Failed to load routine templates:', err);
      } finally {
        setLoading(false);
      }
    },
    [selectedTemplateId, handleSelectTemplate]
  );

  useEffect(() => {
    loadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreateNew = () => {
    const newId = `temp_${Date.now()}`;
    setFormId(newId);
    setFormName('Rutinitas Baru');
    setFormDescription('');
    setFormCategory('Operasional');
    setFormColor('#2563eb');
    setFormMonthlyTasks([
      {
        id: `m_${Date.now()}_1`,
        title: 'Target Strategis Bulanan 1',
        category: 'result',
        priority: 'high',
        targetValue: 10,
        targetUnit: 'NOA',
      },
    ]);
    setFormWeeklyTasks([
      {
        id: `w_${Date.now()}_1`,
        title: 'Target Operasional Mingguan 1',
        category: 'non_result',
        priority: 'high',
      },
    ]);
    setFormDailyTasks([
      {
        id: `d_${Date.now()}_1`,
        title: 'Tugas Rutin Pagi (Briefing)',
        category: 'non_result',
        priority: 'high',
        time: '08:00',
        dayOffset: 1,
        enableReminder: true,
        reminderType: 'minutes_before',
        reminderMinutesBefore: 15,
      },
    ]);
    setSelectedTemplateId(newId);
    setIsEditing(true);
    setEditTab('monthly');
    setMobileTab('detail');
  };

  const handleDuplicate = (tmpl: TalRoutineTemplate) => {
    const newId = `temp_${Date.now()}`;
    setFormId(newId);
    setFormName(`${tmpl.name} (Salinan)`);
    setFormDescription(tmpl.description || '');
    setFormCategory(tmpl.categoryTag || 'Operasional');
    setFormColor(tmpl.color || '#2563eb');
    setFormMonthlyTasks([...(tmpl.monthlyTasks || [])]);
    setFormWeeklyTasks([...(tmpl.weeklyTasks || [])]);
    setFormDailyTasks([...(tmpl.dailyTasks || [])]);
    setSelectedTemplateId(newId);
    setIsEditing(true);
    setMobileTab('detail');
    showToast('Template disalin. Silakan ubah dan klik Simpan.');
  };

  /** Mulai edit: preset bawaan tidak bisa diubah langsung — edit membuat salinan. */
  const startEdit = (tmpl: TalRoutineTemplate) => {
    if (tmpl.isPreset) {
      setFormId(null);
      setFormName(`${tmpl.name} (Salinan)`);
    } else {
      setFormId(tmpl.id);
      setFormName(tmpl.name);
    }
    setFormDescription(tmpl.description || '');
    setFormCategory(tmpl.categoryTag || 'Operasional');
    setFormColor(tmpl.color || '#2563eb');
    setFormMonthlyTasks((tmpl.monthlyTasks || []).map((t) => ({ ...t })));
    setFormWeeklyTasks((tmpl.weeklyTasks || []).map((t) => ({ ...t })));
    setFormDailyTasks((tmpl.dailyTasks || []).map((t) => ({ ...t })));
    setIsEditing(true);
    setMobileTab('detail');
  };

  const handleDelete = async (tmplId: string) => {
    if (!window.confirm('Hapus template rutinitas ini?')) return;
    try {
      await deleteTalRoutineTemplate(tmplId);
      showToast('Template berhasil dihapus.');
      await loadTemplates();
    } catch (err) {
      console.error('Failed to delete template:', err);
      showToast('Gagal menghapus template.', 'error');
    }
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      showToast('Nama template tidak boleh kosong.', 'error');
      return;
    }

    setSaving(true);
    try {
      // id temp_ / preset -> API membuat salinan baru; id template milik
      // sendiri -> update.
      const saved = await saveTalRoutineTemplate({
        id: formId || undefined,
        name: formName.trim(),
        description: formDescription.trim(),
        categoryTag: formCategory,
        color: formColor,
        isPreset: false,
        monthlyTasks: formMonthlyTasks,
        weeklyTasks: formWeeklyTasks,
        dailyTasks: formDailyTasks,
      });

      showToast('Template rutinitas berhasil disimpan!');
      setIsEditing(false);
      await loadTemplates(saved.id);
    } catch (err) {
      console.error('Error saving template:', err);
      showToast('Gagal menyimpan template.', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Helper additions for tasks in edit mode
  const addMonthlyTask = () => {
    const newTask: TalRoutineMonthlyTask = {
      id: `m_${Date.now()}`,
      title: 'Target Bulanan Baru',
      category: 'result',
      priority: 'medium',
      targetValue: 1,
      targetUnit: 'NOA',
    };
    setFormMonthlyTasks([...formMonthlyTasks, newTask]);
  };

  const updateMonthlyTask = (id: string, patch: Partial<TalRoutineMonthlyTask>) => {
    setFormMonthlyTasks(formMonthlyTasks.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  };

  const deleteMonthlyTask = (id: string) => {
    setFormMonthlyTasks(formMonthlyTasks.filter((m) => m.id !== id));
    // Clear parent reference in weekly
    setFormWeeklyTasks(
      formWeeklyTasks.map((w) => (w.parentMonthlyTaskTempId === id ? { ...w, parentMonthlyTaskTempId: undefined } : w))
    );
  };

  const addWeeklyTask = () => {
    const newTask: TalRoutineWeeklyTask = {
      id: `w_${Date.now()}`,
      title: 'Target Mingguan Baru',
      category: 'non_result',
      priority: 'medium',
      parentMonthlyTaskTempId: formMonthlyTasks.length > 0 ? formMonthlyTasks[0].id : undefined,
    };
    setFormWeeklyTasks([...formWeeklyTasks, newTask]);
  };

  const updateWeeklyTask = (id: string, patch: Partial<TalRoutineWeeklyTask>) => {
    setFormWeeklyTasks(formWeeklyTasks.map((w) => (w.id === id ? { ...w, ...patch } : w)));
  };

  const deleteWeeklyTask = (id: string) => {
    setFormWeeklyTasks(formWeeklyTasks.filter((w) => w.id !== id));
    // Clear parent reference in daily
    setFormDailyTasks(
      formDailyTasks.map((d) => (d.parentWeeklyTaskTempId === id ? { ...d, parentWeeklyTaskTempId: undefined } : d))
    );
  };

  const addDailyTask = (dayOffset = 1) => {
    const newTask: TalRoutineDailyTask = {
      id: `d_${Date.now()}`,
      title: 'Tugas Harian Baru',
      category: 'non_result',
      priority: 'medium',
      time: '08:30',
      dayOffset,
      parentWeeklyTaskTempId: formWeeklyTasks.length > 0 ? formWeeklyTasks[0].id : undefined,
    };
    setFormDailyTasks([...formDailyTasks, newTask]);
  };

  const updateDailyTask = (id: string, patch: Partial<TalRoutineDailyTask>) => {
    setFormDailyTasks(formDailyTasks.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  };

  const deleteDailyTask = (id: string) => {
    setFormDailyTasks(formDailyTasks.filter((d) => d.id !== id));
  };

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId) || null;

  const filteredTemplates = templates.filter((t) => {
    const matchesSearch =
      !searchKeyword ||
      t.name.toLowerCase().includes(searchKeyword.toLowerCase()) ||
      (t.description || '').toLowerCase().includes(searchKeyword.toLowerCase());
    const matchesTag = selectedTag === 'Semua' || (t.categoryTag || 'Operasional') === selectedTag;
    return matchesSearch && matchesTag;
  });

  const today = new Date();
  const weekInfo = getWeekNumberAndYear(today);

  return (
    <div className="w-full space-y-3 pb-20">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-xl shadow-lg text-xs font-semibold flex items-center gap-2 transition-all ${
            toastMessage.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
          }`}
        >
          <CheckCircle2 size={16} />
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Header */}
      <div className="rounded-xl border border-slate-200 bg-white px-3 sm:px-4 py-3 shadow-sm flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
          <Link
            href="/tal"
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition cursor-pointer shrink-0"
            title="Kembali ke Menu TAL"
          >
            <ArrowLeft size={18} />
          </Link>
          <div className="min-w-0 flex items-center gap-2">
            <h1 className="text-sm sm:text-base font-bold text-slate-900 truncate">Template Rutinitas Kerja</h1>
            <span className="hidden sm:inline-flex text-[10px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200 shrink-0">
              Sub TAL
            </span>
            <span className="hidden md:inline-flex text-[10px] font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full shrink-0">
              {templates.length} Template
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Mobile Switcher (sm/md only) */}
          <div className="lg:hidden flex items-center bg-slate-100 p-0.5 rounded-lg text-xs font-semibold">
            <button
              type="button"
              onClick={() => setMobileTab('list')}
              className={`px-2.5 py-1 rounded-md transition ${
                mobileTab === 'list' ? 'bg-white text-blue-600 font-bold shadow-sm' : 'text-slate-600'
              }`}
            >
              Daftar ({filteredTemplates.length})
            </button>
            <button
              type="button"
              onClick={() => setMobileTab('detail')}
              className={`px-2.5 py-1 rounded-md transition ${
                mobileTab === 'detail' ? 'bg-white text-blue-600 font-bold shadow-sm' : 'text-slate-600'
              }`}
            >
              Detail {isEditing && '•'}
            </button>
          </div>

          <button
            type="button"
            onClick={() => setIsApplyModalOpen(true)}
            className="hidden sm:inline-flex px-2.5 sm:px-3 py-1.5 rounded-lg border border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 text-xs font-semibold cursor-pointer items-center gap-1.5 transition"
            title="Terapkan template ke periode aktif di halaman Tasks"
          >
            <Sparkles size={13} className="text-amber-500" />
            <span className="hidden md:inline">Terapkan ke Tasks</span>
            <span className="md:hidden">Terapkan</span>
          </button>
          <button
            type="button"
            onClick={handleCreateNew}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3 sm:px-3.5 py-1.5 rounded-lg font-semibold text-xs cursor-pointer flex items-center gap-1.5 shadow-sm transition"
          >
            <Plus size={14} />
            <span className="hidden sm:inline">Buat Template</span>
            <span className="sm:hidden">Buat</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
        {/* Sidebar Kiri: Daftar Template */}
        <aside
          className={`${mobileTab === 'list' ? 'block' : 'hidden'} lg:block lg:col-span-4 xl:col-span-4 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden`}
        >
          {/* Search & Category Filter */}
          <div className="p-2.5 sm:p-3 border-b border-slate-200 bg-white space-y-2">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                placeholder="Cari template..."
                className="w-full pl-7 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 transition"
              />
              {searchKeyword && (
                <button
                  type="button"
                  onClick={() => setSearchKeyword('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1 overflow-x-auto pb-1 no-scrollbar text-xs">
              {CATEGORY_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setSelectedTag(tag)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer shrink-0 ${
                    selectedTag === tag ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {/* Template Cards List */}
          <div className="p-2 sm:p-2.5 space-y-1.5 max-h-[60vh] lg:max-h-[calc(100vh-260px)] overflow-y-auto bg-white">
            {loading ? (
              <div className="py-8 text-center text-xs text-slate-400">Memuat template...</div>
            ) : filteredTemplates.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">Tidak ada template ditemukan.</div>
            ) : (
              filteredTemplates.map((tmpl) => {
                const isSelected = selectedTemplateId === tmpl.id;
                const mCount = tmpl.monthlyTasks?.length || 0;
                const wCount = tmpl.weeklyTasks?.length || 0;
                const dCount = tmpl.dailyTasks?.length || 0;

                return (
                  <div
                    key={tmpl.id}
                    onClick={() => handleSelectTemplate(tmpl)}
                    className={`p-2.5 rounded-lg border text-left transition cursor-pointer relative group ${
                      isSelected
                        ? 'bg-blue-50/70 border-blue-300 ring-1 ring-blue-300'
                        : 'bg-slate-50/50 border-slate-200 hover:bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: tmpl.color || '#2563eb' }}
                        />
                        <h2 className="text-xs font-bold text-slate-800 truncate">{tmpl.name}</h2>
                      </div>
                      <span className="text-[10px] font-semibold text-slate-500 bg-white px-1.5 py-0.5 rounded border border-slate-200 shrink-0">
                        {tmpl.categoryTag || 'Operasional'}
                      </span>
                    </div>

                    {tmpl.description && <p className="text-[11px] text-slate-500 line-clamp-1 mt-1">{tmpl.description}</p>}

                    <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-slate-200/60 text-[10px] text-slate-500">
                      <div className="flex items-center gap-1.5 font-medium">
                        <span className="bg-white px-1 py-0.5 rounded border border-slate-200">M: {mCount}</span>
                        <span className="bg-white px-1 py-0.5 rounded border border-slate-200">W: {wCount}</span>
                        <span className="bg-white px-1 py-0.5 rounded border border-slate-200">D: {dCount}</span>
                        {tmpl.isPreset && (
                          <span className="bg-amber-50 text-amber-700 px-1 py-0.5 rounded border border-amber-200 font-bold">
                            Preset
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectTemplate(tmpl);
                            startEdit(tmpl);
                          }}
                          className="p-1 text-blue-600 hover:bg-blue-100 rounded transition"
                          title={tmpl.isPreset ? 'Duplikasi & Edit Template' : 'Edit Template'}
                        >
                          <Edit3 size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDuplicate(tmpl);
                          }}
                          className="p-1 text-slate-600 hover:bg-slate-200 rounded transition"
                          title="Salin Template"
                        >
                          <Copy size={12} />
                        </button>
                        {!tmpl.isPreset && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(tmpl.id);
                            }}
                            className="p-1 text-rose-600 hover:bg-rose-100 rounded transition"
                            title="Hapus Template"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Bottom Sidebar Status */}
          <div className="p-2.5 px-3 border-t border-slate-200 shrink-0 bg-white flex items-center justify-between text-[11px] text-slate-500">
            <span>
              Total: <strong>{filteredTemplates.length}</strong> Template
            </span>
            <span className="capitalize">{selectedTag === 'Semua' ? 'Semua Kategori' : selectedTag}</span>
          </div>
        </aside>

        {/* Right Column: Template Detail / Editor */}
        <main
          className={`${mobileTab === 'detail' ? 'block' : 'hidden'} lg:block lg:col-span-8 xl:col-span-8 rounded-xl border border-slate-200 bg-white shadow-sm p-4 sm:p-6 min-w-0 space-y-3`}
        >
          {/* Header Action Bar for active template */}
          <div className="flex items-center justify-between pb-2.5 border-b border-slate-200 gap-2 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ backgroundColor: formColor }} />
              <h2 className="text-sm sm:text-base font-bold text-slate-900 truncate">
                {isEditing ? (formId?.startsWith('temp_') || !formId ? 'Buat Template Baru' : 'Edit Template') : formName}
              </h2>
              <span className="text-[10px] font-semibold bg-slate-100 text-slate-700 px-2 py-0.5 rounded shrink-0">
                {formCategory}
              </span>
              {selectedTemplate?.isPreset && !isEditing && (
                <span className="text-[10px] font-bold bg-amber-50 text-amber-700 px-2 py-0.5 rounded border border-amber-200 shrink-0">
                  Preset
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              {!isEditing ? (
                <>
                  <button
                    type="button"
                    onClick={() => setIsApplyModalOpen(true)}
                    className="px-2.5 py-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition flex items-center gap-1.5 cursor-pointer shadow-sm"
                  >
                    <Sparkles size={13} className="text-amber-500" />
                    <span>Terapkan</span>
                  </button>
                  {selectedTemplate && (
                    <button
                      type="button"
                      onClick={() => startEdit(selectedTemplate)}
                      className="px-2.5 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <Edit3 size={13} />
                      <span>{selectedTemplate.isPreset ? 'Duplikasi & Edit' : 'Edit'}</span>
                    </button>
                  )}
                  {selectedTemplate && (
                    <button
                      type="button"
                      onClick={() => handleDuplicate(selectedTemplate)}
                      className="px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition flex items-center gap-1 cursor-pointer"
                      title="Salin"
                    >
                      <Copy size={13} />
                    </button>
                  )}
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedTemplate) {
                        handleSelectTemplate(selectedTemplate);
                      } else {
                        setIsEditing(false);
                      }
                    }}
                    className="px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={handleSave}
                    className="px-3 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition flex items-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50"
                  >
                    <Save size={13} />
                    <span>{saving ? 'Menyimpan...' : 'Simpan Perubahan'}</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* EDIT FORM METADATA (Only in edit mode) */}
          {isEditing && (
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 p-3 bg-slate-50/80 rounded-lg border border-slate-200 text-xs">
              <div className="sm:col-span-5 space-y-1">
                <label className="font-semibold text-slate-700 text-[11px]">Nama Template</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Misal: Operasional Harian Cabang"
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 font-semibold"
                />
              </div>

              <div className="sm:col-span-3 space-y-1">
                <label className="font-semibold text-slate-700 text-[11px]">Kategori</label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="Operasional">Operasional</option>
                  <option value="Bisnis">Bisnis</option>
                  <option value="Audit">Audit</option>
                  <option value="Manajemen">Manajemen</option>
                  <option value="Custom">Custom</option>
                </select>
              </div>

              <div className="sm:col-span-4 space-y-1">
                <label className="font-semibold text-slate-700 text-[11px]">Warna Tag</label>
                <div className="flex items-center gap-1.5 pt-0.5">
                  {COLOR_PRESETS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setFormColor(c)}
                      className={`w-6 h-6 rounded-full border-2 transition cursor-pointer ${
                        formColor === c ? 'border-slate-800 scale-110' : 'border-transparent hover:scale-105'
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <div className="sm:col-span-12 space-y-1">
                <label className="font-semibold text-slate-700 text-[11px]">Deskripsi Singkat</label>
                <input
                  type="text"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Deskripsi target dan tujuan dari paket rutinitas ini..."
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          )}

          {/* Description preview in non-edit mode */}
          {!isEditing && formDescription && (
            <p className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-200/80">{formDescription}</p>
          )}

          {/* Tab Switcher: Bulanan, Mingguan, Harian */}
          <div className="flex items-center justify-between border-b border-slate-200 pt-1 gap-2 flex-wrap">
            <div className="flex items-center gap-1 text-xs">
              <button
                type="button"
                onClick={() => setEditTab('monthly')}
                className={`px-3 py-2 font-bold border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
                  editTab === 'monthly'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Target size={14} />
                <span>Bulanan ({formMonthlyTasks.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setEditTab('weekly')}
                className={`px-3 py-2 font-bold border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
                  editTab === 'weekly'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <FolderKanban size={14} />
                <span>Mingguan ({formWeeklyTasks.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setEditTab('daily')}
                className={`px-3 py-2 font-bold border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
                  editTab === 'daily'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Clock size={14} />
                <span>Harian ({formDailyTasks.length})</span>
              </button>
            </div>

            {isEditing && (
              <div className="pb-1.5">
                {editTab === 'monthly' && (
                  <button
                    type="button"
                    onClick={addMonthlyTask}
                    className="px-2.5 py-1 text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition flex items-center gap-1 cursor-pointer"
                  >
                    <Plus size={12} />
                    <span>Tambah Target Bulanan</span>
                  </button>
                )}
                {editTab === 'weekly' && (
                  <button
                    type="button"
                    onClick={addWeeklyTask}
                    className="px-2.5 py-1 text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition flex items-center gap-1 cursor-pointer"
                  >
                    <Plus size={12} />
                    <span>Tambah Target Mingguan</span>
                  </button>
                )}
                {editTab === 'daily' && (
                  <button
                    type="button"
                    onClick={() => addDailyTask(1)}
                    className="px-2.5 py-1 text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition flex items-center gap-1 cursor-pointer"
                  >
                    <Plus size={12} />
                    <span>Tambah Tugas Harian</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* TAB CONTENT: BULANAN */}
          {editTab === 'monthly' && (
            <div className="space-y-2">
              {formMonthlyTasks.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-400">
                  Belum ada paket target bulanan dalam template ini.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {formMonthlyTasks.map((task) => (
                    <div
                      key={task.id}
                      className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/60 hover:bg-white transition text-xs space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 space-y-1">
                          {isEditing ? (
                            <input
                              type="text"
                              value={task.title}
                              onChange={(e) => updateMonthlyTask(task.id, { title: e.target.value })}
                              placeholder="Judul Target Bulanan..."
                              className="w-full px-2.5 py-1 text-xs bg-white border border-slate-200 rounded font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          ) : (
                            <div className="font-bold text-slate-800">{task.title}</div>
                          )}

                          {isEditing ? (
                            <input
                              type="text"
                              value={task.description || ''}
                              onChange={(e) => updateMonthlyTask(task.id, { description: e.target.value })}
                              placeholder="Deskripsi target bulanan (opsional)..."
                              className="w-full px-2.5 py-1 text-[11px] bg-white border border-slate-200 rounded text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          ) : (
                            task.description && <p className="text-[11px] text-slate-500">{task.description}</p>
                          )}
                        </div>

                        {isEditing && (
                          <button
                            type="button"
                            onClick={() => deleteMonthlyTask(task.id)}
                            className="p-1 text-rose-500 hover:bg-rose-50 rounded transition"
                            title="Hapus"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>

                      {/* Meta Controls (Category, Priority, Target) */}
                      <div className="flex items-center gap-2 flex-wrap text-[11px] pt-1 border-t border-slate-200/60">
                        {isEditing ? (
                          <>
                            <div className="flex items-center gap-1">
                              <span className="text-slate-500">Kategori:</span>
                              <select
                                value={task.category}
                                onChange={(e) => updateMonthlyTask(task.id, { category: e.target.value as TalCategory })}
                                className="px-1.5 py-0.5 bg-white border border-slate-200 rounded font-medium"
                              >
                                <option value="result">Result</option>
                                <option value="non_result">Non-Result</option>
                              </select>
                            </div>

                            <div className="flex items-center gap-1">
                              <span className="text-slate-500">Prioritas:</span>
                              <select
                                value={task.priority}
                                onChange={(e) => updateMonthlyTask(task.id, { priority: e.target.value as TalPriority })}
                                className="px-1.5 py-0.5 bg-white border border-slate-200 rounded font-medium"
                              >
                                <option value="high">Tinggi (High)</option>
                                <option value="medium">Sedang (Medium)</option>
                                <option value="low">Rendah (Low)</option>
                              </select>
                            </div>

                            {task.category === 'result' && (
                              <div className="flex items-center gap-1">
                                <span className="text-slate-500">Target:</span>
                                <input
                                  type="number"
                                  value={task.targetValue ?? ''}
                                  onChange={(e) =>
                                    updateMonthlyTask(task.id, { targetValue: parseFloat(e.target.value) || 0 })
                                  }
                                  placeholder="Nilai"
                                  className="w-16 px-1.5 py-0.5 bg-white border border-slate-200 rounded text-center"
                                />
                                <select
                                  value={task.targetUnit || 'NOA'}
                                  onChange={(e) => updateMonthlyTask(task.id, { targetUnit: e.target.value as TalTargetUnit })}
                                  className="px-1.5 py-0.5 bg-white border border-slate-200 rounded font-medium"
                                >
                                  <option value="NOA">NOA</option>
                                  <option value="Rupiah">Rupiah</option>
                                  <option value="Unit">Unit</option>
                                  <option value="Custom">Custom</option>
                                </select>
                              </div>
                            )}
                          </>
                        ) : (
                          <>
                            <span
                              className={`px-1.5 py-0.5 rounded font-bold ${
                                task.category === 'result' ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-700'
                              }`}
                            >
                              {task.category === 'result' ? 'Result' : 'Non-Result'}
                            </span>
                            <span
                              className={`px-1.5 py-0.5 rounded font-bold ${
                                task.priority === 'high'
                                  ? 'bg-rose-100 text-rose-700'
                                  : task.priority === 'medium'
                                    ? 'bg-amber-100 text-amber-700'
                                    : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {task.priority.toUpperCase()}
                            </span>
                            {task.category === 'result' && task.targetValue !== undefined && (
                              <span className="font-semibold text-slate-700">
                                Target:{' '}
                                {task.targetUnit === 'Rupiah'
                                  ? formatCurrencyIDR(task.targetValue)
                                  : `${task.targetValue} ${task.targetUnit || ''}`}
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB CONTENT: MINGGUAN */}
          {editTab === 'weekly' && (
            <div className="space-y-2">
              {formWeeklyTasks.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-400">
                  Belum ada paket target mingguan dalam template ini.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {formWeeklyTasks.map((task) => (
                    <div
                      key={task.id}
                      className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/60 hover:bg-white transition text-xs space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 space-y-1">
                          {isEditing ? (
                            <input
                              type="text"
                              value={task.title}
                              onChange={(e) => updateWeeklyTask(task.id, { title: e.target.value })}
                              placeholder="Judul Target Mingguan..."
                              className="w-full px-2.5 py-1 text-xs bg-white border border-slate-200 rounded font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          ) : (
                            <div className="font-bold text-slate-800">{task.title}</div>
                          )}

                          {isEditing ? (
                            <input
                              type="text"
                              value={task.description || ''}
                              onChange={(e) => updateWeeklyTask(task.id, { description: e.target.value })}
                              placeholder="Deskripsi target mingguan (opsional)..."
                              className="w-full px-2.5 py-1 text-[11px] bg-white border border-slate-200 rounded text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          ) : (
                            task.description && <p className="text-[11px] text-slate-500">{task.description}</p>
                          )}
                        </div>

                        {isEditing && (
                          <button
                            type="button"
                            onClick={() => deleteWeeklyTask(task.id)}
                            className="p-1 text-rose-500 hover:bg-rose-50 rounded transition"
                            title="Hapus"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>

                      {/* Meta Controls & Parent Linking */}
                      <div className="flex items-center gap-2 flex-wrap text-[11px] pt-1 border-t border-slate-200/60">
                        {isEditing ? (
                          <>
                            <div className="flex items-center gap-1">
                              <span className="text-slate-500">Induk Bulanan:</span>
                              <select
                                value={task.parentMonthlyTaskTempId || ''}
                                onChange={(e) =>
                                  updateWeeklyTask(task.id, { parentMonthlyTaskTempId: e.target.value || undefined })
                                }
                                className="px-1.5 py-0.5 bg-white border border-slate-200 rounded font-medium max-w-[150px] truncate"
                              >
                                <option value="">(Tanpa Induk Bulanan)</option>
                                {formMonthlyTasks.map((m) => (
                                  <option key={m.id} value={m.id}>
                                    {m.title}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="flex items-center gap-1">
                              <span className="text-slate-500">Kategori:</span>
                              <select
                                value={task.category}
                                onChange={(e) => updateWeeklyTask(task.id, { category: e.target.value as TalCategory })}
                                className="px-1.5 py-0.5 bg-white border border-slate-200 rounded font-medium"
                              >
                                <option value="result">Result</option>
                                <option value="non_result">Non-Result</option>
                              </select>
                            </div>

                            <div className="flex items-center gap-1">
                              <span className="text-slate-500">Prioritas:</span>
                              <select
                                value={task.priority}
                                onChange={(e) => updateWeeklyTask(task.id, { priority: e.target.value as TalPriority })}
                                className="px-1.5 py-0.5 bg-white border border-slate-200 rounded font-medium"
                              >
                                <option value="high">Tinggi</option>
                                <option value="medium">Sedang</option>
                                <option value="low">Rendah</option>
                              </select>
                            </div>

                            {task.category === 'result' && (
                              <div className="flex items-center gap-1">
                                <span className="text-slate-500">Target:</span>
                                <input
                                  type="number"
                                  value={task.targetValue ?? ''}
                                  onChange={(e) =>
                                    updateWeeklyTask(task.id, { targetValue: parseFloat(e.target.value) || 0 })
                                  }
                                  placeholder="Nilai"
                                  className="w-16 px-1.5 py-0.5 bg-white border border-slate-200 rounded text-center"
                                />
                                <select
                                  value={task.targetUnit || 'NOA'}
                                  onChange={(e) => updateWeeklyTask(task.id, { targetUnit: e.target.value as TalTargetUnit })}
                                  className="px-1.5 py-0.5 bg-white border border-slate-200 rounded font-medium"
                                >
                                  <option value="NOA">NOA</option>
                                  <option value="Rupiah">Rupiah</option>
                                  <option value="Unit">Unit</option>
                                  <option value="Custom">Custom</option>
                                </select>
                              </div>
                            )}
                          </>
                        ) : (
                          <>
                            {task.parentMonthlyTaskTempId && (
                              <span className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded border border-blue-200 font-medium">
                                Induk:{' '}
                                {formMonthlyTasks.find((m) => m.id === task.parentMonthlyTaskTempId)?.title || 'Bulanan'}
                              </span>
                            )}
                            <span
                              className={`px-1.5 py-0.5 rounded font-bold ${
                                task.category === 'result' ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-700'
                              }`}
                            >
                              {task.category === 'result' ? 'Result' : 'Non-Result'}
                            </span>
                            <span
                              className={`px-1.5 py-0.5 rounded font-bold ${
                                task.priority === 'high'
                                  ? 'bg-rose-100 text-rose-700'
                                  : task.priority === 'medium'
                                    ? 'bg-amber-100 text-amber-700'
                                    : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {task.priority.toUpperCase()}
                            </span>
                            {task.category === 'result' && task.targetValue !== undefined && (
                              <span className="font-semibold text-slate-700">
                                Target:{' '}
                                {task.targetUnit === 'Rupiah'
                                  ? formatCurrencyIDR(task.targetValue)
                                  : `${task.targetValue} ${task.targetUnit || ''}`}
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB CONTENT: HARIAN */}
          {editTab === 'daily' && (
            <div className="space-y-2">
              {formDailyTasks.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-400">
                  Belum ada tugas rutinitas harian dalam template ini.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {formDailyTasks.map((task) => {
                    // CATATAN: backup memakai INDONESIAN_DAYS[dayOffset - 1]
                    // (Hari 1 -> 'Minggu') — keliru; yang benar dayOffset 1 =
                    // Senin, sesuai label editor & preview modal.
                    const dayName = INDONESIAN_DAYS[task.dayOffset || 1] || `Hari ke-${task.dayOffset || 1}`;

                    return (
                      <div
                        key={task.id}
                        className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/60 hover:bg-white transition text-xs space-y-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 space-y-1">
                            {isEditing ? (
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <select
                                  value={task.dayOffset || 1}
                                  onChange={(e) => updateDailyTask(task.id, { dayOffset: parseInt(e.target.value) || 1 })}
                                  className="px-2 py-1 text-xs font-bold bg-indigo-50 border border-indigo-200 rounded text-indigo-800"
                                >
                                  <option value={1}>Hari 1 (Senin)</option>
                                  <option value={2}>Hari 2 (Selasa)</option>
                                  <option value={3}>Hari 3 (Rabu)</option>
                                  <option value={4}>Hari 4 (Kamis)</option>
                                  <option value={5}>Hari 5 (Jumat)</option>
                                  <option value={6}>Hari 6 (Sabtu)</option>
                                </select>
                                <input
                                  type="time"
                                  value={task.time || '08:00'}
                                  onChange={(e) => updateDailyTask(task.id, { time: e.target.value })}
                                  className="px-2 py-1 text-xs bg-white border border-slate-200 rounded font-medium"
                                />
                                <input
                                  type="text"
                                  value={task.title}
                                  onChange={(e) => updateDailyTask(task.id, { title: e.target.value })}
                                  placeholder="Judul Tugas Harian..."
                                  className="flex-1 min-w-[160px] px-2.5 py-1 text-xs bg-white border border-slate-200 rounded font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                  {dayName} • {task.time || '08:00'}
                                </span>
                                <span className="font-bold text-slate-800">{task.title}</span>
                              </div>
                            )}

                            {isEditing ? (
                              <input
                                type="text"
                                value={task.description || ''}
                                onChange={(e) => updateDailyTask(task.id, { description: e.target.value })}
                                placeholder="Deskripsi tugas harian (opsional)..."
                                className="w-full px-2.5 py-1 text-[11px] bg-white border border-slate-200 rounded text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                            ) : (
                              task.description && <p className="text-[11px] text-slate-500 pl-1">{task.description}</p>
                            )}
                          </div>

                          {isEditing && (
                            <button
                              type="button"
                              onClick={() => deleteDailyTask(task.id)}
                              className="p-1 text-rose-500 hover:bg-rose-50 rounded transition"
                              title="Hapus"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>

                        {/* Meta Controls & Parent Weekly Linking */}
                        <div className="flex items-center gap-2 flex-wrap text-[11px] pt-1 border-t border-slate-200/60">
                          {isEditing ? (
                            <>
                              <div className="flex items-center gap-1">
                                <span className="text-slate-500">Induk Mingguan:</span>
                                <select
                                  value={task.parentWeeklyTaskTempId || ''}
                                  onChange={(e) =>
                                    updateDailyTask(task.id, { parentWeeklyTaskTempId: e.target.value || undefined })
                                  }
                                  className="px-1.5 py-0.5 bg-white border border-slate-200 rounded font-medium max-w-[140px] truncate"
                                >
                                  <option value="">(Tanpa Induk Mingguan)</option>
                                  {formWeeklyTasks.map((w) => (
                                    <option key={w.id} value={w.id}>
                                      {w.title}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div className="flex items-center gap-1">
                                <span className="text-slate-500">Kategori:</span>
                                <select
                                  value={task.category}
                                  onChange={(e) => updateDailyTask(task.id, { category: e.target.value as TalCategory })}
                                  className="px-1.5 py-0.5 bg-white border border-slate-200 rounded font-medium"
                                >
                                  <option value="result">Result</option>
                                  <option value="non_result">Non-Result</option>
                                </select>
                              </div>

                              <div className="flex items-center gap-1">
                                <span className="text-slate-500">Prioritas:</span>
                                <select
                                  value={task.priority}
                                  onChange={(e) => updateDailyTask(task.id, { priority: e.target.value as TalPriority })}
                                  className="px-1.5 py-0.5 bg-white border border-slate-200 rounded font-medium"
                                >
                                  <option value="high">Tinggi</option>
                                  <option value="medium">Sedang</option>
                                  <option value="low">Rendah</option>
                                </select>
                              </div>

                              <label className="flex items-center gap-1 cursor-pointer select-none text-slate-700">
                                <input
                                  type="checkbox"
                                  checked={task.enableReminder || false}
                                  onChange={(e) => updateDailyTask(task.id, { enableReminder: e.target.checked })}
                                  className="rounded text-blue-600 focus:ring-0"
                                />
                                <Bell size={11} className={task.enableReminder ? 'text-amber-500' : 'text-slate-400'} />
                                <span>Pengingat</span>
                              </label>
                            </>
                          ) : (
                            <>
                              {task.parentWeeklyTaskTempId && (
                                <span className="bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded border border-indigo-200 font-medium">
                                  Induk:{' '}
                                  {formWeeklyTasks.find((w) => w.id === task.parentWeeklyTaskTempId)?.title || 'Mingguan'}
                                </span>
                              )}
                              <span
                                className={`px-1.5 py-0.5 rounded font-bold ${
                                  task.category === 'result' ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-700'
                                }`}
                              >
                                {task.category === 'result' ? 'Result' : 'Non-Result'}
                              </span>
                              <span
                                className={`px-1.5 py-0.5 rounded font-bold ${
                                  task.priority === 'high'
                                    ? 'bg-rose-100 text-rose-700'
                                    : task.priority === 'medium'
                                      ? 'bg-amber-100 text-amber-700'
                                      : 'bg-slate-100 text-slate-600'
                                }`}
                              >
                                {task.priority.toUpperCase()}
                              </span>
                              {task.enableReminder && (
                                <span className="flex items-center gap-1 text-amber-600 font-medium">
                                  <Bell size={11} />
                                  <span>Aktif</span>
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {!selectedTemplate && !isEditing && (
            <div className="py-10 text-center text-xs text-slate-400">
              Pilih template di daftar, atau buat template baru.
            </div>
          )}
        </main>
      </div>

      {/* Apply Modal Component */}
      <TalApplyTemplateModal
        isOpen={isApplyModalOpen}
        onClose={() => setIsApplyModalOpen(false)}
        scopeType="daily"
        targetDateStr={formatDateKey(today)}
        targetWeekNumber={weekInfo.weekNumber}
        targetWeekYear={weekInfo.weekYear}
        targetMonth={today.getMonth() + 1}
        targetYear={today.getFullYear()}
        template={selectedTemplate}
        onSuccess={(count) => {
          showToast(`Template berhasil diterapkan ke halaman Tasks! (${count} tugas)`);
          setIsApplyModalOpen(false);
          router.push('/tal/tasks');
        }}
      />
    </div>
  );
}
