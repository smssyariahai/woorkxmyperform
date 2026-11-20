// lib/tal/types.ts — porting src/types/tal.ts backup (MyPerform) ke WOORK.
// Perubahan vs backup: kunci utama userId (bukan userEmail); userEmail tetap
// disimpan denormalisasi di TalTask untuk view tim. Tidak ada impor firebase/
// router; tipe murni TypeScript.
export type TalTaskType = 'daily' | 'weekly' | 'monthly';
export type TalPriority = 'low' | 'medium' | 'high';
export type TalStatus = 'todo' | 'pending' | 'on_progress' | 'done';
export type TalCategory = 'result' | 'non_result';
export type TalTargetUnit = 'Rupiah' | 'NOA' | 'Unit' | 'Custom';
export type TalViewMode = 'card' | 'table';

export type TalBlockerCategory = 
  | 'Menunggu Vendor/Pihak Ketiga'
  | 'Klien Reschedule'
  | 'Kendala Teknis/Sistem'
  | 'Kekurangan Data/Dokumen'
  | 'Interupsi Tugas Urgent'
  | 'Lain-lain';

export const TAL_BLOCKER_CATEGORIES: TalBlockerCategory[] = [
  'Menunggu Vendor/Pihak Ketiga',
  'Klien Reschedule',
  'Kendala Teknis/Sistem',
  'Kekurangan Data/Dokumen',
  'Interupsi Tugas Urgent',
  'Lain-lain'
];

export interface TalTaskRolloverDecision {
  taskId: string;
  action: 'rollover_tomorrow' | 'rollover_date' | 'cancelled';
  targetDate?: string; // Format YYYY-MM-DD (daily)
  targetWeekNumber?: number; // (weekly)
  targetWeekYear?: number; // (weekly)
  targetMonth?: number; // (monthly 1-12)
  targetYear?: number; // (monthly)
  cancelNotes?: string; // Catatan evaluasi jika opsi C (cancelled)
}

export interface TalAttachment {
  id: string;
  name: string;
  url: string;
  type: 'image' | 'video' | 'file';
  size?: number;
  uploadedAt: string;
}

export interface TalAssignedUser {
  id?: string;
  email: string;
  name: string;
  username?: string;
  fotoProfile?: string;
}

export interface TalUserOption {
  id: string;
  uid?: string;
  email: string;
  name: string;
  username: string;
  fotoProfile?: string;
  role?: string;
  posisi?: string;
  divisi?: string;
  level?: number;
}

export interface TalTaskItem {
  id: string;
  type: TalTaskType;
  isAdditional?: boolean; // Tugas tambahan (hanya di daily)
  originalTaskId?: string; // Tercatat jika task merupakan hasil rollover dari tugas lain
  
  // Date & Period coordinates
  date?: string; // Format: YYYY-MM-DD (untuk daily)
  time?: string; // Format: HH:mm (e.g. "08:11")
  weekNumber: number; // 1 - 53 (Nomor minggu)
  weekYear: number; // Tahun minggu bersangkutan (e.g. 2026)
  month: number; // 1 - 12 (Bulan bersangkutan)
  year: number; // Tahun bersangkutan (e.g. 2026)
  
  // 1. Detail Task
  title: string;
  description?: string;
  parentId?: string; // Daily parent -> weekly task; Weekly parent -> monthly task
  parentTitle?: string;
  category: TalCategory; // 'result' | 'non_result'
  targetValue?: number; // Nilai target jika category === 'result'
  targetUnit?: TalTargetUnit; // 'Rupiah' | 'NOA' | 'Unit' | 'Custom'
  targetCustomUnit?: string;
  priority: TalPriority; // 'low' (hijau) | 'medium' (oren) | 'high' (merah)
  assignedTo: string[]; // List nama karyawan/user, kosong = diri sendiri
  assignedUserEmails?: string[]; // List email user yang ditugaskan
  assignedUsers?: TalAssignedUser[]; // Detail profil user yang ditugaskan (termasuk fotoProfile)
  
  // 2. Progress Task & Blocker Tracking
  status: TalStatus; // 'todo' | 'pending' | 'on_progress' | 'done'
  notes?: string;
  attachments?: TalAttachment[];
  actualValue?: number; // Nilai realisasi/pencapaian

  // Blocker Tracking (Wajib jika status Pending)
  blockerCategory?: TalBlockerCategory | string;
  blockerDescription?: string;
  blockerReportedAt?: string;

  // Task Rollover Tracking (Saat submit Report)
  isRolledOver?: boolean;
  rolloverAction?: 'rollover_tomorrow' | 'rollover_date' | 'cancelled';
  rolloverTargetDate?: string;
  rolloverTargetWeek?: number;
  rolloverTargetYear?: number;
  rolloverTargetMonth?: number;
  cancelNotes?: string;

  // 9.3 Task Execution Reminder (Notifikasi Pengerjaan Task)
  enableReminder?: boolean;
  reminderType?: 'minutes_before' | 'specific_time' | 'custom_time'; // 'minutes_before' (15/30/60m) or 'specific_time' / 'custom_time'
  reminderMinutesBefore?: number; // 15, 30, 60
  reminderTime?: string; // HH:mm
  reminderLastTriggeredAt?: string;
  
  // Metadata & Order
  order?: number;
  userId: string;
  userEmail?: string;
  userName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TalScopeLockReport {
  id: string; // e.g. "lock_daily_2026-09-07_uid", "lock_weekly_2026-W37_uid", "lock_monthly_2026-09_uid"
  scope: TalTaskType; // 'daily' | 'weekly' | 'monthly'
  scopeKey: string; // "2026-09-07" | "2026-W37" | "2026-09"
  userId: string;
  userEmail?: string;
  userName?: string;
  userPhoto?: string;
  type?: TalTaskType;
  date?: string;
  weekNumber?: number;
  weekYear?: number;
  month?: number;
  year?: number;
  
  // Tanggal/Periode Info
  infoTglTask?: string; // e.g. "08/09/2026", "Week 37 (2026)", "September 2026"
  
  // Plan lock state (mengunci detail task)
  isPlanLocked: boolean;
  planLockedAt?: string; // Timestamp ISO string
  lockedAt?: string;
  lockedBy?: string;
  lockNotes?: string;
  taskCount?: number; // Jumlah task saat penguncian Plan
  planScore?: number; // Nilai Perencanaan (100 jika tepat waktu, 50 jika lewat batas waktu)
  planDeadlineAt?: string; // ISO string batas waktu plan

  // Realisasi / Progress stage metrics
  progressScore?: number; // Nilai Realisasi / Progress = (Main Done + Add Done) / Total Main (Maks. 100%)

  // Report state (mengunci progress task)
  isReported: boolean;
  reportedAt?: string; // Timestamp ISO string
  reportedBy?: string;
  reportNotes?: string;
  reportScore?: number; // Nilai Report (100 jika tepat waktu, 50 jika lewat batas waktu atau jika planScore week = 50)
  reportDeadlineAt?: string; // ISO string batas waktu report
  
  // Report metrics
  totalTaskCount?: number;
  mainTaskCount?: number;
  additionalTaskCount?: number;
  doneTaskCount?: number;
  pendingTaskCount?: number;
  scorePercent?: number;
  mainDoneCount?: number;
  mainPendingCount?: number;
  additionalDoneCount?: number;
  additionalPendingCount?: number;
  
  // Report summary
  reportSummary?: {
    totalTasks: number;
    mainTasks?: number;
    additionalTasks?: number;
    doneTasks: number;
    pendingTasks: number;
    mainDone?: number;
    mainPending?: number;
    additionalDone?: number;
    additionalPending?: number;
    scorePercent?: number;
    formula?: string;
    onProgressTasks: number;
    todoTasks: number;
    targetTotal?: number;
    actualTotal?: number;
    achievementPercent?: number;
    notes?: string;
  };

  // Cuti info
  isCuti?: boolean;
  cutiReason?: string;
}

export interface TalCutiRecord {
  id?: string; // e.g. "cuti_2026-09-07_uid"
  date: string; // YYYY-MM-DD
  userId: string;
  userEmail?: string;
  userName?: string;
  reason?: string;
  isCuti?: boolean;
  createdAt?: string;
}

export type TalNotificationCategory = 
  | 'assignment' 
  | 'deadline_plan' 
  | 'deadline_report' 
  | 'blocker_alert' 
  | 'rollover_alert' 
  | 'scoring' 
  | 'system_reminder' 
  | 'test';

export interface TalNotification {
  id: string;
  recipientEmail: string;
  senderEmail: string;
  senderName: string;
  senderPhoto?: string;
  taskId?: string;
  taskTitle?: string;
  taskType?: TalTaskType;
  taskDate?: string;
  taskWeek?: string;
  taskMonth?: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  category?: TalNotificationCategory;
  priority?: 'normal' | 'penting' | 'mendesak';
  actionUrl?: string;
}

export interface TalWeeklyPlanTrigger {
  id: string;
  label: string;
  day: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
  time: string; // HH:mm
  enabled?: boolean;
}

export interface TalMonthlyPlanTrigger {
  id: string;
  label: string;
  timingType: 'h_minus_days_end_month' | 'first_workday';
  daysBefore?: number;
  time: string; // HH:mm
  enabled?: boolean;
}

export interface TalReportTrigger {
  id: string;
  label: string;
  leadType: 'H-0' | 'H+1' | 'H-1' | 'H-2' | 'H+2' | string;
  day?: string; // e.g. 'friday' | 'saturday'
  time: string; // HH:mm
  enabled?: boolean;
}

export interface TalUserNotificationSettings {
  userId?: string;
  userEmail: string;
  userName?: string;

  // Master Switch: Do Not Disturb
  dndMode: boolean; // Matikan Semua Notifikasi Eksternal (hanya simpan pasif di In-App Bell)

  // Channels
  channelTal: boolean; // Notifikasi internal TAL (Bell icon)
  channelGlobal: boolean; // Notifikasi Global Portal
  channelSound: boolean; // Suara chime saat notifikasi masuk
  channelBrowserPush: boolean; // Web browser push notification

  // 1. Notifikasi Pembuatan Plan Mingguan
  enableWeeklyPlanReminder: boolean;
  weeklyPlanTriggers: TalWeeklyPlanTrigger[];

  // 2. Notifikasi Pembuatan Plan Bulanan
  enableMonthlyPlanReminder: boolean;
  monthlyPlanTriggers: TalMonthlyPlanTrigger[];

  // 3. Notifikasi Batas Kunci Plan Mingguan
  enableWeeklyPlanLockReminder: boolean;
  weeklyPlanLockTriggers: TalWeeklyPlanTrigger[];

  // 4. Notifikasi Batas Kunci Plan Bulanan
  enableMonthlyPlanLockReminder: boolean;
  monthlyPlanLockTriggers: TalMonthlyPlanTrigger[];

  // 5. Notifikasi Pengingat Pengerjaan Task (Per-task alert)
  enableTaskExecutionReminder: boolean;
  defaultTaskReminderMinutes: number; // 15, 30, 60

  // 6. Notifikasi Batas Pelaporan Harian
  enableDailyReportReminder: boolean;
  dailyReportTriggers: TalReportTrigger[];

  // 7. Notifikasi Batas Pelaporan Mingguan
  enableWeeklyReportReminder: boolean;
  weeklyReportTriggers: TalReportTrigger[];

  // 8. Notifikasi Batas Pelaporan Bulanan
  enableMonthlyReportReminder: boolean;
  monthlyReportTriggers: TalReportTrigger[];

  // 9. Notifikasi Penugasan, Blocker, & Evaluasi
  notifyOnTaskAssigned: boolean;
  notifyOnTaskRollover: boolean;
  notifyOnTaskBlocker: boolean;
  notifyOnReportEvaluation: boolean;

  updatedAt?: string;
}

export const DEFAULT_TAL_NOTIFICATION_SETTINGS: TalUserNotificationSettings = {
  userEmail: '',
  dndMode: false,
  channelTal: true,
  channelGlobal: true,
  channelSound: true,
  channelBrowserPush: false,

  // 1. Rencana Mingguan (Default: Sabtu siang & Selasa 13:00)
  enableWeeklyPlanReminder: true,
  weeklyPlanTriggers: [
    { id: 'wp_1', label: 'Pengingat Awal Rencana', day: 'saturday', time: '12:00' },
    { id: 'wp_2', label: 'Pengingat H-3 Jam Cut-off', day: 'tuesday', time: '13:00' }
  ],

  // 2. Rencana Bulanan (Default: H-3 09:00 & Tgl 1 Hari Pertama 08:30)
  enableMonthlyPlanReminder: true,
  monthlyPlanTriggers: [
    { id: 'mp_1', label: 'H-3 Sebelum Akhir Bulan', timingType: 'h_minus_days_end_month', daysBefore: 3, time: '09:00' },
    { id: 'mp_2', label: 'Hari Kerja Pertama Bulan Baru', timingType: 'first_workday', time: '08:30' }
  ],

  // 3. Batas Kunci Plan Mingguan
  enableWeeklyPlanLockReminder: true,
  weeklyPlanLockTriggers: [
    { id: 'wpl_1', label: 'Batas Kunci Plan Mingguan', day: 'tuesday', time: '16:00' }
  ],

  // 4. Batas Kunci Plan Bulanan
  enableMonthlyPlanLockReminder: true,
  monthlyPlanLockTriggers: [
    { id: 'mpl_1', label: 'Batas Kunci Target Bulanan', timingType: 'first_workday', time: '16:00' }
  ],

  // 5. Pengingat Pengerjaan Task
  enableTaskExecutionReminder: true,
  defaultTaskReminderMinutes: 15,

  // 6. Pelaporan Harian (Default: H-0 16:00, H+1 09:00)
  enableDailyReportReminder: true,
  dailyReportTriggers: [
    { id: 'dr_1', label: 'H-0 Batas Laporan Harian', leadType: 'H-0', time: '16:00' },
    { id: 'dr_2', label: 'H+1 Toleransi Laporan Pagi', leadType: 'H+1', time: '09:00' }
  ],

  // 7. Pelaporan Mingguan (Default: H-0 Jumat 16:00, H+1 Sabtu 09:00)
  enableWeeklyReportReminder: true,
  weeklyReportTriggers: [
    { id: 'wr_1', label: 'H-0 Akhir Minggu (Jumat)', leadType: 'H-0', day: 'friday', time: '16:00' },
    { id: 'wr_2', label: 'H+1 Akhir Minggu (Sabtu)', leadType: 'H+1', day: 'saturday', time: '09:00' }
  ],

  // 8. Pelaporan Bulanan (Default: H-0 16:00, H+1 09:00)
  enableMonthlyReportReminder: true,
  monthlyReportTriggers: [
    { id: 'mr_1', label: 'H-0 Batas Laporan Akhir Bulan', leadType: 'H-0', time: '16:00' },
    { id: 'mr_2', label: 'H+1 Toleransi Laporan Awal Bulan', leadType: 'H+1', time: '09:00' }
  ],

  // 9. Kolaborasi & Hasil
  notifyOnTaskAssigned: true,
  notifyOnTaskRollover: true,
  notifyOnTaskBlocker: true,
  notifyOnReportEvaluation: true
};

export interface TalHolidayItem {
  id: string;
  date: string; // YYYY-MM-DD
  title: string; // e.g. "Hari Kemerdekaan Republik Indonesia"
  description?: string;
  category?: 'nasional' | 'cuti_bersama' | 'kantor';
  isRecurringYearly?: boolean;
  createdAt?: string;
  createdBy?: string;
}

export interface TalDeadlineSettings {
  id?: string;
  planLockWeeklyDays: number; // H+X hari kerja dari awal minggu
  planLockWeeklyTime?: string; // HH:mm e.g. "23:59"
  planLockMonthlyDays: number; // H+X hari kerja dari awal bulan
  planLockMonthlyTime?: string; // HH:mm e.g. "23:59"
  reportDailyDays: number; // H+X hari kerja dari tanggal task harian
  reportDailyTime?: string; // HH:mm e.g. "23:59"
  reportWeeklyDays: number; // H+X hari kerja dari tanggal akhir minggu (Sabtu)
  reportWeeklyTime?: string; // HH:mm e.g. "23:59"
  reportMonthlyDays: number; // H+X hari kerja dari tanggal akhir bulan
  reportMonthlyTime?: string; // HH:mm e.g. "23:59"
  systemLockMonthlyDays?: number; // H+X hari kerja dari tanggal akhir bulan (default 5)
  systemLockMonthlyTime?: string; // HH:mm e.g. "16:00"
  systemLockEnabled?: boolean; // default true
  updatedAt?: string;
  updatedBy?: string;
}

export interface TalMonthLockRecord {
  id?: string; // e.g. "month_lock_2026-09"
  monthKey: string; // "2026-09"
  year: number;
  month: number;
  isLocked: boolean; // true = locked, false = unlocked
  manualOverride: boolean; // true if admin manually locked or unlocked
  lockedAt?: string;
  lockedBy?: string;
  unlockedAt?: string;
  unlockedBy?: string;
  reason?: string;
  createdAt?: string;
  updatedAt: string;
}

export interface TalCopyTarget {
  targetType: TalTaskType;
  targetDate?: string; // e.g. "2026-09-15"
  targetWeekNumber?: number; // e.g. 38
  targetWeekYear?: number; // e.g. 2026
  targetMonth?: number; // 1 - 12
  targetYear?: number; // e.g. 2026
}

export interface TalUserObligation {
  id: string; // Document ID (usually user email or userId sanitized)
  userId: string;
  userEmail: string;
  userName: string;
  userPhoto?: string;
  userRole?: string;
  userPosisi?: string;
  userDivisi?: string;
  daily: boolean; // default true
  weekly: boolean; // default true
  monthly: boolean; // default true
  updatedAt?: string;
  updatedBy?: string;
}

export interface TalAuditLog {
  id: string;
  actionType: 'delete_tasks' | 'unlock_plans' | 'reset_reports' | 'update_obligations' | 'lock_month_lock' | 'unlock_month_lock' | 'reset_month_lock_auto';
  actionTitle: string;
  adminEmail: string;
  adminName: string;
  reason: string;
  targetSummary: string;
  affectedCount: number;
  details?: any;
  createdAt: string;
}

export interface TalAdminTaskFilter {
  userEmails: string[]; // empty = all users
  taskTypes: TalTaskType[]; // empty = all types
  periodMode: 'all' | 'date_range' | 'specific_dates' | 'weeks' | 'months' | 'years';
  startDate?: string;
  endDate?: string;
  specificDates?: string[];
  selectedWeeks?: { year: number; weekNumber: number }[];
  selectedMonths?: { year: number; month: number }[];
  selectedYears?: number[];
  statusFilter?: string; // 'all' | 'todo' | 'on_progress' | 'pending' | 'done'
  searchKeyword?: string;
}

export interface TalAdminLockReportFilter {
  userEmails: string[]; // empty = all users
  scopeTypes: TalTaskType[]; // 'daily', 'weekly', 'monthly'
  periodMode: 'all' | 'date_range' | 'weeks' | 'months' | 'years';
  startDate?: string;
  endDate?: string;
  selectedWeeks?: { year: number; weekNumber: number }[];
  selectedMonths?: { year: number; month: number }[];
  selectedYears?: number[];
  onlyLocked?: boolean;
  onlyReported?: boolean;
}

// ----------------------------------------------------
// 9.7 Multi-Level Routine Task Templates Data Models
// ----------------------------------------------------

export interface TalRoutineMonthlyTask {
  id: string;
  title: string;
  description?: string;
  category: TalCategory;
  priority: TalPriority;
  targetValue?: number;
  targetUnit?: TalTargetUnit;
  targetCustomUnit?: string;
}

export interface TalRoutineWeeklyTask {
  id: string;
  title: string;
  description?: string;
  category: TalCategory;
  priority: TalPriority;
  targetValue?: number;
  targetUnit?: TalTargetUnit;
  targetCustomUnit?: string;
  parentMonthlyTaskTempId?: string; // Optional reference to a monthly task in this template
}

export interface TalRoutineDailyTask {
  id: string;
  title: string;
  description?: string;
  category: TalCategory;
  priority: TalPriority;
  time?: string; // e.g. "08:30"
  targetValue?: number;
  targetUnit?: TalTargetUnit;
  targetCustomUnit?: string;
  dayOffset: number; // 1 = Hari ke-1 (Senin), 2 = Hari ke-2 (Selasa), 3 = Rabu, 4 = Kamis, 5 = Jumat, 6 = Hari ke-6 (Sabtu)
  parentWeeklyTaskTempId?: string; // Optional reference to a weekly task in this template
  enableReminder?: boolean;
  reminderType?: 'minutes_before' | 'specific_time';
  reminderMinutesBefore?: number;
  reminderTime?: string;
}

export interface TalRoutineTemplate {
  id: string;
  name: string; // e.g. "Rutinitas Buka Cabang", "Rutinitas Penutupan Akhir Bulan", "Jadwal Audit Lapangan"
  description?: string;
  categoryTag?: string; // e.g. "Operasional", "Keuangan", "Audit", "Pemasaran", "Umum"
  color?: string; // Hex color or theme name
  isPreset?: boolean;
  userId?: string;
  userEmail?: string;
  userName?: string;
  monthlyTasks: TalRoutineMonthlyTask[];
  weeklyTasks: TalRoutineWeeklyTask[];
  dailyTasks: TalRoutineDailyTask[];
  createdAt: string;
  updatedAt: string;
}

export const TAL_DEFAULT_ROUTINE_TEMPLATES: TalRoutineTemplate[] = [
  {
    id: 'preset_buka_cabang',
    name: 'Rutinitas Buka Cabang Baru',
    description: 'Paket terintegrasi persiapan fisik, operasional kasir, sosialisasi, dan target pembukaan cabang baru.',
    categoryTag: 'Operasional',
    color: '#2563eb', // Blue
    isPreset: true,
    userId: 'system',
    userEmail: 'system',
    userName: 'Sistem MyPerform',
    monthlyTasks: [
      {
        id: 'm1',
        title: 'Target Akuisisi 50 Anggota & Nasabah Baru Cabang',
        description: 'Mencapai total pembukaan akun anggota koperasi dan pembiayaan aktif pada bulan perdana.',
        category: 'result',
        priority: 'high',
        targetValue: 50,
        targetUnit: 'NOA'
      },
      {
        id: 'm2',
        title: 'Target Realisasi Portofolio Gadai & Simpanan Rp 150.000.000',
        description: 'Pencapaian akumulasi penyaluran pinjaman gadai emas dan penghimpunan simpanan berjangka.',
        category: 'result',
        priority: 'high',
        targetValue: 150000000,
        targetUnit: 'Rupiah'
      }
    ],
    weeklyTasks: [
      {
        id: 'w1',
        title: 'Persiapan & Uji Kelayakan Sarana Fisik Outlet Cabang',
        description: 'Pengecekan brankas, CCTV, timbangan emas presisi, jaringan internet, dan keamanan.',
        category: 'non_result',
        priority: 'high',
        parentMonthlyTaskTempId: 'm1'
      },
      {
        id: 'w2',
        title: 'Sosialisasi Lapangan & Kerjasama Komunitas / Toko Sekitar',
        description: 'Distribusi brosur, kunjungan silaturahmi ke pengurus pasar, dan mitra lokal.',
        category: 'result',
        priority: 'medium',
        targetValue: 20,
        targetUnit: 'NOA',
        parentMonthlyTaskTempId: 'm1'
      },
      {
        id: 'w3',
        title: 'Supervisi Alur SOP Transaksi & Validasi Taksiran Emas',
        description: 'Memastikan seluruh tim memahami akurasi karatase, pencetakan SBG, dan buku register kasir.',
        category: 'non_result',
        priority: 'high',
        parentMonthlyTaskTempId: 'm2'
      },
      {
        id: 'w4',
        title: 'Evaluasi & Laporan Realisasi Kinerja Pekanan Cabang',
        description: 'Review pencapaian target mingguan dan penyusunan strategi lanjutan.',
        category: 'non_result',
        priority: 'medium',
        parentMonthlyTaskTempId: 'm2'
      }
    ],
    dailyTasks: [
      // Hari ke-1 (Senin)
      {
        id: 'd1_1',
        title: 'Morning Briefing Pembukaan & Doa Bersama Tim Cabang',
        description: 'Penyelarasan target harian dan pengecekan kesiapan seluruh staf.',
        category: 'non_result',
        priority: 'high',
        time: '07:45',
        dayOffset: 1,
        parentWeeklyTaskTempId: 'w1',
        enableReminder: true,
        reminderType: 'minutes_before',
        reminderMinutesBefore: 15
      },
      {
        id: 'd1_2',
        title: 'Pemeriksaan Saldo Awal Brankas & Kasir Operasional',
        description: 'Pencatatan kas fisik awal, stok formulir SBG, dan segel kantong emas.',
        category: 'non_result',
        priority: 'high',
        time: '08:15',
        dayOffset: 1,
        parentWeeklyTaskTempId: 'w1',
        enableReminder: true,
        reminderType: 'minutes_before',
        reminderMinutesBefore: 15
      },
      {
        id: 'd1_3',
        title: 'Distribusi Brosur & Edukasi Simulasi Gadai ke Pasar Sekitar',
        description: 'Canvassing lapangan mengenalkan program taksiran tinggi dan ujroh ringan.',
        category: 'result',
        priority: 'medium',
        time: '10:00',
        dayOffset: 1,
        targetValue: 5,
        targetUnit: 'NOA',
        parentWeeklyTaskTempId: 'w2'
      },
      // Hari ke-2 (Selasa)
      {
        id: 'd2_1',
        title: 'Follow-up Prospek Nasabah & Pelayanan Transaksi Masuk',
        description: 'Menghubungi calon anggota yang berminat membuka tabungan atau gadai emas.',
        category: 'result',
        priority: 'high',
        time: '08:30',
        dayOffset: 2,
        targetValue: 3,
        targetUnit: 'NOA',
        parentWeeklyTaskTempId: 'w2'
      },
      {
        id: 'd2_2',
        title: 'Pengecekan Kalibrasi Timbangan Digital & Uji Karatase Emas',
        description: 'Uji asam dan densimeter untuk memastikan keakuratan hasil taksir barang jaminan.',
        category: 'non_result',
        priority: 'medium',
        time: '13:30',
        dayOffset: 2,
        parentWeeklyTaskTempId: 'w3'
      },
      // Hari ke-3 (Rabu)
      {
        id: 'd3_1',
        title: 'Kunjungan Silaturahmi Kerjasama Merchant / Toko Emas Sekitar',
        description: 'Membangun relasi kemitraan referal dengan pemilik toko emas terdekat.',
        category: 'result',
        priority: 'medium',
        time: '09:00',
        dayOffset: 3,
        targetValue: 2,
        targetUnit: 'Unit',
        parentWeeklyTaskTempId: 'w2'
      },
      {
        id: 'd3_2',
        title: 'Rekonsiliasi Buku Kas Harian & Mutasi Rekening Operasional',
        description: 'Memastikan saldo fisik kasir klop dengan catatan sistem aplikasi.',
        category: 'non_result',
        priority: 'high',
        time: '15:30',
        dayOffset: 3,
        parentWeeklyTaskTempId: 'w3'
      },
      // Hari ke-4 (Kamis)
      {
        id: 'd4_1',
        title: 'Edukasi Produk Simulasi Gadai Emas & Pembiayaan Syariah',
        description: 'Pelayanan konsultasi kepada calon nasabah walk-in di kantor cabang.',
        category: 'result',
        priority: 'medium',
        time: '08:30',
        dayOffset: 4,
        targetValue: 3,
        targetUnit: 'NOA',
        parentWeeklyTaskTempId: 'w2'
      },
      {
        id: 'd4_2',
        title: 'Maintenance Perangkat Komputer, Printer SBG, & Jaringan POS',
        description: 'Pemeriksaan rutin kelancaran perangkat kasir dan kelengkapan cadangan tinta/kertas.',
        category: 'non_result',
        priority: 'low',
        time: '14:30',
        dayOffset: 4,
        parentWeeklyTaskTempId: 'w1'
      },
      // Hari ke-5 (Jumat)
      {
        id: 'd5_1',
        title: 'Kajian Rohani Pagi & Kerja Bakti Kebersihan Outlet',
        description: 'Menjaga kebersihan front office, ruang tunggu, dan area pelayanan nasabah.',
        category: 'non_result',
        priority: 'medium',
        time: '07:30',
        dayOffset: 5,
        parentWeeklyTaskTempId: 'w1'
      },
      {
        id: 'd5_2',
        title: 'Rekapitulasi Formulir & Berkas Nasabah Baru Pekanan',
        description: 'Arsip berkas KTP, akad perjanjian, dan foto jaminan ke lemari arsip terkunci.',
        category: 'non_result',
        priority: 'high',
        time: '14:00',
        dayOffset: 5,
        parentWeeklyTaskTempId: 'w3'
      },
      // Hari ke-6 (Sabtu)
      {
        id: 'd6_1',
        title: 'Pemeriksaan Fisik Barang Jaminan (Stock Opname Brankas)',
        description: 'Pencocokan fisik kantong emas dengan daftar register SBG aktif.',
        category: 'non_result',
        priority: 'high',
        time: '08:30',
        dayOffset: 6,
        parentWeeklyTaskTempId: 'w3'
      },
      {
        id: 'd6_2',
        title: 'Penyusunan & Pengiriman Laporan Kinerja Penutupan Pekan',
        description: 'Input capaian mingguan di sistem TAL dan evaluasi dengan tim cabang.',
        category: 'non_result',
        priority: 'high',
        time: '14:00',
        dayOffset: 6,
        parentWeeklyTaskTempId: 'w4',
        enableReminder: true,
        reminderType: 'minutes_before',
        reminderMinutesBefore: 30
      }
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'preset_closing_bulanan',
    name: 'Rutinitas Penutupan Akhir Bulan (Closing)',
    description: 'Template komprehensif audit pembukuan, rekonsiliasi kas/bank, penagihan NPL, dan laporan keuangan akhir bulan.',
    categoryTag: 'Keuangan',
    color: '#059669', // Emerald
    isPreset: true,
    userId: 'system',
    userEmail: 'system',
    userName: 'Sistem MyPerform',
    monthlyTasks: [
      {
        id: 'cm1',
        title: 'Penyelesaian Seluruh Rekonsiliasi Keuangan & Pajak Koperasi',
        description: 'Menutup buku besar bulanan dengan selisih Rp 0 dan kelengkapan bukti transaksi 100%.',
        category: 'non_result',
        priority: 'high'
      },
      {
        id: 'cm2',
        title: 'Target Tingkat Kelancaran Pembayaran Angsuran & Gadai > 98%',
        description: 'Meminimalisir pinjaman jatuh tempo yang belum diperpanjang atau dilunasi.',
        category: 'result',
        priority: 'high',
        targetValue: 98,
        targetUnit: 'Unit'
      }
    ],
    weeklyTasks: [
      {
        id: 'cw1',
        title: 'Prakiraan Arus Kas & Pengingat Tagihan Nasabah H-7',
        description: 'Broadcast dan follow up kepada nasabah yang pinjamannya mendekati jatuh tempo.',
        category: 'result',
        priority: 'high',
        targetValue: 25,
        targetUnit: 'NOA',
        parentMonthlyTaskTempId: 'cm2'
      },
      {
        id: 'cw2',
        title: 'Verifikasi Fisik Emas & Audit Silang Brankas',
        description: 'Pengecekan menyeluruh oleh tim supervisi terhadap seluruh jaminan emas yang tersimpan.',
        category: 'non_result',
        priority: 'high',
        parentMonthlyTaskTempId: 'cm1'
      },
      {
        id: 'cw3',
        title: 'Penjurnalan Penyesuaian, Akrual & Perhitungan Laba Rugi',
        description: 'Input jurnal penyusutan inventaris, beban operasional berjalan, dan bagi hasil.',
        category: 'non_result',
        priority: 'high',
        parentMonthlyTaskTempId: 'cm1'
      },
      {
        id: 'cw4',
        title: 'Penyusunan Berita Acara Closing & Laporan Keuangan ke Manajemen',
        description: 'Finalisasi neraca saldo dan penandatanganan berita acara penutupan kas.',
        category: 'non_result',
        priority: 'high',
        parentMonthlyTaskTempId: 'cm1'
      }
    ],
    dailyTasks: [
      {
        id: 'cd1_1',
        title: 'Download & Rekonsiliasi Rekening Koran Seluruh Bank Koperasi',
        description: 'Pencocokan mutasi bank harian dengan penerimaan transfer nasabah.',
        category: 'non_result',
        priority: 'high',
        time: '08:00',
        dayOffset: 1,
        parentWeeklyTaskTempId: 'cw1'
      },
      {
        id: 'cd1_2',
        title: 'Penagihan Nasabah Gadai Jatuh Tempo Lewat Telepon / WhatsApp',
        description: 'Menghubungi nasabah untuk opsi perpanjangan gadai atau pelunasan emas.',
        category: 'result',
        priority: 'high',
        time: '13:00',
        dayOffset: 1,
        targetValue: 10,
        targetUnit: 'NOA',
        parentWeeklyTaskTempId: 'cw1'
      },
      {
        id: 'cd2_1',
        title: 'Validasi & Verifikasi Bukti Fisik Kas Masuk / Kas Keluar',
        description: 'Pemeriksaan tanda tangan otorisasi pada seluruh voucher transaksi kas kecil.',
        category: 'non_result',
        priority: 'medium',
        time: '08:30',
        dayOffset: 2,
        parentWeeklyTaskTempId: 'cw2'
      },
      {
        id: 'cd2_2',
        title: 'Audit Silang Taksiran Emas Sampel Acak',
        description: 'Memastikan tidak ada selisih berat atau penyimpangan nilai taksiran barang jaminan.',
        category: 'non_result',
        priority: 'high',
        time: '14:00',
        dayOffset: 2,
        parentWeeklyTaskTempId: 'cw2'
      },
      {
        id: 'cd3_1',
        title: 'Perhitungan Beban Penyusutan Aset & Ujroh Berjalan',
        description: 'Pencatatan akuntansi penyusutan aktiva tetap dan amortisasi biaya sewa.',
        category: 'non_result',
        priority: 'medium',
        time: '08:30',
        dayOffset: 3,
        parentWeeklyTaskTempId: 'cw3'
      },
      {
        id: 'cd3_2',
        title: 'Konfirmasi Saldo Simpanan Anggota & Rekapitulasi Pokok/Wajib',
        description: 'Pengecekan kebenaran mutasi simpanan sukarela dan simpanan berjangka anggota.',
        category: 'non_result',
        priority: 'medium',
        time: '15:00',
        dayOffset: 3,
        parentWeeklyTaskTempId: 'cw3'
      },
      {
        id: 'cd4_1',
        title: 'Penyusunan Jurnal Penyesuaian (Adjustment) Akhir Periode',
        description: 'Entri pos penyesuaian pendapatan dan biaya ke dalam software pembukuan.',
        category: 'non_result',
        priority: 'high',
        time: '08:30',
        dayOffset: 4,
        parentWeeklyTaskTempId: 'cw3'
      },
      {
        id: 'cd4_2',
        title: 'Audit Kelengkapan Dokumen Perjanjian Akad Gadai',
        description: 'Pemeriksaan kelengkapan materai, KTP, dan tanda tangan anggota pada berkas SBG.',
        category: 'non_result',
        priority: 'high',
        time: '14:00',
        dayOffset: 4,
        parentWeeklyTaskTempId: 'cw2'
      },
      {
        id: 'cd5_1',
        title: 'Closing Neraca Saldo & Buku Besar Keuangan Divisi',
        description: 'Penguncian seluruh posting transaksi debet dan kredit periode berjalan.',
        category: 'non_result',
        priority: 'high',
        time: '08:00',
        dayOffset: 5,
        parentWeeklyTaskTempId: 'cw4'
      },
      {
        id: 'cd5_2',
        title: 'Penyusunan Laporan Laba Rugi & Neraca Sementara',
        description: 'Pencetakan draft laporan keuangan bulanan untuk review pimpinan.',
        category: 'non_result',
        priority: 'high',
        time: '14:00',
        dayOffset: 5,
        parentWeeklyTaskTempId: 'cw4'
      },
      {
        id: 'cd6_1',
        title: 'Finalisasi Berita Acara Closing Kas & Backup Database Keuangan',
        description: 'Penandatanganan Berita Acara Fisik Kas oleh Petugas, Kasir, dan Manager.',
        category: 'non_result',
        priority: 'high',
        time: '09:00',
        dayOffset: 6,
        parentWeeklyTaskTempId: 'cw4'
      },
      {
        id: 'cd6_2',
        title: 'Rapat Evaluasi Kinerja Bulanan & Submit Laporan TAL Bulanan',
        description: 'Presentasi capaian bulanan dan penguncian laporan akhir bulan pada sistem TAL.',
        category: 'non_result',
        priority: 'high',
        time: '11:00',
        dayOffset: 6,
        parentWeeklyTaskTempId: 'cw4',
        enableReminder: true,
        reminderType: 'minutes_before',
        reminderMinutesBefore: 15
      }
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'preset_audit_lapangan',
    name: 'Jadwal Audit & Supervisi Lapangan',
    description: 'Katalog tugas uji petik transaksi, audit brankas mendadak, kepatuhan SOP, dan laporan hasil audit (LHA).',
    categoryTag: 'Audit',
    color: '#7c3aed', // Purple
    isPreset: true,
    userId: 'system',
    userEmail: 'system',
    userName: 'Sistem MyPerform',
    monthlyTasks: [
      {
        id: 'am1',
        title: 'Audit Kepatuhan SOP & Operasional Seluruh Cabang',
        description: 'Melaksanakan audit berkala terhadap kepatuhan regulasi, SOP gadai, dan tata kelola.',
        category: 'non_result',
        priority: 'high'
      },
      {
        id: 'am2',
        title: 'Zero Fraud & 100% Akurasi Fisik Barang Jaminan Emas',
        description: 'Memastikan tidak ada indikasi emas palsu, selisih kas, atau ketidaksesuaian nilai taksir.',
        category: 'result',
        priority: 'high',
        targetValue: 100,
        targetUnit: 'Unit'
      }
    ],
    weeklyTasks: [
      {
        id: 'aw1',
        title: 'Cash Count Fisik Kasir & Verifikasi Saldo Kas Kecil',
        description: 'Perhitungan mendadak fisik uang tunai di laci kasir dan brankas harian.',
        category: 'non_result',
        priority: 'high',
        parentMonthlyTaskTempId: 'am1'
      },
      {
        id: 'aw2',
        title: 'Uji Petik Karatase & Re-Taksir Sampel Barang Jaminan Emas',
        description: 'Pengujian ulang minimal 10 sampel jaminan emas yang sedang berjalan.',
        category: 'result',
        priority: 'high',
        targetValue: 10,
        targetUnit: 'Unit',
        parentMonthlyTaskTempId: 'am2'
      },
      {
        id: 'aw3',
        title: 'Pemeriksaan Logbook Brankas, Kunci Ganda, & Rekaman CCTV',
        description: 'Audit kepatuhan pengamanan dual-custody dan rekaman visual 30 hari terakhir.',
        category: 'non_result',
        priority: 'medium',
        parentMonthlyTaskTempId: 'am1'
      },
      {
        id: 'aw4',
        title: 'Penyusunan Lembar Temuan Audit (LTA) & Exit Meeting Supervisi',
        description: 'Penyampaian temuan operasional kepada Kepala Cabang dan komitmen perbaikan.',
        category: 'non_result',
        priority: 'high',
        parentMonthlyTaskTempId: 'am1'
      }
    ],
    dailyTasks: [
      {
        id: 'ad1_1',
        title: 'Cash Count Mendadak Pagi Hari di Pos Kasir',
        description: 'Pemeriksaan fisik lembaran uang dan koin sebelum outlet mulai beroperasi.',
        category: 'non_result',
        priority: 'high',
        time: '08:00',
        dayOffset: 1,
        parentWeeklyTaskTempId: 'aw1'
      },
      {
        id: 'ad1_2',
        title: 'Uji Petik 5 Dokumen SBG & Verifikasi KTP Nasabah',
        description: 'Pemeriksaan keaslian identitas anggota dan kelayakan jaminan.',
        category: 'result',
        priority: 'medium',
        time: '11:00',
        dayOffset: 1,
        targetValue: 5,
        targetUnit: 'NOA',
        parentWeeklyTaskTempId: 'aw1'
      },
      {
        id: 'ad2_1',
        title: 'Uji Karatase Ulang (Re-Taksir) Sampel Emas Batangan & Perhiasan',
        description: 'Pengujian berat jenis dan uji gores dengan batu uji standar.',
        category: 'result',
        priority: 'high',
        time: '08:30',
        dayOffset: 2,
        targetValue: 5,
        targetUnit: 'Unit',
        parentWeeklyTaskTempId: 'aw2'
      },
      {
        id: 'ad2_2',
        title: 'Wawancara Acak Kepuasan Nasabah Walk-in Terhadap Pelayanan',
        description: 'Memastikan tidak ada biaya siluman atau pungutan liar di luar tagihan resmi.',
        category: 'non_result',
        priority: 'low',
        time: '14:00',
        dayOffset: 2,
        parentWeeklyTaskTempId: 'aw2'
      },
      {
        id: 'ad3_1',
        title: 'Pemeriksaan Fisik Kunci Ganda & Logbook Buka/Tutup Brankas',
        description: 'Verifikasi tanda tangan pemegang kunci 1 dan kunci 2.',
        category: 'non_result',
        priority: 'high',
        time: '08:00',
        dayOffset: 3,
        parentWeeklyTaskTempId: 'aw3'
      },
      {
        id: 'ad3_2',
        title: 'Audit Kelengkapan Voucher Biaya Operasional & Nota Pengeluaran',
        description: 'Pemeriksaan kewajaran harga dan bukti struk pengeluaran cabang.',
        category: 'non_result',
        priority: 'medium',
        time: '13:30',
        dayOffset: 3,
        parentWeeklyTaskTempId: 'aw3'
      },
      {
        id: 'ad4_1',
        title: 'Audit Portofolio Kredit Macet & Prosedur Pemberitahuan Lelang',
        description: 'Memastikan surat peringatan 1, 2, 3 dikirim sesuai jadwal regulasi.',
        category: 'non_result',
        priority: 'high',
        time: '08:30',
        dayOffset: 4,
        parentWeeklyTaskTempId: 'aw3'
      },
      {
        id: 'ad5_1',
        title: 'Penyusunan Draft Lembar Temuan Audit (LTA) & Rekomendasi Solusi',
        description: 'Pengelompokan temuan berisiko tinggi, sedang, dan rendah.',
        category: 'non_result',
        priority: 'high',
        time: '08:30',
        dayOffset: 5,
        parentWeeklyTaskTempId: 'aw4'
      },
      {
        id: 'ad5_2',
        title: 'Exit Meeting Bersama Kepala Cabang & Penandatanganan LTA',
        description: 'Diskusi temuan dan penetapan tenggat waktu penyelesaian tindak lanjut (Action Plan).',
        category: 'non_result',
        priority: 'high',
        time: '14:00',
        dayOffset: 5,
        parentWeeklyTaskTempId: 'aw4'
      },
      {
        id: 'ad6_1',
        title: 'Finalisasi Laporan Hasil Audit (LHA) Resmi ke Direksi',
        description: 'Pengiriman dokumen laporan audit komprehensif ke manajemen pusat.',
        category: 'non_result',
        priority: 'high',
        time: '09:00',
        dayOffset: 6,
        parentWeeklyTaskTempId: 'aw4'
      }
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];


