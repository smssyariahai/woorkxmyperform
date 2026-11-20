// app/(dashboard)/tal/preferences/page.tsx — Preferensi TAL pribadi.
// Porting src/pages/TalPreferences.tsx backup (747 baris) ke WOORK.
// Preferensi notifikasi → NotificationPreference.prefs.tal (Gelombang 3),
// BUKAN sistem baru (§3.4). Simpan lewat /api/tal/preferences (client.ts).
// Struktur mengikuti backup: kartu header + tombol Simpan, kotak DND,
// kartu bertab (Kanal & Suara / Rencana / Pelaporan / Task & Aktivitas)
// dengan footer Reset + Simpan. Editor pemicu WOORK dipertahankan apa adanya
// (pemicu bulanan, pemicu kunci plan, pemicu laporan mingguan/bulanan,
// pengingat pengerjaan task + menit default — lebih kaya dari backup).
// Catatan: channelSound / channelBrowserPush hanya disimpan — tanpa service
// worker + izin push, keduanya belum berefek otomatis (keputusan fondasi §9).
// Tombol "Uji Bunyi" hanya memutar chime uji lokal (WebAudio) saat diklik,
// bukan chime otomatis saat notifikasi masuk.
'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Bell,
  BellOff,
  Calendar,
  CheckCircle2,
  Clock,
  Globe,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  Send,
  Sliders,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  fetchTalPreferences, saveTalPreferences, sendTalTestNotification,
} from '@/lib/tal/client';
import { DEFAULT_TAL_PREFS, normalizeTalPrefs } from '@/lib/tal/preferences';
import type { TalUserNotificationSettings } from '@/lib/tal/types';

type SubTab = 'general' | 'planning' | 'reporting' | 'tasks';

const DAYS: { value: string; label: string }[] = [
  { value: 'monday', label: 'Senin' },
  { value: 'tuesday', label: 'Selasa' },
  { value: 'wednesday', label: 'Rabu' },
  { value: 'thursday', label: 'Kamis' },
  { value: 'friday', label: 'Jumat' },
  { value: 'saturday', label: 'Sabtu' },
  { value: 'sunday', label: 'Minggu' },
];
const LEAD_TYPES = ['H-2', 'H-1', 'H-0', 'H+1', 'H+2'];

/** Bunyi uji kecil (WebAudio) — pengganti playTalChime backup. */
function playTalChime() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const notes = [880, 1174.66];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = ctx.currentTime + i * 0.14;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.5);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.55);
    });
    setTimeout(() => void ctx.close(), 1200);
  } catch {
    // Audio tidak tersedia — abaikan.
  }
}

export default function TalPreferencesPage() {
  const [settings, setSettings] = useState<TalUserNotificationSettings>({ ...DEFAULT_TAL_PREFS });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('general');
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [pushPermission, setPushPermission] = useState<string>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported',
  );

  useEffect(() => {
    (async () => {
      try {
        setSettings(await fetchTalPreferences());
      } catch (e: any) {
        setMsg({ type: 'error', text: e?.message ?? 'Gagal memuat preferensi TAL.' });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const showMsg = (type: 'success' | 'error', text: string) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 5000);
  };

  const update = <K extends keyof TalUserNotificationSettings>(key: K, value: TalUserNotificationSettings[K]) =>
    setSettings((s) => ({ ...s, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const saved = await saveTalPreferences(settings);
      setSettings(saved);
      showMsg('success', 'Pengaturan preferensi & notifikasi TAL berhasil disimpan!');
    } catch (e: any) {
      showMsg('error', e?.message ?? 'Gagal menyimpan preferensi.');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (window.confirm('Kembalikan seluruh pengaturan preferensi ke konfigurasi standar pabrik?')) {
      setSettings(normalizeTalPrefs({}));
      showMsg('success', 'Preferensi dikembalikan ke default. Klik Simpan untuk menerapkan.');
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const sent = await sendTalTestNotification();
      showMsg(
        sent ? 'success' : 'error',
        sent
          ? 'Notifikasi uji terkirim — cek bell notifikasi di kanan atas (perlu refresh halaman bila bell belum memperbarui).'
          : 'Notifikasi uji tidak terkirim — periksa mode DND / kanal TAL di tab Umum.',
      );
    } catch (e: any) {
      showMsg('error', e?.message ?? 'Gagal mengirim notifikasi uji.');
    } finally {
      setTesting(false);
    }
  };

  const handleRequestPush = async () => {
    if (!('Notification' in window)) return;
    const result = await Notification.requestPermission();
    setPushPermission(result);
    if (result === 'granted') showMsg('success', 'Izin notifikasi browser diberikan. Pengiriman push otomatis tetap menunggu service worker (defer).');
    else showMsg('error', 'Izin notifikasi browser tidak diberikan.');
  };

  const toggleCls = 'relative h-6 w-11 shrink-0 cursor-pointer appearance-none rounded-full bg-slate-300 transition checked:bg-blue-600 after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition checked:after:translate-x-5';
  const sectionTitle = 'text-sm font-bold text-slate-900';
  const sectionDesc = 'mt-0.5 text-xs text-slate-500';

  const switchRow = (label: string, desc: string, checked: boolean, onChange: (v: boolean) => void, extra?: React.ReactNode) => (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div>
        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-800">
          {label}
          {extra}
        </p>
        <p className="mt-0.5 text-xs text-slate-500">{desc}</p>
      </div>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className={toggleCls} aria-label={label} />
    </div>
  );

  const weeklyTriggerEditor = (
    triggers: { id: string; label: string; day: string; time: string }[],
    onChange: (next: typeof triggers) => void,
    prefix: string,
  ) => (
    <div className="space-y-2">
      {triggers.map((t, i) => (
        <div key={t.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
          <input
            className="min-w-[140px] flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-xs outline-none"
            value={t.label}
            onChange={(e) => onChange(triggers.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
            placeholder="Label pengingat"
          />
          <select
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs outline-none"
            value={t.day}
            onChange={(e) => onChange(triggers.map((x, j) => (j === i ? { ...x, day: e.target.value } : x)))}
          >
            {DAYS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
          <input
            type="time"
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs outline-none"
            value={t.time}
            onChange={(e) => onChange(triggers.map((x, j) => (j === i ? { ...x, time: e.target.value } : x)))}
          />
          <button type="button" onClick={() => onChange(triggers.filter((_, j) => j !== i))} className="rounded-lg p-1.5 text-red-500 hover:bg-red-50">
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...triggers, { id: `${prefix}_${Date.now()}`, label: 'Pengingat Baru', day: 'saturday', time: '09:00' }])}
        className="inline-flex items-center gap-1 rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
      >
        <Plus size={13} /> Tambah Pengingat
      </button>
    </div>
  );

  const monthlyTriggerEditor = (
    triggers: { id: string; label: string; timingType: string; daysBefore?: number; time: string }[],
    onChange: (next: typeof triggers) => void,
    prefix: string,
  ) => (
    <div className="space-y-2">
      {triggers.map((t, i) => (
        <div key={t.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
          <input
            className="min-w-[140px] flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-xs outline-none"
            value={t.label}
            onChange={(e) => onChange(triggers.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
            placeholder="Label pengingat"
          />
          <select
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs outline-none"
            value={t.timingType}
            onChange={(e) => onChange(triggers.map((x, j) => (j === i ? { ...x, timingType: e.target.value } : x)))}
          >
            <option value="h_minus_days_end_month">H- (hari sebelum akhir bulan)</option>
            <option value="first_workday">Hari kerja pertama bulan baru</option>
          </select>
          {t.timingType === 'h_minus_days_end_month' && (
            <input
              type="number"
              min={1}
              max={10}
              className="w-16 rounded-lg border border-slate-300 px-2 py-1.5 text-xs outline-none"
              value={t.daysBefore ?? 3}
              onChange={(e) => onChange(triggers.map((x, j) => (j === i ? { ...x, daysBefore: Number(e.target.value) } : x)))}
            />
          )}
          <input
            type="time"
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs outline-none"
            value={t.time}
            onChange={(e) => onChange(triggers.map((x, j) => (j === i ? { ...x, time: e.target.value } : x)))}
          />
          <button type="button" onClick={() => onChange(triggers.filter((_, j) => j !== i))} className="rounded-lg p-1.5 text-red-500 hover:bg-red-50">
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...triggers, { id: `${prefix}_${Date.now()}`, label: 'Pengingat Baru', timingType: 'h_minus_days_end_month', daysBefore: 3, time: '09:00' }])}
        className="inline-flex items-center gap-1 rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
      >
        <Plus size={13} /> Tambah Pengingat
      </button>
    </div>
  );

  const reportTriggerEditor = (
    triggers: { id: string; label: string; leadType: string; day?: string; time: string }[],
    onChange: (next: typeof triggers) => void,
    prefix: string,
  ) => (
    <div className="space-y-2">
      {triggers.map((t, i) => (
        <div key={t.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
          <input
            className="min-w-[140px] flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-xs outline-none"
            value={t.label}
            onChange={(e) => onChange(triggers.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
            placeholder="Label pengingat"
          />
          <select
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs outline-none"
            value={t.leadType}
            onChange={(e) => onChange(triggers.map((x, j) => (j === i ? { ...x, leadType: e.target.value } : x)))}
          >
            {LEAD_TYPES.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
          <input
            type="time"
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs outline-none"
            value={t.time}
            onChange={(e) => onChange(triggers.map((x, j) => (j === i ? { ...x, time: e.target.value } : x)))}
          />
          <button type="button" onClick={() => onChange(triggers.filter((_, j) => j !== i))} className="rounded-lg p-1.5 text-red-500 hover:bg-red-50">
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...triggers, { id: `${prefix}_${Date.now()}`, label: 'Pengingat Baru', leadType: 'H-0', time: '16:00' }])}
        className="inline-flex items-center gap-1 rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
      >
        <Plus size={13} /> Tambah Pengingat
      </button>
    </div>
  );

  const subTabBtn = (id: SubTab, label: string, Icon: React.ComponentType<{ size?: number | string }>) => (
    <button
      onClick={() => setActiveSubTab(id)}
      className={`px-3.5 py-2 rounded-t-xl border-b-2 transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
        activeSubTab === id
          ? 'border-blue-600 text-blue-700 bg-white shadow-sm'
          : 'border-transparent text-slate-500 hover:text-slate-700'
      }`}
    >
      <Icon size={14} />
      <span>{label}</span>
    </button>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
        <Loader2 size={16} className="animate-spin" /> Memuat preferensi TAL...
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto space-y-4 pb-20">
      {/* Header Bar */}
      <div className="flex items-center justify-between gap-3 bg-white border border-slate-200/90 rounded-2xl p-3.5 shadow-sm">
        <div className="flex items-center gap-3">
          <Link
            href="/tal"
            className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 transition"
          >
            <ArrowLeft size={16} />
          </Link>
          <div>
            <h1 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">
              Preferensi TAL
            </h1>
            <p className="text-xs text-slate-500">
              Personalisasi &amp; Pengaturan Notifikasi, Jam Pengingat, dan Mode Hening (DND)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Save size={14} />
            <span>{saving ? 'Menyimpan...' : 'Simpan'}</span>
          </button>
        </div>
      </div>

      {msg && (
        <div className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
          msg.type === 'success'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
          <span className="font-semibold">{msg.text}</span>
        </div>
      )}

      {/* DND Toggle Box */}
      <div className={`p-4 rounded-2xl border flex items-center justify-between transition ${
        settings.dndMode ? 'bg-amber-500 text-white border-amber-600 shadow-sm' : 'bg-white border-slate-200 text-slate-800 shadow-sm'
      }`}>
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
            settings.dndMode ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
          }`}>
            {settings.dndMode ? <BellOff size={20} /> : <Bell size={20} />}
          </div>
          <div>
            <span className="text-sm font-bold block leading-tight">
              Mode Jangan Ganggu (Do Not Disturb / DND)
            </span>
            <span className={`text-xs block ${settings.dndMode ? 'text-amber-100' : 'text-slate-500'}`}>
              {settings.dndMode
                ? 'Aktif: Seluruh suara & pop-up browser dinonaktifkan sementara. Notifikasi tetap disimpan di Lonceng.'
                : 'Matikan suara denting & banner notifikasi sementara saat fokus bekerja tanpa mengubah pengaturan.'}
            </span>
          </div>
        </div>

        <input
          type="checkbox"
          checked={settings.dndMode}
          onChange={(e) => update('dndMode', e.target.checked)}
          className="relative h-6 w-11 shrink-0 cursor-pointer appearance-none rounded-full bg-slate-300 transition checked:bg-white after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition checked:after:translate-x-5 checked:after:bg-amber-600"
          aria-label="Mode Jangan Ganggu"
        />
      </div>

      {/* Tabs */}
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-sm overflow-hidden">
        <div className="flex border-b border-slate-200 bg-slate-50/70 px-4 pt-2 gap-1 text-xs font-bold overflow-x-auto">
          {subTabBtn('general', 'Kanal & Suara', Sliders)}
          {subTabBtn('planning', 'Pemicu Rencana (Planning)', Calendar)}
          {subTabBtn('reporting', 'Pemicu Pelaporan (Reporting)', Clock)}
          {subTabBtn('tasks', 'Task & Aktivitas', Sparkles)}
        </div>

        {/* Tab Content */}
        <div className="p-5 space-y-4">
          {/* TAB 1: KANAL & SUARA */}
          {activeSubTab === 'general' && (
            <div className="space-y-4">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Globe size={14} className="text-blue-600" />
                  Saluran Distribusi Pengingat
                </h2>

                {switchRow('Lonceng Notifikasi TAL (In-App)', 'Tampilkan badge angka & pesan notifikasi di modul TAL.', settings.channelTal, (v) => update('channelTal', v))}
                {switchRow('Feed Notifikasi Global (Aplikasi)', 'Teruskan pengingat ke daftar notifikasi utama sistem.', settings.channelGlobal, (v) => update('channelGlobal', v))}
                {switchRow(
                  'Denting Suara (Audio Chime)',
                  'Mainkan nada lonceng jernih saat notifikasi pengingat masuk.',
                  settings.channelSound,
                  (v) => update('channelSound', v),
                  <button
                    type="button"
                    onClick={playTalChime}
                    className="px-2 py-0.5 text-[10px] font-bold bg-blue-100 text-blue-700 hover:bg-blue-200 rounded transition cursor-pointer"
                  >
                    🔊 Uji Bunyi
                  </button>,
                )}
                {switchRow(
                  'Notifikasi Browser & Mobile Device',
                  'Mendukung notifikasi desktop, pop-up browser, dan lock screen ponsel.',
                  settings.channelBrowserPush,
                  (v) => update('channelBrowserPush', v),
                  <button
                    type="button"
                    onClick={handleRequestPush}
                    className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold rounded-lg transition"
                  >
                    Minta Izin ({pushPermission === 'unsupported' ? 'tidak didukung' : pushPermission})
                  </button>,
                )}
              </div>

              {/* Test Action Box */}
              <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-xl flex items-center justify-between gap-3">
                <div>
                  <span className="text-xs font-bold text-indigo-900 block">Uji Coba Pengingat</span>
                  <span className="text-[11px] text-indigo-700 block">Kirim satu contoh pengingat ke lonceng dan uji bunyi notifikasi.</span>
                </div>
                <button
                  type="button"
                  onClick={handleTest}
                  disabled={testing}
                  className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
                >
                  <Send size={13} />
                  <span>{testing ? 'Mengirim...' : 'Tes Notifikasi'}</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: PLANNING */}
          {activeSubTab === 'planning' && (
            <div className="space-y-4">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-800 block">Pengingat Rencana Mingguan (Weekly Plan)</span>
                    <span className="text-[11px] text-slate-500 block">Pemberitahuan otomatis untuk menyusun dan mengunci rencana mingguan.</span>
                  </div>
                  <input type="checkbox" checked={settings.enableWeeklyPlanReminder} onChange={(e) => update('enableWeeklyPlanReminder', e.target.checked)} className={toggleCls} aria-label="Pengingat rencana mingguan" />
                </div>

                {settings.enableWeeklyPlanReminder && (
                  <div className="space-y-2 pt-2 border-t border-slate-200">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-bold text-slate-700">Daftar Jadwal Pemicu Mingguan:</span>
                    </div>
                    {weeklyTriggerEditor(settings.weeklyPlanTriggers, (next) => update('weeklyPlanTriggers', next as any), 'wp')}
                  </div>
                )}
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-800 block">Pengingat Rencana Bulanan (Monthly Plan)</span>
                    <span className="text-[11px] text-slate-500 block">Pemicu sebelum tanggal batas penguncian rencana bulan baru (H+3).</span>
                  </div>
                  <input type="checkbox" checked={settings.enableMonthlyPlanReminder} onChange={(e) => update('enableMonthlyPlanReminder', e.target.checked)} className={toggleCls} aria-label="Pengingat rencana bulanan" />
                </div>
                {settings.enableMonthlyPlanReminder && (
                  <div className="mt-3">
                    {monthlyTriggerEditor(settings.monthlyPlanTriggers, (next) => update('monthlyPlanTriggers', next as any), 'mp')}
                  </div>
                )}
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-800 block">Pengingat Batas Kunci Plan Mingguan</span>
                    <span className="text-[11px] text-slate-500 block">Ingatkan sebelum batas kunci rencana mingguan.</span>
                  </div>
                  <input type="checkbox" checked={settings.enableWeeklyPlanLockReminder} onChange={(e) => update('enableWeeklyPlanLockReminder', e.target.checked)} className={toggleCls} aria-label="Pengingat kunci plan mingguan" />
                </div>
                {settings.enableWeeklyPlanLockReminder && (
                  <div className="mt-3">
                    {weeklyTriggerEditor(settings.weeklyPlanLockTriggers, (next) => update('weeklyPlanLockTriggers', next as any), 'wpl')}
                  </div>
                )}
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-800 block">Pengingat Batas Kunci Plan Bulanan</span>
                    <span className="text-[11px] text-slate-500 block">Ingatkan sebelum batas kunci target bulanan.</span>
                  </div>
                  <input type="checkbox" checked={settings.enableMonthlyPlanLockReminder} onChange={(e) => update('enableMonthlyPlanLockReminder', e.target.checked)} className={toggleCls} aria-label="Pengingat kunci plan bulanan" />
                </div>
                {settings.enableMonthlyPlanLockReminder && (
                  <div className="mt-3">
                    {monthlyTriggerEditor(settings.monthlyPlanLockTriggers, (next) => update('monthlyPlanLockTriggers', next as any), 'mpl')}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: REPORTING */}
          {activeSubTab === 'reporting' && (
            <div className="space-y-4">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-800 block">Pengingat Laporan Harian (Daily Report)</span>
                    <span className="text-[11px] text-slate-500 block">Mengingatkan pelaporan hasil kerja sebelum batas malam hari.</span>
                  </div>
                  <input type="checkbox" checked={settings.enableDailyReportReminder} onChange={(e) => update('enableDailyReportReminder', e.target.checked)} className={toggleCls} aria-label="Pengingat laporan harian" />
                </div>
                {settings.enableDailyReportReminder && (
                  <div className="space-y-2 pt-2 border-t border-slate-200">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-bold text-slate-700">Waktu Pemicu Laporan Harian:</span>
                    </div>
                    {reportTriggerEditor(settings.dailyReportTriggers, (next) => update('dailyReportTriggers', next as any), 'dr')}
                  </div>
                )}
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-800 block">Pengingat Laporan Mingguan (Weekly Report)</span>
                    <span className="text-[11px] text-slate-500 block">Pengingat rekonsiliasi dan submission nilai capaian mingguan.</span>
                  </div>
                  <input type="checkbox" checked={settings.enableWeeklyReportReminder} onChange={(e) => update('enableWeeklyReportReminder', e.target.checked)} className={toggleCls} aria-label="Pengingat laporan mingguan" />
                </div>
                {settings.enableWeeklyReportReminder && (
                  <div className="mt-3">
                    {reportTriggerEditor(settings.weeklyReportTriggers, (next) => update('weeklyReportTriggers', next as any), 'wr')}
                  </div>
                )}
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-800 block">Pengingat Laporan Bulanan (Monthly Report)</span>
                    <span className="text-[11px] text-slate-500 block">Pengingat batas pelaporan bulanan (akhir bulan).</span>
                  </div>
                  <input type="checkbox" checked={settings.enableMonthlyReportReminder} onChange={(e) => update('enableMonthlyReportReminder', e.target.checked)} className={toggleCls} aria-label="Pengingat laporan bulanan" />
                </div>
                {settings.enableMonthlyReportReminder && (
                  <div className="mt-3">
                    {reportTriggerEditor(settings.monthlyReportTriggers, (next) => update('monthlyReportTriggers', next as any), 'mr')}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: TASKS */}
          {activeSubTab === 'tasks' && (
            <div className="space-y-4">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Pemicu Tugas &amp; Delegasi
                </h2>

                {switchRow('Pengingat Pengerjaan Task', 'Ingatkan saya mengerjakan task yang mengaktifkan pengingat.', settings.enableTaskExecutionReminder, (v) => update('enableTaskExecutionReminder', v))}
                {settings.enableTaskExecutionReminder && (
                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <label className="mb-1 block text-xs font-semibold text-slate-600">Pengingat Default Task (menit sebelum jam task)</label>
                    <select
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none"
                      value={settings.defaultTaskReminderMinutes}
                      onChange={(e) => update('defaultTaskReminderMinutes', Number(e.target.value))}
                    >
                      {[15, 30, 60].map((m) => <option key={m} value={m}>{m} menit</option>)}
                    </select>
                  </div>
                )}
                {switchRow('Tugas Ditugaskan ke Saya', 'Beri tahu saat seseorang menugaskan task ke saya.', settings.notifyOnTaskAssigned, (v) => update('notifyOnTaskAssigned', v))}
                {switchRow('Task di-Rollover', 'Beri tahu saat task saya di-rollover ke periode berikut.', settings.notifyOnTaskRollover, (v) => update('notifyOnTaskRollover', v))}
                {switchRow('Blocker Dilaporkan', 'Beri tahu saat ada blocker yang dilaporkan pada task saya.', settings.notifyOnTaskBlocker, (v) => update('notifyOnTaskBlocker', v))}
                {switchRow('Evaluasi Laporan', 'Beri tahu saat laporan saya dinilai (skor keluar).', settings.notifyOnReportEvaluation, (v) => update('notifyOnReportEvaluation', v))}
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-800">
                  Pengingat di atas tersimpan sebagai pengaturan. Pengiriman otomatis terjadwal (cron) belum tersedia di WOORK —
                  lihat keputusan fondasi §9. Pengingat per-task (enableReminder) tetap bisa diatur di form task.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            type="button"
            onClick={handleReset}
            className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1 cursor-pointer font-medium"
          >
            <RotateCcw size={13} />
            <span>Kembalikan Default</span>
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Save size={14} />
            <span>{saving ? 'Menyimpan...' : 'Simpan Perubahan'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
