// Kantor Virtual — tampilan 2D/daftar sementara (Wave 0).
// Pola polling diadaptasi dari Ruang (yugienugraha/ruang v0.2.0, MIT © 2026
// yugienugraha): fetch GET /api/kantor/office + /api/kantor/tasks, jeda saat tab
// tersembunyi. Polling adaptif — 2 detik selama ada agent/tugas aktif,
// 10 detik bila semua idle (sebelumnya 10 detik tetap, sehingga eksekusi
// ~4 detik tidak pernah terlihat). Read-only: tidak ada perintah, eksekusi,
// atau persetujuan. Scene 3D memakai snapshot yang sama.
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Building2, ClipboardList, Users } from 'lucide-react';
import { Avatar, Badge, Card } from '@/components/ui/primitives';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { formatTanggalJam } from '@/lib/pengumuman/client';
import type { KantorOfficeSnapshot, KantorStation } from '@/lib/kantor/types';
import { useKantorRealtime } from './useKantorRealtime';

const STATE_TONE: Record<KantorStation['state'], 'green' | 'amber' | 'blue' | 'gray'> = {
  Working: 'green',
  Reviewing: 'blue',
  Collaborating: 'blue',
  Idle: 'gray',
  Offline: 'gray',
  Unknown: 'amber',
};

const STATE_LABEL: Record<KantorStation['state'], string> = {
  Working: 'Bekerja',
  Reviewing: 'Meninjau',
  Collaborating: 'Berkolaborasi',
  Idle: 'Santai',
  Offline: 'Offline',
  Unknown: 'Tidak diketahui',
};

interface KantorTaskItem {
  id: string;
  title: string;
  agentName: string | null;
  priority: string;
  status: string;
  kanbanStatus: string;
  progress: number;
  createdAt: string;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' });
  const j = (await res.json().catch(() => null)) as { success?: boolean; data?: T; message?: string } | null;
  if (!res.ok || !j?.success) throw new Error(j?.message ?? 'Gagal memuat data.');
  return j.data as T;
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <Card className="!p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${tone}`}>{value}</p>
    </Card>
  );
}

export function KantorClient() {
  const [snapshot, setSnapshot] = useState<KantorOfficeSnapshot | null>(null);
  const [tasks, setTasks] = useState<KantorTaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [snap, taskRes] = await Promise.all([
        fetchJson<KantorOfficeSnapshot>('/api/kantor/office'),
        fetchJson<{ tasks: KantorTaskItem[] }>('/api/kantor/tasks').catch(() => ({ tasks: [] })),
      ]);
      setSnapshot(snap);
      setTasks(taskRes.tasks);
      setFetchedAt(snap.fetchedAt);
      setError('');
    } catch (e: unknown) {
      if (!silent) setError(e instanceof Error ? e.message : 'Gagal memuat Kantor Virtual.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  // Sibuk bila ada agent yang tidak Idle atau ada tugas aktif — dari data
  // terakhir. Selama sibuk, poll 2 detik; bila semua idle, kembali 10 detik.
  const isBusy =
    snapshot?.stations.some((s) => s.state !== 'Idle') === true ||
    tasks.some((t) => t.status === 'QUEUED' || t.status === 'RUNNING' || t.status === 'WAITING_APPROVAL');

  useEffect(() => {
    void load();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load(true);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  useEffect(() => {
    // Polling adaptif; jeda saat tab tersembunyi.
    const tick = () => {
      if (document.visibilityState === 'hidden') return;
      void load(true);
    };
    timerRef.current = setInterval(tick, isBusy ? 2_000 : 10_000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [load, isBusy]);

  // Wave 10 — sinkronisasi realtime: event Kantor dari user lain di kantor
  // yang sama memicu reload segera (debounce ~250 ms). Polling di atas
  // tetap sebagai fallback bila SSE putus.
  const sseDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadSoon = useCallback(() => {
    if (sseDebounceRef.current) clearTimeout(sseDebounceRef.current);
    sseDebounceRef.current = setTimeout(() => {
      if (document.visibilityState !== 'hidden') void load(true);
    }, 250);
  }, [load]);
  useKantorRealtime(loadSoon);

  const summary = snapshot?.summary;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-800 text-white">
            <Building2 size={22} />
          </span>
          <div>
            <h1 className="text-lg font-bold text-slate-800">Kantor Virtual</h1>
            <p className="text-xs text-slate-500">
              Agent kantor Anda — siapa yang sedang bekerja, di mana, dan mengerjakan apa
            </p>
          </div>
        </div>
        {fetchedAt && (
          <span className="text-xs text-slate-400">Diperbarui {formatTanggalJam(fetchedAt)}</span>
        )}
      </div>

      {loading ? (
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : error && !snapshot ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : (
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard label="Agent Aktif" value={summary?.active ?? 0} tone="text-slate-800" />
          <StatCard label="Santai" value={summary?.idle ?? 0} tone="text-slate-500" />
          <StatCard label="Bekerja" value={summary?.working ?? 0} tone="text-green-700" />
          <StatCard label="Tugas Berjalan" value={summary?.runningTasks ?? 0} tone="text-slate-800" />
          <StatCard label="Persetujuan Pending" value={summary?.pendingApprovals ?? 0} tone="text-amber-700" />
        </div>
      )}

      <Card>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-800">Agent</h2>
          <span className="text-xs text-slate-500">
            {snapshot ? `${snapshot.stations.length} agent` : ''}
          </span>
        </div>
        {loading ? (
          <div className="mt-4 space-y-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : !snapshot || snapshot.stations.length === 0 ? (
          <EmptyState
            icon={<Users className="h-7 w-7" />}
            title="Belum ada agent aktif"
            description="Agent kantor yang aktif akan tampil di sini beserta status dan tugasnya."
          />
        ) : (
          <ul className="mt-4 space-y-2">
            {snapshot.stations.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5"
              >
                <Avatar name={s.name} color={s.avatarColor} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800">{s.name}</p>
                  <p className="truncate text-xs text-slate-500">
                    {s.role}
                    {s.currentTask ? ` · ${s.currentTask.title}` : ''}
                  </p>
                </div>
                <Badge tone={STATE_TONE[s.state]}>{STATE_LABEL[s.state]}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-800">Tugas Terbaru</h2>
          <span className="text-xs text-slate-500">{tasks.length > 0 ? `${tasks.length} tugas` : ''}</span>
        </div>
        {loading ? (
          <div className="mt-4 space-y-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : tasks.length === 0 ? (
          <EmptyState
            icon={<ClipboardList className="h-7 w-7" />}
            title="Belum ada tugas"
            description="Tugas agent kantor akan tampil di sini setelah dibuat."
          />
        ) : (
          <ul className="mt-4 space-y-2">
            {tasks.slice(0, 10).map((t) => (
              <li
                key={t.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800">{t.title}</p>
                  <p className="truncate text-xs text-slate-500">
                    {t.agentName ?? 'Tanpa agent'} · {formatTanggalJam(t.createdAt)}
                  </p>
                </div>
                <Badge tone={t.status === 'RUNNING' ? 'green' : t.status === 'WAITING_APPROVAL' ? 'blue' : t.status === 'COMPLETED' ? 'green' : t.status === 'FAILED' ? 'red' : 'gray'}>
                  {t.status}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
