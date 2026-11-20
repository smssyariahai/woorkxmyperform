// components/tal/TalPills.tsx — pil prioritas & status tugas TAL
// (tampilan saja, atau <select> bila onChange diberikan).
// Porting src/components/tal/TalPills.tsx (backup MyPerform) apa adanya;
// tipe TalPriority/TalStatus dari lib/tal/types.
import React from 'react';
import { ChevronDown } from 'lucide-react';
import type { TalPriority, TalStatus } from '@/lib/tal/types';

interface PriorityPillProps {
  priority: TalPriority;
  onChange?: (newPriority: TalPriority) => void;
  disabled?: boolean;
}

export const PriorityPill: React.FC<PriorityPillProps> = ({
  priority,
  onChange,
  disabled = false
}) => {
  const getStyle = (p: TalPriority) => {
    switch (p) {
      case 'low':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100';
      case 'medium':
        return 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100';
      case 'high':
        return 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  const getLabel = (p: TalPriority) => {
    switch (p) {
      case 'low': return 'LOW';
      case 'medium': return 'MEDIUM';
      case 'high': return 'HIGH';
      default: return p;
    }
  };

  if (disabled || !onChange) {
    return (
      <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-extrabold border ${getStyle(priority)} tracking-wider shrink-0 select-none`}>
        {getLabel(priority)}
      </span>
    );
  }

  return (
    <div
      className="relative inline-flex items-center shrink-0 max-w-full"
      onClick={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
    >
      <select
        value={priority}
        onChange={(e) => {
          e.stopPropagation();
          onChange(e.target.value as TalPriority);
        }}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        className={`appearance-none inline-flex items-center pl-1.5 pr-3.5 py-0.5 rounded-full text-[9px] font-extrabold border ${getStyle(priority)} tracking-wider focus:outline-none cursor-pointer transition select-none`}
      >
        <option value="low" className="text-emerald-700 font-bold bg-white text-xs">LOW</option>
        <option value="medium" className="text-amber-700 font-bold bg-white text-xs">MEDIUM</option>
        <option value="high" className="text-rose-700 font-bold bg-white text-xs">HIGH</option>
      </select>
      <ChevronDown size={9} className="absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none opacity-60" />
    </div>
  );
};

interface StatusPillProps {
  status: TalStatus;
  onChange?: (newStatus: TalStatus) => void;
  disabled?: boolean;
}

export const StatusPill: React.FC<StatusPillProps> = ({
  status,
  onChange,
  disabled = false
}) => {
  const getStyle = (s: TalStatus) => {
    switch (s) {
      case 'todo':
        return 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100';
      case 'on_progress':
        return 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100';
      case 'pending':
        return 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100';
      case 'done':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  const getLabel = (s: TalStatus) => {
    switch (s) {
      case 'todo': return 'TO DO';
      case 'on_progress': return 'ON PROGRESS';
      case 'pending': return 'PENDING';
      case 'done': return 'DONE';
      default: return s;
    }
  };

  if (disabled || !onChange) {
    return (
      <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-extrabold border ${getStyle(status)} tracking-wider shrink-0 select-none whitespace-nowrap`}>
        {getLabel(status)}
      </span>
    );
  }

  return (
    <div
      className="relative inline-flex items-center shrink-0 max-w-full"
      onClick={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
    >
      <select
        value={status}
        onChange={(e) => {
          e.stopPropagation();
          onChange(e.target.value as TalStatus);
        }}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        className={`appearance-none inline-flex items-center pl-1.5 pr-3.5 py-0.5 rounded-full text-[9px] font-extrabold border ${getStyle(status)} tracking-wider focus:outline-none cursor-pointer transition select-none whitespace-nowrap`}
      >
        <option value="todo" className="text-blue-700 font-bold bg-white text-xs">TO DO</option>
        <option value="on_progress" className="text-amber-700 font-bold bg-white text-xs">ON PROGRESS</option>
        <option value="pending" className="text-orange-700 font-bold bg-white text-xs">PENDING</option>
        <option value="done" className="text-emerald-700 font-bold bg-white text-xs">DONE</option>
      </select>
      <ChevronDown size={9} className="absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none opacity-60" />
    </div>
  );
};
