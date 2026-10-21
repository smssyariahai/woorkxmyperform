'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { toast } from 'sonner';
import { X, Box, Map as MapIcon, Move, RotateCcw, Save } from 'lucide-react';
import { OfficeMap, DESK_POS, type WalkTarget } from './OfficeMap';
import type { Agent } from './AgentGrid';
import type { AgentTask } from './TaskManager';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { hashName } from './agent-look';
import { layoutToWorld } from './Office3D/layout3d';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';

/** Scene 3D lazy-load (bundle three.js tidak ikut di halaman awal). */
const OfficeScene = dynamic(
  () => import('./Office3D/OfficeScene').then((m) => m.OfficeScene),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[420px] w-full items-center justify-center rounded-xl bg-slate-100 text-[13px] text-muted sm:h-[520px]">
        Memuat kantor 3D…
      </div>
    ),
  }
);

/** Pasangan agent → video gerakan terarah yang tersedia. */
const DIRECTED_VIDEOS: Record<string, { src: string; caption: string }> = {
  'Bima>Aria': {
    src: '/kantor-video/bima-ke-aria.mp4',
    caption: 'Bima berjalan menuju meja Aria…',
  },
};

function parsePayload(t: AgentTask): any {
  try {
    return JSON.parse(t.inputPayload || '{}');
  } catch {
    return {};
  }
}

/** Ambil (pengirim → tujuan) bila tugas adalah delegasi/koordinasi antar agent. */
function delegationOf(t: AgentTask): { from: string; to: string } | null {
  const p = parsePayload(t);
  if (p?.toolKey === 'delegasi_tugas' && p?.toolArgs?.agentName && t.agent?.name) {
    return { from: t.agent.name, to: String(p.toolArgs.agentName) };
  }
  return null;
}

const WALK_WINDOW_MS = 25_000;

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl') || c.getContext('experimental-webgl'));
  } catch {
    return false;
  }
}

/**
 * Denah kantor "hidup": mode 2D (peta + video ambient) atau 3D (Three.js).
 * Admin dapat menggeser posisi meja (mode Atur) — tersimpan per tenant.
 */
export function OfficeLive({ agents, tasks, onSelect, isAdmin }: {
  agents: Agent[];
  tasks: AgentTask[];
  onSelect: (a: Agent) => void;
  isAdmin: boolean;
}) {
  const [screen, setScreen] = useState<{ src: string; caption: string; taskId: string } | null>(null);
  const [mode, setMode] = useState<'2d' | '3d'>('2d');
  const [webgl, setWebgl] = useState(true);
  const [layout, setLayout] = useState<Record<string, { x: number; y: number }>>({});
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const shownRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    setWebgl(webglAvailable());
  }, []);

  // muat tata letak tersimpan milik tenant
  useEffect(() => {
    let alive = true;
    fetch('/api/office-layout')
      .then((r) => r.json())
      .then((j) => { if (alive && j.success) setLayout(j.data); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const posOf = (agentId: string, name: string) =>
    layout[agentId] ?? DESK_POS[name] ?? { x: 50, y: 50 };

  // --- sutradara: putar video terarah untuk tugas koordinasi yang baru dibuat --
  useEffect(() => {
    const now = Date.now();
    for (const t of tasks) {
      if (shownRef.current.has(t.id)) continue;
      if (now - +new Date(t.createdAt) > 30_000) continue;
      const d = delegationOf(t);
      if (!d) continue;
      const v = DIRECTED_VIDEOS[`${d.from}>${d.to}`];
      if (v) {
        shownRef.current.add(t.id);
        setScreen({ src: v.src, caption: v.caption, taskId: t.id });
        break;
      }
    }
  }, [tasks]);

  // tutup otomatis saat video selesai atau 18 detik
  useEffect(() => {
    if (!screen) return;
    const to = setTimeout(() => setScreen(null), 18_000);
    return () => clearTimeout(to);
  }, [screen]);

  // --- karakter BERJALAN saat ada tugas baru (data asli, bukan simulasi) ---
  // 1) delegasi/koordinasi → berjalan ke meja agent tujuan
  // 2) perintah langsung (mis. "Eko, periksa status sistem") → berjalan ke titik
  //    kerja di dekat mejanya dengan label tugas, kembali saat tugas selesai/kedaluwarsa
  const walkTo = useMemo(() => {
    const map: Record<string, WalkTarget> = {};
    const now = Date.now();
    const clampPct = (v: number) => Math.min(94, Math.max(6, Math.round(v * 10) / 10));
    const shortTitle = (s: string) => (s.length > 30 ? s.slice(0, 30) + '…' : s);
    for (const t of tasks) {
      if (['FAILED', 'CANCELLED', 'COMPLETED'].includes(t.status)) continue;
      if (!t.agent) continue;
      if (now - +new Date(t.createdAt) > WALK_WINDOW_MS) continue;
      if (map[t.agent.id]) continue;
      const d = delegationOf(t);
      if (d) {
        if (DIRECTED_VIDEOS[`${d.from}>${d.to}`]) continue; // sudah ditangani video
        const targetAgent = agents.find((a) => a.name === d.to);
        const target = targetAgent ? posOf(targetAgent.id, d.to) : DESK_POS[d.to];
        if (!target) continue;
        map[t.agent.id] = {
          x: Math.min(92, target.x + 6),
          y: Math.max(8, target.y - 10),
          label: `${d.from} → meja ${d.to}`,
        };
      } else {
        // perintah langsung: melangkah ke titik kerja dekat meja sendiri
        const pos = posOf(t.agent.id, t.agent.name);
        const ang = ((hashName(t.id) % 360) * Math.PI) / 180;
        map[t.agent.id] = {
          x: clampPct(pos.x + Math.cos(ang) * 13),
          y: clampPct(pos.y + Math.sin(ang) * 9),
          label: `${t.agent.name} → ${shortTitle(t.title)}`,
        };
      }
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, agents, layout]);

  // target jalan versi koordinat dunia 3D
  const walk3d = useMemo(() => {
    const map: Record<string, { x: number; z: number }> = {};
    for (const [agentId, w] of Object.entries(walkTo)) {
      const [wx, wz] = layoutToWorld(w.x, w.y);
      map[agentId] = { x: wx, z: wz };
    }
    return map;
  }, [walkTo]);

  async function saveLayout() {
    setSaving(true);
    try {
      const r = await fetch('/api/office-layout', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: Object.entries(layout).map(([agentId, p]) => ({ agentId, x: p.x, y: p.y })),
        }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success('Tata letak tersimpan.');
      setEditing(false);
    } catch (e: any) {
      toast.error(e.message || 'Gagal menyimpan tata letak.');
    } finally {
      setSaving(false);
    }
  }

  async function resetLayout() {
    if (!confirm('Kembalikan semua meja ke posisi awal?')) return;
    try {
      const r = await fetch('/api/office-layout', { method: 'DELETE' });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      setLayout({});
      toast.success('Tata letak dikembalikan ke awal.');
    } catch (e: any) {
      toast.error(e.message || 'Gagal mereset.');
    }
  }

  return (
    <div className="relative">
      {/* toolbar */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-xl border border-line bg-white text-[12.5px] font-semibold">
          <button
            onClick={() => setMode('2d')}
            className={cn('flex items-center gap-1.5 px-3.5 py-2 transition', mode === '2d' ? 'bg-brand text-white' : 'text-muted hover:text-ink')}
          >
            <MapIcon className="h-3.5 w-3.5" /> 2D
          </button>
          <button
            onClick={() => { if (!webgl) { toast.error('Perangkat ini tidak mendukung WebGL — tetap di mode 2D.'); return; } setMode('3d'); }}
            className={cn('flex items-center gap-1.5 px-3.5 py-2 transition', mode === '3d' ? 'bg-brand text-white' : 'text-muted hover:text-ink')}
            title={webgl ? 'Tampilan 3D interaktif' : 'WebGL tidak tersedia di perangkat ini'}
          >
            <Box className="h-3.5 w-3.5" /> 3D {!webgl && '(N/A)'}
          </button>
        </div>
        {mode === '3d' && (
          <Button variant="secondary" onClick={() => controlsRef.current?.reset()} className="!rounded-xl !py-2 !text-[12.5px]">
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reset kamera
          </Button>
        )}
        {mode === '2d' && isAdmin && (
          <>
            {!editing ? (
              <Button variant="secondary" onClick={() => setEditing(true)} className="!rounded-xl !py-2 !text-[12.5px]">
                <Move className="mr-1.5 h-3.5 w-3.5" /> Atur tata letak
              </Button>
            ) : (
              <>
                <Button onClick={saveLayout} disabled={saving} className="!rounded-xl !py-2 !text-[12.5px]">
                  <Save className="mr-1.5 h-3.5 w-3.5" /> {saving ? 'Menyimpan…' : 'Simpan'}
                </Button>
                <Button variant="secondary" onClick={() => setEditing(false)} className="!rounded-xl !py-2 !text-[12.5px]">Batal</Button>
                <Button variant="secondary" onClick={resetLayout} className="!rounded-xl !py-2 !text-[12.5px]">
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Kembalikan awal
                </Button>
              </>
            )}
          </>
        )}
        <span className="ml-auto hidden text-[11.5px] text-muted sm:inline">
          {mode === '3d' ? 'Seret untuk memutar · scroll untuk zoom · klik kanan untuk geser' : editing ? 'Seret karakter untuk memindahkan meja' : 'Klik karakter untuk profil agent'}
        </span>
      </div>

      {mode === '3d' && webgl ? (
        <div className="card !p-3">
          <OfficeScene
            agents={agents}
            layout={layout}
            walkTargets={walk3d}
            controlsRef={controlsRef}
          />
          <p className="px-1 pt-2 text-[11.5px] text-muted">
            Tampilan 3D — posisi meja mengikuti tata letak yang diatur di mode 2D.
          </p>
        </div>
      ) : (
        <OfficeMap
          agents={agents}
          onSelect={onSelect}
          walkTo={walkTo}
          layout={layout}
          editable={editing}
          onMove={(agentId, x, y) => setLayout((l) => ({ ...l, [agentId]: { x, y } }))}
          background={
            <span className="relative block w-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/kantor-office.jpg" alt="" aria-hidden className="w-full h-auto block" />
              <video
                className="absolute inset-0 h-full w-full object-cover"
                src="/kantor-video/kantor-ambient.mp4"
                autoPlay
                muted
                loop
                playsInline
                poster="/kantor-office.jpg"
              />
            </span>
          }
        />
      )}

      {editing && (
        <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
          Mode atur aktif — seret karakter agent ke posisi meja yang diinginkan, lalu tekan <b>Simpan</b>.
        </p>
      )}

      {/* overlay video gerakan terarah */}
      {screen && (
        <div className="absolute inset-0 z-30 overflow-hidden rounded-xl bg-black">
          <video
            key={screen.taskId}
            className="h-full w-full object-cover"
            src={screen.src}
            autoPlay
            muted
            playsInline
            onEnded={() => setScreen(null)}
          />
          <div className="absolute bottom-3 left-1/2 w-max max-w-[90%] -translate-x-1/2">
            <p className="rounded-full bg-slate-900/85 px-4 py-1.5 text-center text-[12px] font-semibold text-white shadow-lg ring-1 ring-white/30">
              {screen.caption}
            </p>
          </div>
          <button
            onClick={() => setScreen(null)}
            className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
            aria-label="Tutup video"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
