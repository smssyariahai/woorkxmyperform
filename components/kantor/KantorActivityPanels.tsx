'use client'

import { useCallback, useEffect, useState } from 'react'
import { X } from 'lucide-react'
import type { BriefingContent } from '@/lib/kantor/briefing'
import type { NextPrayer, PrayerScheduleDay } from '@/lib/kantor/prayer'

/**
 * Panel "Musala & Morning Briefing" — drawer kanan di halaman /kantor.
 *
 * - Semua yang bisa melihat kantor: "Jadwal Salat Hari Ini" (5 waktu +
 *   salat berikutnya + countdown live + kota/sumber/metode/kiblat) dan
 *   status + agenda Morning Briefing.
 * - OWNER/ADMIN (canManage): form pengaturan salat + briefing dan tombol
 *   aksi sesi (Preview / Mulai / Hentikan).
 *
 * Semua data dari API (bukan hardcode); bagian yang `available: false`
 * tampil "belum tersedia", bukan angka karangan. Warna memakai token
 * tema Tailwind (brand/ink/muted/line/canvas) — tanpa class shadcn.
 */

type PrayerName = 'fajr' | 'dhuhr' | 'asr' | 'maghrib' | 'isha'

const PRAYER_ROWS: { key: PrayerName; label: string; nextName: string }[] = [
  { key: 'fajr', label: 'Subuh', nextName: 'subuh' },
  { key: 'dhuhr', label: 'Dzuhur', nextName: 'dzuhur' },
  { key: 'asr', label: 'Ashar', nextName: 'ashar' },
  { key: 'maghrib', label: 'Magrib', nextName: 'maghrib' },
  { key: 'isha', label: 'Isya', nextName: 'isya' },
]

interface AgentLite {
  id: string
  name: string
  role: string | null
  isEnabled: boolean
}

interface PrayerSettings {
  isEnabled: boolean
  latitude: number
  longitude: number
  cityName: string | null
  timezone: string
  calculationMethod: string
  asrMethod: string
  adjustmentMinutes: number
  sessionDurationMinutes: number
  enableAnimation: boolean
  autoReturn: boolean
  excludedAgentIds: string[]
  defaultImamAgentId: string | null
}

interface BriefingSettings {
  isEnabled: boolean
  startTime: string
  timezone: string
  durationMinutes: number
  preparationMinutes: number
  meetingLeaderId: string | null
  participantMode: string
  excludedAgentIds: string[]
  autoReturn: boolean
}

interface ScheduleResponse {
  schedule: PrayerScheduleDay
  next: NextPrayer | null
  qibla: number
  source: string
  cityName: string | null
  timezone: string
  isEnabled: boolean
  sessionDurationMinutes: number
  calculationMethod: string
  asrMethod: string
}

function countdownText(scheduledAt: string | null, now: number): string {
  if (!scheduledAt) return '—'
  const diff = Math.max(0, Date.parse(scheduledAt) - now)
  const h = Math.floor(diff / 3_600_000)
  const m = Math.floor((diff % 3_600_000) / 60_000)
  const s = Math.floor((diff % 60_000) / 1000)
  if (h > 0) return `${h} jam ${m} mnt lagi`
  return `${m} mnt ${s} dtk lagi`
}

function inputCls(extra = '') {
  return `w-full rounded-lg border bg-white px-3 py-2 text-sm text-ink dark:bg-slate-900 ${extra}`
}

export function KantorActivityPanels({ open, onClose, canManage = false }: { open: boolean; onClose: () => void; canManage?: boolean }) {
  const [schedule, setSchedule] = useState<ScheduleResponse | null>(null)
  const [content, setContent] = useState<BriefingContent | null>(null)
  const [prayerSettings, setPrayerSettings] = useState<PrayerSettings | null>(null)
  const [briefingSettings, setBriefingSettings] = useState<BriefingSettings | null>(null)
  const [agents, setAgents] = useState<AgentLite[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  // Nama salat untuk "Mulai Simulasi" — API session memakai nama Indonesia
  // (subuh/dzuhur/ashar/maghrib/isya), BUKAN key Inggris fajr/dhuhr/dst.
  const [startPrayerName, setStartPrayerName] = useState<string>('dzuhur')
  const [prayerPreview, setPrayerPreview] = useState<{ imam: { name: string } | null; participants: { name: string }[]; skipped: { name: string; reason: string }[]; inWindow: boolean } | null>(null)
  const [briefingPreview, setBriefingPreview] = useState<{ leader: { name: string } | null; participants: { name: string }[]; skipped: { name: string; reason: string }[] } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!open) return
    setLoading(true)
    setError(null)
    try {
      const [ps, bc, bs] = await Promise.all([
        fetch('/api/kantor/prayer/schedule', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch('/api/kantor/briefing/content', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch('/api/kantor/briefing/settings', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ])
      if (ps?.data) {
        setSchedule(ps.data)
        if (ps.data.next?.prayerName) setStartPrayerName(ps.data.next.prayerName)
      }
      if (bc?.data) setContent(bc.data)
      if (bs?.data) setBriefingSettings(bs.data)
      if (canManage) {
        const [pset, ag] = await Promise.all([
          fetch('/api/kantor/prayer/settings', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
          fetch('/api/kantor/agents', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        ])
        if (pset?.data?.settings) setPrayerSettings(pset.data.settings)
        if (ag?.data?.agents) setAgents(ag.data.agents)
      }
    } catch {
      setError('Gagal memuat data musala/briefing.')
    } finally {
      setLoading(false)
    }
  }, [open, canManage])

  useEffect(() => {
    void load()
  }, [load])

  // Countdown salat berikutnya berdetak tiap detik.
  useEffect(() => {
    if (!open) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [open ])

  // Refresh jadwal + konten tiap 60 dtk selama drawer terbuka.
  useEffect(() => {
    if (!open) return
    const id = window.setInterval(() => void load(), 60_000)
    return () => window.clearInterval(id)
  }, [open, load])

  const callApi = async (url: string, init: RequestInit, busyKey: string) => {
    setBusy(busyKey)
    setNotice(null)
    setError(null)
    try {
      const res = await fetch(url, init)
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error?.message ?? body?.message ?? `Gagal (${res.status}).`)
      return body?.data ?? null
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Gagal memanggil API.')
      return null
    } finally {
      setBusy(null)
    }
  }

  const savePrayerSettings = async () => {
    if (!prayerSettings) return
    const data = await callApi('/api/kantor/prayer/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prayerSettings),
    }, 'save-prayer')
    if (data) {
      setNotice('Pengaturan salat tersimpan.')
      void load()
    }
  }

  const saveBriefingSettings = async () => {
    if (!briefingSettings) return
    const data = await callApi('/api/kantor/briefing/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(briefingSettings),
    }, 'save-briefing')
    if (data) {
      setNotice('Pengaturan briefing tersimpan.')
      void load()
    }
  }

  const prayerSession = async (action: 'preview' | 'start' | 'stop') => {
    const data = await callApi('/api/kantor/prayer/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(action === 'start' ? { action, prayerName: startPrayerName } : { action }),
    }, `prayer-${action}`)
    if (!data) return
    if (action === 'preview') {
      setPrayerPreview(data)
      setNotice('Preview sesi salat dimuat.')
    } else if (action === 'start') {
      setNotice(`Simulasi salat ${data.prayerLabel ?? startPrayerName} dimulai — agent berjalan ke musala.`)
    } else {
      setNotice('Sesi salat dihentikan.')
    }
    void load()
  }

  const briefingSession = async (action: 'preview' | 'start' | 'stop') => {
    const data = await callApi('/api/kantor/briefing/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    }, `briefing-${action}`)
    if (!data) return
    if (action === 'preview') {
      setBriefingPreview(data)
      setNotice('Preview briefing dimuat.')
    } else if (action === 'start') {
      setNotice(`Morning Briefing dimulai — leader ${data.leaderName ?? ''}, ${data.participantCount ?? 0} peserta.`)
    } else {
      setNotice('Briefing dihentikan.')
    }
    void load()
  }

  if (!open) return null

  const nextRow = schedule?.next ? PRAYER_ROWS.find((r) => r.nextName === schedule.next?.prayerName) : undefined
  const enabledAgents = agents.filter((a) => a.isEnabled)

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Musala dan Morning Briefing">
      <button type="button" aria-label="Tutup panel" onClick={onClose} className="absolute inset-0 bg-black/50" />
      <div className="absolute inset-y-0 right-0 flex w-[400px] max-w-[92vw] flex-col overflow-y-auto border-l bg-white shadow-xl dark:bg-slate-900">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-4 py-3 dark:bg-slate-900">
          <div>
            <h2 className="text-base font-semibold text-ink">Musala &amp; Morning Briefing</h2>
            <p className="text-xs text-muted">Jadwal salat, pengaturan musala, dan briefing pagi kantor.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Tutup" className="rounded-lg border p-2 text-muted hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-5 px-4 py-4">
          {loading && <p className="text-sm text-muted">Memuat data…</p>}
          {error && <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
          {notice && <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">{notice}</p>}

          {/* --- Jadwal Salat Hari Ini (semua yang bisa lihat kantor) --- */}
          <section aria-label="Jadwal salat hari ini">
            <h3 className="text-sm font-semibold text-ink">Jadwal Salat Hari Ini</h3>
            {schedule ? (
              <div className="mt-2">
                <p className="text-xs text-muted">
                  {schedule.cityName ?? 'Jakarta'} · {schedule.source === 'aladhan' ? 'AlAdhan (Kemenag RI)' : schedule.source} · {schedule.calculationMethod === 'kemenag' ? 'Kemenag' : 'Astronomis'} · Asar {schedule.asrMethod === 'hanafi' ? 'Hanafi' : "Syafi'i"} · Kiblat {schedule.qibla.toFixed(2)}°
                </p>
                <ul className="mt-2 divide-y rounded-lg border">
                  {PRAYER_ROWS.map((row) => {
                    const isNext = nextRow?.key === row.key
                    return (
                      <li key={row.key} className={`flex items-center justify-between px-3 py-2 text-sm ${isNext ? 'bg-emerald-500/10 font-semibold text-ink' : 'text-ink'}`}>
                        <span>{row.label}{isNext ? ' · berikutnya' : ''}</span>
                        <span className="tabular-nums">{schedule.schedule[row.key]}</span>
                      </li>
                    )
                  })}
                </ul>
                {schedule.next && (
                  <p className="mt-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
                    Berikutnya: {schedule.next.prayerLabel} pukul {schedule.next.time} · {countdownText(schedule.next.scheduledAt, now)}
                  </p>
                )}
                {!schedule.isEnabled && <p className="mt-2 text-xs text-muted">Jadwal salat sedang dinonaktifkan oleh admin.</p>}
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted">Jadwal belum tersedia.</p>
            )}
          </section>

          {/* --- Morning Briefing: status + agenda (semua yang bisa lihat kantor) --- */}
          <section aria-label="Morning Briefing">
            <h3 className="text-sm font-semibold text-ink">Morning Briefing</h3>
            {content ? (
              <div className="mt-2 text-sm text-ink">
                <p className="text-muted">{content.greeting} · {content.dateLong} · {content.startTime} WIB · {content.durationMinutes} mnt</p>
                <ul className="mt-2 flex flex-col gap-2">
                  <li className="rounded-lg border px-3 py-2">
                    <span className="font-medium">Agenda hari ini: </span>
                    {content.overview.available
                      ? content.overview.meetingsCount > 0
                        ? `${content.overview.meetingsCount} meeting — ${content.overview.meetingsToday.map((m) => m.title).join(', ')}`
                        : 'Tidak ada meeting hari ini.'
                      : 'belum tersedia'}
                  </li>
                  <li className="rounded-lg border px-3 py-2">
                    <span className="font-medium">Kalender: </span>
                    {content.calendar.available
                      ? content.calendar.eventsCount > 0
                        ? `${content.calendar.eventsCount} event — ${content.calendar.events.map((e) => e.title).join(', ')}`
                        : 'Tidak ada event hari ini.'
                      : 'belum tersedia'}
                  </li>
                  <li className="rounded-lg border px-3 py-2">
                    <span className="font-medium">Tugas: </span>
                    {content.tasks.available
                      ? `${content.tasks.done}/${content.tasks.total} selesai · ${content.tasks.pending} berjalan${content.tasks.overdueCount > 0 ? ` · ${content.tasks.overdueCount} terlambat` : ''}`
                      : 'belum tersedia'}
                  </li>
                  <li className="rounded-lg border px-3 py-2">
                    <span className="font-medium">AI Agent: </span>
                    {content.agents.available
                      ? `${content.agents.activeCount} aktif${content.agents.runningCount > 0 ? ` · ${content.agents.runningCount} sedang bekerja (${content.agents.runningAgents.join(', ')})` : ''}`
                      : 'belum tersedia'}
                  </li>
                </ul>
                {briefingSettings && (
                  <p className="mt-2 text-xs text-muted">
                    Briefing {briefingSettings.isEnabled ? 'aktif' : 'nonaktif'} · {briefingSettings.startTime} WIB · {briefingSettings.durationMinutes} mnt · persiapan {briefingSettings.preparationMinutes} mnt
                  </p>
                )}
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted">Agenda briefing belum tersedia.</p>
            )}
          </section>

          {canManage && (
            <>
              {/* --- Pengaturan Musala (OWNER/ADMIN) --- */}
              <section aria-label="Pengaturan musala">
                <h3 className="text-sm font-semibold text-ink">Pengaturan Musala</h3>
                {prayerSettings ? (
                  <div className="mt-2 flex flex-col gap-3 text-sm">
                    <label className="flex items-center gap-2 text-ink">
                      <input type="checkbox" checked={prayerSettings.isEnabled} onChange={(e) => setPrayerSettings({ ...prayerSettings, isEnabled: e.target.checked })} />
                      Jadwal salat aktif
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-muted">Lintang
                        <input type="number" step="0.0001" min={-90} max={90} value={prayerSettings.latitude} onChange={(e) => setPrayerSettings({ ...prayerSettings, latitude: Number(e.target.value) })} className={inputCls('mt-1')} />
                      </label>
                      <label className="text-muted">Bujur
                        <input type="number" step="0.0001" min={-180} max={180} value={prayerSettings.longitude} onChange={(e) => setPrayerSettings({ ...prayerSettings, longitude: Number(e.target.value) })} className={inputCls('mt-1')} />
                      </label>
                    </div>
                    <label className="text-muted">Kota
                      <input type="text" value={prayerSettings.cityName ?? ''} onChange={(e) => setPrayerSettings({ ...prayerSettings, cityName: e.target.value || null })} className={inputCls('mt-1')} placeholder="Jakarta" />
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-muted">Zona waktu
                        <select value={prayerSettings.timezone} onChange={(e) => setPrayerSettings({ ...prayerSettings, timezone: e.target.value })} className={inputCls('mt-1')}>
                          {['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura', 'WIB', 'WITA', 'WIT'].map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                        </select>
                      </label>
                      <label className="text-muted">Metode hitung
                        <select value={prayerSettings.calculationMethod} onChange={(e) => setPrayerSettings({ ...prayerSettings, calculationMethod: e.target.value })} className={inputCls('mt-1')}>
                          <option value="kemenag">Kemenag</option>
                          <option value="astronomical">Astronomis</option>
                        </select>
                      </label>
                      <label className="text-muted">Metode Asar
                        <select value={prayerSettings.asrMethod} onChange={(e) => setPrayerSettings({ ...prayerSettings, asrMethod: e.target.value })} className={inputCls('mt-1')}>
                          <option value="shafii">Syafi&apos;i</option>
                          <option value="hanafi">Hanafi</option>
                        </select>
                      </label>
                      <label className="text-muted">Koreksi (mnt, −30..30)
                        <input type="number" min={-30} max={30} value={prayerSettings.adjustmentMinutes} onChange={(e) => setPrayerSettings({ ...prayerSettings, adjustmentMinutes: Number(e.target.value) })} className={inputCls('mt-1')} />
                      </label>
                      <label className="text-muted">Durasi sesi (mnt, 1..30)
                        <input type="number" min={1} max={30} value={prayerSettings.sessionDurationMinutes} onChange={(e) => setPrayerSettings({ ...prayerSettings, sessionDurationMinutes: Number(e.target.value) })} className={inputCls('mt-1')} />
                      </label>
                      <label className="text-muted">Imam default
                        <select value={prayerSettings.defaultImamAgentId ?? ''} onChange={(e) => setPrayerSettings({ ...prayerSettings, defaultImamAgentId: e.target.value || null })} className={inputCls('mt-1')}>
                          <option value="">Otomatis (agent pertama)</option>
                          {enabledAgents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                      </label>
                    </div>
                    <label className="flex items-center gap-2 text-ink">
                      <input type="checkbox" checked={prayerSettings.enableAnimation} onChange={(e) => setPrayerSettings({ ...prayerSettings, enableAnimation: e.target.checked })} />
                      Animasi pose salat di scene 3D
                    </label>
                    <label className="flex items-center gap-2 text-ink">
                      <input type="checkbox" checked={prayerSettings.autoReturn} onChange={(e) => setPrayerSettings({ ...prayerSettings, autoReturn: e.target.checked })} />
                      Agent kembali ke meja setelah salat
                    </label>
                    {enabledAgents.length > 0 && (
                      <fieldset>
                        <legend className="text-muted">Agent yang dikecualikan dari salat</legend>
                        <div className="mt-1 flex flex-wrap gap-2">
                          {enabledAgents.map((a) => {
                            const excluded = prayerSettings.excludedAgentIds.includes(a.id)
                            return (
                              <button
                                key={a.id}
                                type="button"
                                aria-pressed={excluded}
                                onClick={() => setPrayerSettings({
                                  ...prayerSettings,
                                  excludedAgentIds: excluded ? prayerSettings.excludedAgentIds.filter((id) => id !== a.id) : [...prayerSettings.excludedAgentIds, a.id],
                                })}
                                className={`rounded-full border px-2.5 py-1 text-xs ${excluded ? 'border-danger bg-danger/10 text-danger' : 'text-muted hover:text-ink'}`}
                              >
                                {a.name}
                              </button>
                            )
                          })}
                        </div>
                      </fieldset>
                    )}
                    <button type="button" onClick={savePrayerSettings} disabled={busy === 'save-prayer'} className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
                      {busy === 'save-prayer' ? 'Menyimpan…' : 'Simpan Pengaturan Salat'}
                    </button>
                    <div className="rounded-lg border p-3">
                      <p className="font-medium text-ink">Sesi Salat</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <select value={startPrayerName} onChange={(e) => setStartPrayerName(e.target.value)} className={inputCls('w-auto')} aria-label="Waktu salat untuk simulasi">
                          {PRAYER_ROWS.map((r) => <option key={r.key} value={r.nextName}>{r.label}</option>)}
                        </select>
                        <button type="button" onClick={() => void prayerSession('start')} disabled={busy === 'prayer-start'} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
                          {busy === 'prayer-start' ? 'Memulai…' : 'Mulai Simulasi Sekarang'}
                        </button>
                        <button type="button" onClick={() => void prayerSession('preview')} disabled={busy === 'prayer-preview'} className="rounded-lg border px-3 py-2 text-sm text-muted hover:text-ink disabled:opacity-50">
                          {busy === 'prayer-preview' ? 'Memuat…' : 'Preview'}
                        </button>
                        <button type="button" onClick={() => void prayerSession('stop')} disabled={busy === 'prayer-stop'} className="rounded-lg border border-danger/50 px-3 py-2 text-sm text-danger disabled:opacity-50">
                          {busy === 'prayer-stop' ? 'Menghentikan…' : 'Hentikan'}
                        </button>
                      </div>
                      {prayerPreview && (
                        <div className="mt-2 text-xs text-muted">
                          <p>Imam: {prayerPreview.imam?.name ?? '—'} · {prayerPreview.inWindow ? 'Sekarang dalam jendela waktu salat.' : 'Di luar jendela waktu salat.'}</p>
                          <p>Peserta ({prayerPreview.participants.length}): {prayerPreview.participants.map((p) => p.name).join(', ') || '—'}</p>
                          {prayerPreview.skipped.length > 0 && <p>Dilewati: {prayerPreview.skipped.map((s) => `${s.name} (${s.reason})`).join(', ')}</p>}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-muted">Pengaturan salat belum termuat.</p>
                )}
              </section>

              {/* --- Pengaturan Morning Briefing (OWNER/ADMIN) --- */}
              <section aria-label="Pengaturan morning briefing">
                <h3 className="text-sm font-semibold text-ink">Pengaturan Morning Briefing</h3>
                {briefingSettings ? (
                  <div className="mt-2 flex flex-col gap-3 text-sm">
                    <label className="flex items-center gap-2 text-ink">
                      <input type="checkbox" checked={briefingSettings.isEnabled} onChange={(e) => setBriefingSettings({ ...briefingSettings, isEnabled: e.target.checked })} />
                      Briefing pagi aktif
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-muted">Jam mulai
                        <input type="time" value={briefingSettings.startTime} onChange={(e) => setBriefingSettings({ ...briefingSettings, startTime: e.target.value })} className={inputCls('mt-1')} />
                      </label>
                      <label className="text-muted">Zona waktu
                        <select value={briefingSettings.timezone} onChange={(e) => setBriefingSettings({ ...briefingSettings, timezone: e.target.value })} className={inputCls('mt-1')}>
                          {['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura'].map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                        </select>
                      </label>
                      <label className="text-muted">Durasi (mnt, 1..60)
                        <input type="number" min={1} max={60} value={briefingSettings.durationMinutes} onChange={(e) => setBriefingSettings({ ...briefingSettings, durationMinutes: Number(e.target.value) })} className={inputCls('mt-1')} />
                      </label>
                      <label className="text-muted">Persiapan (mnt, 0..10)
                        <input type="number" min={0} max={10} value={briefingSettings.preparationMinutes} onChange={(e) => setBriefingSettings({ ...briefingSettings, preparationMinutes: Number(e.target.value) })} className={inputCls('mt-1')} />
                      </label>
                      <label className="text-muted">Leader
                        <select value={briefingSettings.meetingLeaderId ?? ''} onChange={(e) => setBriefingSettings({ ...briefingSettings, meetingLeaderId: e.target.value || null })} className={inputCls('mt-1')}>
                          <option value="">Otomatis (agent pertama)</option>
                          {enabledAgents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                      </label>
                      <label className="text-muted">Peserta
                        <select value={briefingSettings.participantMode} onChange={(e) => setBriefingSettings({ ...briefingSettings, participantMode: e.target.value })} className={inputCls('mt-1')}>
                          <option value="all">Semua agent aktif</option>
                          <option value="selected">Terpilih (kecuali yang dikecualikan)</option>
                        </select>
                      </label>
                    </div>
                    <label className="flex items-center gap-2 text-ink">
                      <input type="checkbox" checked={briefingSettings.autoReturn} onChange={(e) => setBriefingSettings({ ...briefingSettings, autoReturn: e.target.checked })} />
                      Agent kembali ke meja setelah briefing
                    </label>
                    {enabledAgents.length > 0 && (
                      <fieldset>
                        <legend className="text-muted">Agent yang dikecualikan dari briefing</legend>
                        <div className="mt-1 flex flex-wrap gap-2">
                          {enabledAgents.map((a) => {
                            const excluded = briefingSettings.excludedAgentIds.includes(a.id)
                            return (
                              <button
                                key={a.id}
                                type="button"
                                aria-pressed={excluded}
                                onClick={() => setBriefingSettings({
                                  ...briefingSettings,
                                  excludedAgentIds: excluded ? briefingSettings.excludedAgentIds.filter((id) => id !== a.id) : [...briefingSettings.excludedAgentIds, a.id],
                                })}
                                className={`rounded-full border px-2.5 py-1 text-xs ${excluded ? 'border-danger bg-danger/10 text-danger' : 'text-muted hover:text-ink'}`}
                              >
                                {a.name}
                              </button>
                            )
                          })}
                        </div>
                      </fieldset>
                    )}
                    <button type="button" onClick={saveBriefingSettings} disabled={busy === 'save-briefing'} className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
                      {busy === 'save-briefing' ? 'Menyimpan…' : 'Simpan Pengaturan Briefing'}
                    </button>
                    <div className="rounded-lg border p-3">
                      <p className="font-medium text-ink">Sesi Briefing</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button type="button" onClick={() => void briefingSession('start')} disabled={busy === 'briefing-start'} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
                          {busy === 'briefing-start' ? 'Memulai…' : 'Mulai Briefing Sekarang'}
                        </button>
                        <button type="button" onClick={() => void briefingSession('preview')} disabled={busy === 'briefing-preview'} className="rounded-lg border px-3 py-2 text-sm text-muted hover:text-ink disabled:opacity-50">
                          {busy === 'briefing-preview' ? 'Memuat…' : 'Preview'}
                        </button>
                        <button type="button" onClick={() => void briefingSession('stop')} disabled={busy === 'briefing-stop'} className="rounded-lg border border-danger/50 px-3 py-2 text-sm text-danger disabled:opacity-50">
                          {busy === 'briefing-stop' ? 'Menghentikan…' : 'Hentikan'}
                        </button>
                      </div>
                      {briefingPreview && (
                        <div className="mt-2 text-xs text-muted">
                          <p>Leader: {briefingPreview.leader?.name ?? '—'}</p>
                          <p>Peserta ({briefingPreview.participants.length}): {briefingPreview.participants.map((p) => p.name).join(', ') || '—'}</p>
                          {briefingPreview.skipped.length > 0 && <p>Dilewati: {briefingPreview.skipped.map((s) => `${s.name} (${s.reason})`).join(', ')}</p>}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-muted">Pengaturan briefing belum termuat.</p>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
