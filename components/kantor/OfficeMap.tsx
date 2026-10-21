'use client';

import { useRef } from 'react';
import { AGENT_STATUS_META } from './meta';
import { cn } from '@/lib/utils';
import type { Agent } from './AgentGrid';
import { AgentSprite } from './AgentSprite';
import { opStatusOf, type OpStatus } from '@/lib/agents/display-status';

/** Posisi meja tiap agent di gambar denah (persen). */
export const DESK_POS: Record<string, { x: number; y: number }> = {
  Aria: { x: 43, y: 36 },
  Bima: { x: 8, y: 53 },
  Citra: { x: 63, y: 46 },
  Dian: { x: 82, y: 53 },
  Eko: { x: 55, y: 70 },
};

const ACTIVE_TASK_STATUS = ['QUEUED', 'RUNNING', 'WAITING_APPROVAL'];

export interface WalkTarget { x: number; y: number; label: string }

export function OfficeMap({ agents, onSelect, background, walkTo, layout, editable, onMove }: {
  agents: Agent[];
  onSelect: (a: Agent) => void;
  /** Pengganti gambar denah statis — mis. video ambient kantor hidup. */
  background?: React.ReactNode;
  /** Marker yang sedang "berjalan": posisi target per agent id. */
  walkTo?: Record<string, WalkTarget>;
  /** Tata letak tersimpan (persen) per agent id — menimpa DESK_POS. */
  layout?: Record<string, { x: number; y: number }>;
  /** Mode atur: marker bisa diseret untuk memindahkan meja. */
  editable?: boolean;
  onMove?: (agentId: string, x: number, y: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    id: string; startX: number; startY: number; origX: number; origY: number; moved: boolean;
  } | null>(null);
  const justDraggedRef = useRef(false);

  const posOf = (a: Agent) => layout?.[a.id] ?? DESK_POS[a.name] ?? { x: 50, y: 50 };

  function onPointerDown(e: React.PointerEvent, a: Agent) {
    if (!editable || !onMove) return;
    const pos = posOf(a);
    dragRef.current = {
      id: a.id,
      startX: e.clientX, startY: e.clientY,
      origX: pos.x, origY: pos.y,
      moved: false,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    const el = containerRef.current;
    if (!d || !el || !onMove) return;
    const rect = el.getBoundingClientRect();
    const dx = ((e.clientX - d.startX) / rect.width) * 100;
    const dy = ((e.clientY - d.startY) / rect.height) * 100;
    if (Math.abs(e.clientX - d.startX) + Math.abs(e.clientY - d.startY) > 6) d.moved = true;
    const clamp = (v: number) => Math.min(96, Math.max(4, Math.round(v * 10) / 10));
    onMove(d.id, clamp(d.origX + dx), clamp(d.origY + dy));
  }

  function onPointerUp() {
    if (dragRef.current?.moved) {
      justDraggedRef.current = true;
      setTimeout(() => { justDraggedRef.current = false; }, 150);
    }
    dragRef.current = null;
  }

  return (
    <div className="card !p-0 overflow-hidden">
      <div
        ref={containerRef}
        className={cn('relative', editable && 'cursor-move')}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {background ?? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src="/kantor-office.jpg"
            alt="Denah Kantor Virtual Woork.id"
            className="w-full h-auto block"
          />
        )}
        {agents.map((a) => {
          const walk = walkTo?.[a.id];
          const pos = walk ?? posOf(a);
          const meta = AGENT_STATUS_META[a.currentStatus] ?? AGENT_STATUS_META.IDLE;
          const working = ['WORKING', 'TYPING', 'EXECUTING_TASK', 'THINKING', 'COMMUNICATING'].includes(a.currentStatus);
          const task = a.currentTask && ACTIVE_TASK_STATUS.includes(a.currentTask.status) ? a.currentTask : null;
          const waitingApproval = a.currentStatus === 'WAITING_APPROVAL' || task?.status === 'WAITING_APPROVAL';
          return (
            <button
              key={a.id}
              onClick={() => {
                // abaikan klik bila baru saja selesai drag
                if (justDraggedRef.current) return;
                if (!editable) onSelect(a);
              }}
              onPointerDown={(e) => onPointerDown(e, a)}
              className={cn(
                'absolute -translate-x-1/2 -translate-y-1/2 group z-10',
                editable && 'touch-none',
                walk && 'transition-[left,top] duration-[2600ms] ease-in-out',
                editable && 'ring-2 ring-dashed ring-amber-400 rounded-xl'
              )}
              style={{ left: `${pos.x}%`, top: `${pos.y}%`, zIndex: walk ? 20 : 10 }}
              title={`${a.name} — ${meta.label}`}
            >
              {/* label jalan */}
              {walk && (
                <span className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 w-max max-w-[200px]">
                  <span className="flex items-center gap-1.5 rounded-full bg-teal-600/95 px-2.5 py-1 text-[10px] font-semibold text-white shadow-lg ring-1 ring-white/40">
                    <span className="h-1.5 w-1.5 rounded-full bg-white animate-ping" />
                    <span className="truncate">{walk.label}</span>
                  </span>
                </span>
              )}
              {/* label tugas aktif melayang di atas marker */}
              {task && !walk && (
                <span className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 w-max max-w-[190px]">
                  <span
                    className={cn(
                      'flex items-center gap-1.5 rounded-full pl-2 pr-2.5 py-1 text-[10px] font-semibold text-white shadow-lg ring-1 ring-white/40',
                      waitingApproval ? 'bg-amber-500/95' : 'bg-slate-900/92'
                    )}
                  >
                    <span
                      className={cn('h-1.5 w-1.5 shrink-0 rounded-full', !waitingApproval && 'animate-pulse')}
                      style={{ backgroundColor: waitingApproval ? '#fff' : a.avatarColor }}
                    />
                    <span className="truncate">
                      {waitingApproval ? 'Menunggu persetujuan' : task.title}
                    </span>
                  </span>
                  {!waitingApproval && task.progress > 0 && (
                    <span className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-white/30">
                      <span
                        className="block h-full rounded-full bg-green-400 transition-all duration-500"
                        style={{ width: `${Math.min(100, Math.max(4, task.progress))}%` }}
                      />
                    </span>
                  )}
                </span>
              )}
              {/* cincin putar saat bekerja */}
              {working && (
                <svg
                  className="absolute -inset-[7px] h-[42px] w-[42px] animate-[spin_3s_linear_infinite] pointer-events-none"
                  viewBox="0 0 42 42"
                  fill="none"
                >
                  <circle
                    cx="21" cy="21" r="18.5"
                    stroke={a.avatarColor} strokeWidth="2.5"
                    strokeDasharray="9 7" strokeLinecap="round" opacity="0.95"
                  />
                </svg>
              )}
              <span className={cn('relative block transition-transform group-hover:scale-110', walk && 'animate-kantor-walk')}>
                <AgentSprite
                  agentId={a.id}
                  name={a.name}
                  opStatus={(a.opStatus ?? opStatusOf({
                    isEnabled: a.isEnabled,
                    currentStatus: a.currentStatus,
                    currentTask: a.currentTask,
                  })) as OpStatus}
                  size={38}
                />
                {/* nama di bawah karakter */}
                <span className="absolute left-1/2 top-full mt-0.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900/90 px-2 py-0.5 text-[10px] font-semibold text-white shadow">
                  {a.name}
                </span>
              </span>
              <span className="absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900/90 px-2 py-0.5 text-[10px] font-medium text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                {meta.label}{a.currentTask?.title ? ` — ${a.currentTask.title}` : ''}
              </span>
              {working && (
                <span className="absolute -right-1 -top-1 flex h-3 w-3 pointer-events-none">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-green-500" />
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="px-4 py-2.5 border-t border-line flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" /> Working
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-green-500" /> Online
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-red-500" /> Error
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-slate-400" /> Offline
        </span>
        <span className="ml-auto hidden sm:inline">Klik karakter untuk profil agent</span>
      </div>
    </div>
  );
}
