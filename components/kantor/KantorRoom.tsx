/**
 * Kantor Virtual — ruang 3D (Wave 1).
 *
 * Mengambil snapshot dari GET /api/kantor/office (data DB WOORK per kantor, bukan CLI hermes),
 * polling adaptif — 2 detik selama ada agent yang tidak Idle (bekerja/meninjau),
 * 10 detik bila semua idle — dan memuat scene 3D lewat next/dynamic ssr:false
 * (three.js tidak dirender di server). Bila WebGL tidak tersedia, tampilkan
 * poster statis + pesan. Muat ulang segera juga dipicu dari luar lewat prop
 * refreshSignal (naik tiap perintah baru dikirim dari CommandPanel) supaya
 * transisi idle → bekerja tidak menunggu poll berikutnya (s.d. 10 detik).
 *
 * Wave 10 — sinkronisasi realtime: selain polling, komponen ini juga
 * mendengarkan event Kantor lewat SSE `/api/realtime` (hook
 * useKantorRealtime) — perubahan status agent/tugas dari user lain di
 * kantor yang sama memicu reload snapshot segera (debounce ~250 ms).
 * Pergantian langkah idle (tiap 32 dtk, IDLE_STOP_MS) dijadwalkan tepat di
 * batas langkah server berikutnya, dihitung dari `snapshot.fetchedAt`
 * (jam server) — semua client reload di batas waktu yang sama. Polling
 * tetap dipertahankan sebagai fallback bila SSE putus.
 *
 * Wave 11 — status "Tidur" juga sinkron: nilai bersama per kantor dari
 * snapshot (`snapshot.sleep`); tombol Tidur di scene memanggil
 * POST /api/kantor/sleep (toggleSleep di bawah) dan event SSE
 * `kantor.sleep_changed` membuat semua layar reload segera. Lantai dan
 * tema scene TETAP preferensi per-browser (bukan keadaan kantor).
 *
 * Data: lib/kantor/types.ts (KantorOfficeSnapshot). Scene: ./Office3D.tsx.
 * Dialog detail agent dibuat di Wave 2 — untuk sekarang klik agent hanya membuka panel kecil.
 */

'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { KantorOfficeSnapshot, KantorStation } from '@/lib/kantor/types'
import { IDLE_STOP_MS } from './scene/office3d-layout'
import { useKantorRealtime } from './useKantorRealtime'

const Office3D = dynamic(() => import('./Office3D'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-[220px] items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
      Memuat tampilan 3D…
    </div>
  ),
})

const POLL_MS_IDLE = 10_000;
const POLL_MS_BUSY = 2_000;

/** Cek WebGL ala Ruang (src/pages/Office.tsx): coba webgl2 lalu webgl. */
function webglAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch {
    return false
  }
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch {
    return iso
  }
}

const STATE_BADGE: Record<KantorStation['state'], string> = {
  Idle: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200',
  Working: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200',
  Reviewing: 'bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200',
  Collaborating: 'bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-200',
  Offline: 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  Unknown: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200',
}

export default function KantorRoom({
  refreshSignal = 0,
  fillHeight = false,
}: {
  refreshSignal?: number
  /** Wave 8: bila true, KantorRoom mengisi tinggi parent (flex h-full);
   *  stage 3D ikut mengisi sisa tinggi lewat prop fillHeight Office3D.
   *  Dipakai halaman /kantor yang tingginya dinamis (dvh). */
  fillHeight?: boolean
}) {
  const [snapshot, setSnapshot] = useState<KantorOfficeSnapshot | null>(null)
  const [stale, setStale] = useState(false)
  const [loading, setLoading] = useState(true)
  const [webgl, setWebgl] = useState<boolean | null>(null)
  const [selected, setSelected] = useState<KantorStation | null>(null)
  const mounted = useRef(true)
  // Wave 10: jeda hingga batas langkah idle server berikutnya (ms, dihitung
  // di load() dari snapshot.fetchedAt). Dipakai effect timer di bawah.
  const boundaryDelayRef = useRef<number | null>(null)
  // Wave 10: debounce reload yang dipicu event SSE (task.progress bisa
  // datang beruntun tiap perubahan progress).
  const sseDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async () => {
    const fetchStartMs = Date.now()
    try {
      const res = await fetch('/api/kantor/office', { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      // API memakai apiOk() -> dibungkus { success, data }; buka bungkusnya
      // (tanpa ini, `stations` undefined dan scene 3D crash di stations.length).
      const body = (await res.json()) as { data?: KantorOfficeSnapshot } | KantorOfficeSnapshot
      const data = (body as { data?: KantorOfficeSnapshot }).data ?? (body as KantorOfficeSnapshot)
      if (!Array.isArray(data.stations)) throw new Error('Snapshot kantor tidak valid')
      if (!mounted.current) return
      setSnapshot(data)
      setStale(false)
      setLoading(false)
      // Wave 10 — jadwalkan reload tepat di batas langkah idle server
      // berikutnya: langkah idle berganti tiap IDLE_STOP_MS (32 dtk) dari
      // epoch; fetchedAt adalah jam server saat snapshot dibuat. Estimasi
      // jam server saat ini = fetchedAt + waktu fetch (latensi jaringan);
      // +150 ms buffer supaya server sudah melewati batas saat kita reload.
      // Semua client menghitung batas yang sama → pergantian langkah idle
      // terlihat serentak (selisih hanya latensi jaringan).
      const fetchedMs = Date.parse(data.fetchedAt)
      if (Number.isFinite(fetchedMs)) {
        const serverNowMs = fetchedMs + (Date.now() - fetchStartMs)
        const nextBoundaryMs = (Math.floor(serverNowMs / IDLE_STOP_MS) + 1) * IDLE_STOP_MS
        boundaryDelayRef.current = nextBoundaryMs - serverNowMs + 150
      } else {
        boundaryDelayRef.current = null
      }
    } catch {
      if (!mounted.current) return
      // Gagal -> pertahankan data lama + label STALE (pola Ruang: request-state.ts).
      setStale(true)
      setLoading(false)
    }
  }, [])

  // Wave 10 — reload segera (debounce ~250 ms) tiap event Kantor masuk
  // lewat SSE: agent.status_changed / task.* / notification.created /
  // kantor.sleep_changed dari user lain di kantor yang sama. Polling di
  // bawah tetap jalan sebagai fallback bila SSE putus (EventSource
  // reconnect otomatis).
  const loadSoon = useCallback(() => {
    if (sseDebounceRef.current) clearTimeout(sseDebounceRef.current)
    sseDebounceRef.current = setTimeout(() => {
      if (!document.hidden) void load()
    }, 250)
  }, [load])
  useKantorRealtime(loadSoon)

  // Wave 11 — tombol Tidur mengubah state BERSAMA per kantor di server
  // (POST /api/kantor/sleep). Kirim nilai eksplisit (kebalikan dari state
  // snapshot) supaya klik ganda tidak membalik dua kali. Nilai baru
  // datang lewat load() di sini + event SSE `kantor.sleep_changed` ke
  // semua client kantor ini (termasuk pengirim sendiri).
  const toggleSleep = useCallback(async () => {
    const next = !(snapshot?.sleep ?? false)
    try {
      const res = await fetch('/api/kantor/sleep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sleeping: next }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    } catch {
      // Gagal -> biarkan state lama; tombol tetap menampilkan state snapshot.
    }
    void load()
  }, [snapshot?.sleep, load])

  useEffect(() => {
    mounted.current = true
    setWebgl(webglAvailable())
    void load()
    return () => {
      mounted.current = false
    }
  }, [load])

  // Sibuk bila ada agent yang tidak Idle (bekerja/meninjau) — dari snapshot
  // terakhir. Selama sibuk, poll 2 detik supaya label "Bekerja", HUD, dan
  // label "Diperbarui ..." ikut bergerak; bila semua idle, kembali 10 detik.
  const isBusy = snapshot?.stations.some((s) => s.state !== 'Idle') ?? false

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.hidden) return
      void load()
    }, isBusy ? POLL_MS_BUSY : POLL_MS_IDLE)
    return () => window.clearInterval(timer)
  }, [load, isBusy])

  // Wave 10 — timer batas langkah idle: reload tepat saat langkah idle
  // server berganti (tiap 32 dtk), supaya semua client berpindah spot
  // serentak. Dijadwalkan ulang tiap snapshot baru (load() menghitung
  // ulang boundaryDelayRef). Polling 10 dtk di atas tetap sebagai fallback
  // bila timer ini terlewat (mis. tab tersembunyi saat batas lewat).
  useEffect(() => {
    if (!snapshot) return
    const delay = boundaryDelayRef.current
    if (!delay || delay <= 0 || delay > IDLE_STOP_MS) return
    const timer = window.setTimeout(() => {
      if (!document.hidden) void load()
    }, delay)
    return () => window.clearTimeout(timer)
  }, [snapshot, load])

  // Perintah baru dikirim dari CommandPanel -> muat ulang segera. Tanpa ini,
  // transisi idle → bekerja baru terlihat di poll berikutnya (s.d. 10 detik),
  // padahal eksekusi hanya ~4 detik — agent sudah selesai sebelum snapshot
  // sempat menangkapnya.
  useEffect(() => {
    if (refreshSignal > 0) void load()
  }, [refreshSignal, load])

  // Pilih agent baru dari snapshot bila yang sedang dipilih ikut berubah datanya.
  useEffect(() => {
    if (!selected || !snapshot) return
    const fresh = snapshot.stations.find((station) => station.id === selected.id)
    if (fresh && fresh !== selected) setSelected(fresh)
  }, [snapshot, selected])

  const summary = snapshot?.summary
  const chips: { label: string; value: number }[] = summary
    ? [
        { label: 'Agent', value: summary.total },
        { label: 'Aktif', value: summary.active },
        { label: 'Idle', value: summary.idle },
        { label: 'Bekerja', value: summary.working },
        { label: 'Tugas berjalan', value: summary.runningTasks },
        { label: 'Persetujuan pending', value: summary.pendingApprovals },
      ]
    : []

  return (
    <div className={fillHeight ? 'flex h-full min-h-0 flex-col space-y-2' : 'space-y-3'}>
      {/* HUD ringkasan */}
      {snapshot && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {chips.map((chip) => (
            <span key={chip.label} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <span className="uppercase tracking-wide text-slate-400 dark:text-slate-500">{chip.label}</span>
              <b className="font-semibold">{chip.value}</b>
            </span>
          ))}
          {stale && (
            <span className="inline-flex items-center rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-700 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-200">
              STALE — data lama, gagal memuat baru
            </span>
          )}
          <span className="ml-auto text-xs text-slate-400 dark:text-slate-500">
            Diperbarui {formatTime(snapshot.fetchedAt)}
          </span>
        </div>
      )}

      {/* Stage 3D / fallback */}
      <div className={fillHeight ? 'relative flex min-h-0 flex-1 flex-col' : 'relative'}>
        {webgl === null || (webgl && loading && !snapshot) ? (
          <div
            className={
              fillHeight
                ? 'flex h-full min-h-[220px] items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400'
                : 'flex min-h-[420px] items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400'
            }
          >
            Memuat data kantor…
          </div>
        ) : !webgl ? (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/kantor-office.jpg" alt="Kantor Virtual WOORK" className="h-auto w-full object-cover" />
            <p className="p-4 text-sm text-slate-600 dark:text-slate-300">
              Tampilan 3D tidak tersedia di browser ini. Coba browser lain yang mendukung WebGL untuk melihat kantor virtual 3D.
            </p>
          </div>
        ) : snapshot ? (
          <>
            <div className={fillHeight ? 'min-h-0 flex-1' : undefined}>
              <Office3D stations={snapshot.stations} onSelectAgent={setSelected} fillHeight={fillHeight} sleep={snapshot.sleep ?? false} onToggleSleep={toggleSleep} />
            </div>
            <p className="mt-2 shrink-0 text-xs text-slate-400 dark:text-slate-500">
              Seret untuk memutar · klik kanan / dua jari untuk menggeser · scroll untuk zoom · klik agent untuk detail · Page Up / Page Down ganti lantai
            </p>
          </>
        ) : (
          <div
            className={
              fillHeight
                ? 'flex h-full min-h-[220px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center dark:border-slate-700 dark:bg-slate-900'
                : 'flex min-h-[420px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center dark:border-slate-700 dark:bg-slate-900'
            }
          >  <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Data kantor belum tersedia.</p>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              {stale ? 'Gagal memuat /api/kantor/office — mencoba lagi otomatis.' : 'Menunggu /api/kantor/office…'}
            </p>
            <button type="button" onClick={() => void load()} className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">
              Muat ulang
            </button>
          </div>
        )}

        {/* Panel kecil agent yang dipilih (dialog detail dibuat di Wave 2) */}
        {selected && webgl && snapshot && (
          <div className="absolute bottom-10 left-3 z-10 w-72 max-w-[calc(100%-1.5rem)] rounded-xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="inline-block h-4 w-4 shrink-0 rounded-full border border-black/10" style={{ backgroundColor: selected.avatarColor || '#888888' }} />
                <div>
                  <p className="text-sm font-semibold leading-tight text-slate-900 dark:text-white">{selected.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{selected.role}</p>
                </div>
              </div>
              <button type="button" onClick={() => setSelected(null)} aria-label="Tutup" className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300">✕</button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
              <span className={`rounded-full px-2 py-0.5 font-medium ${STATE_BADGE[selected.state]}`}>{selected.state}</span>
              <span className="text-slate-500 dark:text-slate-400">{selected.room === 'Lounge' ? 'Lounge' : 'Workspace'} · Meja {selected.seat}</span>
            </div>
            {selected.currentTask ? (
              <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                <span className="font-medium text-slate-800 dark:text-slate-100">Tugas berjalan: </span>
                {selected.currentTask.title}
                <span className="text-slate-400"> ({selected.currentTask.status})</span>
              </p>
            ) : (
              <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">Tidak ada tugas berjalan.</p>
            )}
            {selected.recentActivity && (
              <p className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{selected.recentActivity}</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
