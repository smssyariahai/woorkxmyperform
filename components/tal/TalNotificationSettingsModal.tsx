// components/tal/TalNotificationSettingsModal.tsx — Modal pengaturan notifikasi TAL.
// Porting src/components/tal/TalNotificationSettingsModal.tsx (backup MyPerform).
// Adaptasi stack: talService (Firebase/pgJson) -> lib/tal/client.ts WOORK
// (fetchTalPreferences / saveTalPreferences / sendTalTestNotification,
// prefs.tal di NotificationPreference Gelombang 3, session-scoped —
// userEmail/userName hanya dipertahankan sebagai prop opsional untuk
// kompatibilitas pemanggil ala backup, tidak dipakai untuk fetch).
// Perbedaan vs backup:
// - playTalChime (utils backup) tidak ada di WOORK: tombol "Tes" memakai
//   chime WebAudio lokal kecil (hanya bunyi uji saat diklik — chime otomatis
//   saat notifikasi masuk tetap belum ada, keputusan fondasi §9).
// - requestBrowserNotificationPermission (utils backup) diganti
//   Notification.requestPermission() langsung.
// - Kelas h-4.5 backup (bukan skala Tailwind 3.4) diganti toggle standar
//   WOORK (appearance-none) agar tampil benar.
// - Tab Task: backup menggabung rollover+blocker dalam satu checkbox;
//   di sini dipisah (sesuai model prefs WOORK + halaman Preferensi), plus
//   baris pengingat pengerjaan task & menit default.
// - Pemicu bulanan tetap 2 baris tetap ala backup (H-3 akhir bulan & hari
//   kerja pertama), tapi update-nya aman bila array kosong (backup diam-diam
//   tidak menyimpan bila triggers[0]/[1] belum ada).
'use client';

import React, { useEffect, useState } from 'react';
import {
  X,
  Bell,
  BellOff,
  Globe,
  Clock,
  Calendar,
  Sliders,
  Send,
  Sparkles,
  Plus,
  Trash2,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import {
  fetchTalPreferences,
  saveTalPreferences,
  sendTalTestNotification,
} from '@/lib/tal/client';
import { DEFAULT_TAL_PREFS } from '@/lib/tal/preferences';
import type {
  TalUserNotificationSettings,
  TalWeeklyPlanTrigger,
  TalReportTrigger,
} from '@/lib/tal/types';

interface TalNotificationSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail?: string;
  userName?: string;
  onSettingsSaved?: (settings: TalUserNotificationSettings) => void;
}

type SubTab = 'general' | 'planning' | 'reporting' | 'tasks';

const DAYS: { value: TalWeeklyPlanTrigger['day']; label: string }[] = [
  { value: 'monday', label: 'Senin' },
  { value: 'tuesday', label: 'Selasa' },
  { value: 'wednesday', label: 'Rabu' },
  { value: 'thursday', label: 'Kamis' },
  { value: 'friday', label: 'Jumat' },
  { value: 'saturday', label: 'Sabtu' },
  { value: 'sunday', label: 'Minggu' },
];
const LEAD_TYPES = ['H-0', 'H+1', 'H-1', 'H-2', 'H+2'];

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
    // Audio tidak tersedia — abaikan, tombol uji tetap tidak merusak modal.
  }
}

const toggleCls =
  'relative h-6 w-11 shrink-0 cursor-pointer appearance-none rounded-full bg-slate-300 transition checked:bg-blue-600 after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition checked:after:translate-x-5';

export const TalNotificationSettingsModal: React.FC<TalNotificationSettingsModalProps> = ({
  isOpen,
  onClose,
  userEmail,
  userName,
  onSettingsSaved,
}) => {
  const [settings, setSettings] = useState<TalUserNotificationSettings>({ ...DEFAULT_TAL_PREFS });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('general');
  const [pushPermission, setPushPermission] = useState<string>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported',
  );

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setSuccessMsg('');
    setErrorMsg('');
    fetchTalPreferences()
      .then((res) => setSettings(res))
      .catch((e: any) => setErrorMsg(e?.message ?? 'Gagal memuat preferensi.'))
      .finally(() => setLoading(false));
  }, [isOpen, userEmail, userName]);

  if (!isOpen) return null;

  const update = <K extends keyof TalUserNotificationSettings>(key: K, value: TalUserNotificationSettings[K]) =>
    setSettings((s) => ({ ...s, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    setSuccessMsg('');
    setErrorMsg('');
    try {
      const saved = await saveTalPreferences(settings);
      setSettings(saved);
      setSuccessMsg('Pengaturan notifikasi berhasil disimpan!');
      if (onSettingsSaved) onSettingsSaved(saved);
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Gagal menyimpan pengaturan.');
    } finally {
      setSaving(false);
    }
  };

  const handleResetToDefault = () => {
    if (window.confirm('Kembalikan seluruh pengaturan notifikasi ke konfigurasi standar pabrik?')) {
      setSettings({ ...DEFAULT_TAL_PREFS });
    }
  };

  const handleTestNotification = async () => {
    setTesting(true);
    setErrorMsg('');
    try {
      const sent = await sendTalTestNotification();
      setSuccessMsg(
        sent
          ? 'Notifikasi uji coba berhasil dikirim ke TAL & Notifikasi Global!'
          : 'Notifikasi uji tidak terkirim — periksa mode DND / kanal TAL.',
      );
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (e: any) {
      setErrorMsg(e?.message ?? 'Gagal mengirim notifikasi uji.');
    } finally {
      setTesting(false);
    }
  };

  const handleRequestPush = async () => {
    if (!('Notification' in window)) return;
    const result = await Notification.requestPermission();
    setPushPermission(result);
    if (result === 'granted') {
      update('channelBrowserPush', true);
      setSuccessMsg('Izin notifikasi browser aktif!');
      setTimeout(() => setSuccessMsg(''), 3000);
    } else {
      setErrorMsg('Izin notifikasi browser belum diberikan.');
    }
  };

  // Weekly Trigger Helpers
  const handleAddWeeklyTrigger = () => {
    const newTrig: TalWeeklyPlanTrigger = {
      id: `w_trig_${Date.now()}`,
      day: 'saturday',
      time: '10:00',
      label: 'Pengingat Rencana Mingguan Baru',
      enabled: true,
    };
    update('weeklyPlanTriggers', [...(settings.weeklyPlanTriggers || []), newTrig]);
  };

  const handleRemoveWeeklyTrigger = (id: string) => {
    update(
      'weeklyPlanTriggers',
      (settings.weeklyPlanTriggers || []).filter((t) => t.id !== id),
    );
  };

  const handleUpdateWeeklyTrigger = (id: string, partial: Partial<TalWeeklyPlanTrigger>) => {
    update(
      'weeklyPlanTriggers',
      (settings.weeklyPlanTriggers || []).map((t) => (t.id === id ? { ...t, ...partial } : t)),
    );
  };

  // Daily Report Trigger Helpers
  const handleAddDailyReportTrigger = () => {
    const newTrig: TalReportTrigger = {
      id: `d_rep_${Date.now()}`,
      leadType: 'H-0',
      time: '15:30',
      label: 'Pengingat Submit Laporan Harian',
      enabled: true,
    };
    update('dailyReportTriggers', [...(settings.dailyReportTriggers || []), newTrig]);
  };

  const handleRemoveDailyReportTrigger = (id: string) => {
    update(
      'dailyReportTriggers',
      (settings.dailyReportTriggers || []).filter((t) => t.id !== id),
    );
  };

  const handleUpdateDailyReportTrigger = (id: string, partial: Partial<TalReportTrigger>) => {
    update(
      'dailyReportTriggers',
      (settings.dailyReportTriggers || []).map((t) => (t.id === id ? { ...t, ...partial } : t)),
    );
  };

  /** Ubah jam salah satu dari 2 baris tetap pemicu bulanan (aman bila array kosong). */
  const handleUpdateMonthlyTriggerTime = (index: 0 | 1, time: string) => {
    const base = [...DEFAULT_TAL_PREFS.monthlyPlanTriggers];
    const current = [...(settings.monthlyPlanTriggers || [])];
    while (current.length <= index) {
      const fill = base[current.length];
      if (!fill) break;
      current.push({ ...fill });
    }
    if (current[index]) current[index] = { ...current[index], time };
    update('monthlyPlanTriggers', current);
  };

  const subTabBtn = (id: SubTab, label: string, Icon: React.ComponentType<{ size?: number | string }>) => (
    <button
      onClick={() => setActiveSubTab(id)}
      className={`px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-t-xl border-b-2 transition flex items-center gap-1.5 whitespace-nowrap text-[11px] sm:text-xs cursor-pointer ${
        activeSubTab === id
          ? 'border-blue-600 text-blue-700 bg-white shadow-sm'
          : 'border-transparent text-slate-500 hover:text-slate-700'
      }`}
    >
      <Icon size={13} />
      <span>{label}</span>
    </button>
  );

  const switchRow = (label: string, desc: string, checked: boolean, onChange: (v: boolean) => void) => (
    <div className="flex items-center justify-between py-1.5 border-b border-slate-200/80 last:border-b-0">
      <div className="pr-2">
        <span className="text-xs font-bold text-slate-800 block">{label}</span>
        <span className="text-[10.5px] text-slate-500 block">{desc}</span>
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className={toggleCls}
        aria-label={label}
      />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm">
      <div
        id="tal-notif-settings-modal"
        className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3.5 py-2.5 sm:px-5 sm:py-3 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 text-white shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-white/20 flex items-center justify-center text-white shrink-0">
              <Sliders size={16} />
            </div>
            <h2 className="text-xs sm:text-base font-bold leading-tight truncate">
              Personalisasi &amp; Pengaturan Notifikasi TAL
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 sm:w-8 sm:h-8 rounded-full hover:bg-white/20 flex items-center justify-center text-white/90 hover:text-white transition cursor-pointer shrink-0 ml-2"
          >
            <X size={16} />
          </button>
        </div>

        {/* Master DND Banner */}
        <div
          className={`px-3.5 py-2 sm:px-5 sm:py-2.5 border-b flex items-center justify-between transition ${
            settings.dndMode ? 'bg-amber-500 text-white border-amber-600' : 'bg-slate-50 border-slate-200 text-slate-800'
          }`}
        >
          <div className="flex items-center gap-2">
            <div
              className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                settings.dndMode ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
              }`}
            >
              {settings.dndMode ? <BellOff size={15} /> : <Bell size={15} />}
            </div>
            <div>
              <span className="text-xs font-bold block leading-tight">
                Mode Jangan Ganggu (DND)
              </span>
              <span className={`text-[10px] sm:text-[11px] leading-tight block ${settings.dndMode ? 'text-amber-100' : 'text-slate-500'}`}>
                {settings.dndMode ? 'Notifikasi suara & pop-up dimatikan' : 'Heningkan suara & pop-up sementara'}
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

        {/* Sub-tab Navigation */}
        <div className="flex border-b border-slate-200 bg-slate-50/50 px-2 sm:px-4 pt-1.5 gap-1 text-xs font-bold overflow-x-auto shrink-0">
          {subTabBtn('general', 'Kanal & Suara', Sliders)}
          {subTabBtn('planning', 'Rencana', Calendar)}
          {subTabBtn('reporting', 'Pelaporan', Clock)}
          {subTabBtn('tasks', 'Task', Sparkles)}
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3">
          {loading && <p className="text-xs text-slate-500 text-center py-4">Memuat preferensi...</p>}
          {successMsg && (
            <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center gap-2">
              <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
              <span className="font-semibold">{successMsg}</span>
            </div>
          )}
          {errorMsg && (
            <div className="p-2.5 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs flex items-center gap-2">
              <AlertTriangle size={15} className="text-red-600 shrink-0" />
              <span className="font-semibold">{errorMsg}</span>
            </div>
          )}

          {/* SUBTAB 1: KANAL & SUARA */}
          {activeSubTab === 'general' && (
            <div className="space-y-3">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 sm:p-3.5 space-y-2">
                <h3 className="text-[11px] font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5 mb-1">
                  <Globe size={13} className="text-blue-600" />
                  Saluran Notifikasi
                </h3>

                {switchRow('Lonceng Notifikasi TAL', 'Muncul di lonceng header modul TAL', settings.channelTal, (v) => update('channelTal', v))}
                {switchRow('Feed Notifikasi Utama', 'Teruskan ke panel Notifikasi Utama aplikasi', settings.channelGlobal, (v) => update('channelGlobal', v))}

                <div className="flex items-center justify-between py-1.5 border-b border-slate-200/80">
                  <div className="pr-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-slate-800">Suara Denting Chime</span>
                      <button
                        type="button"
                        onClick={playTalChime}
                        className="px-1.5 py-0.5 text-[9.5px] font-bold bg-blue-100 text-blue-700 hover:bg-blue-200 rounded transition cursor-pointer"
                      >
                        🔊 Tes
                      </button>
                    </div>
                    <span className="text-[10.5px] text-slate-500 block">Bunyi nada saat ada notifikasi masuk</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.channelSound}
                    onChange={(e) => update('channelSound', e.target.checked)}
                    className={toggleCls}
                    aria-label="Suara Denting Chime"
                  />
                </div>

                <div className="flex items-center justify-between py-1.5">
                  <div className="pr-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-bold text-slate-800">Notifikasi Android / Browser</span>
                      {pushPermission !== 'unsupported' && (
                        <span
                          className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded ${
                            pushPermission === 'granted'
                              ? 'bg-emerald-100 text-emerald-700'
                              : pushPermission === 'denied'
                                ? 'bg-rose-100 text-rose-700'
                                : 'bg-amber-100 text-amber-700'
                          }`}
                        >
                          {pushPermission === 'granted' ? '✅ Aktif' : pushPermission === 'denied' ? '❌ Diblokir' : '⏳ Izin'}
                        </span>
                      )}
                    </div>
                    <span className="text-[10.5px] text-slate-500 block">Pop-up banner, layar kunci &amp; getar</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {pushPermission !== 'granted' && pushPermission !== 'unsupported' && (
                      <button
                        type="button"
                        onClick={handleRequestPush}
                        className="px-2 py-0.5 bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg text-[10px] font-bold shadow-sm transition cursor-pointer"
                      >
                        Izin
                      </button>
                    )}
                    <input
                      type="checkbox"
                      checked={settings.channelBrowserPush}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        if (checked && pushPermission !== 'granted') void handleRequestPush();
                        else update('channelBrowserPush', checked);
                      }}
                      className={toggleCls}
                      aria-label="Notifikasi Android / Browser"
                    />
                  </div>
                </div>
              </div>

              {/* Uji Coba Tombol */}
              <div className="p-2.5 sm:p-3 bg-indigo-50/70 border border-indigo-200 rounded-xl flex items-center justify-between gap-2">
                <div>
                  <span className="text-xs font-bold text-indigo-950 block">Uji Coba Notifikasi</span>
                  <span className="text-[10.5px] text-indigo-800 block">Tes banner, suara chime, dan lonceng</span>
                </div>
                <button
                  type="button"
                  onClick={handleTestNotification}
                  disabled={testing}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold rounded-lg transition shadow-sm flex items-center gap-1 cursor-pointer disabled:opacity-50 shrink-0"
                >
                  <Send size={12} />
                  <span>{testing ? 'Mengirim...' : 'Tes Sekarang'}</span>
                </button>
              </div>
            </div>
          )}

          {/* SUBTAB 2: PLANNING (RENCANA) */}
          {activeSubTab === 'planning' && (
            <div className="space-y-3">
              {/* Rencana Mingguan */}
              <div className="p-3 sm:p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 block">Pengingat Rencana Mingguan (Weekly)</span>
                  <input
                    type="checkbox"
                    checked={settings.enableWeeklyPlanReminder}
                    onChange={(e) => update('enableWeeklyPlanReminder', e.target.checked)}
                    className={toggleCls}
                    aria-label="Pengingat Rencana Mingguan"
                  />
                </div>

                {settings.enableWeeklyPlanReminder && (
                  <div className="space-y-2 pt-2 border-t border-slate-200">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-bold text-slate-700">Jadwal Pemicu:</span>
                      <button
                        type="button"
                        onClick={handleAddWeeklyTrigger}
                        className="text-[10.5px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
                      >
                        <Plus size={11} />
                        <span>Tambah</span>
                      </button>
                    </div>

                    {(settings.weeklyPlanTriggers || []).map((trig) => (
                      <div
                        key={trig.id}
                        className="bg-white p-2 sm:p-1.5 rounded-lg border border-slate-200 text-xs space-y-1.5 sm:space-y-0 sm:flex sm:items-center sm:gap-1.5"
                      >
                        <div className="flex items-center gap-1.5 justify-between sm:justify-start">
                          <div className="flex items-center gap-1.5 flex-1 sm:flex-initial">
                            <select
                              value={trig.day}
                              onChange={(e) => handleUpdateWeeklyTrigger(trig.id, { day: e.target.value as TalWeeklyPlanTrigger['day'] })}
                              className="px-2 py-1 bg-slate-50 border border-slate-200 rounded text-[11px] font-semibold flex-1 sm:flex-initial cursor-pointer"
                            >
                              {DAYS.map((d) => (
                                <option key={d.value} value={d.value}>{d.label}</option>
                              ))}
                            </select>
                            <input
                              type="time"
                              value={trig.time}
                              onChange={(e) => handleUpdateWeeklyTrigger(trig.id, { time: e.target.value })}
                              className="px-2 py-1 bg-slate-50 border border-slate-200 rounded text-[11px] font-semibold shrink-0"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveWeeklyTrigger(trig.id)}
                            className="sm:hidden p-1 text-slate-400 hover:text-rose-600 rounded transition cursor-pointer shrink-0"
                            title="Hapus"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                        <div className="w-full sm:flex-1 flex items-center gap-1.5">
                          <input
                            type="text"
                            value={trig.label}
                            onChange={(e) => handleUpdateWeeklyTrigger(trig.id, { label: e.target.value })}
                            placeholder="Keterangan / label pengingat..."
                            className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded text-[11px] placeholder:text-slate-400"
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveWeeklyTrigger(trig.id)}
                            className="hidden sm:block p-1 text-slate-400 hover:text-rose-600 rounded transition cursor-pointer shrink-0"
                            title="Hapus"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Rencana Bulanan */}
              <div className="p-3 sm:p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 block">Pengingat Rencana Bulanan (Monthly)</span>
                  <input
                    type="checkbox"
                    checked={settings.enableMonthlyPlanReminder}
                    onChange={(e) => update('enableMonthlyPlanReminder', e.target.checked)}
                    className={toggleCls}
                    aria-label="Pengingat Rencana Bulanan"
                  />
                </div>

                {settings.enableMonthlyPlanReminder && (
                  <div className="space-y-1.5 pt-2 border-t border-slate-200 text-xs">
                    <div className="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-200 gap-2">
                      <span className="font-semibold text-slate-800 text-[11px] truncate">H-3 Akhir Bulan</span>
                      <input
                        type="time"
                        value={settings.monthlyPlanTriggers?.[0]?.time || '09:00'}
                        onChange={(e) => handleUpdateMonthlyTriggerTime(0, e.target.value)}
                        className="px-1.5 py-1 bg-slate-50 border border-slate-200 rounded text-[11px] font-semibold shrink-0"
                      />
                    </div>
                    <div className="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-200 gap-2">
                      <span className="font-semibold text-slate-800 text-[11px] truncate">Hari Kerja Ke-1 Bulan Baru</span>
                      <input
                        type="time"
                        value={settings.monthlyPlanTriggers?.[1]?.time || '08:00'}
                        onChange={(e) => handleUpdateMonthlyTriggerTime(1, e.target.value)}
                        className="px-1.5 py-1 bg-slate-50 border border-slate-200 rounded text-[11px] font-semibold shrink-0"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* SUBTAB 3: REPORTING (PELAPORAN) */}
          {activeSubTab === 'reporting' && (
            <div className="space-y-3">
              {/* Laporan Harian */}
              <div className="p-3 sm:p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 block">Pengingat Laporan Harian (Daily)</span>
                  <input
                    type="checkbox"
                    checked={settings.enableDailyReportReminder}
                    onChange={(e) => update('enableDailyReportReminder', e.target.checked)}
                    className={toggleCls}
                    aria-label="Pengingat Laporan Harian"
                  />
                </div>

                {settings.enableDailyReportReminder && (
                  <div className="space-y-2 pt-2 border-t border-slate-200">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-bold text-slate-700">Waktu Pengingat:</span>
                      <button
                        type="button"
                        onClick={handleAddDailyReportTrigger}
                        className="text-[10.5px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
                      >
                        <Plus size={11} />
                        <span>Tambah</span>
                      </button>
                    </div>

                    {(settings.dailyReportTriggers || []).map((trig) => (
                      <div
                        key={trig.id}
                        className="bg-white p-2 sm:p-1.5 rounded-lg border border-slate-200 text-xs space-y-1.5 sm:space-y-0 sm:flex sm:items-center sm:gap-1.5"
                      >
                        <div className="flex items-center gap-1.5 justify-between sm:justify-start">
                          <div className="flex items-center gap-1.5 flex-1 sm:flex-initial">
                            <select
                              value={trig.leadType}
                              onChange={(e) => handleUpdateDailyReportTrigger(trig.id, { leadType: e.target.value })}
                              className="px-2 py-1 bg-amber-50 text-amber-900 border border-amber-300 hover:border-amber-400 rounded text-[11px] font-bold shrink-0 cursor-pointer focus:ring-1 focus:ring-amber-500 outline-none"
                              title="Pilih Target Hari Pengingat (H-0, H+1, H-1, dll)"
                            >
                              {LEAD_TYPES.map((l) => (
                                <option key={l} value={l}>{l}</option>
                              ))}
                            </select>
                            <input
                              type="time"
                              value={trig.time}
                              onChange={(e) => handleUpdateDailyReportTrigger(trig.id, { time: e.target.value })}
                              className="px-2 py-1 bg-slate-50 border border-slate-200 rounded text-[11px] font-semibold shrink-0"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveDailyReportTrigger(trig.id)}
                            className="sm:hidden p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer shrink-0"
                            title="Hapus"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                        <div className="w-full sm:flex-1 flex items-center gap-1.5">
                          <input
                            type="text"
                            value={trig.label}
                            onChange={(e) => handleUpdateDailyReportTrigger(trig.id, { label: e.target.value })}
                            placeholder="Keterangan / label pengingat..."
                            className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded text-[11px] placeholder:text-slate-400"
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveDailyReportTrigger(trig.id)}
                            className="hidden sm:block p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer shrink-0"
                            title="Hapus"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Laporan Mingguan & Bulanan */}
              <div className="p-3 sm:p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                <span className="text-xs font-bold text-slate-800 block">Laporan Mingguan &amp; Bulanan</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-slate-200">
                  <div className="p-2 bg-white rounded-lg border border-slate-200 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-slate-800 block">Laporan Mingguan</span>
                      <span className="text-[10px] text-slate-500">Jumat 16:00 / Senin 08:00</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.enableWeeklyReportReminder}
                      onChange={(e) => update('enableWeeklyReportReminder', e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                    />
                  </div>
                  <div className="p-2 bg-white rounded-lg border border-slate-200 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-slate-800 block">Laporan Bulanan</span>
                      <span className="text-[10px] text-slate-500">Akhir Bulan 16:00</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.enableMonthlyReportReminder}
                      onChange={(e) => update('enableMonthlyReportReminder', e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SUBTAB 4: TASKS */}
          {activeSubTab === 'tasks' && (
            <div className="space-y-3">
              <div className="p-3 sm:p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <h3 className="text-[11px] font-bold text-slate-700 uppercase tracking-wide mb-1">
                  Kolaborasi &amp; Tugas
                </h3>

                {switchRow(
                  'Pengingat Pengerjaan Task',
                  'Ingatkan tugas harian sebelum jam eksekusi',
                  settings.enableTaskExecutionReminder,
                  (v) => update('enableTaskExecutionReminder', v),
                )}
                {settings.enableTaskExecutionReminder && (
                  <div className="pb-1.5 border-b border-slate-200/80">
                    <label className="mb-1 block text-[11px] font-semibold text-slate-600">
                      Pengingat Default Task (menit sebelum jam task)
                    </label>
                    <select
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs outline-none bg-white"
                      value={settings.defaultTaskReminderMinutes}
                      onChange={(e) => update('defaultTaskReminderMinutes', Number(e.target.value))}
                    >
                      {[15, 30, 60].map((m) => (
                        <option key={m} value={m}>{m} menit</option>
                      ))}
                    </select>
                  </div>
                )}
                {switchRow(
                  'Penugasan Task Baru (Assignment)',
                  'Notifikasi delegasi tugas dari atasan/rekan',
                  settings.notifyOnTaskAssigned,
                  (v) => update('notifyOnTaskAssigned', v),
                )}
                {switchRow(
                  'Alih Tugas (Rollover)',
                  'Notifikasi task di-rollover ke periode berikut',
                  settings.notifyOnTaskRollover,
                  (v) => update('notifyOnTaskRollover', v),
                )}
                {switchRow(
                  'Blocker & Kendala Kerja',
                  'Notifikasi saat task terhambat / ada blocker dilaporkan',
                  settings.notifyOnTaskBlocker,
                  (v) => update('notifyOnTaskBlocker', v),
                )}
                {switchRow(
                  'Evaluasi & Nilai Kinerja',
                  'Notifikasi skor realisasi laporan TAL',
                  settings.notifyOnReportEvaluation,
                  (v) => update('notifyOnReportEvaluation', v),
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-3.5 py-2.5 sm:px-5 sm:py-3 bg-slate-50 border-t border-slate-200 shrink-0">
          <button
            type="button"
            onClick={handleResetToDefault}
            className="text-[11px] sm:text-xs font-semibold text-slate-600 hover:text-rose-700 flex items-center gap-1 transition cursor-pointer"
          >
            <RotateCcw size={12} />
            <span>Reset Standar</span>
          </button>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 sm:px-4 sm:py-2 text-[11px] sm:text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200 rounded-lg sm:rounded-xl transition cursor-pointer"
            >
              Tutup
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-3.5 py-1.5 sm:px-5 sm:py-2 text-[11px] sm:text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg sm:rounded-xl shadow-sm transition cursor-pointer disabled:opacity-50"
            >
              {saving ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
