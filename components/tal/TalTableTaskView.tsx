// components/tal/TalTableTaskView.tsx — porting src/components/tal/TalTableTaskView.tsx backup.
// Adaptasi WOORK: sama seperti TalCardTaskView (TalPills dari Grup 1, tanpa useAuth).
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Clock,
  MoreVertical,
  Edit3,
  Trash2,
  Copy,
  Eye,
  CalendarPlus,
  Paperclip,
  CheckCircle2,
  Plus,
  Palmtree,
  CalendarOff,
  AlertTriangle,
  Sparkles,
  ArrowUpDown
} from 'lucide-react';
import type { TalTaskItem, TalPriority, TalStatus, TalTaskType } from '@/lib/tal/types';
import { PriorityPill, StatusPill } from './TalPills';
import { formatCurrencyIDR, isOnlySelfAssigned } from '@/lib/tal/date';

interface TalTableTaskViewProps {
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
  onSelectAll: (tasks: TalTaskItem[]) => void;
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

export const TalTableTaskView: React.FC<TalTableTaskViewProps> = ({
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
  onSelectAll,
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
  const [menuAnchor, setMenuAnchor] = useState<{
    taskId: string;
    top?: number;
    bottom?: number;
    right: number;
  } | null>(null);

  // Drag-and-drop state
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverTaskId, setDragOverTaskId] = useState<string | null>(null);
  const draggedTaskIdRef = useRef<string | null>(null);
  const dragOverTaskIdRef = useRef<string | null>(null);
  const isDraggingRef = useRef(false);

  // Touch tracking for mobile
  const touchStartRef = useRef<{ x: number; y: number; time: number; taskId: string } | null>(null);
  const isTouchDraggingRef = useRef(false);

  // Close menu on window scroll or resize
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
    const menuEstimatedHeight = 240;
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

  const handleDrop = (targetTaskId: string, isAdditionalList: boolean, sourceIdOverride?: string | null) => {
    const sourceId = sourceIdOverride || draggedTaskIdRef.current || draggedTaskId;

    // Reset drag state immediately so next drag is ready right away
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

  // Touch handlers for mobile
  const handleTouchStart = (e: React.TouchEvent, task: TalTaskItem) => {
    if (isReported) return;
    const touch = e.touches[0];
    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
      taskId: task.id
    };
    isTouchDraggingRef.current = false;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const touch = e.touches[0];
    const deltaX = Math.abs(touch.clientX - touchStartRef.current.x);
    const deltaY = Math.abs(touch.clientY - touchStartRef.current.y);

    if (deltaX > 6 || deltaY > 6 || isTouchDraggingRef.current) {
      if (!isTouchDraggingRef.current) {
        isTouchDraggingRef.current = true;
        isDraggingRef.current = true;
        draggedTaskIdRef.current = touchStartRef.current.taskId;
        setDraggedTaskId(touchStartRef.current.taskId);
      }

      const elem = document.elementFromPoint(touch.clientX, touch.clientY);
      const endElem = elem?.closest('[data-tal-drop-end]');
      const rowElem = elem?.closest('[data-tal-row-id]');

      if (endElem) {
        if (dragOverTaskIdRef.current !== '__END__') {
          dragOverTaskIdRef.current = '__END__';
          setDragOverTaskId('__END__');
        }
      } else if (rowElem) {
        const targetId = rowElem.getAttribute('data-tal-row-id');
        if (targetId && targetId !== touchStartRef.current.taskId) {
          if (dragOverTaskIdRef.current !== targetId) {
            dragOverTaskIdRef.current = targetId;
            setDragOverTaskId(targetId);
          }
        } else {
          if (dragOverTaskIdRef.current) {
            dragOverTaskIdRef.current = null;
            setDragOverTaskId(null);
          }
        }
      } else {
        if (dragOverTaskIdRef.current) {
          dragOverTaskIdRef.current = null;
          setDragOverTaskId(null);
        }
      }
    }
  };

  const handleTouchEnd = (isAdditionalList: boolean) => {
    const targetDropId = dragOverTaskIdRef.current || dragOverTaskId;
    const sourceTaskId = touchStartRef.current?.taskId;
    if (isTouchDraggingRef.current && targetDropId) {
      handleDrop(targetDropId, isAdditionalList, sourceTaskId);
    }
    touchStartRef.current = null;
    isTouchDraggingRef.current = false;
    draggedTaskIdRef.current = null;
    dragOverTaskIdRef.current = null;
    isDraggingRef.current = false;
    setDraggedTaskId(null);
    setDragOverTaskId(null);
  };

  const renderTaskRow = (task: TalTaskItem, index: number, isAdditionalList: boolean) => {
    const isSelected = selectedIds.has(task.id);
    const isDone = task.status === 'done';
    const hideAssignee = isOnlySelfAssigned(task);
    const isBeingDragged = draggedTaskId === task.id;
    const isDropTarget = dragOverTaskId === task.id && draggedTaskId !== task.id;

    return (
      <tr
        key={task.id}
        data-tal-row-id={task.id}
        onDragOver={(e) => {
          if (isReported) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          if (draggedTaskIdRef.current && draggedTaskIdRef.current !== task.id) {
            dragOverTaskIdRef.current = task.id;
            if (dragOverTaskId !== task.id) {
              setDragOverTaskId(task.id);
            }
          }
        }}
        onDragLeave={(e) => {
          if (e.currentTarget.contains(e.relatedTarget as Node)) return;
          if (dragOverTaskIdRef.current === task.id) {
            dragOverTaskIdRef.current = null;
            setDragOverTaskId(null);
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const sourceId = e.dataTransfer.getData('text/plain') || draggedTaskIdRef.current || draggedTaskId;
          handleDrop(task.id, isAdditionalList, sourceId);
        }}
        onDragEnd={() => {
          isDraggingRef.current = false;
          draggedTaskIdRef.current = null;
          dragOverTaskIdRef.current = null;
          setDraggedTaskId(null);
          setDragOverTaskId(null);
        }}
        className={`hover:bg-slate-50/80 transition-colors border-b border-slate-100 text-xs ${
          isBeingDragged
            ? 'opacity-30 bg-blue-50/50 border-blue-300'
            : isDropTarget
              ? 'border-t-4 border-t-blue-500 bg-blue-50/80'
              : isSelected
                ? 'bg-blue-50/50'
                : ''
        }`}
      >
          {/* Checkbox */}
          <td className="py-2.5 px-3 text-center w-10">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => onToggleSelect(task.id)}
              className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
            />
          </td>

          {/* No (Swaps to Drag Icon on Hover) */}
          <td
            draggable={!isReported}
            onDragStart={(e) => {
              if (isReported) return;
              isDraggingRef.current = true;
              draggedTaskIdRef.current = task.id;
              setDraggedTaskId(task.id);
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', task.id);
            }}
            onDragEnd={() => {
              isDraggingRef.current = false;
              draggedTaskIdRef.current = null;
              dragOverTaskIdRef.current = null;
              setDraggedTaskId(null);
              setDragOverTaskId(null);
            }}
            onTouchStart={(e) => handleTouchStart(e, task)}
            onTouchMove={(e) => handleTouchMove(e)}
            onTouchEnd={() => handleTouchEnd(isAdditionalList)}
            onTouchCancel={() => {
              touchStartRef.current = null;
              isTouchDraggingRef.current = false;
              draggedTaskIdRef.current = null;
              dragOverTaskIdRef.current = null;
              isDraggingRef.current = false;
              setDraggedTaskId(null);
              setDragOverTaskId(null);
            }}
            className="py-2.5 px-2 text-center w-10 group/no cursor-grab active:cursor-grabbing select-none touch-none"
            title="Tahan & geser untuk memindahkan urutan tugas"
          >
            <div className="flex items-center justify-center min-h-[20px]">
              <span className="group-hover/no:hidden text-slate-400 font-medium">
                {index + 1}
              </span>
              <span className="hidden group-hover/no:flex items-center justify-center text-blue-600 bg-blue-50 p-1 rounded hover:bg-blue-100 transition shadow-2xs">
                <ArrowUpDown size={14} className="stroke-[2.5]" />
              </span>
            </div>
          </td>

          {/* Jam (Only in daily) */}
          {type === 'daily' && (
            <td className="py-2.5 px-3 font-semibold text-slate-700 whitespace-nowrap w-24">
              {task.time ? (
                <span className="flex items-center gap-1 text-slate-700">
                  <span>{task.time}</span>
                  <Clock size={12} className="text-slate-400 shrink-0" />
                </span>
              ) : (
                <span className="text-slate-300">-</span>
              )}
            </td>
          )}

          {/* Judul Task & Details */}
          <td className="py-2.5 px-3">
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  onClick={() => onViewDetail(task)}
                  className={`font-semibold cursor-pointer hover:text-blue-600 transition ${
                    isDone ? 'line-through text-slate-400' : 'text-slate-800'
                  }`}
                >
                  {task.title}
                </span>

                {/* Category tag */}
                {task.category === 'result' ? (
                  <span className="text-[9px] bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.2 rounded font-bold">
                    Result
                  </span>
                ) : (
                  <span className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded font-medium">
                    Non Result
                  </span>
                )}

                {/* Target / Realization */}
                {task.category === 'result' && task.targetValue !== undefined && (
                  <span className="text-[10px] text-slate-600 font-semibold bg-slate-100 px-1.5 py-0.2 rounded">
                    Target: {task.targetUnit === 'Rupiah' ? formatCurrencyIDR(task.targetValue) : `${task.targetValue} ${task.targetUnit || ''}`}
                    {task.actualValue !== undefined && ` • Realisasi: ${task.targetUnit === 'Rupiah' ? formatCurrencyIDR(task.actualValue) : `${task.actualValue} ${task.targetUnit || ''}`}`}
                  </span>
                )}

                {/* Parent Task Badge */}
                {task.parentTitle && (
                  <span className="text-[9px] bg-indigo-50 text-indigo-700 border border-indigo-200 px-1.5 py-0.2 rounded font-medium truncate max-w-[140px]" title={task.parentTitle}>
                    Parent: {task.parentTitle}
                  </span>
                )}

                {/* Attachments */}
                {task.attachments && task.attachments.length > 0 && (
                  <span className="flex items-center gap-0.5 text-[10px] text-slate-500 font-medium">
                    <Paperclip size={10} />
                    {task.attachments.length}
                  </span>
                )}

                {/* Rollover Tags */}
                {task.originalTaskId && (
                  <span className="text-[9px] bg-sky-50 text-sky-700 border border-sky-200 px-1.5 py-0.2 rounded font-semibold shrink-0" title="Tugas Tambahan hasil Alih Tugas (Rollover)">
                    Alih Tugas
                  </span>
                )}

                {task.isRolledOver && task.rolloverAction === 'cancelled' && (
                  <span className="text-[9px] bg-rose-50 text-rose-700 border border-rose-200 px-1.5 py-0.2 rounded font-semibold shrink-0" title={`Dibatalkan: ${task.cancelNotes || '-'}`}>
                    Dibatalkan
                  </span>
                )}

                {task.isRolledOver && (task.rolloverAction === 'rollover_tomorrow' || task.rolloverAction === 'rollover_date') && (
                  <span className="text-[9px] bg-indigo-50 text-indigo-700 border border-indigo-200 px-1.5 py-0.2 rounded font-semibold shrink-0" title={`Dialihkan ke ${task.rolloverTargetDate || 'besok'}`}>
                    Dialihkan
                  </span>
                )}
              </div>

              {/* Blocker Alert Banner in Table */}
              {task.status === 'pending' && (
                <div
                  onClick={() => onOpenBlockerModal?.(task)}
                  className={`mt-1.5 p-1.5 border rounded-lg flex items-center justify-between gap-2 cursor-pointer transition shadow-2xs group/tblblocker max-w-xl ${
                    isReported || isMonthLocked
                      ? 'bg-amber-50/70 border-amber-200/80 text-amber-950 hover:bg-amber-100/60'
                      : 'bg-amber-50/90 hover:bg-amber-100/80 border-amber-300/80 text-amber-950'
                  }`}
                  title={isReported || isMonthLocked ? "Lihat rincian kendala blocker (Read Only - Tugas Sudah Dilaporkan/Terkunci)" : "Klik untuk melihat atau mengubah kendala blocker"}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <AlertTriangle size={12} className="text-amber-600 shrink-0" />
                    <span className="text-[10px] font-bold text-amber-900 shrink-0">
                      Blocker ({task.blockerCategory || 'Kendala'}):
                    </span>
                    <span className="text-[10.5px] text-amber-950/90 truncate font-medium">
                      {task.blockerDescription || (isReported || isMonthLocked ? 'Tidak ada catatan rincian kendala' : 'Klik untuk melengkapi catatan')}
                    </span>
                  </div>
                  <span className={`text-[9px] underline shrink-0 opacity-0 group-hover/tblblocker:opacity-100 transition ${isReported || isMonthLocked ? 'text-slate-500' : 'text-amber-700'}`}>
                    {isReported || isMonthLocked ? 'Lihat' : 'Edit'}
                  </span>
                </div>
              )}

              {/* Description note if any */}
              {task.description && (
                <p className="text-[11px] text-slate-400 truncate max-w-lg mt-0.5">
                  {task.description}
                </p>
              )}
            </div>
          </td>

          {/* Priority */}
          <td className="py-2.5 px-3 whitespace-nowrap text-center w-28">
            <PriorityPill
              priority={task.priority}
              onChange={(p) => onUpdatePriority(task.id, p)}
              disabled={isPlanLocked || isReported || isMonthLocked}
            />
          </td>

          {/* Status */}
          <td className="py-2.5 px-3 whitespace-nowrap text-center w-36">
            <StatusPill
              status={task.status}
              onChange={(s) => onUpdateStatus(task.id, s)}
              disabled={isReported || isMonthLocked}
            />
          </td>

          {/* Tugaskan Ke (Dedicated Column - Hidden if only self) */}
          <td className="py-2.5 px-3 text-slate-700 text-xs w-40">
            {!hideAssignee && (
              task.assignedUsers && task.assignedUsers.length > 0 ? (
                <div className="flex items-center gap-1.5 flex-wrap" title={task.assignedUsers.map(u => u.name).join(', ')}>
                  <div className="flex -space-x-1.5 overflow-hidden shrink-0">
                    {task.assignedUsers.slice(0, 3).map((u, i) => (
                      <div
                        key={i}
                        className="w-5 h-5 rounded-full ring-1 ring-white bg-gradient-to-tr from-blue-500 to-indigo-600 text-white flex items-center justify-center text-[9px] font-bold overflow-hidden"
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
                  <span className="text-[11px] font-medium text-slate-700 truncate max-w-[90px]">
                    {task.assignedUsers.map(u => u.name).join(', ')}
                  </span>
                </div>
              ) : task.assignedTo && task.assignedTo.length > 0 ? (
                <div className="flex items-center gap-1.5" title={task.assignedTo.join(', ')}>
                  <div className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-[9px] font-bold shrink-0">
                    {task.assignedTo[0].charAt(0).toUpperCase()}
                  </div>
                  <span className="text-[11px] font-medium text-slate-700 truncate max-w-[90px]">
                    {task.assignedTo.join(', ')}
                  </span>
                </div>
              ) : (
                <span className="text-slate-300 text-[11px]">-</span>
              )
            )}
            {hideAssignee && (
              <span className="text-slate-300 text-[11px]">-</span>
            )}
          </td>

          {/* Aksi (3 dots) */}
          <td className="py-2.5 px-3 text-center whitespace-nowrap w-12">
            <button
              type="button"
              onClick={(e) => handleToggleMenu(e, task)}
              className={`p-1.5 rounded-lg transition cursor-pointer ${
                menuAnchor?.taskId === task.id
                  ? 'bg-blue-50 text-blue-600'
                  : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
              }`}
              title="Menu Aksi"
            >
              <MoreVertical size={16} />
            </button>
          </td>
        </tr>
    );
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
              <th className="py-2.5 px-3 text-center w-10">
                <input
                  type="checkbox"
                  checked={tasks.length > 0 && tasks.every(t => selectedIds.has(t.id))}
                  onChange={() => onSelectAll(tasks)}
                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
              </th>
              <th className="py-2.5 px-2 text-center w-10">No</th>
              {type === 'daily' && <th className="py-2.5 px-3 w-24">Jam</th>}
              <th className="py-2.5 px-3">Judul Task</th>
              <th className="py-2.5 px-3 text-center w-28">Priority</th>
              <th className="py-2.5 px-3 text-center w-36">Status</th>
              <th className="py-2.5 px-3 w-36">Tugaskan Ke</th>
              <th className="py-2.5 px-3 text-center w-12">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {/* Tugas Utama Section */}
            {mainTasks.length === 0 && additionalTasks.length === 0 ? (
              <tr>
                <td colSpan={type === 'daily' ? 8 : 7} className="py-10 px-4 text-center">
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
                          className="px-3.5 py-1.5 text-xs font-semibold text-amber-800 bg-white hover:bg-amber-100 border border-amber-300 rounded-xl transition shadow-2xs"
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
                    <div className="flex flex-col items-center justify-center max-w-md mx-auto text-slate-500">
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
                </td>
              </tr>
            ) : (
              <>
                {mainTasks.map((t, idx) => renderTaskRow(t, idx, false))}
                {draggedTaskId && !tasks.find(t => t.id === draggedTaskId)?.isAdditional && (
                  <tr
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
                    className={`transition-colors border-2 border-dashed ${
                      dragOverTaskId === '__END__'
                        ? 'border-blue-500 bg-blue-100/70 text-blue-700'
                        : 'border-blue-300 bg-blue-50/40 text-blue-600'
                    }`}
                  >
                    <td colSpan={type === 'daily' ? 8 : 7} className="py-2 px-3 text-center text-xs font-semibold">
                      <div className="flex items-center justify-center gap-1.5">
                        <ArrowUpDown size={13} />
                        <span>Pindahkan ke urutan paling bawah</span>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            )}

            {/* Tugas Tambahan Section (Daily only) */}
            {type === 'daily' && additionalTasks.length > 0 && (
              <>
                <tr className="bg-amber-50/60 border-y border-amber-200/70">
                  <td colSpan={8} className="py-1.5 px-4 text-xs font-bold text-amber-800">
                    <span className="flex items-center justify-between">
                      <span>Tugas Tambahan ({additionalTasks.length})</span>
                      {onAddAdditionalTask && !isReported && (
                        <button
                          type="button"
                          onClick={onAddAdditionalTask}
                          className="text-[11px] text-amber-900 font-bold hover:underline flex items-center gap-1"
                        >
                          <Plus size={12} /> Tambah Lagi
                        </button>
                      )}
                    </span>
                  </td>
                </tr>
                {additionalTasks.map((t, idx) => renderTaskRow(t, mainTasks.length + idx, true))}
                {draggedTaskId && tasks.find(t => t.id === draggedTaskId)?.isAdditional && (
                  <tr
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
                    className={`transition-colors border-2 border-dashed ${
                      dragOverTaskId === '__END__'
                        ? 'border-amber-500 bg-amber-100/70 text-amber-800'
                        : 'border-amber-300 bg-amber-50/40 text-amber-700'
                    }`}
                  >
                    <td colSpan={type === 'daily' ? 8 : 7} className="py-2 px-3 text-center text-xs font-semibold">
                      <div className="flex items-center justify-center gap-1.5">
                        <ArrowUpDown size={13} />
                        <span>Pindahkan ke urutan paling bawah</span>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>

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

export default TalTableTaskView;
