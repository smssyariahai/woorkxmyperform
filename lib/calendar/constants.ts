// WOORK WORK CALENDAR — konstanta pusat.
// Warna kategori konsisten dipakai semua tampilan kalender (list, month,
// agenda, upcoming) agar satu kategori selalu satu warna.

export const EVENT_CATEGORIES = [
  { key: 'meeting', label: 'Meeting', color: '#2563eb' },
  { key: 'task', label: 'Tugas / Deadline', color: '#d97706' },
  { key: 'project', label: 'Proyek', color: '#7c3aed' },
  { key: 'hr', label: 'HR / Rekrutmen', color: '#db2777' },
  { key: 'leave', label: 'Cuti', color: '#059669' },
  { key: 'attendance', label: 'Kehadiran / Shift', color: '#0891b2' },
  { key: 'training', label: 'Pelatihan', color: '#65a30d' },
  { key: 'company', label: 'Acara Perusahaan', color: '#4f46e5' },
  { key: 'personal', label: 'Pribadi', color: '#64748b' },
  { key: 'finance', label: 'Keuangan / Akuntansi', color: '#b45309' },
  { key: 'reminder', label: 'Pengingat', color: '#e11d48' },
  { key: 'other', label: 'Lainnya', color: '#6b7280' },
] as const;

export type EventCategoryKey = (typeof EVENT_CATEGORIES)[number]['key'];

export const EVENT_CATEGORY_KEYS = EVENT_CATEGORIES.map((c) => c.key) as string[];

export const EVENT_CATEGORY_MAP: Record<string, { label: string; color: string }> =
  Object.fromEntries(EVENT_CATEGORIES.map((c) => [c.key, { label: c.label, color: c.color }]));

export function categoryColor(category: string): string {
  return EVENT_CATEGORY_MAP[category]?.color ?? '#6b7280';
}

export function categoryLabel(category: string): string {
  return EVENT_CATEGORY_MAP[category]?.label ?? 'Lainnya';
}

export const EVENT_VISIBILITIES = ['PRIVATE', 'TEAM', 'DEPARTMENT', 'COMPANY', 'CUSTOM'] as const;
export type EventVisibility = (typeof EVENT_VISIBILITIES)[number];

export const EVENT_STATUSES = ['SCHEDULED', 'COMPLETED', 'CANCELLED'] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const RSVP_STATUSES = ['PENDING', 'ACCEPTED', 'DECLINED', 'TENTATIVE'] as const;
export type RsvpStatus = (typeof RSVP_STATUSES)[number];

export const REMINDER_STATUSES = ['PENDING', 'SENT', 'FAILED'] as const;
export type ReminderStatus = (typeof REMINDER_STATUSES)[number];

export const SYNC_STATUSES = ['SYNCED', 'FAILED', 'PENDING'] as const;

// Modul sumber yang VALID untuk sinkronisasi. Hanya modul yang benar-benar
// ada di schema Prisma WOORK. Jangan tambah sumber tanpa model di schema.
// 'attendance' = OvertimeRequest yang disetujui (lembur masuk kalender);
// fetch/map-nya ada di lib/calendar/sync.ts (mapOvertime) — tanpa case itu,
// syncSourceEvent akan menganggap record hilang dan MENGHAPUS event lembur.
export const SOURCE_MODULES = [
  'meeting',
  'tal_task',
  'tal_cuti',
  'invoice',
  'announcement',
  'holiday',
  'attendance',
] as const;
export type SourceModule = (typeof SOURCE_MODULES)[number];

export const SOURCE_MODULE_LABELS: Record<SourceModule, string> = {
  meeting: 'WOORK MEET',
  tal_task: 'TAL — Tugas',
  tal_cuti: 'TAL — Cuti',
  invoice: 'Tagihan',
  announcement: 'Pengumuman',
  holiday: 'TAL — Hari Libur',
  attendance: 'Attendance — Lembur',
};

export function isValidSourceModule(v: unknown): v is SourceModule {
  return typeof v === 'string' && (SOURCE_MODULES as readonly string[]).includes(v);
}

/** URL halaman modul sumber untuk tombol "Buka di modul sumber". null = tidak ada halaman detail. */
export function sourceUrl(sourceModule: string | null, sourceRecordId: string | null): string | null {
  if (!sourceModule || !sourceRecordId) return null;
  switch (sourceModule) {
    case 'meeting':
      return `/meet/${sourceRecordId}`;
    case 'tal_task':
      return '/tal/tasks';
    case 'tal_cuti':
      return '/tal/kalender-kerja';
    case 'announcement':
      return `/pengumuman/${sourceRecordId}`;
    case 'holiday':
      return '/tal/kalender-kerja';
    case 'attendance':
      return '/absensi';
    case 'invoice':
      // Tidak ada halaman detail invoice untuk anggota kantor (hanya
      // /admin/invoices untuk Administrator Pusat).
      return null;
    default:
      return null;
  }
}

export const DEFAULT_TIMEZONE = 'Asia/Jakarta';

export const CALENDAR_VIEWS = ['day', 'week', 'month', 'agenda', 'year', 'timeline'] as const;
export type CalendarView = (typeof CALENDAR_VIEWS)[number];

/** Batas rentang baca kalender (hari) — mencegah ledakan occurrence berulang. */
export const MAX_RANGE_DAYS = 366;
/** Batas occurrence saat ekspansi satu event berulang. */
export const MAX_OCCURRENCES = 366;
