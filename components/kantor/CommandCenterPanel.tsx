'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, Bot, CalendarDays, CheckCircle2, Gauge, MessagesSquare, RefreshCw, Wallet, XCircle } from 'lucide-react';
import type { CommandCenterData } from '@/lib/kantor/command-center';
import { cn } from '@/lib/utils';

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' });
  const j = (await res.json().catch(() => null)) as { success?: boolean; data?: T; message?: string } | null;
  if (!res.ok || !j?.success) {
    const err = new Error(j?.message ?? 'Gagal memuat data.') as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return j.data as T;
}

function formatWaktu(iso: string): string {
  return new Date(iso).toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Panel Pusat Kendali AI — dashboard Command Center (Fase 7a1, SPEC §23).
 *  Semua angka dari GET /api/admin/kantor/command-center (data tenant
 *  nyata). Metrik tanpa sumber data tampil "Data belum tersedia", bukan
 *  angka karangan. */
export function CommandCenterPanel({ className }: { className?: string }) {
  const [data, setData] = useState<CommandCenterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [departmentId, setDepartmentId] = useState('all');
  const [agentId, setAgentId] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (departmentId !== 'all') params.set('departmentId', departmentId);
      if (agentId !== 'all') params.set('agentId', agentId);
      const q = params.toString();
      const d = await fetchJson<CommandCenterData>(`/api/admin/kantor/command-center${q ? `?${q}` : ''}`);
      setData(d);
    } catch (e: any) {
      setError(e?.message ?? 'Gagal memuat Command Center.');
    } finally {
      setLoading(false);
    }
  }, [departmentId, agentId]);

  useEffect(() => {
    load();
  }, [load]);

  const agentOptions = useMemo(() => {
    if (!data) return [];
    return data.utilization.map((u) => ({ id: u.agentId, name: u.agentName, departmentName: u.departmentName }));
  }, [data]);

  const maxDeptCount = Math.max(1, ...(data?.agents.byDepartment.map((d) => d.count) ?? [0]));

  return (
    <div className={cn('flex min-h-0 flex-col overflow-hidden rounded-lg border bg-white dark:bg-slate-900', className)}>
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2.5">
        <Gauge className="h-4 w-4 text-brand" />
        <h2 className="text-sm font-semibold text-ink">Pusat Kendali AI</h2>
        <span className="text-xs text-muted">Lantai 3 · AI Command Center</span>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:text-ink disabled:opacity-50"
          title="Muat ulang data"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          Muat ulang
        </button>
      </div>

      <div className="flex shrink-0 flex-wrap gap-2 border-b px-3 py-2">
        <label className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-muted">
          Divisi
          <select
            value={departmentId}
            onChange={(e) => {
              setDepartmentId(e.target.value);
              setAgentId('all');
            }}
            className="min-w-0 flex-1 rounded-md border bg-white dark:bg-slate-900 px-2 py-1.5 text-xs text-ink"
          >
            <option value="all">Semua divisi</option>
            {(data?.departments ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
                {d.floor ? ` (L${d.floor})` : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-muted">
          Agent
          <select
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            className="min-w-0 flex-1 rounded-md border bg-white dark:bg-slate-900 px-2 py-1.5 text-xs text-ink"
          >
            <option value="all">Semua agent</option>
            {agentOptions.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {loading && !data && <p className="text-sm text-muted">Memuat data Command Center…</p>}
        {error && !data && (
          <div className="rounded-lg border border-danger/40 bg-danger/5 px-3 py-2.5 text-sm text-danger">
            {error}
            {error.includes('akses') ? ' Minta admin memberikan izin DEPARTMENTS_VIEW atau yang setara.' : ''}
          </div>
        )}
        {data && (
          <div className="flex flex-col gap-4">
            {/* Kartu metrik */}
            <div className="grid grid-cols-2 gap-2">
              <Metric icon={<Bot className="h-4 w-4 text-brand" />} label="Agent aktif" value={`${data.agents.active}/${data.agents.total}`} hint="punya tugas saat ini" />
              <Metric icon={<Activity className="h-4 w-4 text-brand" />} label="Tugas berjalan" value={String(data.tasks.current.length)} hint="antre + berjalan + menunggu persetujuan" />
              <Metric icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />} label="Selesai hari ini" value={String(data.tasks.today.completed)} hint="dari semua tugas" />
              <Metric icon={<XCircle className="h-4 w-4 text-danger" />} label="Gagal hari ini" value={String(data.tasks.today.failed)} hint="dari semua tugas" />
              <Metric icon={<MessagesSquare className="h-4 w-4 text-brand" />} label="Kolaborasi aktif" value={String(data.collaborations.total)} hint="percakapan antar-agent 24 jam" />
              <Metric icon={<CalendarDays className="h-4 w-4 text-brand" />} label="Meeting 7 hari" value={String(data.meetings.length)} hint="terjadwal + berlangsung" />
              <Metric icon={<Bot className="h-4 w-4 text-brand" />} label="Panggilan AI hari ini" value={String(data.aiUsage.callsToday)} hint="jumlah panggilan, bukan token" />
              <Metric
                icon={<Wallet className="h-4 w-4 text-muted" />}
                label="Token & estimasi biaya"
                value="Belum tersedia"
                hint={data.tokenUsage.reason}
                unavailable
              />
            </div>
            <p className="text-[11px] leading-relaxed text-muted">
              Periode tugas: hari ini (00:00 WIB). {data.scopeNote}
            </p>

            {/* Agent per divisi */}
            <Section title="Agent per divisi">
              {data.agents.byDepartment.length === 0 && <Empty text="Belum ada agent." />}
              {data.agents.byDepartment.map((d) => (
                <div key={d.departmentId ?? 'none'} className="flex items-center gap-2 py-1 text-sm">
                  <span className="w-40 shrink-0 truncate text-ink">
                    {d.name}
                    {d.floor ? <span className="text-muted"> · L{d.floor}</span> : ''}
                  </span>
                  <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                    <span className="block h-full rounded-full bg-brand" style={{ width: `${Math.round((d.count / maxDeptCount) * 100)}%` }} />
                  </span>
                  <span className="w-6 shrink-0 text-right font-medium text-ink">{d.count}</span>
                </div>
              ))}
            </Section>

            {/* Utilisasi per agent */}
            <Section title="Utilisasi agent">
              {data.utilization.length === 0 && <Empty text="Tidak ada agent dalam cakupan filter." />}
              {data.utilization.map((u) => (
                <div key={u.agentId} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 border-b border-slate-100 py-1.5 text-sm last:border-0 dark:border-slate-800">
                  <span className="font-medium text-ink">{u.agentName}</span>
                  <span className="text-xs text-muted">{u.departmentName ?? 'Tanpa divisi'}</span>
                  <span className="ml-auto text-xs text-muted">
                    {u.currentStatus} · {u.activeTasks} berjalan · hari ini {u.tasksToday.total} ({u.tasksToday.completed} selesai
                    {u.tasksToday.failed > 0 ? `, ${u.tasksToday.failed} gagal` : ''})
                  </span>
                </div>
              ))}
            </Section>

            {/* Tugas berjalan */}
            <Section title="Tugas berjalan">
              {data.tasks.current.length === 0 && <Empty text="Tidak ada tugas berjalan." />}
              {data.tasks.current.map((t) => (
                <div key={t.id} className="border-b border-slate-100 py-1.5 text-sm last:border-0 dark:border-slate-800">
                  <p className="font-medium text-ink">{t.title}</p>
                  <p className="text-xs text-muted">
                    {t.agentName ?? 'Tanpa agent'} · {t.status} · {t.priority} · {formatWaktu(t.createdAt)}
                  </p>
                </div>
              ))}
            </Section>

            {/* Kolaborasi aktif */}
            <Section title="Kolaborasi aktif (24 jam)">
              {data.collaborations.items.length === 0 && <Empty text="Tidak ada percakapan antar-agent 24 jam terakhir." />}
              {data.collaborations.items.map((c) => (
                <div key={c.conversationId} className="border-b border-slate-100 py-1.5 text-sm last:border-0 dark:border-slate-800">
                  <p className="font-medium text-ink">{c.participants.join(' ↔ ')}</p>
                  <p className="text-xs text-muted">
                    {c.messageCount} pesan · terakhir {formatWaktu(c.lastAt)}
                    {c.taskTitle ? ` · tugas: ${c.taskTitle}` : ''}
                  </p>
                </div>
              ))}
            </Section>

            {/* Meeting mendatang */}
            <Section title="Meeting mendatang (7 hari)">
              {data.meetings.length === 0 && <Empty text="Tidak ada meeting terjadwal 7 hari ke depan." />}
              {data.meetings.map((m) => (
                <div key={m.id} className="border-b border-slate-100 py-1.5 text-sm last:border-0 dark:border-slate-800">
                  <p className="font-medium text-ink">{m.title}</p>
                  <p className="text-xs text-muted">
                    {formatWaktu(m.startsAt)} · {m.meetingType} · {m.status}
                    {m.hostName ? ` · host: ${m.hostName}` : ''}
                  </p>
                </div>
              ))}
            </Section>
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  hint,
  unavailable,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
  unavailable?: boolean;
}) {
  return (
    <div className={cn('rounded-lg border px-2.5 py-2', unavailable && 'border-dashed bg-slate-50 dark:bg-slate-800/50')}>
      <div className="flex items-center gap-1.5 text-xs text-muted">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <p className={cn('mt-1 text-lg font-semibold leading-none', unavailable ? 'text-sm text-muted' : 'text-ink')}>{value}</p>
      <p className="mt-1 text-[11px] leading-snug text-muted">{hint}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="py-1 text-sm text-muted">{text}</p>;
}
