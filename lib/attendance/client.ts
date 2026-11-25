// WOORK ATTENDANCE — helper client-side (murni, tanpa import server).
// Tipe cermin serialisasi backend + fetch unwrap + util tanggal Jakarta +
// Haversine untuk jarak ke lokasi terdekat (dipakai kartu Check In).

import {
  apiJson,
  formatTimeId,
  formatTimeSecondsId,
  formatDateLongId,
  formatDateShortId,
  toJakartaDateKey,
  jakartaParts,
} from '@/lib/calendar/client';
import { haversineMeters } from './geo';

export { apiJson, formatTimeId, formatTimeSecondsId, formatDateLongId, formatDateShortId, toJakartaDateKey, jakartaParts };
export { haversineMeters };

// ---------------------------------------------------------------------------
// Tipe (cermin serialisasi backend)
// ---------------------------------------------------------------------------

export interface AttendanceSetting {
  requireGeofence: boolean;
  allowRemoteCheckIn: boolean;
  defaultLocationId: string | null;
  graceLateMinutes: number;
  workDays: number[];
}

export interface AttendanceSettings extends AttendanceSetting {
  id: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface AttendanceLocation {
  id: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Shift {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  isNightShift: boolean;
  breakMinutes: number;
  graceLateMinutes: number;
  color: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WorkSchedule {
  id: string;
  name: string;
  userId: string | null;
  userName: string | null;
  departmentId: string | null;
  departmentName: string | null;
  daysOfWeek: Record<string, string | null>;
  isDefault: boolean;
  isActive: boolean;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AttendanceRecord {
  id: string;
  date: string;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  position: string | null;
  department: string | null;
  shiftId: string | null;
  shiftName: string | null;
  shiftStartTime: string | null;
  shiftEndTime: string | null;
  scheduleId: string | null;
  scheduleName: string | null;
  locationId: string | null;
  locationName: string | null;
  checkInAt: string | null;
  checkInMethod: string | null;
  checkInNote: string | null;
  checkOutAt: string | null;
  checkOutMethod: string | null;
  checkOutNote: string | null;
  status: string;
  statusLabel: string;
  lateMinutes: number;
  earlyMinutes: number;
  overtimeMinutes: number;
  workMinutes: number;
  breakMinutes: number;
  isRemote: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TodayStatus {
  date: string;
  timezone: string;
  record: AttendanceRecord | null;
  shift: {
    id: string;
    name: string;
    startTime: string;
    endTime: string;
    isNightShift: boolean;
    breakMinutes: number;
    graceLateMinutes: number;
    color: string | null;
  } | null;
  schedule: { id: string; name: string; source: string } | null;
  window: { startAt: string; endAt: string; isNight: boolean; scheduledMinutes: number } | null;
  isHoliday: boolean;
  holidayName: string | null;
  isOnLeave: boolean;
  setting: AttendanceSetting;
  locations: Array<{
    id: string;
    name: string;
    address: string | null;
    latitude: number;
    longitude: number;
    radiusMeters: number;
    isDefault: boolean;
  }>;
  canCheckIn: boolean;
  canCheckOut: boolean;
  openRecordDate: string | null;
}

export interface CheckInResult {
  record: AttendanceRecord;
  lateMinutes: number;
  workDate: string;
  shift: { id: string; name: string; startTime: string; endTime: string } | null;
  locationName: string | null;
  distanceMeters: number | null;
  isRemote: boolean;
  message: string;
}

export interface CheckOutResult {
  record: AttendanceRecord;
  lateMinutes: number;
  earlyMinutes: number;
  workMinutes: number;
  overtimeMinutes: number;
  message: string;
}

export interface RecordsSummary {
  total: number;
  present: number;
  late: number;
  earlyLeave: number;
  incomplete: number;
  totalLateMinutes: number;
  totalEarlyMinutes: number;
  totalOvertimeMinutes: number;
  totalWorkMinutes: number;
  alpha: number | null;
  leaveDays: number;
  holidayDays: number;
}

export interface RecordsResponse {
  records: AttendanceRecord[];
  total: number;
  page: number;
  limit: number;
  summary: RecordsSummary;
}

export interface Correction {
  id: string;
  recordId: string;
  recordDate: string | null;
  requestedById: string;
  requestedByName: string | null;
  type: string;
  reason: string;
  requestedValue: Record<string, unknown>;
  status: string;
  reviewedById: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OvertimeItem {
  id: string;
  userId: string;
  userName: string | null;
  date: string;
  startTime: string;
  endTime: string;
  isNight: boolean;
  durationMinutes: number;
  reason: string;
  status: string;
  approvedById: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TeamMember {
  userId: string;
  name: string | null;
  email: string | null;
  position: string | null;
  department: string | null;
  status: string;
  checkInAt?: string;
  checkOutAt?: string;
  locationName?: string | null;
  shiftName?: string | null;
  meeting?: { id: string; title: string; startsAt: string; endsAt: string | null } | null;
  note?: string;
}

export interface TeamResponse {
  date: string;
  isHoliday: boolean;
  holidayName: string | null;
  scope: string;
  counts: { online: number; inMeeting: number; onLeave: number; off: number };
  online: TeamMember[];
  inMeeting: TeamMember[];
  onLeave: TeamMember[];
  off: TeamMember[];
}

export interface DashboardTotals {
  activeEmployees: number;
  present: number;
  late: number;
  earlyLeave: number;
  incomplete: number;
  absent: number;
  notYetCheckedIn: number;
  leave: number;
  holiday: boolean;
  holidayName: string | null;
  workDays: number;
}

export interface DashboardResponse {
  date: string;
  isToday: boolean;
  scope: string;
  departmentId: string | null;
  totals: DashboardTotals;
  byDepartment: Array<{
    departmentId: string | null;
    departmentName: string;
    total: number;
    present: number;
    late: number;
    absent: number;
    leave: number;
  }>;
  byLocation: Array<{ locationId: string | null; locationName: string; count: number }>;
  trend: Array<{
    date: string;
    present: number;
    late: number;
    earlyLeave: number;
    incomplete: number;
    absent: number;
    leave: number;
    holiday: boolean;
    workDays: number;
  }>;
  lateToday: AttendanceRecord[];
  notCheckedOut: AttendanceRecord[];
}

export interface ReportRow {
  userId: string;
  name: string | null;
  email: string | null;
  position: string | null;
  department: string | null;
  workDays: number;
  present: number;
  late: number;
  lateMinutes: number;
  earlyLeave: number;
  earlyMinutes: number;
  incomplete: number;
  overtimeMinutes: number;
  workMinutes: number;
  absent: number;
  leaveDays: number;
  holidayDays: number;
}

export interface ReportResponse {
  from: string;
  to: string;
  scope: string;
  totals: {
    workDays: number;
    present: number;
    late: number;
    earlyLeave: number;
    incomplete: number;
    lateMinutes: number;
    earlyMinutes: number;
    overtimeMinutes: number;
    workMinutes: number;
    absent: number;
    leaveDays: number;
    holidayDays: number;
  };
  rows: ReportRow[];
  days: Array<{
    date: string;
    present: number;
    late: number;
    earlyLeave: number;
    incomplete: number;
    absent: number;
    leave: number;
    holiday: boolean;
    workDays: number;
  }>;
}

export interface TeamApiMember {
  user: { id: string; name: string | null; email: string | null };
  role?: { name?: string };
  department?: { id?: string; name?: string } | null;
}

// ---------------------------------------------------------------------------
// Label & gaya status
// ---------------------------------------------------------------------------

export const RECORD_STATUS_LABELS: Record<string, string> = {
  PRESENT: 'Hadir',
  LATE: 'Terlambat',
  EARLY_LEAVE: 'Pulang Awal',
  ABSENT: 'Alpha',
  ON_LEAVE: 'Cuti',
  HOLIDAY: 'Libur',
  INCOMPLETE: 'Belum Check Out',
};

export function recordStatusLabel(status: string): string {
  return RECORD_STATUS_LABELS[status] ?? status;
}

/** Kelas badge per status (warna semantik, aman di light/dark). */
export const RECORD_STATUS_BADGE: Record<string, string> = {
  PRESENT: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  LATE: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  EARLY_LEAVE: 'bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  ABSENT: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  ON_LEAVE: 'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  HOLIDAY: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  INCOMPLETE: 'bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
};

export function recordStatusBadge(status: string): string {
  return RECORD_STATUS_BADGE[status] ?? RECORD_STATUS_BADGE.HOLIDAY;
}

export const CORRECTION_TYPE_LABELS: Record<string, string> = {
  CHECK_IN: 'Jam Masuk',
  CHECK_OUT: 'Jam Pulang',
  STATUS: 'Status',
  DATE: 'Tanggal',
};

export const REVIEW_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Menunggu',
  APPROVED: 'Disetujui',
  REJECTED: 'Ditolak',
};

export const REVIEW_STATUS_BADGE: Record<string, string> = {
  PENDING: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  APPROVED: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  REJECTED: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

export const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
export const DAY_SHORT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

export const METHOD_LABELS: Record<string, string> = {
  WEB: 'Website',
  WHATSAPP: 'WhatsApp',
  MANUAL: 'Manual (HRD)',
};

// ---------------------------------------------------------------------------
// Format
// ---------------------------------------------------------------------------

/** "1 jam 30 mnt" / "45 mnt" / "0 mnt". */
export function formatMinutes(mins: number): string {
  const m = Math.max(0, Math.round(mins));
  if (m < 60) return `${m} mnt`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r === 0 ? `${h} jam` : `${h} jam ${r} mnt`;
}

/** "45 m" / "1,2 km". */
export function formatDistance(meters: number | null | undefined): string {
  if (meters === null || meters === undefined || Number.isNaN(meters)) return '—';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} km`;
}

/** "HH:MM" -> "08.00" (tampilan Indonesia). */
export function formatHHMM(hhmm: string | null | undefined): string {
  if (!hhmm) return '—';
  return hhmm.replace(':', '.');
}

/** "YYYY-MM-DD" -> "21 Nov 2026". */
export function formatDateKey(key: string | null | undefined): string {
  if (!key) return '—';
  const [y, m, d] = key.split('-').map(Number);
  if (!y || !m || !d) return key;
  return formatDateShortId(new Date(Date.UTC(y, m - 1, d) - 7 * 3600 * 1000));
}

/** Validasi format HH:MM (00:00–23:59). */
export function isValidHHMM(v: string): boolean {
  const m = /^(\d{2}):(\d{2})$/.exec(v.trim());
  if (!m) return false;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h >= 0 && h <= 23 && min >= 0 && min <= 59;
}

/** "YYYY-MM-DD" hari ini (Jakarta). */
export function todayKeyJakarta(): string {
  return toJakartaDateKey(new Date());
}

/** Geser tanggal "YYYY-MM-DD" sebanyak n hari. */
export function shiftDateKey(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d) + days * 24 * 3600 * 1000);
  return dt.toISOString().slice(0, 10);
}
