// lib/tal/gamification-shared.ts — Tipe, konstanta & helper MURNI gamifikasi TAL.
//
// File ini SENGAJA tanpa import server (tanpa `@/lib/db`, tanpa Prisma):
// komponen client (`'use client'`, mis. TalBadgeGallery) meng-import tipe +
// BADGE_TIERS dari sini. Sebelumnya mereka meng-import dari
// `lib/tal/gamification.ts` yang di puncaknya meng-import `prisma`
// (`@/lib/db`) — sejak Phase 3 `lib/db.ts` menarik modul tenant Node-only
// (`node:async_hooks`, `fs`, `child_process`) sehingga `next build` gagal
// total di client bundle. Aturan: JANGAN tambah import server ke file ini;
// logika Prisma tetap di `lib/tal/gamification.ts` (yang me-re-export
// semua isi file ini).

import type { AuthContext } from '@/lib/auth-helpers';

// ---------------------------------------------------------------------------
// Tipe (porting src/types/talGamification.ts; kunci utama userId, bukan email)
// ---------------------------------------------------------------------------

export type BadgeLevel = 1 | 2 | 3 | 4 | 5;
export type BadgeTier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';

export interface BadgeTierInfo {
  tier: BadgeTier;
  level: BadgeLevel;
  name: string;
  emoji: string;
  badgeClass: string;
  borderClass: string;
  textClass: string;
  bgClass: string;
}

export const BADGE_TIERS: Record<BadgeLevel, BadgeTierInfo> = {
  1: { tier: 'bronze', level: 1, name: 'Bronze', emoji: '🥉', badgeClass: 'bg-amber-100 text-amber-800 border-amber-300', borderClass: 'border-amber-400', textClass: 'text-amber-700', bgClass: 'bg-amber-50' },
  2: { tier: 'silver', level: 2, name: 'Silver', emoji: '🥈', badgeClass: 'bg-slate-200 text-slate-700 border-slate-300', borderClass: 'border-slate-400', textClass: 'text-slate-600', bgClass: 'bg-slate-100' },
  3: { tier: 'gold', level: 3, name: 'Gold', emoji: '🥇', badgeClass: 'bg-yellow-100 text-yellow-800 border-yellow-300', borderClass: 'border-yellow-400', textClass: 'text-yellow-700', bgClass: 'bg-yellow-50' },
  4: { tier: 'platinum', level: 4, name: 'Platinum', emoji: '🧿', badgeClass: 'bg-cyan-100 text-cyan-800 border-cyan-300', borderClass: 'border-cyan-400', textClass: 'text-cyan-700', bgClass: 'bg-cyan-50' },
  5: { tier: 'diamond', level: 5, name: 'Diamond', emoji: '💎', badgeClass: 'bg-indigo-100 text-indigo-800 border-indigo-300', borderClass: 'border-indigo-400', textClass: 'text-indigo-700', bgClass: 'bg-indigo-50' },
};

export type BadgeMetricType =
  | 'streak_days'
  | 'done_task_count'
  | 'monthly_ratio_percent'
  | 'high_priority_streak'
  | 'delegated_task_count'
  | 'flash_plan_weeks'
  | 'sniper_weeks'
  | 'early_bird_streak'
  | 'perfectionist_months';

export interface BadgeLevelConfig {
  level: BadgeLevel;
  tier: BadgeTier;
  target: number;
  customLabel?: string;
}

export type BadgeCategory = 'perencanaan' | 'eksekusi' | 'disiplin' | 'kolaborasi' | 'kualitas';

/** DTO badge — bentuk yang dipakai komponen galeri (id = kode badge). */
export interface TalBadgeDto {
  id: string; // kode unik katalog, mis. FLASH_PLANNER (= TalBadge.badgeId)
  code: string;
  title: string;
  description: string;
  icon: string; // id lucide
  iconColor?: string;
  category: BadgeCategory;
  metricType: BadgeMetricType;
  metricUnit: string;
  max_level: BadgeLevel;
  levels: BadgeLevelConfig[];
  status: 'active' | 'inactive' | 'archived';
  isGlow?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserBadgeProgressDto {
  userId?: string;
  badgeId: string;
  seasonYear: number;
  currentValue: number;
  currentLevel: number; // 0 = belum ada level
  isMastered: boolean;
  nextTarget: number;
  progressPercent: number;
  remainingToNext: number;
  lastUpdated: string;
  levelAchievedDates?: Record<number, string>;
}

export interface TrophyArchiveItemDto {
  id: string;
  badgeId: string;
  badgeCode: string;
  badgeTitle: string;
  badgeIcon: string;
  badgeCategory: string;
  highestLevel: BadgeLevel;
  highestTier: BadgeTier;
  finalValue: number;
  seasonYear: number;
  achievedAt: string;
  userName?: string;
  userEmail?: string;
}

export interface HeatmapDayData {
  date: string; // YYYY-MM-DD
  dayOfWeek: number; // 0 Minggu .. 6 Sabtu
  isHoliday: boolean;
  isFuture: boolean;
  hasPlan: boolean;
  planLockedOnTime: boolean;
  hasReport: boolean;
  reportSubmittedOnTime: boolean;
  status: 'holiday' | 'future' | 'empty' | 'late' | 'on_time';
  taskCount: number;
  tooltipText: string;
}

export interface UserGamificationSummary {
  userId: string;
  userEmail: string;
  userName: string;
  seasonYear: number;
  currentStreak: number;
  bestStreak: number;
  earlyBirdStreak: number;
  totalDaysOnTime: number;
  totalDaysLate: number;
  activeBadgesCount: number;
  masteredBadgesCount: number;
  /** Angka tampilan turunan saja (bukan sistem poin terpisah). */
  points: number;
  heatmapData: HeatmapDayData[];
  badgesProgress: Record<string, UserBadgeProgressDto>;
  trophies: TrophyArchiveItemDto[];
}


// ---------------------------------------------------------------------------
// Helper tanggal minimal (WIB). TODO: konsolidasi ke lib/tal/date.ts
// (sub-tahap a) begitu file itu tersedia.
// ---------------------------------------------------------------------------

export const WIB_MS = 7 * 3600 * 1000;

/** Hari ini (kalender WIB) sebagai Date UTC-midnight; field UTC = tanggal WIB. */
export function todayWib(): Date {
  const now = new Date(Date.now() + WIB_MS);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function formatDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: Date, n: number): Date {
  const c = new Date(d.getTime());
  c.setUTCDate(c.getUTCDate() + n);
  return c;
}

/** Nomor minggu ISO + tahun ISO dari sebuah tanggal (kalender WIB). */
export function getISOWeek(d: Date): { week: number; year: number } {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (date.getUTCDay() + 6) % 7; // Senin = 0
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const fDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - fDayNum + 3);
  const week = 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
  return { week, year: date.getUTCFullYear() };
}

export function weeklyScopeKey(d: Date): string {
  const { week, year } = getISOWeek(d);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** Jam WIB (0-23) dari sebuah timestamp. */
export function hourWib(ts: Date | string): number {
  const t = typeof ts === 'string' ? new Date(ts) : ts;
  return (t.getUTCHours() + 7) % 24;
}

export function payloadOf(row: { payload: unknown }): Record<string, any> {
  const p = (row as any).payload;
  return p && typeof p === 'object' ? (p as Record<string, any>) : {};
}

export function tierForLevel(level: number): BadgeTier {
  if (level >= 5) return 'diamond';
  if (level === 4) return 'platinum';
  if (level === 3) return 'gold';
  if (level === 2) return 'silver';
  return 'bronze';
}


// ---------------------------------------------------------------------------
// Katalog badge bawaan (porting DEFAULT_TAL_BADGES dari talGamificationService)
// ---------------------------------------------------------------------------

export const DEFAULT_TAL_BADGES: Omit<TalBadgeDto, 'createdAt' | 'updatedAt'>[] = [
  { id: 'FLASH_PLANNER', code: 'FLASH_PLANNER', title: 'The Flash Planner', description: 'Kunci Rencana Mingguan ≤ 2 jam sejak jam mulai kerja pada pekan bersangkutan.', icon: 'Zap', iconColor: 'text-amber-500', category: 'perencanaan', metricType: 'flash_plan_weeks', metricUnit: 'pekan berturut-turut', max_level: 5, levels: [{ level: 1, tier: 'bronze', target: 1, customLabel: '1 Pekan Tepat Waktu' }, { level: 2, tier: 'silver', target: 2, customLabel: '2 Pekan Berturut-turut' }, { level: 3, tier: 'gold', target: 4, customLabel: '4 Pekan Berturut-turut' }, { level: 4, tier: 'platinum', target: 8, customLabel: '8 Pekan Berturut-turut' }, { level: 5, tier: 'diamond', target: 16, customLabel: '16 Pekan Berturut-turut' }], status: 'active', isGlow: true },
  { id: 'SNIPER_EXECUTION', code: 'SNIPER_EXECUTION', title: 'Sniper Execution', description: '100% target tugas Result tercapai tanpa rollover selama pekan berturut-turut.', icon: 'Target', iconColor: 'text-red-500', category: 'eksekusi', metricType: 'sniper_weeks', metricUnit: 'pekan berturut-turut', max_level: 5, levels: [{ level: 1, tier: 'bronze', target: 2, customLabel: '2 Pekan 100% Result' }, { level: 2, tier: 'silver', target: 4, customLabel: '4 Pekan 100% Result' }, { level: 3, tier: 'gold', target: 8, customLabel: '8 Pekan 100% Result' }, { level: 4, tier: 'platinum', target: 16, customLabel: '16 Pekan 100% Result' }, { level: 5, tier: 'diamond', target: 32, customLabel: '32 Pekan 100% Result' }], status: 'active', isGlow: true },
  { id: 'TITAN_ACHIEVER', code: 'TITAN_ACHIEVER', title: 'Titan Achiever', description: 'Realisasi capaian bulanan ≥ 120% target selama bulan berjalan.', icon: 'Trophy', iconColor: 'text-yellow-600', category: 'eksekusi', metricType: 'monthly_ratio_percent', metricUnit: 'bulan', max_level: 5, levels: [{ level: 1, tier: 'bronze', target: 1, customLabel: '1 Bulan ≥ 120%' }, { level: 2, tier: 'silver', target: 2, customLabel: '2 Bulan ≥ 120%' }, { level: 3, tier: 'gold', target: 4, customLabel: '4 Bulan ≥ 120%' }, { level: 4, tier: 'platinum', target: 8, customLabel: '8 Bulan ≥ 120%' }, { level: 5, tier: 'diamond', target: 16, customLabel: '16 Bulan ≥ 120%' }], status: 'active', isGlow: true },
  { id: 'TASK_MASTERMIND', code: 'TASK_MASTERMIND', title: 'Task Mastermind', description: 'Selesaikan akumulasi tugas utama status Done dengan bukti valid.', icon: 'Crown', iconColor: 'text-purple-600', category: 'eksekusi', metricType: 'done_task_count', metricUnit: 'tugas Done', max_level: 5, levels: [{ level: 1, tier: 'bronze', target: 100, customLabel: '100 Tugas Done' }, { level: 2, tier: 'silver', target: 200, customLabel: '200 Tugas Done' }, { level: 3, tier: 'gold', target: 400, customLabel: '400 Tugas Done' }, { level: 4, tier: 'platinum', target: 800, customLabel: '800 Tugas Done' }, { level: 5, tier: 'diamond', target: 1600, customLabel: '1.600 Tugas Done' }], status: 'active', isGlow: true },
  { id: 'IRON_DISCIPLINE', code: 'IRON_DISCIPLINE', title: 'Iron Discipline', description: 'Streak pelaporan harian tepat waktu tanpa jeda di hari kerja.', icon: 'Shield', iconColor: 'text-slate-600', category: 'disiplin', metricType: 'streak_days', metricUnit: 'hari kerja beruntun', max_level: 5, levels: [{ level: 1, tier: 'bronze', target: 30, customLabel: '30 Hari Disiplin' }, { level: 2, tier: 'silver', target: 60, customLabel: '60 Hari Disiplin' }, { level: 3, tier: 'gold', target: 120, customLabel: '120 Hari Disiplin' }, { level: 4, tier: 'platinum', target: 240, customLabel: '240 Hari Disiplin' }, { level: 5, tier: 'diamond', target: 480, customLabel: '480 Hari Disiplin' }], status: 'active', isGlow: true },
  { id: 'EARLY_BIRD', code: 'EARLY_BIRD', title: 'Early Bird Reporter', description: 'Submit laporan harian lengkap sebelum pukul 17:00 WIB berturut-turut.', icon: 'Sun', iconColor: 'text-amber-500', category: 'disiplin', metricType: 'early_bird_streak', metricUnit: 'hari beruntun', max_level: 5, levels: [{ level: 1, tier: 'bronze', target: 10, customLabel: '10 Hari < 17:00' }, { level: 2, tier: 'silver', target: 20, customLabel: '20 Hari < 17:00' }, { level: 3, tier: 'gold', target: 40, customLabel: '40 Hari < 17:00' }, { level: 4, tier: 'platinum', target: 80, customLabel: '80 Hari < 17:00' }, { level: 5, tier: 'diamond', target: 160, customLabel: '160 Hari < 17:00' }], status: 'active', isGlow: false },
  { id: 'SYNERGY_CHAMP', code: 'SYNERGY_CHAMP', title: 'Synergy Champion', description: 'Selesaikan akumulasi tugas delegasi kolaboratif sebagai penerima tugas.', icon: 'Users', iconColor: 'text-blue-600', category: 'kolaborasi', metricType: 'delegated_task_count', metricUnit: 'tugas delegasi', max_level: 5, levels: [{ level: 1, tier: 'bronze', target: 15, customLabel: '15 Delegasi Selesai' }, { level: 2, tier: 'silver', target: 30, customLabel: '30 Delegasi Selesai' }, { level: 3, tier: 'gold', target: 60, customLabel: '60 Delegasi Selesai' }, { level: 4, tier: 'platinum', target: 120, customLabel: '120 Delegasi Selesai' }, { level: 5, tier: 'diamond', target: 240, customLabel: '240 Delegasi Selesai' }], status: 'active', isGlow: false },
  { id: 'UNSTOPPABLE', code: 'UNSTOPPABLE', title: 'Unstoppable Force', description: 'Selesaikan tugas prioritas High berturut-turut tanpa pernah berstatus Pending.', icon: 'Flame', iconColor: 'text-orange-600', category: 'eksekusi', metricType: 'high_priority_streak', metricUnit: 'tugas High beruntun', max_level: 5, levels: [{ level: 1, tier: 'bronze', target: 20, customLabel: '20 Tugas High' }, { level: 2, tier: 'silver', target: 40, customLabel: '40 Tugas High' }, { level: 3, tier: 'gold', target: 80, customLabel: '80 Tugas High' }, { level: 4, tier: 'platinum', target: 160, customLabel: '160 Tugas High' }, { level: 5, tier: 'diamond', target: 320, customLabel: '320 Tugas High' }], status: 'active', isGlow: true },
  { id: 'PERFECTIONIST', code: 'PERFECTIONIST', title: 'The Perfectionist', description: 'Seluruh tugas harian dalam 1 bulan berstatus Done 100% tanpa ada Pending.', icon: 'Sparkles', iconColor: 'text-emerald-600', category: 'kualitas', metricType: 'perfectionist_months', metricUnit: 'bulan sempurna', max_level: 5, levels: [{ level: 1, tier: 'bronze', target: 1, customLabel: '1 Bulan 100% Done' }, { level: 2, tier: 'silver', target: 2, customLabel: '2 Bulan 100% Done' }, { level: 3, tier: 'gold', target: 4, customLabel: '4 Bulan 100% Done' }, { level: 4, tier: 'platinum', target: 8, customLabel: '8 Bulan 100% Done' }, { level: 5, tier: 'diamond', target: 16, customLabel: '16 Bulan 100% Done' }], status: 'active', isGlow: true },
];


// ---------------------------------------------------------------------------
// RBAC (§5.2/§5.3 fondasi): admin TAL = super admin / OWNER / ADMIN
// ---------------------------------------------------------------------------

export function isTalAdmin(ctx: AuthContext): boolean {
  return ctx.isSuperAdmin === true || ctx.role === 'OWNER' || ctx.role === 'ADMIN';
}


// ---------------------------------------------------------------------------
// Mapping baris Prisma -> DTO
// ---------------------------------------------------------------------------

export function mapTalBadge(row: {
  badgeId: string;
  name: string | null;
  description: string | null;
  payload: unknown;
  createdAt: Date;
  updatedAt: Date;
}): TalBadgeDto {
  const p = payloadOf(row as { payload: unknown });
  const levels = Array.isArray(p.levels) ? (p.levels as BadgeLevelConfig[]) : [];
  return {
    id: row.badgeId,
    code: row.badgeId,
    title: row.name ?? row.badgeId,
    description: row.description ?? '',
    icon: typeof p.icon === 'string' ? p.icon : 'Award',
    iconColor: typeof p.iconColor === 'string' ? p.iconColor : undefined,
    category: (p.category as BadgeCategory) || 'eksekusi',
    metricType: (p.metricType as BadgeMetricType) || 'done_task_count',
    metricUnit: typeof p.metricUnit === 'string' ? p.metricUnit : '',
    max_level: (typeof p.max_level === 'number' ? p.max_level : 5) as BadgeLevel,
    levels,
    status: (p.status as TalBadgeDto['status']) || 'active',
    isGlow: p.isGlow === true,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function mapTrophy(row: {
  id: string;
  badgeId: string | null;
  payload: unknown;
  createdAt: Date;
}): TrophyArchiveItemDto {
  const p = payloadOf(row as { payload: unknown });
  const highestLevel = (typeof p.highestLevel === 'number' ? p.highestLevel : 1) as BadgeLevel;
  return {
    id: row.id,
    badgeId: row.badgeId ?? (typeof p.badgeCode === 'string' ? p.badgeCode : ''),
    badgeCode: typeof p.badgeCode === 'string' ? p.badgeCode : (row.badgeId ?? ''),
    badgeTitle: typeof p.badgeTitle === 'string' ? p.badgeTitle : (row.badgeId ?? ''),
    badgeIcon: typeof p.badgeIcon === 'string' ? p.badgeIcon : 'Trophy',
    badgeCategory: typeof p.badgeCategory === 'string' ? p.badgeCategory : '',
    highestLevel,
    highestTier: (typeof p.highestTier === 'string' ? p.highestTier : tierForLevel(highestLevel)) as BadgeTier,
    finalValue: typeof p.finalValue === 'number' ? p.finalValue : 0,
    seasonYear: typeof p.seasonYear === 'number' ? p.seasonYear : new Date().getFullYear(),
    achievedAt: typeof p.achievedAt === 'string' ? p.achievedAt : row.createdAt.toISOString(),
    userName: typeof p.userName === 'string' ? p.userName : undefined,
    userEmail: typeof p.userEmail === 'string' ? p.userEmail : undefined,
  };
}

export function mapStoredProgress(row: {
  badgeId: string;
  seasonYear: number;
  payload: unknown;
  updatedAt: Date;
}): UserBadgeProgressDto {
  const p = payloadOf(row as { payload: unknown });
  return {
    badgeId: row.badgeId,
    seasonYear: row.seasonYear,
    currentValue: typeof p.currentValue === 'number' ? p.currentValue : 0,
    currentLevel: typeof p.currentLevel === 'number' ? p.currentLevel : 0,
    isMastered: p.isMastered === true,
    nextTarget: typeof p.nextTarget === 'number' ? p.nextTarget : 0,
    progressPercent: typeof p.progressPercent === 'number' ? p.progressPercent : 0,
    remainingToNext: typeof p.remainingToNext === 'number' ? p.remainingToNext : 0,
    lastUpdated: typeof p.lastUpdated === 'string' ? p.lastUpdated : row.updatedAt.toISOString(),
    levelAchievedDates: p.levelAchievedDates && typeof p.levelAchievedDates === 'object'
      ? (p.levelAchievedDates as Record<number, string>)
      : undefined,
  };
}


// ---------------------------------------------------------------------------
// Validasi input badge (POST admin) — pola parseAnnouncementInput
// ---------------------------------------------------------------------------

const BADGE_CATEGORIES: BadgeCategory[] = ['perencanaan', 'eksekusi', 'disiplin', 'kolaborasi', 'kualitas'];
const BADGE_METRICS: BadgeMetricType[] = [
  'streak_days', 'done_task_count', 'monthly_ratio_percent', 'high_priority_streak',
  'delegated_task_count', 'flash_plan_weeks', 'sniper_weeks', 'early_bird_streak',
  'perfectionist_months',
];

export function parseBadgeInput(body: Record<string, unknown>): { error?: string; data?: Omit<TalBadgeDto, 'createdAt' | 'updatedAt'> } {
  const code = String((body.badgeId ?? body.code ?? '') as string).trim().toUpperCase();
  if (!code || !/^[A-Z0-9_]+$/.test(code)) return { error: 'Kode badge wajib diisi (huruf kapital, angka, underscore).' };
  const title = String((body.title ?? body.name ?? '') as string).trim();
  if (!title) return { error: 'Nama badge wajib diisi.' };
  const metricType = String(body.metricType ?? 'done_task_count');
  if (!BADGE_METRICS.includes(metricType as BadgeMetricType)) return { error: 'metricType tidak dikenal.' };
  const category = String(body.category ?? 'eksekusi');
  if (!BADGE_CATEGORIES.includes(category as BadgeCategory)) return { error: 'Kategori badge tidak dikenal.' };
  const rawLevels = Array.isArray(body.levels) ? (body.levels as any[]) : [];
  if (rawLevels.length === 0) return { error: 'Badge wajib punya minimal 1 level.' };
  const levels: BadgeLevelConfig[] = [];
  for (const l of rawLevels) {
    const level = Number(l?.level);
    const target = Number(l?.target);
    if (![1, 2, 3, 4, 5].includes(level) || !Number.isFinite(target) || target <= 0) {
      return { error: 'Setiap level wajib punya level 1–5 dan target > 0.' };
    }
    levels.push({
      level: level as BadgeLevel,
      tier: tierForLevel(level),
      target,
      customLabel: typeof l?.customLabel === 'string' ? l.customLabel : undefined,
    });
  }
  levels.sort((a, b) => a.level - b.level);
  const max_level = (typeof body.max_level === 'number' ? body.max_level : levels[levels.length - 1].level) as BadgeLevel;
  return {
    data: {
      id: code,
      code,
      title,
      description: String((body.description ?? '') as string),
      icon: String((body.icon ?? 'Award') as string),
      iconColor: typeof body.iconColor === 'string' ? body.iconColor : undefined,
      category: category as BadgeCategory,
      metricType: metricType as BadgeMetricType,
      metricUnit: String((body.metricUnit ?? '') as string),
      max_level,
      levels,
      status: (body.status === 'inactive' || body.status === 'archived' ? body.status : 'active') as TalBadgeDto['status'],
      isGlow: body.isGlow === true,
    },
  };
}

