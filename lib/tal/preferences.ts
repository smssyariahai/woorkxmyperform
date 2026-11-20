// lib/tal/preferences.ts — bentuk KANONIK preferensi notifikasi TAL (prefs.tal
// di dalam NotificationPreference, Gelombang 3). Porting
// DEFAULT_TAL_NOTIFICATION_SETTINGS dari src/types/tal.ts backup.
// Pola mengikuti lib/pengumuman/preferences.ts: DEFAULT + normalize + merge.
//
// Catatan: channelSound / channelBrowserPush hanya disimpan — tanpa service
// worker + izin push, keduanya tidak berefek (keputusan fondasi §9).

import {
  DEFAULT_TAL_NOTIFICATION_SETTINGS,
  type TalMonthlyPlanTrigger,
  type TalReportTrigger,
  type TalUserNotificationSettings,
  type TalWeeklyPlanTrigger,
} from './types';

export type { TalUserNotificationSettings };

export const DEFAULT_TAL_PREFS: TalUserNotificationSettings =
  DEFAULT_TAL_NOTIFICATION_SETTINGS;

function asBool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function asNum(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeWeeklyTriggers(
  raw: unknown,
  fallback: TalWeeklyPlanTrigger[]
): TalWeeklyPlanTrigger[] {
  if (!Array.isArray(raw)) return fallback.map((t) => ({ ...t }));
  const days = [
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday',
  ] as const;
  return raw
    .filter((t): t is Record<string, unknown> => !!t && typeof t === 'object')
    .map((t, i) => ({
      id: typeof t.id === 'string' && t.id ? t.id : `wp_${Date.now()}_${i}`,
      label: typeof t.label === 'string' ? t.label : 'Pengingat',
      day: days.includes(t.day as (typeof days)[number])
        ? (t.day as (typeof days)[number])
        : 'saturday',
      time: typeof t.time === 'string' && /^\d{2}:\d{2}$/.test(t.time) ? t.time : '09:00',
      enabled: typeof t.enabled === 'boolean' ? t.enabled : true,
    }));
}

function normalizeMonthlyTriggers(
  raw: unknown,
  fallback: TalMonthlyPlanTrigger[]
): TalMonthlyPlanTrigger[] {
  if (!Array.isArray(raw)) return fallback.map((t) => ({ ...t }));
  return raw
    .filter((t): t is Record<string, unknown> => !!t && typeof t === 'object')
    .map((t, i) => ({
      id: typeof t.id === 'string' && t.id ? t.id : `mp_${Date.now()}_${i}`,
      label: typeof t.label === 'string' ? t.label : 'Pengingat',
      timingType:
        t.timingType === 'first_workday' ? 'first_workday' : 'h_minus_days_end_month',
      daysBefore: typeof t.daysBefore === 'number' ? t.daysBefore : 3,
      time: typeof t.time === 'string' && /^\d{2}:\d{2}$/.test(t.time) ? t.time : '09:00',
      enabled: typeof t.enabled === 'boolean' ? t.enabled : true,
    }));
}

function normalizeReportTriggers(
  raw: unknown,
  fallback: TalReportTrigger[]
): TalReportTrigger[] {
  if (!Array.isArray(raw)) return fallback.map((t) => ({ ...t }));
  return raw
    .filter((t): t is Record<string, unknown> => !!t && typeof t === 'object')
    .map((t, i) => ({
      id: typeof t.id === 'string' && t.id ? t.id : `rp_${Date.now()}_${i}`,
      label: typeof t.label === 'string' ? t.label : 'Pengingat',
      leadType: typeof t.leadType === 'string' ? t.leadType : 'H-0',
      day: typeof t.day === 'string' ? t.day : undefined,
      time: typeof t.time === 'string' && /^\d{2}:\d{2}$/.test(t.time) ? t.time : '16:00',
      enabled: typeof t.enabled === 'boolean' ? t.enabled : true,
    }));
}

/** Normalisasi prefs.tal mentah (dari body POST / kolom Json) ke bentuk kanonik. */
export function normalizeTalPrefs(raw: unknown): TalUserNotificationSettings {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const d = DEFAULT_TAL_PREFS;
  return {
    userEmail: typeof r.userEmail === 'string' ? r.userEmail : '',
    userName: typeof r.userName === 'string' ? r.userName : undefined,
    dndMode: asBool(r.dndMode, d.dndMode),
    channelTal: asBool(r.channelTal, d.channelTal),
    channelGlobal: asBool(r.channelGlobal, d.channelGlobal),
    channelSound: asBool(r.channelSound, d.channelSound),
    channelBrowserPush: asBool(r.channelBrowserPush, d.channelBrowserPush),
    enableWeeklyPlanReminder: asBool(r.enableWeeklyPlanReminder, d.enableWeeklyPlanReminder),
    weeklyPlanTriggers: normalizeWeeklyTriggers(r.weeklyPlanTriggers, d.weeklyPlanTriggers),
    enableMonthlyPlanReminder: asBool(r.enableMonthlyPlanReminder, d.enableMonthlyPlanReminder),
    monthlyPlanTriggers: normalizeMonthlyTriggers(r.monthlyPlanTriggers, d.monthlyPlanTriggers),
    enableWeeklyPlanLockReminder: asBool(
      r.enableWeeklyPlanLockReminder,
      d.enableWeeklyPlanLockReminder
    ),
    weeklyPlanLockTriggers: normalizeWeeklyTriggers(
      r.weeklyPlanLockTriggers,
      d.weeklyPlanLockTriggers
    ),
    enableMonthlyPlanLockReminder: asBool(
      r.enableMonthlyPlanLockReminder,
      d.enableMonthlyPlanLockReminder
    ),
    monthlyPlanLockTriggers: normalizeMonthlyTriggers(
      r.monthlyPlanLockTriggers,
      d.monthlyPlanLockTriggers
    ),
    enableTaskExecutionReminder: asBool(
      r.enableTaskExecutionReminder,
      d.enableTaskExecutionReminder
    ),
    defaultTaskReminderMinutes: [15, 30, 60].includes(asNum(r.defaultTaskReminderMinutes, 15))
      ? asNum(r.defaultTaskReminderMinutes, 15)
      : 15,
    enableDailyReportReminder: asBool(r.enableDailyReportReminder, d.enableDailyReportReminder),
    dailyReportTriggers: normalizeReportTriggers(r.dailyReportTriggers, d.dailyReportTriggers),
    enableWeeklyReportReminder: asBool(
      r.enableWeeklyReportReminder,
      d.enableWeeklyReportReminder
    ),
    weeklyReportTriggers: normalizeReportTriggers(
      r.weeklyReportTriggers,
      d.weeklyReportTriggers
    ),
    enableMonthlyReportReminder: asBool(
      r.enableMonthlyReportReminder,
      d.enableMonthlyReportReminder
    ),
    monthlyReportTriggers: normalizeReportTriggers(
      r.monthlyReportTriggers,
      d.monthlyReportTriggers
    ),
    notifyOnTaskAssigned: asBool(r.notifyOnTaskAssigned, d.notifyOnTaskAssigned),
    notifyOnTaskRollover: asBool(r.notifyOnTaskRollover, d.notifyOnTaskRollover),
    notifyOnTaskBlocker: asBool(r.notifyOnTaskBlocker, d.notifyOnTaskBlocker),
    notifyOnReportEvaluation: asBool(r.notifyOnReportEvaluation, d.notifyOnReportEvaluation),
  };
}

/** Gabung prefs tersimpan di atas default (kunci yang hilang = default). */
export function mergeTalPrefs(raw: unknown): TalUserNotificationSettings {
  return normalizeTalPrefs(raw);
}

/** Ambil prefs.tal dari kolom prefs NotificationPreference (mentah). */
export function talPrefsFromRowPrefs(prefs: unknown): TalUserNotificationSettings {
  const r = prefs && typeof prefs === 'object' ? (prefs as Record<string, unknown>) : {};
  return normalizeTalPrefs(r.tal);
}
