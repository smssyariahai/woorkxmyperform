/**
 * Status operasional agent untuk tampilan Kantor Virtual.
 *
 * Diturunkan SELALU dari data nyata (bukan simulasi), dengan precedence:
 *   OFFLINE  — agent dinonaktifkan (isEnabled=false)
 *   ERROR    — status terakhir ERROR / tugas terakhir FAILED tanpa retry tersisa
 *   WORKING  — ada tugas aktif (QUEUED/RUNNING/WAITING_APPROVAL) atau state kerja
 *   IDLE     — aktif & tersedia, tidak sedang mengerjakan apa pun (= "Online")
 *
 * Terinspirasi prinsip "hanya tampilkan kerja yang teratribusi" dari proyek
 * "ruang" (MIT, yugienugraha) — lihat NOTICE-KANTOR-3D.md.
 */

export type OpStatus = 'OFFLINE' | 'ERROR' | 'WORKING' | 'IDLE';

export const OP_STATUS_LABEL: Record<OpStatus, string> = {
  OFFLINE: 'Offline',
  ERROR: 'Error',
  WORKING: 'Working',
  IDLE: 'Online',
};

export const OP_STATUS_SUB: Record<OpStatus, string> = {
  OFFLINE: 'tidak aktif',
  ERROR: 'terdeteksi kendala',
  WORKING: 'mengerjakan tugas',
  IDLE: 'siaga · tersedia',
};

const ACTIVE_TASK = new Set(['QUEUED', 'RUNNING', 'WAITING_APPROVAL']);
const WORKING_STATES = new Set(['WORKING', 'TYPING', 'THINKING', 'READING', 'COMMUNICATING', 'EXECUTING_TASK', 'WAITING_APPROVAL']);

export function opStatusOf(a: {
  isEnabled: boolean;
  currentStatus: string;
  currentTask?: { status: string } | null;
}): OpStatus {
  if (!a.isEnabled) return 'OFFLINE';
  if (a.currentStatus === 'ERROR') return 'ERROR';
  if (a.currentTask && ACTIVE_TASK.has(a.currentTask.status)) return 'WORKING';
  if (WORKING_STATES.has(a.currentStatus)) return 'WORKING';
  return 'IDLE';
}
