// components/tal/TalCardTaskView.tsx — porting src/components/tal/TalCardTaskView.tsx backup.
// Adaptasi WOORK:
// - PriorityPill/StatusPill dari ./TalPills (milik Grup 1).
// - useAuth/Firebase dihapus: data sudah session-scoped server-side; deteksi
//   "hanya ditugaskan ke diri sendiri" memakai isOnlySelfAssigned(task) yang
//   membandingkan dengan pembuat task (userId/userEmail/userName di task).
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  MoreVertical,
  Edit3,
  Trash2,
  Copy,
  Eye,
  CalendarPlus,
  Paperclip,
  Plus,
  CheckCircle2,
  Palmtree,
  CalendarOff,
  AlertTriangle,
  ArrowUpDown,
  GripVertical,
  ArrowUp,
  ArrowDown,
  Sparkles
} from 'lucide-react';
import type { TalTaskItem, TalPriority, TalStatus, TalTaskType } from '@/lib/tal/types';
import { PriorityPill, StatusPill } from './TalPills';
import { formatCurrencyIDR, isOnlySelfAssigned } from '@/lib/tal/date';

interface TalCardTaskViewProps {
  tasks: TalTaskItem[];
  type: TalTaskType;
  isPlanLocked: boolean;
  isReported: boolean;
  isMonthLocked?: boolean;
  isCuti?: boolean;
  cutiReason?: string;
  isHoliday?: boolean;
  holidayTitle?: string;
  isPlanning?: boolean;
  onOpenCutiModal?: () => void;
  onAddTask?: () => void;
  onApplyRoutineTemplate?: () => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onUpdatePriority: (id: string, priority: TalPriority) => void;
  onUpdateStatus: (id: string, status: TalStatus) => void;
  onViewDetail: (task: TalTaskItem) => void;
  onEditTask: (task: TalTaskItem, initialTab?: 'detail' | 'progress') => void;
  onDeleteTask: (id: string) => void;
  onDuplicateTask: (task: TalTaskItem) => void;
  onCopyTaskToDate: (task: TalTaskItem) => void;
  onAddAdditionalTask?: () => void;
  onOpenBlockerModal?: (task: TalTaskItem) => void;
  onReorderTasks?: (reorderedTasks: TalTaskItem[]) => void;
}

export const TalCardTaskView: React.FC<TalCardTaskViewProps> = ({
  tasks,
  type,
  isPlanLocked,
  isReported,
  isMonthLocked = false,
  isCuti = false,
  cutiReason = '',
  isHoliday = false,
  holidayTitle = '',
  isPlanning = false,
  onOpenCutiModal,
  onAddTask,
  onApplyRoutineTemplate,
  selectedIds,
  onToggleSelect,
  onUpdatePriority,
  onUpdateStatus,
  onViewDetail,
  onEditTask,
  onDeleteTask,
  onDuplicateTask,
  onCopyTaskToDate,
  onAddAdditionalTask,
  onOpenBlockerModal,
  onReorderTasks
}) => {
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  useEffect(() => {
    const checkTouch = () => {
      setIsTouchDevice(
        'ontouchstart' in window ||
        navigator.maxTouchPoints > 0 ||
        (window.matchMedia && window.matchMedia('(pointer: coarse)').matches)
      );
    };
    checkTouch();
    window.addEventListener('resize', checkTouch);
    return () => window.removeEventListener('resize', checkTouch);
  }, []);

  const [menuAnchor, setMenuAnchor] = useState<{
    taskId: string;
    top?: number;
    bottom?: number;
    right: number;
  } | null>(null);

  // Desktop Mouse Drag-and-drop state
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverTaskId, setDragOverTaskId] = useState<string | null>(null);
  const draggedTaskIdRef = useRef<string | null>(null);
  const dragOverTaskIdRef = useRef<string | null>(null);
  const isDraggingRef = useRef(false);

  // Close menu on scroll or resize
  useEffect(() => {
    if (!menuAnchor) return;
    const handleScrollOrResize = () => setMenuAnchor(null);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [menuAnchor]);

  const handleToggleMenu = (e: React.MouseEvent<HTMLButtonElement>, task: TalTaskItem) => {
    e.stopPropagation();
    if (menuAnchor && menuAnchor.taskId === task.id) {
      setMenuAnchor(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const menuEstimatedHeight = 280;
    const openUpward = spaceBelow < menuEstimatedHeight && rect.top > menuEstimatedHeight;

    setMenuAnchor({
      taskId: task.id,
      top: openUpward ? undefined : rect.bottom + 4,
      bottom: openUpward ? window.innerHeight - rect.top + 4 : undefined,
      right: Math.max(8, window.innerWidth - rect.right),
    });
  };

  const mainTasks = type === 'daily' ? tasks.filter(t => !t.isAdditional) : tasks;
  const additionalTasks = type === 'daily' ? tasks.filter(t => t.isAdditional) : [];

  // Reorder task move up/down (ideal for mobile / touch screens)
  const handleMoveTaskOrder = (taskId: string, direction: 'up' | 'down') => {
    const isAdditional = !!tasks.find(t => t.id === taskId)?.isAdditional;
    const currentList = isAdditional ? additionalTasks : mainTasks;
    const otherList = isAdditional ? mainTasks : additionalTasks;

    const idx = currentList.findIndex(t => t.id === taskId);
    if (idx === -1) return;

    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= currentList.length) return;

    const updatedList = [...currentList];
    const [moved] = updatedList.splice(idx, 1);
    updatedList.splice(targetIdx, 0, moved);

    const fullReordered = isAdditional
      ? [...otherList, ...updatedList]
      : [...updatedList, ...otherList];

    onReorderTasks?.(fullReordered);
  };

  const handleDrop = (targetTaskId: string, isAdditionalList: boolean, sourceIdOverride?: string | null) => {
    const sourceId = sourceIdOverride || draggedTaskIdRef.current || draggedTaskId;

    // Reset drag state immediately
    draggedTaskIdRef.current = null;
    dragOverTaskIdRef.current = null;
    isDraggingRef.current = false;
    setDraggedTaskId(null);
    setDragOverTaskId(null);

    if (!sourceId || sourceId === targetTaskId || !onReorderTasks) {
      return;
    }

    const currentList = isAdditionalList ? additionalTasks : mainTasks;
    const otherList = isAdditionalList ? mainTasks : additionalTasks;

    const sourceIndex = currentList.findIndex(t => t.id === sourceId);
    let targetIndex = currentList.findIndex(t => t.id === targetTaskId);

    if (sourceIndex === -1) {
      return;
    }

    const reorderedSublist = [...currentList];
    const [movedItem] = reorderedSublist.splice(sourceIndex, 1);

    if (targetTaskId === '__END__') {
      reorderedSublist.push(movedItem);
    } else {
      if (targetIndex === -1) return;
      reorderedSublist.splice(targetIndex, 0, movedItem);
    }

    const fullReordered = isAdditionalList
      ? [...otherList, ...reorderedSublist]
      : [...reorderedSublist, ...otherList];

    onReorderTasks(fullReordered);
  };

  const renderCard = (task: TalTaskItem, isAdditionalList: boolean) => {
    const isSelected = selectedIds.has(task.id);
    const isDone = task.status === 'done';
    const hideAssignee = isOnlySelfAssigned(task);
    const isBeingDragged = !isTouchDevice && draggedTaskId === task.id;
    const isDropTarget = !isTouchDevice && dragOverTaskId === task.id && draggedTaskId !== task.id;

    return (
      <div
        key={task.id}
        data-tal-card-id={task.id}
        draggable={!isTouchDevice && !isReported && !isMonthLocked}
        onDragStart={!isTouchDevice ? (e) => {
          if (isReported || isMonthLocked) return;
          isDraggingRef.current = true;
          draggedTaskIdRef.current = task.id;
          setDraggedTaskId(task.id);
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', task.id);
        } : undefined}
        onDragOver={!isTouchDevice ? (e) => {
          if (isReported || isMonthLocked) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          if (draggedTaskIdRef.current && draggedTaskIdRef.current !== task.id) {
            dragOverTaskIdRef.current = task.id;
            if (dragOverTaskId !== task.id) {
              setDragOverTaskId(task.id);
            }
          }
        } : undefined}
        onDragLeave={!isTouchDevice ? (e) => {
          if (e.currentTarget.contains(e.relatedTarget as Node)) return;
          if (dragOverTaskIdRef.current === task.id) {
            dragOverTaskIdRef.current = null;
            setDragOverTaskId(null);
          }
        } : undefined}
        onDrop={!isTouchDevice ? (e) => {
          e.preventDefault();
          e.stopPropagation();
          const sourceId = e.dataTransfer.getData('text/plain') || draggedTaskIdRef.current || draggedTaskId;
          handleDrop(task.id, isAdditionalList, sourceId);
        } : undefined}
        onDragEnd={!isTouchDevice ? () => {
          isDraggingRef.current = false;
          draggedTaskIdRef.current = null;
          dragOverTaskIdRef.current = null;
          setDraggedTaskId(null);
          setDragOverTaskId(null);
        } : undefined}
        onClick={() => {
          if (!isDraggingRef.current) {
            onViewDetail(task);
          }
        }}
        className={`bg-white rounded-xl border p-2.5 sm:p-3 shadow-xs hover:shadow-sm transition-all flex flex-col justify-between relative group min-w-0 overflow-hidden select-none ${
          !isTouchDevice ? 'cursor-grab active:cursor-grabbing' : ''
        } ${
          isBeingDragged
            ? 'opacity-30 scale-[0.98] border-blue-400 ring-2 ring-blue-300 ring-offset-1 bg-blue-50/40'
            : isDropTarget
              ? 'border-blue-500 ring-2 ring-blue-400/80 bg-blue-50/50 shadow-md -translate-y-0.5'
              : isSelected
                ? 'border-blue-500 bg-blue-50/20 ring-1 ring-blue-500'
                : 'border-slate-200/90 hover:border-slate-300'
        }`}
      >
          {/* Row 1: Drag handle (desktop only) + Checkbox + Title + 3 dots */}
          <div className="min-w-0">
            <div className="flex items-start justify-between gap-1.5">
              <div className="flex items-start gap-1 flex-1 min-w-0">
                {!isTouchDevice && !isReported && !isMonthLocked && (
                  <div
                    title="Geser untuk ubah urutan"
                    className="p-0.5 -ml-1 text-slate-300 hover:text-slate-600 active:text-blue-600 cursor-grab active:cursor-grabbing shrink-0"
                  >
                    <GripVertical size={14} />
                  </div>
                )}
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={(e) => {
                    e.stopPropagation();
                    onToggleSelect(task.id);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                  className="w-4 h-4 mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <h4
                    onClick={(e) => {
                      e.stopPropagation();
                      onViewDetail(task);
                    }}
                    className={`text-xs sm:text-sm font-bold truncate leading-tight cursor-pointer hover:text-blue-600 transition ${
                      isDone ? 'line-through text-slate-400' : 'text-slate-800'
                    }`}
                    title={task.title}
                  >
                    {task.title}
                  </h4>

                  {/* Sub info */}
                  <div className="flex items-center gap-1 flex-wrap mt-1">
                    {task.category === 'result' ? (
                      <span className="text-[9px] bg-amber-50 text-amber-700 border border-amber-200 px-1 py-0.2 rounded font-bold shrink-0">
                        Result
                      </span>
                    ) : (
                      <span className="text-[9px] bg-slate-100 text-slate-600 px-1 py-0.2 rounded font-medium shrink-0">
                        Non Result
                      </span>
                    )}

                    {task.category === 'result' && task.targetValue !== undefined && (
                      <span className="text-[10px] text-slate-600 font-semibold truncate max-w-[110px]">
                        {task.targetUnit === 'Rupiah' ? formatCurrencyIDR(task.targetValue) : `${task.targetValue} ${task.targetUnit || ''}`}
                      </span>
                    )}

                    {task.parentTitle && (
                      <span className="text-[9px] text-indigo-700 bg-indigo-50 border border-indigo-200 px-1 py-0.2 rounded font-medium truncate max-w-[90px]" title={task.parentTitle}>
                        {task.parentTitle}
                      </span>
                    )}

                    {task.attachments && task.attachments.length > 0 && (
                      <span className="flex items-center gap-0.5 text-[10px] text-slate-400 shrink-0">
                        <Paperclip size={10} />
                        {task.attachments.length}
                      </span>
                    )}

                    {task.originalTaskId && (
                      <span className="text-[9px] bg-sky-50 text-sky-700 border border-sky-200 px-1 py-0.2 rounded font-semibold shrink-0" title="Tugas Tambahan hasil Alih Tugas (Rollover)">
                        Alih Tugas
                      </span>
                    )}

                    {task.isRolledOver && task.rolloverAction === 'cancelled' && (
                      <span className="text-[9px] bg-rose-50 text-rose-700 border border-rose-200 px-1 py-0.2 rounded font-semibold shrink-0" title={`Dibatalkan: ${task.cancelNotes || '-'}`}>
                        Dibatalkan
                      </span>
                    )}

                    {task.isRolledOver && (task.rolloverAction === 'rollover_tomorrow' || task.rolloverAction === 'rollover_date') && (
                      <span className="text-[9px] bg-indigo-50 text-indigo-700 border border-indigo-200 px-1 py-0.2 rounded font-semibold shrink-0" title={`Dialihkan ke ${task.rolloverTargetDate || 'besok'}`}>
                        Dialihkan
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* 3 dots menu button */}
              <div className="shrink-0" onClick={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={(e) => handleToggleMenu(e, task)}
                  onTouchStart={(e) => e.stopPropagation()}
                  className={`p-1 rounded-lg transition cursor-pointer ${
                    menuAnchor?.taskId === task.id
                      ? 'bg-blue-50 text-blue-600'
                      : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                  }`}
                  title="Menu Aksi"
                >
                  <MoreVertical size={15} />
                </button>
              </div>
            </div>

            {/* Description */}
            {task.description && (
              <p className="text-[11px] text-slate-500 mt-1.5 line-clamp-2">
                {task.description}
              </p>
            )}

            {/* Blocker Alert Box if Pending */}
            {task.status === 'pending' && (
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenBlockerModal?.(task);
                }}
                onTouchStart={(e) => e.stopPropagation()}
                className={`mt-2 p-2 border rounded-xl flex flex-col gap-0.5 cursor-pointer transition shadow-2xs group/blocker ${
                  isReported || isMonthLocked
                    ? 'bg-amber-50/70 border-amber-200/80 text-amber-950 hover:bg-amber-100/60'
                    : 'bg-amber-50/90 hover:bg-amber-100/80 border-amber-300/80 text-amber-950'
                }`}
                title={isReported || isMonthLocked ? "Lihat rincian kendala blocker (Read Only - Tugas Sudah Dilaporkan/Terkunci)" : "Klik untuk melihat atau mengubah kendala blocker"}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="flex items-center gap-1 text-[10px] font-bold text-amber-900">
                    <AlertTriangle size={12} className="text-amber-600 shrink-0" />
                    Blocker: {task.blockerCategory || 'Kendala Tugas'}
                  </span>
                  <span className={`text-[9px] underline opacity-0 group-hover/blocker:opacity-100 transition ${isReported || isMonthLocked ? 'text-slate-500' : 'text-amber-700'}`}>
                    {isReported || isMonthLocked ? 'Lihat' : 'Edit'}
                  </span>
                </div>
                {task.blockerDescription ? (
                  <p className="text-[10.5px] text-amber-950/90 line-clamp-2 leading-tight mt-0.5 font-medium">
                    {task.blockerDescription}
                  </p>
                ) : (
                  <p className="text-[10px] text-amber-700 italic">
                    {isReported || isMonthLocked ? 'Tidak ada rincian kendala' : 'Klik untuk melengkapi catatan kendala'}
                  </p>
                )}
              </div>
            )}

            {/* Assigned to (Hidden if only assigned to self) */}
            {!hideAssignee && (
              task.assignedUsers && task.assignedUsers.length > 0 ? (
                <div className="flex items-center gap-1.5 mt-2 min-w-0">
                  <div className="flex -space-x-1.5 overflow-hidden shrink-0">
                    {task.assignedUsers.slice(0, 3).map((u, i) => (
                      <div
                        key={i}
                        className="w-[18px] h-[18px] rounded-full ring-1 ring-white bg-gradient-to-tr from-blue-500 to-indigo-600 text-white flex items-center justify-center text-[8.5px] font-bold overflow-hidden"
                        title={u.name}
                      >
                        {u.fotoProfile ? (
                          <img src={u.fotoProfile} alt={u.name} className="w-full h-full object-cover" />
                        ) : (
                          u.name.charAt(0).toUpperCase()
                        )}
                      </div>
                    ))}
                  </div>
                  <span className="text-[10px] text-slate-500 font-medium truncate">
                    {task.assignedUsers.map(u => u.name).join(', ')}
                  </span>
                </div>
              ) : task.assignedTo && task.assignedTo.length > 0 ? (
                <div className="flex items-center gap-1 mt-1.5 min-w-0">
                  <div className="w-4 h-4 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-[8px] font-bold shrink-0">
                    {task.assignedTo[0].charAt(0).toUpperCase()}
                  </div>
                  <span className="text-[10px] text-slate-500 font-medium truncate">
                    {task.assignedTo.join(', ')}
                  </span>
                </div>
              ) : null
            )}
          </div>

          {/* Row 2: Bottom metadata & pills */}
          <div
            className="flex items-center justify-between gap-1.5 mt-2.5 pt-2 border-t border-slate-100 flex-wrap min-w-0"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            <PriorityPill
              priority={task.priority}
              onChange={(p) => onUpdatePriority(task.id, p)}
              disabled={isPlanLocked || isReported || isMonthLocked}
            />

            <StatusPill
              status={task.status}
              onChange={(s) => onUpdateStatus(task.id, s)}
              disabled={isReported || isMonthLocked}
            />
          </div>
        </div>
    );
  };

  return (
    <div className="space-y-4 min-w-0">
      {/* Tugas Utama Grid */}
      {mainTasks.length === 0 && additionalTasks.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200/80 p-10 text-center text-slate-500 text-xs">
          {isCuti ? (
            <div className="flex flex-col items-center justify-center max-w-md mx-auto p-4 bg-amber-50/80 rounded-2xl border border-amber-200 text-amber-900 animate-in fade-in duration-200">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 flex items-center justify-center text-amber-600 mb-2.5 shadow-xs">
                <Palmtree size={24} />
              </div>
              <h4 className="text-sm font-bold text-amber-900 mb-0.5">Selamat Berlibur!</h4>
              <p className="text-xs text-amber-700/90 mb-3">
                Karyawan sedang cuti / izin pada tanggal ini{cutiReason ? `: "${cutiReason}"` : '.'} Tidak ada penugasan tugas harian.
              </p>
              {onOpenCutiModal && !isReported && (
                <button
                  type="button"
                  onClick={onOpenCutiModal}
                  className="px-3.5 py-1.5 text-xs font-semibold text-amber-800 bg-white hover:bg-amber-100 border border-amber-300 rounded-xl transition shadow-2xs cursor-pointer"
                >
                  Kelola Status Cuti
                </button>
              )}
            </div>
          ) : isHoliday ? (
            <div className="flex flex-col items-center justify-center max-w-md mx-auto p-4 bg-rose-50/80 rounded-2xl border border-rose-200 text-rose-900 animate-in fade-in duration-200">
              <div className="w-12 h-12 rounded-2xl bg-rose-100 flex items-center justify-center text-rose-600 mb-2.5 shadow-xs">
                <CalendarOff size={24} />
              </div>
              <h4 className="text-sm font-bold text-rose-900 mb-0.5">
                {holidayTitle || 'Hari Libur'}
              </h4>
              <p className="text-xs text-rose-700/90">
                Hari ini bukan hari kerja (semua karyawan libur). Tidak dapat menambahkan tugas kerja pada hari libur.
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center max-w-md mx-auto">
              <p className="text-xs mb-3">
                {isMonthLocked ? (
                  <span className="text-rose-600 font-semibold">
                    Bulan ini telah dikunci oleh sistem (Sistem Terkunci). Seluruh data TAL bersifat read-only.
                  </span>
                ) : (
                  <>Belum ada tugas untuk periode ini. Klik <b>Tugas</b> untuk menambahkan tugas baru.</>
                )}
              </p>
              {isPlanning && !isReported && !isMonthLocked && (
                <div className="flex items-center gap-2 flex-wrap justify-center">
                  {onApplyRoutineTemplate && (
                    <button
                      type="button"
                      onClick={onApplyRoutineTemplate}
                      className="px-3 py-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
                    >
                      <Sparkles size={13} className="text-amber-500" />
                      <span>Terapkan Template Rutinitas</span>
                    </button>
                  )}
                  {type === 'daily' && onOpenCutiModal && (
                    <button
                      type="button"
                      onClick={onOpenCutiModal}
                      className="px-3 py-1.5 text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <Palmtree size={13} />
                      <span>Cuti</span>
                    </button>
                  )}
                  {onAddTask && (
                    <button
                      type="button"
                      onClick={onAddTask}
                      className="px-3.5 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition shadow-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <Plus size={13} />
                      <span>Tambah Tugas</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 min-[440px]:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2.5 sm:gap-3">
          {mainTasks.map(t => renderCard(t, false))}
          {draggedTaskId && !tasks.find(t => t.id === draggedTaskId)?.isAdditional && (
            <div
              data-tal-drop-end="true"
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                dragOverTaskIdRef.current = '__END__';
                if (dragOverTaskId !== '__END__') setDragOverTaskId('__END__');
              }}
              onDragLeave={() => {
                if (dragOverTaskIdRef.current === '__END__') {
                  dragOverTaskIdRef.current = null;
                  setDragOverTaskId(null);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const sourceId = e.dataTransfer.getData('text/plain') || draggedTaskIdRef.current || draggedTaskId;
                handleDrop('__END__', false, sourceId);
              }}
              className={`rounded-xl border-2 border-dashed p-4 min-h-[90px] flex flex-col items-center justify-center text-center gap-1.5 transition-all cursor-pointer ${
                dragOverTaskId === '__END__'
                  ? 'border-blue-500 bg-blue-100/70 text-blue-700 shadow-sm'
                  : 'border-blue-300 bg-blue-50/40 text-blue-600'
              }`}
            >
              <ArrowUpDown size={15} />
              <span className="text-xs font-semibold">Pindahkan ke urutan paling akhir</span>
            </div>
          )}
        </div>
      )}

      {/* Tugas Tambahan Grid (Daily only) */}
      {type === 'daily' && additionalTasks.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-slate-200/70">
          <div className="flex items-center justify-between px-1">
            <h5 className="text-xs font-bold text-amber-800 uppercase tracking-wider flex items-center gap-1.5">
              <span>Tugas Tambahan ({additionalTasks.length})</span>
            </h5>
            {onAddAdditionalTask && !isReported && (
              <button
                type="button"
                onClick={onAddAdditionalTask}
                className="text-[11px] text-amber-800 font-bold hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Plus size={12} /> Tugas Tambahan
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 min-[440px]:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2.5 sm:gap-3">
            {additionalTasks.map(t => renderCard(t, true))}
            {draggedTaskId && tasks.find(t => t.id === draggedTaskId)?.isAdditional && (
              <div
                data-tal-drop-end="true"
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  dragOverTaskIdRef.current = '__END__';
                  if (dragOverTaskId !== '__END__') setDragOverTaskId('__END__');
                }}
                onDragLeave={() => {
                  if (dragOverTaskIdRef.current === '__END__') {
                    dragOverTaskIdRef.current = null;
                    setDragOverTaskId(null);
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const sourceId = e.dataTransfer.getData('text/plain') || draggedTaskIdRef.current || draggedTaskId;
                  handleDrop('__END__', true, sourceId);
                }}
                className={`rounded-xl border-2 border-dashed p-4 min-h-[90px] flex flex-col items-center justify-center text-center gap-1.5 transition-all cursor-pointer ${
                  dragOverTaskId === '__END__'
                    ? 'border-amber-500 bg-amber-100/70 text-amber-800 shadow-sm'
                    : 'border-amber-300 bg-amber-50/40 text-amber-700'
                }`}
              >
                <ArrowUpDown size={15} />
                <span className="text-xs font-semibold">Pindahkan ke urutan paling akhir</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Floating 3-Dots Action Menu rendered via React Portal directly into body */}
      {menuAnchor && (() => {
        const activeTask = tasks.find(t => t.id === menuAnchor.taskId);
        if (!activeTask) return null;

        return createPortal(
          <>
            <div
              className="fixed inset-0 z-[9998] bg-transparent"
              onClick={(e) => {
                e.stopPropagation();
                setMenuAnchor(null);
              }}
            />
            <div
              style={{
                top: menuAnchor.top !== undefined ? `${menuAnchor.top}px` : undefined,
                bottom: menuAnchor.bottom !== undefined ? `${menuAnchor.bottom}px` : undefined,
                right: `${menuAnchor.right}px`
              }}
              className="fixed z-[9999] bg-white rounded-xl shadow-2xl border border-slate-200 py-1.5 w-48 text-left animate-in fade-in zoom-in-95 duration-100 select-none"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => {
                  onViewDetail(activeTask);
                  setMenuAnchor(null);
                }}
                className="w-full px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 transition cursor-pointer"
              >
                <Eye size={14} className="text-slate-400 shrink-0" />
                <span>Lihat Detail</span>
              </button>

              {(!isPlanLocked || activeTask.isAdditional) && !isReported && !isMonthLocked && (
                <button
                  type="button"
                  onClick={() => {
                    onEditTask(activeTask, 'detail');
                    setMenuAnchor(null);
                  }}
                  className="w-full px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 transition cursor-pointer"
                >
                  <Edit3 size={14} className="text-blue-500 shrink-0" />
                  <span>Edit Tugas</span>
                </button>
              )}

              {isPlanLocked && !isReported && !isMonthLocked && (
                <button
                  type="button"
                  onClick={() => {
                    onEditTask(activeTask, 'progress');
                    setMenuAnchor(null);
                  }}
                  className="w-full px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 transition cursor-pointer"
                >
                  <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                  <span>Update Realisasi</span>
                </button>
              )}

              {!isPlanLocked && !isReported && !isMonthLocked && !isHoliday && !isCuti && (
                <button
                  type="button"
                  onClick={() => {
                    onDuplicateTask(activeTask);
                    setMenuAnchor(null);
                  }}
                  className="w-full px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 transition cursor-pointer"
                >
                  <Copy size={14} className="text-slate-400 shrink-0" />
                  <span>Duplikat</span>
                </button>
              )}

              {!isMonthLocked && (
                <button
                  type="button"
                  onClick={() => {
                    onCopyTaskToDate(activeTask);
                    setMenuAnchor(null);
                  }}
                  className="w-full px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 transition cursor-pointer"
                >
                  <CalendarPlus size={14} className="text-indigo-500 shrink-0" />
                  <span>
                    {type === 'daily' ? 'Salin ke Tanggal...' : type === 'weekly' ? 'Salin ke Week...' : 'Salin ke Bulan...'}
                  </span>
                </button>
              )}

              {/* Reorder Up / Down (Very convenient on touch/mobile) */}
              {!isReported && !isMonthLocked && onReorderTasks && (
                <>
                  <div className="my-1 border-t border-slate-100" />
                  <button
                    type="button"
                    onClick={() => {
                      handleMoveTaskOrder(activeTask.id, 'up');
                      setMenuAnchor(null);
                    }}
                    disabled={
                      (activeTask.isAdditional ? additionalTasks : mainTasks).findIndex(t => t.id === activeTask.id) === 0
                    }
                    className="w-full px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 transition cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed"
                  >
                    <ArrowUp size={14} className="text-blue-500 shrink-0" />
                    <span>Pindahkan ke Atas</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleMoveTaskOrder(activeTask.id, 'down');
                      setMenuAnchor(null);
                    }}
                    disabled={
                      (activeTask.isAdditional ? additionalTasks : mainTasks).findIndex(t => t.id === activeTask.id) ===
                      (activeTask.isAdditional ? additionalTasks : mainTasks).length - 1
                    }
                    className="w-full px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 transition cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed"
                  >
                    <ArrowDown size={14} className="text-blue-500 shrink-0" />
                    <span>Pindahkan ke Bawah</span>
                  </button>
                </>
              )}

              {(!isPlanLocked || activeTask.isAdditional) && !isReported && !isMonthLocked && (
                <>
                  <div className="my-1 border-t border-slate-100" />
                  <button
                    type="button"
                    onClick={() => {
                      onDeleteTask(activeTask.id);
                      setMenuAnchor(null);
                    }}
                    className="w-full px-3.5 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 flex items-center gap-2.5 transition cursor-pointer"
                  >
                    <Trash2 size={14} className="text-rose-500 shrink-0" />
                    <span>Hapus Tugas</span>
                  </button>
                </>
              )}
            </div>
          </>,
          document.body
        );
      })()}
    </div>
  );
};

export default TalCardTaskView;
