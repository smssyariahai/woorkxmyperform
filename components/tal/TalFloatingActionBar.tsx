// components/tal/TalFloatingActionBar.tsx — porting src/components/tal/TalFloatingActionBar.tsx backup.
'use client';

import React from 'react';
import {
  X,
  Trash2,
  CalendarPlus,
  ChevronDown
} from 'lucide-react';
import type { TalStatus } from '@/lib/tal/types';

interface TalFloatingActionBarProps {
  selectedCount: number;
  totalCount: number;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onChangeBulkStatus: (status: TalStatus) => void;
  onBulkCopyToDate: () => void;
  onBulkDelete: () => void;
  isDaily: boolean;
  disabled?: boolean;
  canDelete?: boolean;
}

export const TalFloatingActionBar: React.FC<TalFloatingActionBarProps> = ({
  selectedCount,
  totalCount,
  onSelectAll,
  onClearSelection,
  onChangeBulkStatus,
  onBulkCopyToDate,
  onBulkDelete,
  isDaily,
  disabled = false,
  canDelete = true
}) => {
  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-6 inset-x-0 z-40 flex justify-center px-4 animate-in slide-in-from-bottom-5 duration-200 pointer-events-none">
      <div className="bg-slate-900 text-white rounded-2xl shadow-2xl border border-slate-700/80 px-4 py-2.5 flex items-center gap-2 sm:gap-4 flex-wrap max-w-2xl pointer-events-auto">
        {/* Count & Select All */}
        <div className="flex items-center gap-2 pr-2 border-r border-slate-700 text-xs font-bold">
          <span className="bg-blue-600 text-white px-2 py-0.5 rounded-full text-[11px]">
            {selectedCount}
          </span>
          <span className="hidden sm:inline text-slate-300">terpilih</span>
          {selectedCount < totalCount ? (
            <button
              type="button"
              onClick={onSelectAll}
              className="text-[11px] text-blue-400 hover:text-blue-300 ml-1 underline cursor-pointer"
            >
              Semua ({totalCount})
            </button>
          ) : null}
        </div>

        {/* Change Status Dropdown */}
        <div className="relative">
          <select
            disabled={disabled}
            onChange={(e) => {
              if (e.target.value) {
                onChangeBulkStatus(e.target.value as TalStatus);
                e.target.value = '';
              }
            }}
            defaultValue=""
            className="appearance-none bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs font-semibold text-white pl-2.5 pr-6 py-1.5 rounded-lg focus:outline-none cursor-pointer"
          >
            <option value="" disabled>Ubah Status...</option>
            <option value="todo">Set ke TO DO</option>
            <option value="on_progress">Set ke ON PROGRESS</option>
            <option value="pending">Set ke PENDING</option>
            <option value="done">Set ke DONE</option>
          </select>
          <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" />
        </div>

        {/* Copy to date/week/month */}
        <button
          type="button"
          onClick={onBulkCopyToDate}
          className="flex items-center gap-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-indigo-300 hover:text-indigo-200 px-3 py-1.5 rounded-lg border border-slate-600 transition cursor-pointer"
          title="Salin tugas terpilih ke periode lain"
        >
          <CalendarPlus size={14} />
          <span className="hidden sm:inline">Salin ke..</span>
        </button>

        {/* Delete */}
        {!disabled && canDelete && (
          <button
            type="button"
            onClick={onBulkDelete}
            className="flex items-center gap-1 text-xs font-semibold bg-rose-900/60 hover:bg-rose-800 text-rose-300 px-2.5 py-1.5 rounded-lg border border-rose-700/60 transition cursor-pointer"
            title="Hapus tugas terpilih"
          >
            <Trash2 size={14} />
            <span className="hidden sm:inline">Hapus</span>
          </button>
        )}

        {/* Cancel / Clear */}
        <button
          type="button"
          onClick={onClearSelection}
          className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer ml-auto"
          title="Batal pilih"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
};

export default TalFloatingActionBar;
