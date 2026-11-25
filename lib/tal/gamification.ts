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
//
// Tipe, konstanta & helper murni dipindah ke `lib/tal/gamification-shared.ts`
// (client-safe, tanpa import server) — file ini me-re-export semuanya agar
// importir server yang sudah ada tidak berubah.

import { prisma } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import {
  DEFAULT_TAL_BADGES,
  addDays,
  formatDateKey,
  getISOWeek,
  hourWib,
  mapStoredProgress,
  mapTalBadge,
  mapTrophy,
  payloadOf,
  tierForLevel,
  todayWib,
  weeklyScopeKey,
} from './gamification-shared';
import type {
  BadgeMetricType,
  HeatmapDayData,
  TalBadgeDto,
  UserBadgeProgressDto,
  UserGamificationSummary,
} from './gamification-shared';

export * from './gamification-shared';

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
