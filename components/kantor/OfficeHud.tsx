'use client';

import { useEffect, useState } from 'react';
import { Bot, CircleDot, Loader2, CheckCircle2, XCircle, Clock, Wallet, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import { timeAgo } from './meta';

function rp(n: number) {
  return 'Rp' + (n ?? 0).toLocaleString('id-ID');
}

interface Summary {
  agents: { total: number; online: number; working: number; idle: number; error: number; offline: number };
  tasks: { running: number; queued: number; waitingApproval: number; completed: number; failed: number };
  activities: { id: string; agentName: string; avatarColor: string; type: string; description: string; startedAt: string }[];
  credit: { balance: number; botEnabled: boolean; usedToday: number; repliesToday: number };
}

/** Panel ringkasan Kantor Virtual — semua angka dari /api/agents/summary (data asli). */
export function OfficeHud({ refreshKey }: { refreshKey: number }) {
  const [s, setS] = useState<Summary | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/agents/summary')
      .then((r) => r.json())
      .then((j) => { if (alive && j.success) setS(j.data); })
      .catch(() => {});
    return () => { alive = false; };
  }, [refreshKey]);

  if (!s) {
    return (
      <div className="card flex items-center gap-2 text-[13px] text-muted">
        <Loader2 className="h-4 w-4 animate-spin" /> Memuat ringkasan…
      </div>
    );
  }

  const agentStats = [
    { label: 'Total Agent', value: s.agents.total, icon: Bot, cls: 'text-slate-600' },
    { label: 'Online', value: s.agents.online, icon: CircleDot, cls: 'text-green-600' },
    { label: 'Working', value: s.agents.working, icon: Loader2, cls: 'text-blue-600' },
    { label: 'Error', value: s.agents.error, icon: XCircle, cls: 'text-red-600' },
    { label: 'Offline', value: s.agents.offline, icon: CircleDot, cls: 'text-slate-400' },
  ];
  const taskStats = [
    { label: 'Berjalan', value: s.tasks.running, icon: Loader2, cls: 'text-blue-600' },
    { label: 'Antre', value: s.tasks.queued, icon: Clock, cls: 'text-slate-500' },
    { label: 'Butuh persetujuan', value: s.tasks.waitingApproval, icon: Clock, cls: 'text-amber-600' },
    { label: 'Selesai', value: s.tasks.completed, icon: CheckCircle2, cls: 'text-green-600' },
    { label: 'Gagal', value: s.tasks.failed, icon: XCircle, cls: 'text-red-600' },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="card">
        <p className="mb-3 text-[13px] font-bold text-ink">Ringkasan Operasional</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {agentStats.map((it) => (
            <div key={it.label} className="rounded-xl bg-slate-50 px-3 py-2.5 text-center">
              <it.icon className={cn('mx-auto h-4 w-4', it.cls)} />
              <p className="mt-1 text-[19px] font-extrabold tabular-nums text-ink">{it.value}</p>
              <p className="text-[10.5px] text-muted">{it.label}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {taskStats.map((it) => (
            <div key={it.label} className="rounded-xl bg-slate-50 px-3 py-2.5 text-center">
              <it.icon className={cn('mx-auto h-4 w-4', it.cls)} />
              <p className="mt-1 text-[19px] font-extrabold tabular-nums text-ink">{it.value}</p>
              <p className="text-[10.5px] text-muted">{it.label}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 rounded-xl bg-blue-50/60 px-3 py-2.5 text-[12px] text-ink">
          <span className="inline-flex items-center gap-1.5">
            <Wallet className="h-3.5 w-3.5 text-blue-600" />
            Saldo AI-Agent: <b className="tabular-nums">{rp(s.credit.balance)}</b>
          </span>
          <span className="text-muted">
            Hari ini: {s.credit.repliesToday} balasan · {rp(s.credit.usedToday)}
          </span>
        </div>
      </div>
      <div className="card">
        <p className="mb-2 flex items-center gap-1.5 text-[13px] font-bold text-ink">
          <Activity className="h-4 w-4 text-muted" /> Aktivitas Terbaru
        </p>
        <div className="max-h-[220px] space-y-2 overflow-y-auto">
          {s.activities.length === 0 && <p className="text-[12px] text-muted">Belum ada aktivitas.</p>}
          {s.activities.map((a) => (
            <div key={a.id} className="flex items-start gap-2 text-[12px]">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: a.avatarColor }} />
              <div className="min-w-0">
                <p className="truncate text-ink"><b>{a.agentName}</b> — {a.description || a.type}</p>
                <p className="text-[10.5px] text-muted">{timeAgo(a.startedAt)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
