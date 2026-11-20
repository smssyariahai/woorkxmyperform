// components/tal/TalIncompleteTasksModal.tsx — porting src/components/tal/TalIncompleteTasksModal.tsx backup.
'use client';

import React from 'react';
import { AlertTriangle, X, ListTodo } from 'lucide-react';
import type { TalTaskItem } from '@/lib/tal/types';

interface TalIncompleteTasksModalProps {
  isOpen: boolean;
  tasks: TalTaskItem[];
  periodLabel: string;
  onClose: () => void;
}

export const TalIncompleteTasksModal: React.FC<TalIncompleteTasksModalProps> = ({
  isOpen,
  tasks,
  periodLabel,
  onClose
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/50 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with warning styling */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-rose-100 bg-rose-50/80">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-rose-100 text-rose-700 rounded-xl">
              <AlertTriangle size={20} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Tidak Bisa Melakukan Report</h3>
              <p className="text-[11px] text-rose-700 font-semibold">{periodLabel}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-rose-100/60 transition cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-3.5">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900">
            <p className="font-bold">Masih ada tugas yang belum diselesaikan!</p>
            <p className="mt-1 text-[11px] text-amber-800">
              Ada <b>{tasks.length} tugas</b> yang berstatus <b>To Do</b> atau <b>On Progress</b>.
              Sebelum mengirimkan Report, semua tugas wajib diperbarui statusnya menjadi <b>Done (Selesai)</b> atau <b>Pending (Ditunda)</b>.
            </p>
          </div>

          {/* List of unfinished tasks */}
          <div>
            <div className="flex items-center justify-between text-xs font-bold text-slate-700 mb-2">
              <span className="flex items-center gap-1.5">
                <ListTodo size={14} className="text-rose-500" />
                Daftar Tugas Belum Selesai ({tasks.length})
              </span>
            </div>
            <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1 divide-y divide-slate-100 border border-slate-200 rounded-xl p-2 bg-slate-50/50">
              {tasks.map((task, idx) => (
                <div key={task.id || idx} className="pt-1.5 first:pt-0 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[11px] font-bold text-slate-400 w-4 text-center shrink-0">
                      {idx + 1}.
                    </span>
                    <div className="truncate">
                      <p className="text-xs font-semibold text-slate-800 truncate" title={task.title}>
                        {task.title}
                      </p>
                      {task.isAdditional && (
                        <span className="text-[9px] font-bold bg-amber-100 text-amber-800 px-1 py-0.2 rounded">
                          Tambahan
                        </span>
                      )}
                    </div>
                  </div>
                  <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    task.status === 'on_progress' || (task.status as string) === 'in_progress'
                      ? 'bg-blue-50 text-blue-700 border-blue-200'
                      : 'bg-slate-100 text-slate-700 border-slate-200'
                  }`}>
                    {task.status === 'on_progress' || (task.status as string) === 'in_progress' ? 'On Progress' : 'To Do'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-5 py-3.5 bg-slate-50 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 text-xs font-bold text-white bg-slate-800 hover:bg-slate-900 rounded-xl transition shadow-xs cursor-pointer"
          >
            Tutup & Selesaikan Tugas
          </button>
        </div>
      </div>
    </div>
  );
};

export default TalIncompleteTasksModal;
