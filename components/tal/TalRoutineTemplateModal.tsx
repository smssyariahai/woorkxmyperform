// components/tal/TalRoutineTemplateModal.tsx — katalog + editor template
// rutinitas kerja (multi-level: bulanan / mingguan / harian).
// Porting src/components/tal/TalRoutineTemplateModal.tsx backup (MyPerform).
// Adaptasi WOORK: useAuth/Firebase diganti session NextAuth (data sudah
// session-scoped server-side), talService diganti lib/tal/client.ts.
// Dipakai halaman yang butuh pemilih template di dalam modal (mis. Tasks);
// halaman /tal/templates punya editor halaman penuhnya sendiri.
'use client';

import React, { useEffect, useState } from 'react';
import {
  X,
  Plus,
  Trash2,
  Edit3,
  Save,
  Sparkles,
  Layers,
  Building2,
  FolderKanban,
  Clock,
  CheckCircle2,
  AlertCircle,
  Copy,
  Bell,
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
import { INDONESIAN_DAYS, formatCurrencyIDR } from '@/lib/tal/date';

export interface TalRoutineTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Dipanggil saat pengguna memilih "Gunakan Template" pada template aktif. */
  onApplyTemplate?: (template: TalRoutineTemplate) => void;
}

const COLOR_PRESETS = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#db2777', '#475569'];

export const TalRoutineTemplateModal: React.FC<TalRoutineTemplateModalProps> = ({
  isOpen,
  onClose,
  onApplyTemplate,
}) => {
  const [templates, setTemplates] = useState<TalRoutineTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTemplate, setActiveTemplate] = useState<TalRoutineTemplate | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState<'preview' | 'edit_monthly' | 'edit_weekly' | 'edit_daily'>('preview');

  // Form State for active template
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formCategory, setFormCategory] = useState('Operasional');
  const [formColor, setFormColor] = useState('#2563eb');
  const [formMonthlyTasks, setFormMonthlyTasks] = useState<TalRoutineMonthlyTask[]>([]);
  const [formWeeklyTasks, setFormWeeklyTasks] = useState<TalRoutineWeeklyTask[]>([]);
  const [formDailyTasks, setFormDailyTasks] = useState<TalRoutineDailyTask[]>([]);

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const loadData = async () => {
    setLoading(true);
    try {
      const list = await fetchTalRoutineTemplates();
      setTemplates(list);
      if (list.length > 0) {
        selectTemplate(list[0]);
      }
    } catch (err) {
      console.error('Failed to load templates:', err);
    } finally {
      setLoading(false);
    }
  };

  const selectTemplate = (tmpl: TalRoutineTemplate) => {
    setActiveTemplate(tmpl);
    setFormName(tmpl.name);
    setFormDescription(tmpl.description || '');
    setFormCategory(tmpl.categoryTag || 'Operasional');
    setFormColor(tmpl.color || '#2563eb');
    setFormMonthlyTasks(tmpl.monthlyTasks || []);
    setFormWeeklyTasks(tmpl.weeklyTasks || []);
    setFormDailyTasks(tmpl.dailyTasks || []);
    setIsEditing(false);
    setActiveTab('preview');
  };

  const handleCreateNew = () => {
    const newTmpl: TalRoutineTemplate = {
      id: `temp_${Date.now()}`,
      name: 'Rutinitas Kerja Baru',
      description: 'Deskripsi rencana operasional atau target divisi.',
      categoryTag: 'Operasional',
      color: '#2563eb',
      isPreset: false,
      monthlyTasks: [
        {
          id: `m_${Date.now()}_1`,
          title: 'Target Strategis Bulanan 1',
          category: 'result',
          priority: 'high',
          targetValue: 10,
          targetUnit: 'NOA',
        },
      ],
      weeklyTasks: [
        {
          id: `w_${Date.now()}_1`,
          title: 'Target Operasional Mingguan 1',
          category: 'non_result',
          priority: 'high',
        },
      ],
      dailyTasks: [
        {
          id: `d_${Date.now()}_1`,
          title: 'Tugas Rutin Pagi (Briefing)',
          category: 'non_result',
          priority: 'high',
          time: '08:00',
          dayOffset: 1, // Senin
          enableReminder: true,
          reminderType: 'minutes_before',
          reminderMinutesBefore: 15,
        },
        {
          id: `d_${Date.now()}_2`,
          title: 'Eksekusi Pelayanan / Transaksi',
          category: 'result',
          priority: 'medium',
          time: '09:00',
          dayOffset: 1,
          targetValue: 3,
          targetUnit: 'NOA',
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    selectTemplate(newTmpl);
    setIsEditing(true);
    setActiveTab('edit_monthly');
  };

  const handleDuplicate = (tmpl: TalRoutineTemplate) => {
    const dup: TalRoutineTemplate = {
      ...tmpl,
      id: `temp_${Date.now()}`,
      name: `${tmpl.name} (Salinan)`,
      isPreset: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    selectTemplate(dup);
    setIsEditing(true);
    setMessage({ text: 'Template disalin. Anda dapat mengubah dan menyimpannya.', type: 'success' });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleDelete = async (tmplId: string) => {
    if (!window.confirm('Yakin ingin menghapus template rutinitas ini?')) return;
    try {
      await deleteTalRoutineTemplate(tmplId);
      const updated = templates.filter((t) => t.id !== tmplId);
      setTemplates(updated);
      if (updated.length > 0) {
        selectTemplate(updated[0]);
      } else {
        setActiveTemplate(null);
      }
      setMessage({ text: 'Template berhasil dihapus.', type: 'success' });
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      console.error('Failed to delete template:', err);
    }
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      setMessage({ text: 'Nama template tidak boleh kosong.', type: 'error' });
      return;
    }

    setSaving(true);
    try {
      const saved = await saveTalRoutineTemplate({
        // id temp_ / preset dikirim apa adanya: API membuat salinan baru
        // (preset bawaan tidak diubah); id template milik sendiri = update.
        id: activeTemplate?.id?.startsWith('temp_') ? undefined : activeTemplate?.id,
        name: formName.trim(),
        description: formDescription.trim(),
        categoryTag: formCategory,
        color: formColor,
        isPreset: false,
        monthlyTasks: formMonthlyTasks,
        weeklyTasks: formWeeklyTasks,
        dailyTasks: formDailyTasks,
      });

      setMessage({ text: 'Template rutinitas berhasil disimpan!', type: 'success' });
      setTimeout(() => setMessage(null), 3000);
      setIsEditing(false);
      await loadData();
      selectTemplate(saved);
    } catch (err) {
      console.error('Failed to save template:', err);
      setMessage({ text: 'Gagal menyimpan template.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shadow-xs shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shrink-0">
              <Layers size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold flex items-center gap-2 text-slate-900 dark:text-white">
                <span>Katalog Template Rutinitas Kerja</span>
                <span className="text-[10px] uppercase font-bold bg-blue-500/20 text-blue-600 dark:text-blue-300 border border-blue-400/30 px-2 py-0.5 rounded-full">
                  Multi-Level
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Kelola paket target berulang: Target Bulanan, Operasional Mingguan, dan Task Harian.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCreateNew}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-xs"
            >
              <Plus size={14} />
              <span>Buat Template Baru</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Alert Feedback Message */}
        {message && (
          <div
            className={`px-4 py-2 text-xs font-semibold flex items-center gap-2 ${
              message.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-b border-emerald-200'
                : 'bg-rose-50 text-rose-800 border-b border-rose-200'
            }`}
          >
            {message.type === 'success' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
            <span>{message.text}</span>
          </div>
        )}

        {/* Main Grid: Sidebar List + Editor / Preview Area */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-12 divide-y md:divide-y-0 md:divide-x divide-slate-200">
          {/* Left Sidebar: Template list */}
          <div className="md:col-span-4 flex flex-col bg-slate-50/70 p-3 overflow-y-auto custom-scrollbar">
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2 px-1 flex items-center justify-between">
              <span>Daftar Template ({templates.length})</span>
            </div>

            <div className="space-y-2">
              {loading ? (
                <div className="py-8 text-center text-xs text-slate-400">Memuat template...</div>
              ) : templates.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">Belum ada template.</div>
              ) : (
                templates.map((tmpl) => {
                  const isSelected = activeTemplate?.id === tmpl.id;
                  return (
                    <div
                      key={tmpl.id}
                      onClick={() => selectTemplate(tmpl)}
                      className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col gap-1 ${
                        isSelected
                          ? 'bg-white border-blue-500 ring-2 ring-blue-500/20 shadow-xs'
                          : 'bg-white/80 border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: tmpl.color || '#2563eb' }}
                          />
                          <h4 className="text-xs font-bold text-slate-800 truncate">{tmpl.name}</h4>
                        </div>
                        {tmpl.isPreset ? (
                          <span className="text-[9px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.2 rounded shrink-0">
                            Preset
                          </span>
                        ) : (
                          <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded shrink-0">
                            Kustom
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-[10px] text-slate-500">
                        <span>{tmpl.monthlyTasks?.length || 0} Bulanan</span>
                        <span>•</span>
                        <span>{tmpl.weeklyTasks?.length || 0} Mingguan</span>
                        <span>•</span>
                        <span>{tmpl.dailyTasks?.length || 0} Harian</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Area: Preview or Full Multi-Level Editor */}
          <div className="md:col-span-8 flex flex-col overflow-hidden bg-white">
            {activeTemplate ? (
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Top Control Bar of active template */}
                <div className="p-4 border-b border-slate-200 flex items-center justify-between gap-2 flex-wrap shrink-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-3.5 h-3.5 rounded-full shrink-0"
                      style={{ backgroundColor: isEditing ? formColor : activeTemplate.color || '#2563eb' }}
                    />
                    <h3 className="text-sm font-bold text-slate-900 truncate">
                      {isEditing ? formName || 'Tanpa Judul' : activeTemplate.name}
                    </h3>
                    <span className="text-[11px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full shrink-0">
                      {isEditing ? formCategory : activeTemplate.categoryTag || 'Operasional'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    {!isEditing ? (
                      <>
                        <button
                          type="button"
                          onClick={() => handleDuplicate(activeTemplate)}
                          className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition flex items-center gap-1 cursor-pointer"
                          title="Duplikat Template"
                        >
                          <Copy size={13} />
                          <span>Duplikat</span>
                        </button>
                        {!activeTemplate.isPreset && (
                          <button
                            type="button"
                            onClick={() => setIsEditing(true)}
                            className="px-3 py-1.5 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition flex items-center gap-1 cursor-pointer"
                          >
                            <Edit3 size={13} />
                            <span>Edit Template</span>
                          </button>
                        )}
                        {!activeTemplate.isPreset && (
                          <button
                            type="button"
                            onClick={() => handleDelete(activeTemplate.id)}
                            className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                            title="Hapus Template"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                        {onApplyTemplate && (
                          <button
                            type="button"
                            onClick={() => {
                              onApplyTemplate(activeTemplate);
                              onClose();
                            }}
                            className="px-3.5 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition shadow-xs flex items-center gap-1.5 cursor-pointer"
                          >
                            <Sparkles size={13} />
                            <span>Gunakan Template</span>
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            if (activeTemplate) selectTemplate(activeTemplate);
                            else setIsEditing(false);
                          }}
                          className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                        >
                          Batal
                        </button>
                        <button
                          type="button"
                          onClick={handleSave}
                          disabled={saving}
                          className="px-4 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
                        >
                          <Save size={14} />
                          <span>{saving ? 'Menyimpan...' : 'Simpan Template'}</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Sub Tab Navigation for Editor */}
                {isEditing ? (
                  <div className="px-4 pt-3 border-b border-slate-200 bg-slate-50 flex items-center gap-2 overflow-x-auto shrink-0">
                    <button
                      type="button"
                      onClick={() => setActiveTab('edit_monthly')}
                      className={`pb-2.5 px-2 text-xs font-bold border-b-2 transition flex items-center gap-1.5 cursor-pointer ${
                        activeTab === 'edit_monthly'
                          ? 'border-indigo-600 text-indigo-700'
                          : 'border-transparent text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      <Building2 size={13} />
                      <span>1. Paket Bulanan ({formMonthlyTasks.length})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('edit_weekly')}
                      className={`pb-2.5 px-2 text-xs font-bold border-b-2 transition flex items-center gap-1.5 cursor-pointer ${
                        activeTab === 'edit_weekly'
                          ? 'border-blue-600 text-blue-700'
                          : 'border-transparent text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      <FolderKanban size={13} />
                      <span>2. Paket Mingguan ({formWeeklyTasks.length})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('edit_daily')}
                      className={`pb-2.5 px-2 text-xs font-bold border-b-2 transition flex items-center gap-1.5 cursor-pointer ${
                        activeTab === 'edit_daily'
                          ? 'border-emerald-600 text-emerald-700'
                          : 'border-transparent text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      <Clock size={13} />
                      <span>3. Paket Harian ({formDailyTasks.length})</span>
                    </button>
                  </div>
                ) : null}

                {/* Main Content Area */}
                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                  {!isEditing ? (
                    // PREVIEW MODE
                    <div className="space-y-4">
                      {/* Description */}
                      {activeTemplate.description && (
                        <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 text-xs text-slate-700">
                          {activeTemplate.description}
                        </div>
                      )}

                      {/* Tier 1: Bulanan */}
                      <div className="border border-slate-200 rounded-xl overflow-hidden">
                        <div className="px-3 py-2 bg-indigo-50 font-bold text-xs text-indigo-950 flex items-center gap-1.5">
                          <Building2 size={14} className="text-indigo-600" />
                          <span>Paket Bulanan (Target Strategis)</span>
                        </div>
                        <div className="p-3 space-y-2 bg-white divide-y divide-slate-100 text-xs">
                          {(activeTemplate.monthlyTasks || []).length === 0 ? (
                            <p className="text-slate-400 text-[11px]">Tidak ada target bulanan.</p>
                          ) : (
                            activeTemplate.monthlyTasks.map((task, idx) => (
                              <div key={task.id || idx} className="pt-2 first:pt-0 flex items-start justify-between gap-2">
                                <div>
                                  <div className="font-semibold text-slate-800">{task.title}</div>
                                  {task.description && <div className="text-[11px] text-slate-500">{task.description}</div>}
                                </div>
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 shrink-0">
                                  {task.category === 'result'
                                    ? `Result: ${task.targetUnit === 'Rupiah' ? formatCurrencyIDR(task.targetValue || 0) : `${task.targetValue} ${task.targetUnit || ''}`}`
                                    : 'Non Result'}
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      {/* Tier 2: Mingguan */}
                      <div className="border border-slate-200 rounded-xl overflow-hidden">
                        <div className="px-3 py-2 bg-blue-50 font-bold text-xs text-blue-950 flex items-center gap-1.5">
                          <FolderKanban size={14} className="text-blue-600" />
                          <span>Paket Mingguan (Target Operasional)</span>
                        </div>
                        <div className="p-3 space-y-2 bg-white divide-y divide-slate-100 text-xs">
                          {(activeTemplate.weeklyTasks || []).length === 0 ? (
                            <p className="text-slate-400 text-[11px]">Tidak ada target mingguan.</p>
                          ) : (
                            activeTemplate.weeklyTasks.map((task, idx) => (
                              <div key={task.id || idx} className="pt-2 first:pt-0 flex items-start justify-between gap-2">
                                <div>
                                  <div className="font-semibold text-slate-800">{task.title}</div>
                                  {task.description && <div className="text-[11px] text-slate-500">{task.description}</div>}
                                </div>
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 shrink-0">
                                  {task.category === 'result'
                                    ? `Result: ${task.targetUnit === 'Rupiah' ? formatCurrencyIDR(task.targetValue || 0) : `${task.targetValue} ${task.targetUnit || ''}`}`
                                    : 'Non Result'}
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      {/* Tier 3: Harian */}
                      <div className="border border-slate-200 rounded-xl overflow-hidden">
                        <div className="px-3 py-2 bg-emerald-50 font-bold text-xs text-emerald-950 flex items-center gap-1.5">
                          <Clock size={14} className="text-emerald-600" />
                          <span>Paket Harian (Hari ke-1 s.d. Hari ke-6 Kerja)</span>
                        </div>
                        <div className="p-3 space-y-2 bg-white text-xs">
                          {[1, 2, 3, 4, 5, 6].map((offset) => {
                            const dayTasks = (activeTemplate.dailyTasks || []).filter((t) => t.dayOffset === offset);
                            if (dayTasks.length === 0) return null;
                            return (
                              <div key={offset} className="bg-slate-50 rounded-lg p-2.5 border border-slate-200/60">
                                <div className="text-xs font-bold text-slate-800 mb-1.5">
                                  Hari ke-{offset} ({INDONESIAN_DAYS[offset]})
                                </div>
                                <div className="space-y-1">
                                  {dayTasks.map((t, idx) => (
                                    <div
                                      key={t.id || idx}
                                      className="flex items-center justify-between text-xs bg-white p-1.5 rounded border border-slate-200/60"
                                    >
                                      <div className="flex items-center gap-2 min-w-0">
                                        <span className="font-mono text-[10px] font-bold text-slate-500 shrink-0">{t.time || '08:00'}</span>
                                        <span className="font-medium text-slate-800 truncate">{t.title}</span>
                                      </div>
                                      <span
                                        className={`text-[9px] px-1.5 py-0.2 rounded font-semibold shrink-0 ${
                                          t.priority === 'high' ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-600'
                                        }`}
                                      >
                                        {t.priority}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ) : (
                    // EDIT MODE
                    <div className="space-y-4">
                      {/* Meta Information Fields */}
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                        <div className="sm:col-span-6">
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">Nama Template Rutinitas *</label>
                          <input
                            type="text"
                            value={formName}
                            onChange={(e) => setFormName(e.target.value)}
                            placeholder="e.g. Rutinitas Buka Cabang Baru"
                            className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                          />
                        </div>

                        <div className="sm:col-span-3">
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">Kategori</label>
                          <select
                            value={formCategory}
                            onChange={(e) => setFormCategory(e.target.value)}
                            className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                          >
                            <option value="Operasional">Operasional</option>
                            <option value="Bisnis">Bisnis</option>
                            <option value="Keuangan">Keuangan</option>
                            <option value="Audit">Audit</option>
                            <option value="Pemasaran">Pemasaran</option>
                            <option value="SDM">SDM</option>
                            <option value="Manajemen">Manajemen</option>
                            <option value="Umum">Umum</option>
                            <option value="Custom">Custom</option>
                          </select>
                        </div>

                        <div className="sm:col-span-3">
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">Warna Aksen</label>
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

                        <div className="sm:col-span-12">
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">Deskripsi Singkat Template</label>
                          <textarea
                            value={formDescription}
                            onChange={(e) => setFormDescription(e.target.value)}
                            rows={2}
                            placeholder="Penjelasan tujuan paket rutinitas kerja ini..."
                            className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                          />
                        </div>
                      </div>

                      {/* TAB 1: BULANAN */}
                      {activeTab === 'edit_monthly' && (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <h4 className="text-xs font-bold text-indigo-900 flex items-center gap-1.5">
                              <Building2 size={14} className="text-indigo-600" />
                              <span>Paket Target Strategis Bulanan</span>
                            </h4>
                            <button
                              type="button"
                              onClick={() => {
                                setFormMonthlyTasks([
                                  ...formMonthlyTasks,
                                  { id: `m_${Date.now()}`, title: '', category: 'non_result', priority: 'high' },
                                ]);
                              }}
                              className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold flex items-center gap-1 border border-indigo-200 transition cursor-pointer"
                            >
                              <Plus size={13} /> Tambah Target Bulanan
                            </button>
                          </div>

                          <div className="space-y-2">
                            {formMonthlyTasks.map((task, idx) => (
                              <div key={task.id || idx} className="p-3 bg-white border border-slate-200 rounded-xl space-y-2 shadow-2xs">
                                <div className="flex items-start gap-2">
                                  <input
                                    type="text"
                                    value={task.title}
                                    onChange={(e) => {
                                      const copy = [...formMonthlyTasks];
                                      copy[idx].title = e.target.value;
                                      setFormMonthlyTasks(copy);
                                    }}
                                    placeholder="Judul Target Bulanan (misal: Target Omset Rp 150 Juta)"
                                    className="flex-1 px-2.5 py-1 text-xs border border-slate-200 rounded-lg font-semibold"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setFormMonthlyTasks(formMonthlyTasks.filter((_, i) => i !== idx));
                                    }}
                                    className="p-1 text-rose-500 hover:bg-rose-50 rounded"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs">
                                  <div>
                                    <label className="block text-[10px] text-slate-500 mb-0.5">Kategori</label>
                                    <select
                                      value={task.category}
                                      onChange={(e) => {
                                        const copy = [...formMonthlyTasks];
                                        copy[idx].category = e.target.value as TalCategory;
                                        setFormMonthlyTasks(copy);
                                      }}
                                      className="w-full px-2 py-1 text-xs border border-slate-200 rounded-lg"
                                    >
                                      <option value="non_result">Non Result</option>
                                      <option value="result">Result</option>
                                    </select>
                                  </div>

                                  <div>
                                    <label className="block text-[10px] text-slate-500 mb-0.5">Prioritas</label>
                                    <select
                                      value={task.priority}
                                      onChange={(e) => {
                                        const copy = [...formMonthlyTasks];
                                        copy[idx].priority = e.target.value as TalPriority;
                                        setFormMonthlyTasks(copy);
                                      }}
                                      className="w-full px-2 py-1 text-xs border border-slate-200 rounded-lg"
                                    >
                                      <option value="high">Tinggi (High)</option>
                                      <option value="medium">Sedang (Medium)</option>
                                      <option value="low">Rendah (Low)</option>
                                    </select>
                                  </div>

                                  {task.category === 'result' && (
                                    <>
                                      <div>
                                        <label className="block text-[10px] text-slate-500 mb-0.5">Target Angka</label>
                                        <input
                                          type="number"
                                          value={task.targetValue || ''}
                                          onChange={(e) => {
                                            const copy = [...formMonthlyTasks];
                                            copy[idx].targetValue = parseFloat(e.target.value) || 0;
                                            setFormMonthlyTasks(copy);
                                          }}
                                          placeholder="e.g. 50"
                                          className="w-full px-2 py-1 text-xs border border-slate-200 rounded-lg"
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-[10px] text-slate-500 mb-0.5">Satuan</label>
                                        <select
                                          value={task.targetUnit || 'NOA'}
                                          onChange={(e) => {
                                            const copy = [...formMonthlyTasks];
                                            copy[idx].targetUnit = e.target.value as TalTargetUnit;
                                            setFormMonthlyTasks(copy);
                                          }}
                                          className="w-full px-2 py-1 text-xs border border-slate-200 rounded-lg"
                                        >
                                          <option value="NOA">NOA (Orang)</option>
                                          <option value="Rupiah">Rupiah (Rp)</option>
                                          <option value="Unit">Unit</option>
                                          <option value="Custom">Kustom</option>
                                        </select>
                                      </div>
                                    </>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* TAB 2: MINGGUAN */}
                      {activeTab === 'edit_weekly' && (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <h4 className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                              <FolderKanban size={14} className="text-blue-600" />
                              <span>Paket Target Operasional Mingguan</span>
                            </h4>
                            <button
                              type="button"
                              onClick={() => {
                                setFormWeeklyTasks([
                                  ...formWeeklyTasks,
                                  { id: `w_${Date.now()}`, title: '', category: 'non_result', priority: 'high' },
                                ]);
                              }}
                              className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-bold flex items-center gap-1 border border-blue-200 transition cursor-pointer"
                            >
                              <Plus size={13} /> Tambah Target Mingguan
                            </button>
                          </div>

                          <div className="space-y-2">
                            {formWeeklyTasks.map((task, idx) => (
                              <div key={task.id || idx} className="p-3 bg-white border border-slate-200 rounded-xl space-y-2 shadow-2xs">
                                <div className="flex items-start gap-2">
                                  <input
                                    type="text"
                                    value={task.title}
                                    onChange={(e) => {
                                      const copy = [...formWeeklyTasks];
                                      copy[idx].title = e.target.value;
                                      setFormWeeklyTasks(copy);
                                    }}
                                    placeholder="Judul Target Mingguan (misal: Supervisi Alur Kasir & SBG)"
                                    className="flex-1 px-2.5 py-1 text-xs border border-slate-200 rounded-lg font-semibold"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setFormWeeklyTasks(formWeeklyTasks.filter((_, i) => i !== idx));
                                    }}
                                    className="p-1 text-rose-500 hover:bg-rose-50 rounded"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs">
                                  <div>
                                    <label className="block text-[10px] text-slate-500 mb-0.5">Kategori</label>
                                    <select
                                      value={task.category}
                                      onChange={(e) => {
                                        const copy = [...formWeeklyTasks];
                                        copy[idx].category = e.target.value as TalCategory;
                                        setFormWeeklyTasks(copy);
                                      }}
                                      className="w-full px-2 py-1 text-xs border border-slate-200 rounded-lg"
                                    >
                                      <option value="non_result">Non Result</option>
                                      <option value="result">Result</option>
                                    </select>
                                  </div>

                                  <div>
                                    <label className="block text-[10px] text-slate-500 mb-0.5">Prioritas</label>
                                    <select
                                      value={task.priority}
                                      onChange={(e) => {
                                        const copy = [...formWeeklyTasks];
                                        copy[idx].priority = e.target.value as TalPriority;
                                        setFormWeeklyTasks(copy);
                                      }}
                                      className="w-full px-2 py-1 text-xs border border-slate-200 rounded-lg"
                                    >
                                      <option value="high">Tinggi (High)</option>
                                      <option value="medium">Sedang (Medium)</option>
                                      <option value="low">Rendah (Low)</option>
                                    </select>
                                  </div>

                                  {task.category === 'result' && (
                                    <>
                                      <div>
                                        <label className="block text-[10px] text-slate-500 mb-0.5">Target Angka</label>
                                        <input
                                          type="number"
                                          value={task.targetValue || ''}
                                          onChange={(e) => {
                                            const copy = [...formWeeklyTasks];
                                            copy[idx].targetValue = parseFloat(e.target.value) || 0;
                                            setFormWeeklyTasks(copy);
                                          }}
                                          placeholder="e.g. 10"
                                          className="w-full px-2 py-1 text-xs border border-slate-200 rounded-lg"
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-[10px] text-slate-500 mb-0.5">Satuan</label>
                                        <select
                                          value={task.targetUnit || 'NOA'}
                                          onChange={(e) => {
                                            const copy = [...formWeeklyTasks];
                                            copy[idx].targetUnit = e.target.value as TalTargetUnit;
                                            setFormWeeklyTasks(copy);
                                          }}
                                          className="w-full px-2 py-1 text-xs border border-slate-200 rounded-lg"
                                        >
                                          <option value="NOA">NOA (Orang)</option>
                                          <option value="Rupiah">Rupiah (Rp)</option>
                                          <option value="Unit">Unit</option>
                                          <option value="Custom">Kustom</option>
                                        </select>
                                      </div>
                                    </>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* TAB 3: HARIAN (Day Offset 1 s.d. 6) */}
                      {activeTab === 'edit_daily' && (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <h4 className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                              <Clock size={14} className="text-emerald-600" />
                              <span>Paket Tugas Harian (Hari ke-1 s.d. Hari ke-6 Kerja)</span>
                            </h4>
                            <button
                              type="button"
                              onClick={() => {
                                setFormDailyTasks([
                                  ...formDailyTasks,
                                  {
                                    id: `d_${Date.now()}`,
                                    title: '',
                                    category: 'non_result',
                                    priority: 'medium',
                                    time: '08:30',
                                    dayOffset: 1,
                                    enableReminder: false,
                                  },
                                ]);
                              }}
                              className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-xs font-bold flex items-center gap-1 border border-emerald-200 transition cursor-pointer"
                            >
                              <Plus size={13} /> Tambah Task Harian
                            </button>
                          </div>

                          <div className="space-y-2">
                            {formDailyTasks.map((task, idx) => (
                              <div key={task.id || idx} className="p-3 bg-white border border-slate-200 rounded-xl space-y-2 shadow-2xs">
                                <div className="flex items-start gap-2">
                                  <input
                                    type="text"
                                    value={task.title}
                                    onChange={(e) => {
                                      const copy = [...formDailyTasks];
                                      copy[idx].title = e.target.value;
                                      setFormDailyTasks(copy);
                                    }}
                                    placeholder="Judul Tugas Harian (misal: Rekonsiliasi Buku Kas Harian)"
                                    className="flex-1 px-2.5 py-1 text-xs border border-slate-200 rounded-lg font-semibold"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setFormDailyTasks(formDailyTasks.filter((_, i) => i !== idx));
                                    }}
                                    className="p-1 text-rose-500 hover:bg-rose-50 rounded"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>

                                <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-xs">
                                  <div>
                                    <label className="block text-[10px] text-slate-500 mb-0.5">Hari Kerja</label>
                                    <select
                                      value={task.dayOffset}
                                      onChange={(e) => {
                                        const copy = [...formDailyTasks];
                                        copy[idx].dayOffset = parseInt(e.target.value, 10);
                                        setFormDailyTasks(copy);
                                      }}
                                      className="w-full px-2 py-1 text-xs border border-slate-200 rounded-lg font-bold text-slate-700"
                                    >
                                      <option value={1}>Hari 1 (Senin)</option>
                                      <option value={2}>Hari 2 (Selasa)</option>
                                      <option value={3}>Hari 3 (Rabu)</option>
                                      <option value={4}>Hari 4 (Kamis)</option>
                                      <option value={5}>Hari 5 (Jumat)</option>
                                      <option value={6}>Hari 6 (Sabtu)</option>
                                    </select>
                                  </div>

                                  <div>
                                    <label className="block text-[10px] text-slate-500 mb-0.5">Jam Pelaksanaan</label>
                                    <input
                                      type="time"
                                      value={task.time || '08:00'}
                                      onChange={(e) => {
                                        const copy = [...formDailyTasks];
                                        copy[idx].time = e.target.value;
                                        setFormDailyTasks(copy);
                                      }}
                                      className="w-full px-2 py-1 text-xs border border-slate-200 rounded-lg font-mono font-bold"
                                    />
                                  </div>

                                  <div>
                                    <label className="block text-[10px] text-slate-500 mb-0.5">Kategori</label>
                                    <select
                                      value={task.category}
                                      onChange={(e) => {
                                        const copy = [...formDailyTasks];
                                        copy[idx].category = e.target.value as TalCategory;
                                        setFormDailyTasks(copy);
                                      }}
                                      className="w-full px-2 py-1 text-xs border border-slate-200 rounded-lg"
                                    >
                                      <option value="non_result">Non Result</option>
                                      <option value="result">Result</option>
                                    </select>
                                  </div>

                                  <div>
                                    <label className="block text-[10px] text-slate-500 mb-0.5">Prioritas</label>
                                    <select
                                      value={task.priority}
                                      onChange={(e) => {
                                        const copy = [...formDailyTasks];
                                        copy[idx].priority = e.target.value as TalPriority;
                                        setFormDailyTasks(copy);
                                      }}
                                      className="w-full px-2 py-1 text-xs border border-slate-200 rounded-lg"
                                    >
                                      <option value="high">Tinggi (High)</option>
                                      <option value="medium">Sedang (Medium)</option>
                                      <option value="low">Rendah (Low)</option>
                                    </select>
                                  </div>

                                  <div className="sm:col-span-2 flex items-center gap-2 pt-4">
                                    <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-slate-700">
                                      <input
                                        type="checkbox"
                                        checked={task.enableReminder || false}
                                        onChange={(e) => {
                                          const copy = [...formDailyTasks];
                                          copy[idx].enableReminder = e.target.checked;
                                          setFormDailyTasks(copy);
                                        }}
                                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                      />
                                      <span className="flex items-center gap-1">
                                        <Bell size={12} className="text-amber-500" />
                                        <span>Notifikasi Pengingat</span>
                                      </span>
                                    </label>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-400 text-xs">
                Pilih atau buat template baru.
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <span>{templates.length} Template dalam katalog rutinitas sistem &amp; kustom.</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 font-bold text-slate-700 hover:bg-slate-200/80 rounded-xl transition cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};

export default TalRoutineTemplateModal;
