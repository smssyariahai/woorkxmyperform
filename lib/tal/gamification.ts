// lib/tal/gamification.ts — Gamifikasi TAL (sub-tahap c, Gelombang 4)
//
// Porting server-side dari src/services/talGamificationService.ts (backup
// MyPerform) + src/types/talGamification.ts. Semua hitungan memakai Prisma
// (lib/db.ts) dan data TAL yang sudah ada (TalTask, TalLockReport, TalCuti,
// TalHoliday). TIDAK ada sistem poin terpisah: "poin" di ringkasan hanya
// angka tampilan turunan (earnedBadges*250 + streak*25, rumus yang sama
// dipakai TalGamificationRewards di backup).
//
// Catatan tanggal: semua tanggal kalender dihitung dalam WIB (UTC+7) dengan
// aritmetika manual, karena zona waktu server tidak dijamin WIB. Helper
// tanggal minimal ada di file ini; bila lib/tal/date.ts (sub-tahap a) sudah
// tersedia, helper di sini sebaiknya diganti pemakaiannya ke sana
// (konsolidasi — lihat laporan sub-tahap c).

import { prisma } from '@/lib/db';
import type { Prisma } from '@prisma/client';
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

const WIB_MS = 7 * 3600 * 1000;

/** Hari ini (kalender WIB) sebagai Date UTC-midnight; field UTC = tanggal WIB. */
export function todayWib(): Date {
  const now = new Date(Date.now() + WIB_MS);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function formatDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
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

function weeklyScopeKey(d: Date): string {
  const { week, year } = getISOWeek(d);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** Jam WIB (0-23) dari sebuah timestamp. */
function hourWib(ts: Date | string): number {
  const t = typeof ts === 'string' ? new Date(ts) : ts;
  return (t.getUTCHours() + 7) % 24;
}

function payloadOf(row: { payload: unknown }): Record<string, any> {
  const p = (row as any).payload;
  return p && typeof p === 'object' ? (p as Record<string, any>) : {};
}

function tierForLevel(level: number): BadgeTier {
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

function mapStoredProgress(row: {
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
// Katalog badge
// ---------------------------------------------------------------------------

/** Seed 9 badge bawaan bila katalog organisasi masih kosong (idempotent). */
export async function ensureDefaultBadges(organizationId: string): Promise<void> {
  const count = await prisma.talBadge.count({ where: { organizationId } });
  if (count > 0) return;
  await prisma.talBadge.createMany({
    data: DEFAULT_TAL_BADGES.map((b) => ({
      organizationId,
      badgeId: b.id,
      name: b.title,
      description: b.description,
      payload: {
        icon: b.icon,
        iconColor: b.iconColor,
        category: b.category,
        metricType: b.metricType,
        metricUnit: b.metricUnit,
        max_level: b.max_level,
        levels: b.levels,
        status: b.status,
        isGlow: b.isGlow,
      } as unknown as Prisma.InputJsonValue,
    })),
    skipDuplicates: true,
  });
}

export async function listBadges(organizationId: string): Promise<TalBadgeDto[]> {
  await ensureDefaultBadges(organizationId);
  const rows = await prisma.talBadge.findMany({
    where: { organizationId },
    orderBy: { badgeId: 'asc' },
  });
  return rows.map(mapTalBadge);
}

/** Progres tersimpan user untuk satu musim (dipakai GET /api/tal/badges). */
export async function listStoredProgress(
  organizationId: string,
  userId: string,
  seasonYear: number,
): Promise<Record<string, UserBadgeProgressDto>> {
  const rows = await prisma.userBadgeProgress.findMany({
    where: { organizationId, userId, seasonYear },
  });
  const out: Record<string, UserBadgeProgressDto> = {};
  for (const r of rows) out[r.badgeId] = { ...mapStoredProgress(r), userId };
  return out;
}

/** Cek apakah badge sudah punya capaian (guard sebelum hapus — §3.3). */
export async function checkBadgeHasAchievements(
  organizationId: string,
  badgeId: string,
): Promise<boolean> {
  const [prog, trophy] = await Promise.all([
    prisma.userBadgeProgress.findFirst({
      where: { organizationId, badgeId },
      select: { id: true, payload: true },
    }),
    prisma.userTrophy.findFirst({ where: { organizationId, badgeId }, select: { id: true } }),
  ]);
  if (trophy) return true;
  if (!prog) return false;
  const p = payloadOf(prog as { payload: unknown });
  return (typeof p.currentLevel === 'number' ? p.currentLevel : 0) > 0;
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

// ---------------------------------------------------------------------------
// Evaluasi gamifikasi — porting evaluateUserGamification (backup)
// ---------------------------------------------------------------------------

interface EvalTask {
  type: string;
  status: string;
  priority: string;
  category: string;
  taskDate: Date | null;
  assignedUserEmails: unknown;
  createdAt: Date;
}

export async function evaluateUserGamification(opts: {
  organizationId: string;
  userId: string;
  userEmail: string;
  userName?: string;
  seasonYear?: number;
}): Promise<UserGamificationSummary> {
  const { organizationId, userId } = opts;
  const userEmail = opts.userEmail.toLowerCase().trim();
  const seasonYear = opts.seasonYear ?? todayWib().getUTCFullYear();
  const today = todayWib();
  const todayKey = formatDateKey(today);

  // 1. Muat data: task milik sendiri (+ yang didelegasikan ke user ini),
  //    lock/report, libur org, cuti user, katalog badge, trofi tersimpan.
  const [ownTasks, badges, locks, holidays, cuti, storedProgress, storedTrophies] = await Promise.all([
    prisma.talTask.findMany({
      where: { organizationId, userId },
      select: { type: true, status: true, priority: true, category: true, taskDate: true, assignedUserEmails: true, createdAt: true },
    }),
    listBadges(organizationId),
    prisma.talLockReport.findMany({
      where: { organizationId, userId },
      select: { scope: true, scopeKey: true, isPlanLocked: true, isReported: true, reportedAt: true, payload: true },
    }),
    prisma.talHoliday.findMany({ where: { organizationId }, select: { holidayDate: true, name: true } }),
    prisma.talCuti.findMany({ where: { organizationId, userId }, select: { cutiDate: true, reason: true } }),
    prisma.userBadgeProgress.findMany({ where: { organizationId, userId, seasonYear } }),
    prisma.userTrophy.findMany({
      where: { organizationId, userId },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  // Tugas delegasi: task org lain yang assignedUserEmails-nya berisi email user.
  let delegatedTasks: EvalTask[] = [];
  if (userEmail) {
    try {
      const rows = await prisma.talTask.findMany({
        where: {
          organizationId,
          userId: { not: userId },
          assignedUserEmails: { array_contains: userEmail },
        },
        select: { type: true, status: true, priority: true, category: true, taskDate: true, assignedUserEmails: true, createdAt: true },
      });
      delegatedTasks = rows as EvalTask[];
    } catch {
      // array_contains pada Json gagal (mis. data lama bukan array) -> abaikan delegasi.
      delegatedTasks = [];
    }
  }
  const tasks = [...(ownTasks as EvalTask[]), ...delegatedTasks];
  const ownTaskList = ownTasks as EvalTask[];

  // 2. Peta bantu
  const holidayMap = new Map<string, string>();
  for (const h of holidays) holidayMap.set(formatDateKey(h.holidayDate), h.name ?? 'Hari Libur');
  const cutiMap = new Map<string, string>();
  for (const c of cuti) cutiMap.set(formatDateKey(c.cutiDate), c.reason ?? 'Cuti Kerja');

  const dailyLocks = new Map<string, { isPlanLocked: boolean; isReported: boolean; planScore: number; reportScore: number; reportedAt: Date | null; isCuti: boolean; cutiReason?: string }>();
  const weeklyLocks = new Map<string, { planScore: number; progressScore: number }>();
  const monthlyLocks: { planScore: number; progressScore: number }[] = [];
  for (const l of locks) {
    const p = payloadOf(l as { payload: unknown });
    const progressScore = typeof p.progressScore === 'number' ? p.progressScore : (typeof p.scorePercent === 'number' ? p.scorePercent : 0);
    if (l.scope === 'daily') {
      dailyLocks.set(l.scopeKey, {
        isPlanLocked: l.isPlanLocked,
        isReported: l.isReported,
        planScore: typeof p.planScore === 'number' ? p.planScore : (l.isPlanLocked ? 100 : 0),
        reportScore: typeof p.reportScore === 'number' ? p.reportScore : (l.isReported ? 100 : 0),
        reportedAt: l.reportedAt,
        isCuti: p.isCuti === true,
        cutiReason: typeof p.cutiReason === 'string' ? p.cutiReason : undefined,
      });
    } else if (l.scope === 'weekly') {
      weeklyLocks.set(l.scopeKey, {
        planScore: typeof p.planScore === 'number' ? p.planScore : (l.isPlanLocked ? 100 : 0),
        progressScore,
      });
    } else if (l.scope === 'monthly') {
      monthlyLocks.push({
        planScore: typeof p.planScore === 'number' ? p.planScore : 0,
        progressScore,
      });
    }
  }

  const dailyTasksByDate = new Map<string, EvalTask[]>();
  for (const t of ownTaskList) {
    if (t.type === 'daily' && t.taskDate) {
      const k = formatDateKey(t.taskDate);
      const arr = dailyTasksByDate.get(k) ?? [];
      arr.push(t);
      dailyTasksByDate.set(k, arr);
    }
  }

  // 3. Heatmap 365 hari musim berjalan (porting backup; hari kerja Sen–Sab,
  //    Minggu = libur mingguan; libur/cuti menjeda streak, bukan memutusnya).
  const heatmapData: HeatmapDayData[] = [];
  let totalDaysOnTime = 0;
  let totalDaysLate = 0;
  const startOfYear = new Date(Date.UTC(seasonYear, 0, 1));
  const endOfYear = new Date(Date.UTC(seasonYear, 11, 31));
  for (let cur = startOfYear; cur <= endOfYear; cur = addDays(cur, 1)) {
    const dKey = formatDateKey(cur);
    const dayOfWeek = cur.getUTCDay();
    const isSunday = dayOfWeek === 0;
    const holidayTitle = holidayMap.get(dKey);
    const cutiReason = cutiMap.get(dKey);
    const isHoliday = isSunday || !!holidayTitle;
    const isFuture = dKey > todayKey;
    const dayTasks = dailyTasksByDate.get(dKey) ?? [];
    const lock = dailyLocks.get(dKey);
    const isCuti = !!cutiReason || !!lock?.isCuti;
    const weeklyLock = weeklyLocks.get(weeklyScopeKey(cur));
    const isWeeklyPlanLocked = !!weeklyLock && (weeklyLock.planScore > 0 || (locks.some((l) => l.scope === 'weekly' && l.scopeKey === weeklyScopeKey(cur) && l.isPlanLocked)));

    let status: HeatmapDayData['status'] = 'empty';
    let planLockedOnTime = false;
    let reportSubmittedOnTime = false;
    let hasPlan = dayTasks.length > 0;
    let hasReport = lock?.isReported ?? false;

    if (isFuture) {
      status = 'future';
    } else if (isHoliday) {
      status = 'holiday';
    } else if (isCuti) {
      status = 'holiday';
    } else {
      const isPlanLocked = lock?.isPlanLocked ?? isWeeklyPlanLocked;
      const isReported = lock?.isReported ?? false;
      hasPlan = hasPlan || isPlanLocked;
      hasReport = isReported;
      const planScore = lock?.planScore ?? (isPlanLocked ? (weeklyLock?.planScore ?? 0) : 0);
      const reportScore = lock?.reportScore ?? (isReported ? 100 : 0);
      planLockedOnTime = isPlanLocked && planScore === 100;
      reportSubmittedOnTime = isReported && reportScore === 100;
      // Batas lapor: hari itu sudah lewat (fallback backup bila deadline tak dihitung).
      const isDeadlinePassed = dKey < todayKey;
      if (dayTasks.length > 0 || isPlanLocked || isReported) {
        if (planLockedOnTime && reportSubmittedOnTime) {
          status = 'on_time';
          totalDaysOnTime++;
        } else if (isDeadlinePassed || (isPlanLocked && isReported)) {
          status = 'late';
          totalDaysLate++;
        } else {
          status = 'empty';
        }
      }
    }

    const tooltipText = status === 'future' ? `${dKey}: Belum tiba`
      : status === 'holiday' ? (isSunday ? `${dKey}: Hari Minggu (Libur Mingguan)` : `${dKey}: ${holidayTitle ?? cutiReason ?? 'Hari Libur'}`)
      : status === 'on_time' ? `${dKey}: Rencana & Laporan Tepat Waktu (Hijau)`
      : status === 'late' ? `${dKey}: Rencana / Laporan Terlambat (Oranye)`
      : `${dKey}: ${dayTasks.length > 0 ? 'Tugas Dalam Proses' : 'Kosong'}`;

    heatmapData.push({
      date: dKey,
      dayOfWeek,
      isHoliday: isHoliday || isCuti,
      isFuture,
      hasPlan,
      planLockedOnTime,
      hasReport,
      reportSubmittedOnTime,
      status,
      taskCount: dayTasks.length,
      tooltipText,
    });
  }

  // 4. Streak: hari kerja on_time beruntun (libur dilewati, bukan pemutus).
  let bestStreak = 0;
  let running = 0;
  for (const day of heatmapData) {
    if (day.isFuture) break;
    if (day.isHoliday) continue;
    if (day.status === 'on_time') {
      running++;
      if (running > bestStreak) bestStreak = running;
    } else {
      running = 0;
    }
  }
  let currentStreak = 0;
  let idx = heatmapData.findIndex((d) => d.date === todayKey);
  if (idx >= 0) {
    let checkIdx = idx;
    if (heatmapData[checkIdx].isHoliday || heatmapData[checkIdx].status === 'empty') checkIdx--;
    while (checkIdx >= 0) {
      const d = heatmapData[checkIdx];
      if (d.isHoliday) { checkIdx--; continue; }
      if (d.status === 'on_time') { currentStreak++; checkIdx--; }
      else break;
    }
  }

  // Early-bird streak (dihitung BENAR dari reportedAt < 17:00 WIB — backup
  // hanya memakai min(currentStreak, 160) sebagai aproksimasi).
  let earlyBirdStreak = 0;
  {
    let checkIdx = heatmapData.findIndex((d) => d.date === todayKey);
    if (checkIdx >= 0) {
      if (heatmapData[checkIdx].isHoliday || heatmapData[checkIdx].status === 'empty') checkIdx--;
      while (checkIdx >= 0) {
        const d = heatmapData[checkIdx];
        if (d.isHoliday) { checkIdx--; continue; }
        const lock = dailyLocks.get(d.date);
        const early = !!lock?.isReported && !!lock.reportedAt && hourWib(lock.reportedAt) < 17;
        if (early) { earlyBirdStreak++; checkIdx--; }
        else break;
      }
    }
  }

  // 5. Metrik badge (porting backup).
  const doneTasks = tasks.filter((t) => t.status === 'done');
  const totalDoneCount = doneTasks.length;
  const delegatedDoneCount = doneTasks.filter((t) => delegatedTasks.includes(t)).length;

  let highPriorityStreak = 0;
  {
    let temp = 0;
    const sorted = [...tasks].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    for (const t of sorted) {
      if (t.priority !== 'high') continue;
      if (t.status === 'done') {
        temp++;
        if (temp > highPriorityStreak) highPriorityStreak = temp;
      } else if (t.status === 'pending') {
        temp = 0;
      }
    }
  }

  const weeklyOnTimePlan = [...weeklyLocks.values()].filter((w) => w.planScore === 100).length;
  const weeklyPerfect = [...weeklyLocks.values()].filter((w) => w.progressScore === 100).length;
  const monthlyOver120 = monthlyLocks.filter((m) => m.progressScore >= 120).length;
  const monthlyPerfect = monthlyLocks.filter((m) => m.progressScore === 100).length;

  const metricValue = (metricType: BadgeMetricType): number => {
    switch (metricType) {
      case 'streak_days': return currentStreak > 0 ? currentStreak : bestStreak;
      case 'done_task_count': return totalDoneCount;
      case 'delegated_task_count': return delegatedDoneCount;
      case 'high_priority_streak': return highPriorityStreak;
      // CATATAN: backup menghitung JUMLAH pekan on-time, bukan pekan
      // berturut-turut, meski labelnya "berturut-turut" — di-port apa adanya.
      case 'flash_plan_weeks': return weeklyOnTimePlan;
      case 'sniper_weeks': return weeklyPerfect;
      case 'monthly_ratio_percent': return monthlyOver120;
      case 'early_bird_streak': return earlyBirdStreak;
      case 'perfectionist_months': return monthlyPerfect;
      default: return totalDoneCount;
    }
  };

  // 6. Progres per badge + simpan progres & trofi (naik level -> trofi baru).
  const badgesProgress: Record<string, UserBadgeProgressDto> = {};
  let activeBadgesCount = 0;
  let masteredBadgesCount = 0;
  const storedByBadge = new Map(storedProgress.map((r) => [r.badgeId, r]));

  for (const badge of badges) {
    if (badge.status === 'archived' || badge.status === 'inactive') continue;
    activeBadgesCount++;
    const currentValue = metricValue(badge.metricType);
    const maxLevel = badge.max_level || 5;
    const activeLevels = badge.levels.filter((l) => l.level <= maxLevel).sort((a, b) => a.level - b.level);
    let currentLevel = 0;
    for (const lvl of activeLevels) if (currentValue >= lvl.target) currentLevel = lvl.level;
    const isMastered = currentLevel >= maxLevel && activeLevels.length > 0 && currentValue >= activeLevels[activeLevels.length - 1].target;
    if (isMastered) masteredBadgesCount++;

    let nextTarget = 0;
    let progressPercent = 0;
    let remainingToNext = 0;
    if (isMastered) {
      nextTarget = activeLevels[activeLevels.length - 1]?.target ?? 100;
      progressPercent = 100;
    } else {
      const nextLvl = activeLevels.find((l) => l.level === currentLevel + 1) ?? activeLevels[0];
      nextTarget = nextLvl?.target ?? 0;
      remainingToNext = Math.max(0, nextTarget - currentValue);
      progressPercent = nextTarget > 0 ? Math.min(100, Math.round((currentValue / nextTarget) * 100)) : 0;
    }

    const prev = storedByBadge.get(badge.id);
    const prevPayload = prev ? payloadOf(prev as { payload: unknown }) : {};
    const prevLevel = typeof prevPayload.currentLevel === 'number' ? prevPayload.currentLevel : 0;
    const levelAchievedDates: Record<number, string> = (prevPayload.levelAchievedDates && typeof prevPayload.levelAchievedDates === 'object'
      ? { ...(prevPayload.levelAchievedDates as Record<number, string>) }
      : {}) as Record<number, string>;
    if (currentLevel > prevLevel) {
      for (let lv = prevLevel + 1; lv <= currentLevel; lv++) levelAchievedDates[lv] = new Date().toISOString();
    }

    const progress: UserBadgeProgressDto = {
      userId,
      badgeId: badge.id,
      seasonYear,
      currentValue,
      currentLevel,
      isMastered,
      nextTarget,
      progressPercent,
      remainingToNext,
      lastUpdated: new Date().toISOString(),
      levelAchievedDates,
    };
    badgesProgress[badge.id] = progress;

    // Simpan progres (best-effort — evaluasi baca tidak boleh gagal karenanya).
    try {
      await prisma.userBadgeProgress.upsert({
        where: { organizationId_userId_badgeId_seasonYear: { organizationId, userId, badgeId: badge.id, seasonYear } },
        create: {
          organizationId, userId, badgeId: badge.id, seasonYear,
          payload: { ...progress, userEmail },
        },
        update: { payload: { ...progress, userEmail } },
      });
    } catch { /* abaikan */ }

    // Trofi baru saat level naik (arsip permanen di trophy room).
    if (currentLevel > prevLevel && currentLevel > 0) {
      try {
        await prisma.userTrophy.create({
          data: {
            organizationId,
            userId,
            badgeId: badge.id,
            payload: {
              badgeCode: badge.id,
              badgeTitle: badge.title,
              badgeIcon: badge.icon,
              badgeCategory: badge.category,
              highestLevel: currentLevel,
              highestTier: tierForLevel(currentLevel),
              finalValue: currentValue,
              seasonYear,
              achievedAt: new Date().toISOString(),
              userEmail,
              userName: opts.userName ?? '',
            },
          },
        });
      } catch { /* abaikan */ }
    }
  }

  const trophies = storedTrophies.map(mapTrophy);
  // Trofi yang baru dibuat di atas ikut tampil bila evaluasi ini menaikkan level.
  // (Dibaca ulang secara ringan: bila ada level naik, ambil ulang daftar trofi.)
  let trophyList = trophies;
  const anyLevelUp = Object.values(badgesProgress).some((p) => {
    const prev = storedByBadge.get(p.badgeId);
    const prevLevel = prev ? (typeof payloadOf(prev as { payload: unknown }).currentLevel === 'number' ? (payloadOf(prev as { payload: unknown }).currentLevel as number) : 0) : 0;
    return p.currentLevel > prevLevel;
  });
  if (anyLevelUp) {
    try {
      const fresh = await prisma.userTrophy.findMany({ where: { organizationId, userId }, orderBy: { createdAt: 'desc' } });
      trophyList = fresh.map(mapTrophy);
    } catch { /* pakai daftar lama */ }
  }

  const earnedBadgesCount = Object.values(badgesProgress).filter((b) => b.currentLevel > 0).length;
  const points = earnedBadgesCount * 250 + currentStreak * 25;

  return {
    userId,
    userEmail,
    userName: opts.userName ?? '',
    seasonYear,
    currentStreak,
    bestStreak,
    earlyBirdStreak,
    totalDaysOnTime,
    totalDaysLate,
    activeBadgesCount,
    masteredBadgesCount,
    points,
    heatmapData,
    badgesProgress,
    trophies: trophyList,
  };
}
