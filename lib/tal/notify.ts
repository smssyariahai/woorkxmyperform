// lib/tal/notify.ts — tulis notifikasi TAL via model Notification woork.
// Porting dispatchTalDualNotification (talService.ts:1414-1572) TANPA sisi
// "global" (di WOORK itu pengumuman Gelombang 3) — hanya in-app.
// TIDAK ada route POST publik untuk membuat notifikasi (lubang spam);
// fungsi ini hanya dipanggil server-side dari aksi task/lock/report/blocker.
//
// Aturan (persis backup): baca NotificationPreference penerima, cek
// prefs.tal; bila dndMode true (kecuali TAL_TEST) atau kanal/kategori
// dimatikan → jangan tulis baris Notification.

import type { PrismaClient } from '@prisma/client';
import { talPrefsFromRowPrefs } from './preferences';
import type { TalNotificationCategory } from './types';

/** Pemetaan kategori backup → type Notification woork (prefix TAL_). */
export const TAL_TYPE_BY_CATEGORY: Record<TalNotificationCategory, string> = {
  assignment: 'TAL_ASSIGNMENT',
  deadline_plan: 'TAL_DEADLINE_PLAN',
  deadline_report: 'TAL_DEADLINE_REPORT',
  blocker_alert: 'TAL_BLOCKER',
  rollover_alert: 'TAL_ROLLOVER',
  scoring: 'TAL_SCORING',
  system_reminder: 'TAL_REMINDER',
  test: 'TAL_TEST',
};

/** Flag prefs.tal yang mengendalikan tiap kategori (null = hanya channelTal). */
const CATEGORY_FLAG: Record<TalNotificationCategory, string | null> = {
  assignment: 'notifyOnTaskAssigned',
  deadline_plan: null,
  deadline_report: null,
  blocker_alert: 'notifyOnTaskBlocker',
  rollover_alert: 'notifyOnTaskRollover',
  scoring: 'notifyOnReportEvaluation',
  system_reminder: null,
  test: null,
};

export interface DispatchTalNotificationInput {
  organizationId: string;
  userId: string;
  category: TalNotificationCategory;
  title: string;
  body?: string;
}

/**
 * Tulis satu notifikasi TAL bila preferensi penerima mengizinkan.
 * Mengembalikan true bila baris Notification dibuat, false bila dilewati
 * karena preferensi (DND / kanal / kategori dimatikan).
 */
export async function dispatchTalNotification(
  prisma: PrismaClient,
  input: DispatchTalNotificationInput
): Promise<boolean> {
  const prefRow = await prisma.notificationPreference.findUnique({
    where: {
      organizationId_userId: { organizationId: input.organizationId, userId: input.userId },
    },
    select: { prefs: true },
  });
  const prefs = talPrefsFromRowPrefs(prefRow?.prefs ?? {});
  if (input.category !== 'test' && prefs.dndMode) return false;
  if (!prefs.channelTal) return false;
  const flag = CATEGORY_FLAG[input.category];
  if (flag && (prefs as unknown as Record<string, unknown>)[flag] === false) return false;

  await prisma.notification.create({
    data: {
      organizationId: input.organizationId,
      userId: input.userId,
      type: TAL_TYPE_BY_CATEGORY[input.category],
      title: input.title,
      body: input.body ?? '',
    },
  });
  return true;
}
