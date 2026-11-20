// components/tal/TalTaskModal.tsx — porting src/components/tal/TalTaskModal.tsx backup.
// Adaptasi WOORK:
// - Tanpa useAuth/Firebase: identitas user tidak ada di modal; API memaksa
//   userId dari sesi, sehingga payload onSave TIDAK membawa userId/userEmail/
//   userName (tipe Omit<..., 'id'|'createdAt'|'updatedAt'|'userId'>).
// - Tanpa fetchRegisteredUsers / sendTalTaskNotifications / fetchAllCutiForDate
//   (tidak ada padanan WOORK): autocomplete penugasan hanya menawarkan
//   "Diri Sendiri" + daftar availableUsers (prop) + input nama manual;
//   cutiUsersMap selalu kosong (tidak ada penanda cuti di daftar user).
// - "Diri Sendiri" dipakai sebagai opsi diri (email kosong).
'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  X,
  Upload,
  Trash2,
  FileText,
  AlertCircle,
  CheckCircle2,
  Lock,
  Search,
  UserPlus,
  Check,
  Users,
  ShieldAlert,
  BellRing,
  Info
} from 'lucide-react';
import type {
  TalTaskItem,
  TalTaskType,
  TalPriority,
  TalStatus,
  TalCategory,
  TalTargetUnit,
  TalAttachment,
  TalAssignedUser,
  TalUserOption
} from '@/lib/tal/types';
import { TAL_BLOCKER_CATEGORIES as TAL_BLOCKER_CATEGORIES_VALUE } from '@/lib/tal/types';

export interface TalTaskModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit' | 'view';
  taskType: TalTaskType;
  initialTask?: Partial<TalTaskItem>;
  isAdditional?: boolean;
  isPlanLocked?: boolean;
  isReported?: boolean;
  initialTab?: 'detail' | 'progress';
  parentOptions?: { id: string; title: string; category: string }[];
  availableUsers?: { id: string; name: string; username: string }[];
  onSave: (taskData: Omit<TalTaskItem, 'id' | 'createdAt' | 'updatedAt' | 'userId'>) => Promise<void>;
  onClose: () => void;
}

const BLOCKER_CATEGORIES: readonly string[] = TAL_BLOCKER_CATEGORIES_VALUE;

export const TalTaskModal: React.FC<TalTaskModalProps> = ({
  isOpen,
  mode,
  taskType,
  initialTask,
  isAdditional = false,
  isPlanLocked = false,
  isReported = false,
  initialTab,
  parentOptions = [],
  availableUsers = [],
  onSave,
  onClose
}) => {
  const isTaskAdditional = !!(isAdditional || initialTask?.isAdditional);
  const isReadOnly = mode === 'view' || isReported;
  // Tugas tambahan tetap bisa diedit di tahap realisasi selama belum dilaporkan (isReported)
  const isPlanReadOnly = isReadOnly || (!isTaskAdditional && isPlanLocked && mode !== 'create');

  // Form state
  const [title, setTitle] = useState(initialTask?.title || '');
  const [description, setDescription] = useState(initialTask?.description || '');
  const [date, setDate] = useState(initialTask?.date || '');
  const [time, setTime] = useState(initialTask?.time || '');
  const [parentId, setParentId] = useState(initialTask?.parentId || '');
  const [category, setCategory] = useState<TalCategory>(initialTask?.category || 'non_result');
  const [targetValue, setTargetValue] = useState<number | ''>(
    initialTask?.targetValue !== undefined ? initialTask.targetValue : ''
  );
  const [targetUnit, setTargetUnit] = useState<TalTargetUnit>(initialTask?.targetUnit || 'Rupiah');
  const [targetCustomUnit, setTargetCustomUnit] = useState(initialTask?.targetCustomUnit || '');
  const [priority, setPriority] = useState<TalPriority>(initialTask?.priority || 'medium');

  // User assignment state
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  const [assignedUsers, setAssignedUsers] = useState<TalAssignedUser[]>(() => {
    if (initialTask?.assignedUsers && initialTask.assignedUsers.length > 0) {
      return initialTask.assignedUsers;
    }
    if (initialTask?.assignedTo && initialTask.assignedTo.length > 0) {
      return initialTask.assignedTo.map((name, i) => ({
        email: initialTask.assignedUserEmails?.[i] || '',
        name,
        fotoProfile: undefined
      }));
    }
    return [{
      email: '',
      name: 'Diri Sendiri',
      fotoProfile: undefined
    }];
  });

  // Keep assignedTo string array in sync for backward compatibility
  const assignedTo = useMemo(() => assignedUsers.map(u => u.name), [assignedUsers]);

  // Progress state
  const [status, setStatus] = useState<TalStatus>(initialTask?.status || 'todo');
  const [notes, setNotes] = useState(initialTask?.notes || '');
  const [actualValue, setActualValue] = useState<number | ''>(
    initialTask?.actualValue !== undefined ? initialTask.actualValue : ''
  );
  const [attachments, setAttachments] = useState<TalAttachment[]>(initialTask?.attachments || []);
  const [blockerCategory, setBlockerCategory] = useState<string>(initialTask?.blockerCategory || '');
  const [blockerDescription, setBlockerDescription] = useState<string>(initialTask?.blockerDescription || '');

  // 9.3.1.2 Task Execution Reminder State
  const [enableReminder, setEnableReminder] = useState<boolean>(initialTask?.enableReminder || false);
  const [reminderType, setReminderType] = useState<'minutes_before' | 'specific_time'>(
    initialTask?.reminderType === 'specific_time' ? 'specific_time' : 'minutes_before'
  );
  const [reminderMinutesBefore, setReminderMinutesBefore] = useState<number>(
    initialTask?.reminderMinutesBefore || 15
  );
  const [reminderTime, setReminderTime] = useState<string>(initialTask?.reminderTime || '');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Active modal tab
  const [activeTab, setActiveTab] = useState<'detail' | 'progress'>(() => {
    if (initialTab) return initialTab;
    if (isPlanLocked && !isTaskAdditional && mode === 'edit') return 'progress';
    return 'detail';
  });
  // WOORK: tidak ada fetchAllCutiForDate — peta cuti selalu kosong.
  const [cutiUsersMap] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setIsSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  useEffect(() => {
    if (initialTask) {
      setTitle(initialTask.title || '');
      setDescription(initialTask.description || '');
      setDate(initialTask.date || '');
      setTime(initialTask.time || '');
      setParentId(initialTask.parentId || '');
      setCategory(initialTask.category || 'non_result');
      setTargetValue(initialTask.targetValue !== undefined ? initialTask.targetValue : '');
      setTargetUnit(initialTask.targetUnit || 'Rupiah');
      setTargetCustomUnit(initialTask.targetCustomUnit || '');
      setPriority(initialTask.priority || 'medium');
      if (initialTask.assignedUsers && initialTask.assignedUsers.length > 0) {
        setAssignedUsers(initialTask.assignedUsers);
      } else if (initialTask.assignedTo && initialTask.assignedTo.length > 0) {
        setAssignedUsers(
          initialTask.assignedTo.map((name, i) => ({
            email: initialTask.assignedUserEmails?.[i] || '',
            name
          }))
        );
      } else {
        setAssignedUsers([{
          email: '',
          name: 'Diri Sendiri',
          fotoProfile: undefined
        }]);
      }
      setStatus(initialTask.status || 'todo');
      setNotes(initialTask.notes || '');
      setActualValue(initialTask.actualValue !== undefined ? initialTask.actualValue : '');
      setAttachments(initialTask.attachments || []);
      setBlockerCategory(initialTask.blockerCategory || '');
      setBlockerDescription(initialTask.blockerDescription || '');
      setEnableReminder(initialTask.enableReminder ?? (taskType === 'daily' && !!initialTask.time));
      setReminderType(initialTask.reminderType === 'specific_time' ? 'specific_time' : 'minutes_before');
      setReminderMinutesBefore(initialTask.reminderMinutesBefore || 15);
      setReminderTime(initialTask.reminderTime || '');
    }

    if (isOpen) {
      if (initialTab) {
        setActiveTab(initialTab);
      } else if (isPlanLocked && !isTaskAdditional && mode === 'edit') {
        setActiveTab('progress');
      } else {
        setActiveTab('detail');
      }
    }
  }, [initialTask, taskType, isOpen, initialTab, isPlanLocked, isTaskAdditional, mode]);

  if (!isOpen) return null;

  // Handle local file / photo attachment simulation
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach(file => {
      const isVideo = file.type.startsWith('video');
      const isImage = file.type.startsWith('image');
      const reader = new FileReader();

      reader.onload = (uploadEvent) => {
        const base64Url = uploadEvent.target?.result as string;
        const newAttachment: TalAttachment = {
          id: `att_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          name: file.name,
          url: base64Url,
          type: isVideo ? 'video' : isImage ? 'image' : 'file',
          size: file.size,
          uploadedAt: new Date().toISOString()
        };
        setAttachments(prev => [...prev, newAttachment]);
      };

      reader.readAsDataURL(file);
    });
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Judul tugas wajib diisi!');
      return;
    }

    // Blocker validation if status is pending
    if (status === 'pending') {
      if (!blockerCategory) {
        setError('Kategori Blocker wajib dipilih saat status tugas Pending!');
        setActiveTab('progress');
        return;
      }
      if (!blockerDescription || blockerDescription.trim().length < 10) {
        setError('Deskripsi kendala / blocker wajib diisi minimal 10 karakter!');
        setActiveTab('progress');
        return;
      }
    }

    setLoading(true);
    setError('');

    try {
      const selectedParent = parentOptions.find(p => p.id === parentId);

      const payload: Omit<TalTaskItem, 'id' | 'createdAt' | 'updatedAt' | 'userId'> = {
        type: taskType,
        isAdditional: initialTask?.isAdditional !== undefined ? initialTask.isAdditional : isAdditional,
        originalTaskId: initialTask?.originalTaskId,
        date: date || initialTask?.date,
        time: time || undefined,
        weekNumber: initialTask?.weekNumber || 1,
        weekYear: initialTask?.weekYear || new Date().getFullYear(),
        month: initialTask?.month || (new Date().getMonth() + 1),
        year: initialTask?.year || new Date().getFullYear(),
        title: title.trim(),
        description: description.trim() || undefined,
        parentId: parentId || undefined,
        parentTitle: selectedParent?.title || undefined,
        category,
        targetValue: category === 'result' && targetValue !== '' ? Number(targetValue) : undefined,
        targetUnit: category === 'result' ? targetUnit : undefined,
        targetCustomUnit: category === 'result' && targetUnit === 'Custom' ? targetCustomUnit : undefined,
        priority,
        assignedTo,
        assignedUserEmails: assignedUsers.map(u => u.email).filter(Boolean) as string[],
        assignedUsers: assignedUsers,
        status,
        notes: notes.trim() || undefined,
        actualValue: category === 'result' && actualValue !== '' ? Number(actualValue) : undefined,
        attachments,
        blockerCategory: status === 'pending' ? blockerCategory : undefined,
        blockerDescription: status === 'pending' ? blockerDescription.trim() : undefined,
        blockerReportedAt: status === 'pending' ? (initialTask?.blockerReportedAt || new Date().toISOString()) : undefined,
        enableReminder: taskType === 'daily' ? enableReminder : undefined,
        reminderType: taskType === 'daily' && enableReminder ? reminderType : undefined,
        reminderMinutesBefore: taskType === 'daily' && enableReminder ? Number(reminderMinutesBefore) : undefined,
        reminderTime: taskType === 'daily' && enableReminder ? reminderTime : undefined,
        isRolledOver: initialTask?.isRolledOver,
        rolloverAction: initialTask?.rolloverAction,
        rolloverTargetDate: initialTask?.rolloverTargetDate,
        cancelNotes: initialTask?.cancelNotes
      };

      await onSave(payload);
      onClose();
    } catch (err: unknown) {
      console.error('Error saving task:', err);
      setError(err instanceof Error ? err.message : 'Gagal menyimpan tugas.');
    } finally {
      setLoading(false);
    }
  };

  const currentSelfOption: TalUserOption = useMemo(() => ({
    id: 'self',
    email: '',
    name: 'Diri Sendiri',
    username: 'me',
    fotoProfile: undefined,
    role: undefined
  }), []);

  const allUserOptions = useMemo(() => {
    const map = new Map<string, TalUserOption>();

    // 1. Current logged in user (WOORK: "Diri Sendiri", tanpa identitas sesi)
    if (currentSelfOption.email) {
      map.set(currentSelfOption.email.toLowerCase(), currentSelfOption);
    } else {
      map.set('self', currentSelfOption);
    }

    // 2. Prop availableUsers
    availableUsers.forEach(u => {
      const key = (u.username || u.name).toLowerCase();
      if (!map.has(key)) {
        map.set(key, {
          id: u.id,
          name: u.name,
          username: u.username,
          email: `${u.username}@company.local`
        });
      }
    });

    return Array.from(map.values());
  }, [availableUsers, currentSelfOption]);

  const filteredUserOptions = useMemo(() => {
    const q = userSearchQuery.trim().toLowerCase();
    if (!q) return allUserOptions.slice(0, 8);
    return allUserOptions.filter(u =>
      u.name.toLowerCase().includes(q) ||
      u.username?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q)
    ).slice(0, 10);
  }, [allUserOptions, userSearchQuery]);

  const isUserCuti = (userOpt: { id?: string; email?: string; name: string }) => {
    if (!cutiUsersMap || cutiUsersMap.size === 0) return false;
    if (userOpt.id && cutiUsersMap.has(userOpt.id.toLowerCase())) return true;
    if (userOpt.email && cutiUsersMap.has(userOpt.email.toLowerCase())) return true;
    if (userOpt.name && cutiUsersMap.has(userOpt.name.toLowerCase())) return true;
    return false;
  };

  const isUserAssigned = (userOpt: { email?: string; name: string }) => {
    return assignedUsers.some(u =>
      (u.email && userOpt.email && u.email.toLowerCase() === userOpt.email.toLowerCase()) ||
      u.name.toLowerCase() === userOpt.name.toLowerCase()
    );
  };

  const handleToggleUser = (userOpt: { id?: string; email?: string; name: string; fotoProfile?: string }) => {
    if (isUserCuti(userOpt)) {
      return; // Disabled if cuti
    }
    setAssignedUsers(prev => {
      const exists = prev.some(u =>
        (u.email && userOpt.email && u.email.toLowerCase() === userOpt.email.toLowerCase()) ||
        u.name.toLowerCase() === userOpt.name.toLowerCase()
      );
      if (exists) {
        return prev.filter(u =>
          !(
            (u.email && userOpt.email && u.email.toLowerCase() === userOpt.email.toLowerCase()) ||
            u.name.toLowerCase() === userOpt.name.toLowerCase()
          )
        );
      } else {
        return [...prev, {
          email: userOpt.email || '',
          name: userOpt.name,
          fotoProfile: userOpt.fotoProfile
        }];
      }
    });
    setUserSearchQuery('');
  };

  const handleRemoveUser = (userToRemove: TalAssignedUser) => {
    setAssignedUsers(prev => prev.filter(u =>
      !(
        (u.email && userToRemove.email && u.email.toLowerCase() === userToRemove.email.toLowerCase()) ||
        u.name.toLowerCase() === userToRemove.name.toLowerCase()
      )
    ));
  };

  const getTypeName = () => {
    switch (taskType) {
      case 'daily': return 'Harian';
      case 'weekly': return 'Mingguan';
      case 'monthly': return 'Bulanan';
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/50 backdrop-blur-xs overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/70">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-slate-900">
                {mode === 'create' ? `Tambah Tugas ${getTypeName()}` : mode === 'edit' ? `Edit Tugas ${getTypeName()}` : `Detail Tugas ${getTypeName()}`}
              </h3>
              {isTaskAdditional && (
                <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full border border-amber-300">
                  Tugas Tambahan
                </span>
              )}
            </div>
            {isPlanLocked && !isReported && !isTaskAdditional && (
              <p className="text-[11px] text-amber-600 font-medium flex items-center gap-1 mt-0.5">
                <Lock size={12} /> Plan terkunci. Hanya progress (status, catatan & bukti) yang dapat diperbarui.
              </p>
            )}
            {isPlanLocked && !isReported && isTaskAdditional && (
              <p className="text-[11px] text-amber-700 font-medium flex items-center gap-1 mt-0.5">
                <Info size={12} className="text-amber-600 shrink-0" /> Tugas tambahan pada tahap realisasi dapat diedit atau dihapus sebelum dilaporkan.
              </p>
            )}
            {isReported && (
              <p className="text-[11px] text-emerald-600 font-medium flex items-center gap-1 mt-0.5">
                <CheckCircle2 size={12} /> Tugas sudah dilaporkan (Reported) & terkunci.
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab switch inside modal (Detail vs Progress) */}
        <div className="flex border-b border-slate-200 bg-slate-50/50 px-5 pt-2">
          <button
            type="button"
            onClick={() => setActiveTab('detail')}
            className={`pb-2 px-3 text-xs font-bold border-b-2 transition-all ${
              activeTab === 'detail'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            1. Detail Tugas {isPlanLocked && !isTaskAdditional && <Lock size={10} className="inline ml-1 opacity-70" />}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('progress')}
            className={`pb-2 px-3 text-xs font-bold border-b-2 transition-all ${
              activeTab === 'progress'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            2. Progress &amp; Realisasi {status === 'done' && '✓'}
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit}>
          <div className="p-5 max-h-[68vh] overflow-y-auto space-y-4">
            {error && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle size={15} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* TAB 1: DETAIL TUGAS */}
            {activeTab === 'detail' && (
              <div className="space-y-3.5">
                {/* Judul Task */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Judul Tugas / Kegiatan <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    disabled={isPlanReadOnly}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Contoh: Follow up penawaran nasabah emas / Meeting koordinasi"
                    className="w-full px-3 py-2 text-xs font-medium rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-500"
                  />
                </div>

                {/* Deskripsi */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Deskripsi Tugas
                  </label>
                  <textarea
                    rows={2}
                    disabled={isPlanReadOnly}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Tuliskan catatan rincian tugas..."
                    className="w-full px-3 py-2 text-xs font-medium rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-500"
                  />
                </div>

                {/* Date & Time (for daily) */}
                {taskType === 'daily' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Tanggal <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="date"
                        required
                        disabled={isPlanReadOnly}
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Jam / Waktu
                      </label>
                      <input
                        type="time"
                        disabled={isPlanReadOnly}
                        value={time}
                        onChange={(e) => setTime(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-500"
                      />
                    </div>
                  </div>
                )}

                {/* Parent Task Dropdown */}
                {parentOptions.length > 0 && (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Parent Task ({taskType === 'daily' ? 'Task Mingguan' : 'Task Bulanan'})
                    </label>
                    <select
                      disabled={isPlanReadOnly}
                      value={parentId}
                      onChange={(e) => setParentId(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-500"
                    >
                      <option value="">-- Tanpa Parent Task --</option>
                      {parentOptions.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.title} ({p.category === 'result' ? 'Result' : 'Non Result'})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Kategori (Result vs Non Result) */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Kategori Tugas <span className="text-rose-500">*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={isPlanReadOnly}
                      onClick={() => setCategory('non_result')}
                      className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
                        category === 'non_result'
                          ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      Non Result (Aktivitas)
                    </button>
                    <button
                      type="button"
                      disabled={isPlanReadOnly}
                      onClick={() => setCategory('result')}
                      className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
                        category === 'result'
                          ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      Result (Target Angka)
                    </button>
                  </div>
                </div>

                {/* If Result: Target Value & Unit */}
                {category === 'result' && (
                  <div className="p-3 bg-amber-50/70 rounded-xl border border-amber-200/80 space-y-2.5">
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[11px] font-bold text-amber-900 mb-1">
                          Nilai Target <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="number"
                          required
                          disabled={isPlanReadOnly}
                          value={targetValue}
                          onChange={(e) => setTargetValue(e.target.value === '' ? '' : Number(e.target.value))}
                          placeholder="e.g. 5000000 / 10"
                          className="w-full px-3 py-1.5 text-xs font-bold rounded-lg border border-amber-300 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:bg-slate-100"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-amber-900 mb-1">
                          Satuan Target
                        </label>
                        <select
                          disabled={isPlanReadOnly}
                          value={targetUnit}
                          onChange={(e) => setTargetUnit(e.target.value as TalTargetUnit)}
                          className="w-full px-3 py-1.5 text-xs font-bold rounded-lg border border-amber-300 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:bg-slate-100"
                        >
                          <option value="Rupiah">Rupiah (Rp)</option>
                          <option value="NOA">NOA (Nasabah)</option>
                          <option value="Unit">Unit / Berkas</option>
                          <option value="Custom">Isi Sendiri...</option>
                        </select>
                      </div>
                    </div>

                    {targetUnit === 'Custom' && (
                      <div>
                        <label className="block text-[10px] font-bold text-amber-900 mb-1">
                          Nama Satuan Kustom
                        </label>
                        <input
                          type="text"
                          disabled={isPlanReadOnly}
                          value={targetCustomUnit}
                          onChange={(e) => setTargetCustomUnit(e.target.value)}
                          placeholder="e.g. Gram, Call, Lead"
                          className="w-full px-3 py-1.5 text-xs rounded-lg border border-amber-300 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Priority */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Skala Prioritas <span className="text-rose-500">*</span>
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      disabled={isPlanReadOnly}
                      onClick={() => setPriority('low')}
                      className={`py-2 rounded-xl text-xs font-extrabold border transition ${
                        priority === 'low'
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                      }`}
                    >
                      LOW
                    </button>
                    <button
                      type="button"
                      disabled={isPlanReadOnly}
                      onClick={() => setPriority('medium')}
                      className={`py-2 rounded-xl text-xs font-extrabold border transition ${
                        priority === 'medium'
                          ? 'bg-amber-500 text-white border-amber-500 shadow-xs'
                          : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                      }`}
                    >
                      MEDIUM
                    </button>
                    <button
                      type="button"
                      disabled={isPlanReadOnly}
                      onClick={() => setPriority('high')}
                      className={`py-2 rounded-xl text-xs font-extrabold border transition ${
                        priority === 'high'
                          ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                          : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                      }`}
                    >
                      HIGH
                    </button>
                  </div>
                </div>

                {/* Tugaskan Ke (Autocomplete URL-bar style multi-select with profile photos) */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-slate-700">
                      Tugaskan Ke (Karyawan / Anggota)
                    </label>
                    <div className="flex items-center gap-2">
                      {!isUserAssigned(currentSelfOption) && !isPlanReadOnly && (
                        <button
                          type="button"
                          onClick={() => handleToggleUser(currentSelfOption)}
                          className="text-[11px] text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1 cursor-pointer"
                        >
                          <UserPlus size={12} />
                          <span>+ Diri Sendiri</span>
                        </button>
                      )}
                      <span className="text-[11px] font-medium text-slate-400">
                        {assignedUsers.length} terpilih
                      </span>
                    </div>
                  </div>

                  {/* Selected User Chips */}
                  <div className="flex flex-wrap gap-1.5 min-h-[38px] p-2 bg-slate-50/80 rounded-xl border border-slate-200">
                    {assignedUsers.length === 0 ? (
                      <div className="text-xs text-slate-400 italic px-1 flex items-center gap-1.5 py-0.5">
                        <Users size={13} className="text-slate-300" />
                        <span>Belum ada yang ditugaskan. Cari nama anggota di bawah.</span>
                      </div>
                    ) : (
                      assignedUsers.map((userItem, idx) => {
                        const isSelf =
                          (userItem.email && currentSelfOption.email && userItem.email.toLowerCase() === currentSelfOption.email.toLowerCase()) ||
                          userItem.name.toLowerCase() === currentSelfOption.name.toLowerCase();

                        return (
                          <div
                            key={idx}
                            className={`inline-flex items-center gap-1.5 pl-1.5 pr-2 py-1 rounded-full text-xs font-medium border shadow-2xs transition animate-in fade-in zoom-in-95 duration-100 ${
                              isSelf
                                ? 'bg-blue-50 text-blue-800 border-blue-200'
                                : 'bg-white text-slate-800 border-slate-200'
                            }`}
                          >
                            {/* Profile photo avatar */}
                            <div className="w-5 h-5 rounded-full overflow-hidden shrink-0 bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center text-[9px] font-bold">
                              {userItem.fotoProfile ? (
                                <img
                                  src={userItem.fotoProfile}
                                  alt={userItem.name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <span>{userItem.name.charAt(0).toUpperCase()}</span>
                              )}
                            </div>

                            <span className="truncate max-w-[130px] font-semibold">
                              {userItem.name}
                            </span>
                            {isSelf && (
                              <span className="text-[9px] font-bold px-1 bg-blue-100 text-blue-700 rounded">
                                Anda
                              </span>
                            )}

                            {!isPlanReadOnly && (
                              <button
                                type="button"
                                onClick={() => handleRemoveUser(userItem)}
                                className="w-4 h-4 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-700 flex items-center justify-center transition cursor-pointer ml-0.5"
                                title={`Hapus ${userItem.name}`}
                              >
                                <X size={11} />
                              </button>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* URL-bar Style Autocomplete Suggestion Input */}
                  {!isPlanReadOnly && (
                    <div ref={searchContainerRef} className="relative">
                      <div className="relative flex items-center">
                        <div className="absolute left-3 text-slate-400 pointer-events-none">
                          <Search size={14} />
                        </div>
                        <input
                          type="text"
                          value={userSearchQuery}
                          onChange={(e) => {
                            setUserSearchQuery(e.target.value);
                            setIsSearchOpen(true);
                          }}
                          onFocus={() => setIsSearchOpen(true)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              if (filteredUserOptions.length > 0) {
                                handleToggleUser(filteredUserOptions[0]);
                              } else if (userSearchQuery.trim()) {
                                handleToggleUser({
                                  name: userSearchQuery.trim(),
                                  email: ''
                                });
                              }
                            } else if (e.key === 'Escape') {
                              setIsSearchOpen(false);
                            }
                          }}
                          placeholder="Ketik 1, 2, 3 huruf untuk mencari atau mengundang karyawan..."
                          className="w-full pl-9 pr-8 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 shadow-2xs placeholder:text-slate-400"
                        />
                        {userSearchQuery && (
                          <button
                            type="button"
                            onClick={() => setUserSearchQuery('')}
                            className="absolute right-2.5 text-slate-400 hover:text-slate-600 p-0.5"
                          >
                            <X size={13} />
                          </button>
                        )}
                      </div>

                      {/* Dropdown Suggestions List (like URL-bar suggestion) */}
                      {isSearchOpen && (
                        <div className="absolute z-20 top-full left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden max-h-56 overflow-y-auto animate-in fade-in duration-100 divide-y divide-slate-100">
                          {filteredUserOptions.length > 0 ? (
                            filteredUserOptions.map((opt) => {
                              const selected = isUserAssigned(opt);
                              const userCuti = isUserCuti(opt);
                              const isSelf =
                                (opt.email && currentSelfOption.email && opt.email.toLowerCase() === currentSelfOption.email.toLowerCase()) ||
                                opt.name.toLowerCase() === currentSelfOption.name.toLowerCase();

                              return (
                                <button
                                  key={opt.id || opt.email || opt.name}
                                  type="button"
                                  disabled={userCuti}
                                  onClick={() => handleToggleUser(opt)}
                                  title={userCuti ? 'Karyawan sedang cuti pada tanggal ini' : undefined}
                                  className={`w-full px-3 py-2 text-left flex items-center justify-between gap-2.5 transition ${
                                    userCuti
                                      ? 'bg-slate-50 opacity-60 cursor-not-allowed'
                                      : selected
                                      ? 'bg-blue-50/40 hover:bg-blue-50/70 cursor-pointer'
                                      : 'hover:bg-blue-50/70 cursor-pointer'
                                  }`}
                                >
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    {/* Profile Avatar */}
                                    <div className="w-7 h-7 rounded-full overflow-hidden shrink-0 bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center text-xs font-bold ring-1 ring-slate-200">
                                      {opt.fotoProfile ? (
                                        <img
                                          src={opt.fotoProfile}
                                          alt={opt.name}
                                          className="w-full h-full object-cover"
                                        />
                                      ) : (
                                        <span>{opt.name.charAt(0).toUpperCase()}</span>
                                      )}
                                    </div>

                                    {/* Name and Details */}
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="text-xs font-bold text-slate-800 truncate">
                                          {opt.name}
                                        </span>
                                        {isSelf && (
                                          <span className="text-[9px] font-bold px-1 bg-blue-100 text-blue-700 rounded shrink-0">
                                            Anda
                                          </span>
                                        )}
                                        {userCuti && (
                                          <span className="text-[9px] font-bold px-1.5 py-0.5 bg-amber-100 text-amber-800 border border-amber-300 rounded shrink-0 flex items-center gap-0.5">
                                            Cuti
                                          </span>
                                        )}
                                        {opt.role && !userCuti && (
                                          <span className="text-[9px] font-medium px-1 bg-slate-100 text-slate-600 rounded shrink-0">
                                            {opt.role}
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-[10px] text-slate-400 truncate">
                                        {userCuti ? 'Sedang cuti / tidak dapat ditugaskan' : (opt.email || `@${opt.username || 'user'}`)}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Selection Check Indicator */}
                                  <div className="shrink-0">
                                    {userCuti ? (
                                      <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                        Libur / Cuti
                                      </span>
                                    ) : selected ? (
                                      <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center">
                                        <Check size={12} strokeWidth={3} />
                                      </span>
                                    ) : (
                                      <span className="text-[11px] font-semibold text-blue-600 hover:underline">
                                        + Pilih
                                      </span>
                                    )}
                                  </div>
                                </button>
                              );
                            })
                          ) : (
                            <div className="px-4 py-3 text-center">
                              <p className="text-xs text-slate-500">
                                Tidak ada user terdaftar yang cocok dengan <b>&quot;{userSearchQuery}&quot;</b>
                              </p>
                              <button
                                type="button"
                                onClick={() => {
                                  handleToggleUser({ name: userSearchQuery.trim(), email: '' });
                                }}
                                className="mt-2 text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-1 cursor-pointer"
                              >
                                <UserPlus size={12} />
                                <span>Gunakan &quot;{userSearchQuery.trim()}&quot; sebagai nama anggota</span>
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 2: PROGRESS & REALISASI */}
            {activeTab === 'progress' && (
              <div className="space-y-3.5">
                {/* Status Tugas */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Status Tugas
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <button
                      type="button"
                      disabled={isReadOnly}
                      onClick={() => setStatus('todo')}
                      className={`py-2 rounded-xl text-xs font-extrabold border transition ${
                        status === 'todo'
                          ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                          : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                      }`}
                    >
                      TO DO
                    </button>
                    <button
                      type="button"
                      disabled={isReadOnly}
                      onClick={() => setStatus('on_progress')}
                      className={`py-2 rounded-xl text-xs font-extrabold border transition ${
                        status === 'on_progress'
                          ? 'bg-amber-500 text-white border-amber-500 shadow-xs'
                          : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                      }`}
                    >
                      ON PROGRESS
                    </button>
                    <button
                      type="button"
                      disabled={isReadOnly}
                      onClick={() => setStatus('pending')}
                      className={`py-2 rounded-xl text-xs font-extrabold border transition ${
                        status === 'pending'
                          ? 'bg-orange-600 text-white border-orange-600 shadow-xs'
                          : 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100'
                      }`}
                    >
                      PENDING
                    </button>
                    <button
                      type="button"
                      disabled={isReadOnly}
                      onClick={() => setStatus('done')}
                      className={`py-2 rounded-xl text-xs font-extrabold border transition ${
                        status === 'done'
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                      }`}
                    >
                      DONE
                    </button>
                  </div>
                </div>

                {/* Blocker Details if Status is PENDING */}
                {status === 'pending' && (
                  <div className="p-3.5 bg-amber-50/80 border border-amber-300/80 rounded-2xl space-y-3 animate-in fade-in duration-150">
                    <div className="flex items-center gap-2 text-amber-900">
                      <ShieldAlert size={18} className="text-amber-600 shrink-0" />
                      <span className="text-xs font-bold">
                        Pelacakan Kendala &amp; Blocker Tugas (Wajib Diisi)
                      </span>
                    </div>

                    {/* Kategori Blocker */}
                    <div>
                      <label className="block text-[11px] font-bold text-amber-950 mb-1.5">
                        Kategori Blocker {!isReadOnly && <span className="text-rose-500">*</span>}
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {BLOCKER_CATEGORIES.map((cat) => {
                          const isSelected = blockerCategory === cat;
                          return (
                            <button
                              key={cat}
                              type="button"
                              disabled={isReadOnly}
                              onClick={() => !isReadOnly && setBlockerCategory(cat)}
                              className={`flex items-center justify-between p-2 rounded-xl border text-left text-xs transition ${
                                isSelected
                                  ? 'bg-amber-500 text-white border-amber-600 font-bold shadow-2xs'
                                  : isReadOnly
                                    ? 'bg-slate-50/70 text-slate-400 border-slate-200 opacity-60'
                                    : 'bg-white text-slate-700 border-amber-200 hover:bg-amber-100/50 cursor-pointer'
                              } ${isReadOnly ? 'cursor-default' : ''}`}
                            >
                              <span className="truncate">{cat}</span>
                              {isSelected && <Check size={13} className="shrink-0 ml-1" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Deskripsi Kendala */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-[11px] font-bold text-amber-950">
                          Deskripsi Kendala {!isReadOnly && <span className="text-rose-500">*</span>}
                        </label>
                        {!isReadOnly && (
                          <div className="text-[10.5px]">
                            <span className={`font-bold ${blockerDescription.trim().length >= 10 ? 'text-emerald-700' : 'text-amber-800'}`}>
                              {blockerDescription.trim().length} / 10
                            </span>
                            <span className="text-amber-800 ml-1 font-medium">
                              {blockerDescription.trim().length >= 10 ? '(Terpenuhi)' : '(Min. 10 Karakter)'}
                            </span>
                          </div>
                        )}
                      </div>
                      <textarea
                        rows={2}
                        readOnly={isReadOnly}
                        disabled={isReadOnly}
                        value={blockerDescription}
                        onChange={(e) => setBlockerDescription(e.target.value)}
                        placeholder={isReadOnly ? 'Tidak ada catatan kendala rinci' : 'Jelaskan secara detail kendala yang dialami (minimal 10 karakter)...'}
                        className={`w-full px-3 py-2 text-xs rounded-xl border transition ${
                          isReadOnly
                            ? 'bg-slate-50 border-slate-200 text-slate-700 cursor-default focus:outline-none'
                            : 'border-amber-300 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500'
                        }`}
                      />
                    </div>
                  </div>
                )}

                {/* 9.3.1.2 Pengingat Pengerjaan Task (Khusus Task Harian) */}
                {taskType === 'daily' && (
                  <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-2xl space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0">
                          <BellRing size={13} />
                        </div>
                        <div>
                          <span className="text-xs font-bold text-slate-800 block leading-tight">
                            Pengingat Pengerjaan Task
                          </span>
                          <span className="text-[10px] text-slate-500">
                            Kirim notifikasi audio chime &amp; popup sebelum jam pelaksanaan
                          </span>
                        </div>
                      </div>

                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          disabled={isReadOnly}
                          checked={enableReminder}
                          onChange={(e) => setEnableReminder(e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                    </div>

                    {enableReminder && (
                      <div className="pt-2 border-t border-blue-100 space-y-2.5 animate-in fade-in duration-150">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={isReadOnly}
                            onClick={() => setReminderType('minutes_before')}
                            className={`flex-1 py-1.5 px-2 text-[11px] font-bold rounded-lg border transition ${
                              reminderType === 'minutes_before'
                                ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            Opsi Cepat (Menit Sebelum)
                          </button>
                          <button
                            type="button"
                            disabled={isReadOnly}
                            onClick={() => setReminderType('specific_time')}
                            className={`flex-1 py-1.5 px-2 text-[11px] font-bold rounded-lg border transition ${
                              reminderType === 'specific_time'
                                ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            Jam Spesifik
                          </button>
                        </div>

                        {reminderType === 'minutes_before' ? (
                          <div className="space-y-1">
                            <label className="block text-[11px] font-semibold text-slate-700">
                              Ingatkan sebelum waktu task ({time || 'Waktu belum diatur'}):
                            </label>
                            <div className="grid grid-cols-4 gap-1.5">
                              {[10, 15, 30, 60].map((mins) => (
                                <button
                                  key={mins}
                                  type="button"
                                  disabled={isReadOnly}
                                  onClick={() => setReminderMinutesBefore(mins)}
                                  className={`py-1.5 px-1 rounded-lg text-center text-xs font-bold border transition ${
                                    reminderMinutesBefore === mins
                                      ? 'bg-blue-700 text-white border-blue-700'
                                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                                  }`}
                                >
                                  {mins} Menit
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <label className="block text-[11px] font-semibold text-slate-700">
                              Pukul / Jam Pengingat Khusus:
                            </label>
                            <input
                              type="time"
                              disabled={isReadOnly}
                              value={reminderTime}
                              onChange={(e) => setReminderTime(e.target.value)}
                              className="w-full px-3 py-1.5 text-xs bg-white rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Realisasi Angka jika Result */}
                {category === 'result' && (
                  <div className="p-3 bg-emerald-50/70 rounded-xl border border-emerald-200">
                    <label className="block text-xs font-bold text-emerald-900 mb-1">
                      Pencapaian / Realisasi ({targetUnit})
                    </label>
                    <input
                      type="number"
                      disabled={isReadOnly}
                      value={actualValue}
                      onChange={(e) => setActualValue(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder={targetValue !== '' ? `Target: ${targetValue}` : 'Masukkan angka realisasi...'}
                      className="w-full px-3 py-2 text-xs font-bold rounded-lg border border-emerald-300 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-100"
                    />
                  </div>
                )}

                {/* Catatan Realisasi */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Catatan Progress &amp; Hasil
                  </label>
                  <textarea
                    rows={3}
                    disabled={isReadOnly}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Tuliskan kendala, hasil tindak lanjut, atau catatan progress..."
                    className="w-full px-3 py-2 text-xs font-medium rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100"
                  />
                </div>

                {/* Upload Foto / Video / Dokumen Bukti */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-slate-700">
                      Lampiran Bukti (Foto / Video / Berkas)
                    </label>
                    {!isReadOnly && (
                      <label className="text-[11px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer">
                        <Upload size={13} />
                        <span>Upload File</span>
                        <input
                          type="file"
                          multiple
                          accept="image/*,video/*,.pdf,.doc,.docx"
                          onChange={handleFileUpload}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>

                  {attachments.length === 0 ? (
                    <div className="p-4 bg-slate-50 border border-dashed border-slate-300 rounded-xl text-center text-xs text-slate-400">
                      Belum ada lampiran file / foto bukti.
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {attachments.map(att => (
                        <div key={att.id} className="relative group bg-white border border-slate-200 rounded-xl p-2 flex flex-col justify-between overflow-hidden shadow-xs">
                          {att.type === 'image' ? (
                            <img src={att.url} alt={att.name} className="w-full h-20 object-cover rounded-lg mb-1" />
                          ) : (
                            <div className="w-full h-20 bg-slate-100 rounded-lg flex items-center justify-center text-slate-500 mb-1">
                              <FileText size={28} />
                            </div>
                          )}
                          <p className="text-[10px] font-semibold text-slate-700 truncate">{att.name}</p>

                          {!isReadOnly && (
                            <button
                              type="button"
                              onClick={() => handleRemoveAttachment(att.id)}
                              className="absolute top-1.5 right-1.5 p-1 bg-rose-600 text-white rounded-md opacity-90 hover:opacity-100 transition shadow"
                              title="Hapus lampiran"
                            >
                              <Trash2 size={11} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-5 py-3.5 bg-slate-50 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 rounded-xl hover:bg-slate-200 transition"
            >
              {isReadOnly ? 'Tutup' : 'Batal'}
            </button>

            {!isReadOnly && (
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition shadow-xs disabled:opacity-50"
              >
                {loading ? 'Menyimpan...' : mode === 'create' ? 'Simpan Tugas' : 'Perbarui Tugas'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

export default TalTaskModal;
