'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Trophy,
  Award,
  Lock,
  Search,
  CreditCard,
  Gift,
  ChevronRight,
  Sparkles
} from 'lucide-react';
import {
  TalBadgeDto as TalBadge,
  UserBadgeProgressDto as UserBadgeProgress,
  TrophyArchiveItemDto as TrophyArchiveItem,
  BADGE_TIERS,
  BadgeLevel,
  BadgeTier
} from '@/lib/tal/gamification';
import { TalBadgeEmblem } from './gamification/TalBadgeEmblem';
import { TalGamificationPopupModal, PopupBadgeData } from './gamification/TalGamificationPopupModal';
import { TalGamificationPassCard } from './gamification/TalGamificationPassCard';
import { TalGamificationRewards } from './gamification/TalGamificationRewards';

export interface BadgeThemeConfig {
  cardBg: string;
  borderColor: string;
  hoverBorder: string;
  shadowColor: string;
  tagBg: string;
  tagText: string;
  tagBorder: string;
  accentText: string;
  barGradient: string;
  buttonBg: string;
  buttonText: string;
  buttonBorder: string;
  glowColor: string;
  haloBg: string;
  defaultIcon: 'crown' | 'diamond' | 'trophy' | 'ribbon' | 'star' | 'flame' | 'shield';
}

export const BADGE_COLOR_THEMES: Record<string, BadgeThemeConfig> = {
  FLASH_PLANNER: {
    cardBg: 'bg-gradient-to-br from-[#eff6ff] via-[#dbeafe]/85 to-[#e0e7ff]/80 dark:from-slate-900/90 dark:via-sky-950/40 dark:to-slate-900/90',
    borderColor: 'border-sky-200/90 dark:border-sky-800/60',
    hoverBorder: 'hover:border-sky-400 dark:hover:border-sky-500',
    shadowColor: 'hover:shadow-sky-200/60 dark:hover:shadow-sky-950/50',
    tagBg: 'bg-sky-500/15 dark:bg-sky-500/25',
    tagText: 'text-sky-800 dark:text-sky-300',
    tagBorder: 'border-sky-300/50 dark:border-sky-700/60',
    accentText: 'text-sky-700 dark:text-sky-300',
    barGradient: 'bg-gradient-to-r from-cyan-500 via-sky-500 to-blue-600',
    buttonBg: 'bg-white/95 hover:bg-white dark:bg-slate-800 dark:hover:bg-slate-700 text-sky-900 dark:text-sky-200',
    buttonText: 'text-sky-900 dark:text-sky-200',
    buttonBorder: 'border-sky-200/80 dark:border-sky-700/60',
    glowColor: 'bg-sky-400/25 dark:bg-sky-500/20',
    haloBg: 'bg-white/90 dark:bg-slate-800/90',
    defaultIcon: 'star'
  },
  SNIPER_EXECUTION: {
    cardBg: 'bg-gradient-to-br from-[#fff1f2] via-[#ffe4e6]/90 to-[#fed7aa]/75 dark:from-slate-900/90 dark:via-rose-950/40 dark:to-slate-900/90',
    borderColor: 'border-rose-200/90 dark:border-rose-800/60',
    hoverBorder: 'hover:border-rose-400 dark:hover:border-rose-500',
    shadowColor: 'hover:shadow-rose-200/60 dark:hover:shadow-rose-950/50',
    tagBg: 'bg-rose-500/15 dark:bg-rose-500/25',
    tagText: 'text-rose-800 dark:text-rose-300',
    tagBorder: 'border-rose-300/50 dark:border-rose-700/60',
    accentText: 'text-rose-700 dark:text-rose-300',
    barGradient: 'bg-gradient-to-r from-rose-500 via-red-500 to-orange-500',
    buttonBg: 'bg-white/95 hover:bg-white dark:bg-slate-800 dark:hover:bg-slate-700 text-rose-900 dark:text-rose-200',
    buttonText: 'text-rose-900 dark:text-rose-200',
    buttonBorder: 'border-rose-200/80 dark:border-rose-700/60',
    glowColor: 'bg-rose-400/25 dark:bg-rose-500/20',
    haloBg: 'bg-white/90 dark:bg-slate-800/90',
    defaultIcon: 'diamond'
  },
  TITAN_ACHIEVER: {
    cardBg: 'bg-gradient-to-br from-[#fffbeb] via-[#fef3c7]/95 to-[#fed7aa]/75 dark:from-slate-900/90 dark:via-amber-950/40 dark:to-slate-900/90',
    borderColor: 'border-amber-200/90 dark:border-amber-800/60',
    hoverBorder: 'hover:border-amber-400 dark:hover:border-amber-500',
    shadowColor: 'hover:shadow-amber-200/60 dark:hover:shadow-amber-950/50',
    tagBg: 'bg-amber-500/15 dark:bg-amber-500/25',
    tagText: 'text-amber-900 dark:text-amber-300',
    tagBorder: 'border-amber-300/50 dark:border-amber-700/60',
    accentText: 'text-amber-800 dark:text-amber-300',
    barGradient: 'bg-gradient-to-r from-amber-500 via-yellow-500 to-orange-500',
    buttonBg: 'bg-white/95 hover:bg-white dark:bg-slate-800 dark:hover:bg-slate-700 text-amber-950 dark:text-amber-200',
    buttonText: 'text-amber-950 dark:text-amber-200',
    buttonBorder: 'border-amber-200/80 dark:border-amber-700/60',
    glowColor: 'bg-amber-400/30 dark:bg-amber-500/20',
    haloBg: 'bg-white/90 dark:bg-slate-800/90',
    defaultIcon: 'trophy'
  },
  TASK_MASTERMIND: {
    cardBg: 'bg-gradient-to-br from-[#faf5ff] via-[#f3e8ff]/95 to-[#fce7f3]/80 dark:from-slate-900/90 dark:via-purple-950/40 dark:to-slate-900/90',
    borderColor: 'border-purple-200/90 dark:border-purple-800/60',
    hoverBorder: 'hover:border-purple-400 dark:hover:border-purple-500',
    shadowColor: 'hover:shadow-purple-200/60 dark:hover:shadow-purple-950/50',
    tagBg: 'bg-purple-500/15 dark:bg-purple-500/25',
    tagText: 'text-purple-800 dark:text-purple-300',
    tagBorder: 'border-purple-300/50 dark:border-purple-700/60',
    accentText: 'text-purple-700 dark:text-purple-300',
    barGradient: 'bg-gradient-to-r from-purple-500 via-fuchsia-500 to-pink-500',
    buttonBg: 'bg-white/95 hover:bg-white dark:bg-slate-800 dark:hover:bg-slate-700 text-purple-900 dark:text-purple-200',
    buttonText: 'text-purple-900 dark:text-purple-200',
    buttonBorder: 'border-purple-200/80 dark:border-purple-700/60',
    glowColor: 'bg-purple-400/25 dark:bg-purple-500/20',
    haloBg: 'bg-white/90 dark:bg-slate-800/90',
    defaultIcon: 'crown'
  },
  IRON_DISCIPLINE: {
    cardBg: 'bg-gradient-to-br from-[#ecfdf5] via-[#d1fae5]/90 to-[#ccfbf1]/80 dark:from-slate-900/90 dark:via-emerald-950/40 dark:to-slate-900/90',
    borderColor: 'border-emerald-200/90 dark:border-emerald-800/60',
    hoverBorder: 'hover:border-emerald-400 dark:hover:border-emerald-500',
    shadowColor: 'hover:shadow-emerald-200/60 dark:hover:shadow-emerald-950/50',
    tagBg: 'bg-emerald-500/15 dark:bg-emerald-500/25',
    tagText: 'text-emerald-800 dark:text-emerald-300',
    tagBorder: 'border-emerald-300/50 dark:border-emerald-700/60',
    accentText: 'text-emerald-700 dark:text-emerald-300',
    barGradient: 'bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-600',
    buttonBg: 'bg-white/95 hover:bg-white dark:bg-slate-800 dark:hover:bg-slate-700 text-emerald-950 dark:text-emerald-200',
    buttonText: 'text-emerald-950 dark:text-emerald-200',
    buttonBorder: 'border-emerald-200/80 dark:border-emerald-700/60',
    glowColor: 'bg-emerald-400/25 dark:bg-emerald-500/20',
    haloBg: 'bg-white/90 dark:bg-slate-800/90',
    defaultIcon: 'shield'
  },
  EARLY_BIRD: {
    cardBg: 'bg-gradient-to-br from-[#fff7ed] via-[#ffedd5]/95 to-[#fef3c7]/80 dark:from-slate-900/90 dark:via-orange-950/40 dark:to-slate-900/90',
    borderColor: 'border-orange-200/90 dark:border-orange-800/60',
    hoverBorder: 'hover:border-orange-400 dark:hover:border-orange-500',
    shadowColor: 'hover:shadow-orange-200/60 dark:hover:shadow-orange-950/50',
    tagBg: 'bg-orange-500/15 dark:bg-orange-500/25',
    tagText: 'text-orange-800 dark:text-orange-300',
    tagBorder: 'border-orange-300/50 dark:border-orange-700/60',
    accentText: 'text-orange-700 dark:text-orange-300',
    barGradient: 'bg-gradient-to-r from-orange-400 via-amber-500 to-rose-500',
    buttonBg: 'bg-white/95 hover:bg-white dark:bg-slate-800 dark:hover:bg-slate-700 text-orange-950 dark:text-orange-200',
    buttonText: 'text-orange-950 dark:text-orange-200',
    buttonBorder: 'border-orange-200/80 dark:border-orange-700/60',
    glowColor: 'bg-orange-400/25 dark:bg-orange-500/20',
    haloBg: 'bg-white/90 dark:bg-slate-800/90',
    defaultIcon: 'star'
  },
  SYNERGY_CHAMP: {
    cardBg: 'bg-gradient-to-br from-[#f0f9ff] via-[#e0f2fe]/95 to-[#fae8ff]/80 dark:from-slate-900/90 dark:via-sky-950/40 dark:to-slate-900/90',
    borderColor: 'border-sky-200/90 dark:border-sky-800/60',
    hoverBorder: 'hover:border-sky-400 dark:hover:border-sky-500',
    shadowColor: 'hover:shadow-sky-200/60 dark:hover:shadow-sky-950/50',
    tagBg: 'bg-sky-500/15 dark:bg-sky-500/25',
    tagText: 'text-sky-800 dark:text-sky-300',
    tagBorder: 'border-sky-300/50 dark:border-sky-700/60',
    accentText: 'text-sky-700 dark:text-sky-300',
    barGradient: 'bg-gradient-to-r from-sky-500 via-blue-500 to-purple-500',
    buttonBg: 'bg-white/95 hover:bg-white dark:bg-slate-800 dark:hover:bg-slate-700 text-sky-950 dark:text-sky-200',
    buttonText: 'text-sky-950 dark:text-sky-200',
    buttonBorder: 'border-sky-200/80 dark:border-sky-700/60',
    glowColor: 'bg-sky-400/25 dark:bg-sky-500/20',
    haloBg: 'bg-white/90 dark:bg-slate-800/90',
    defaultIcon: 'diamond'
  },
  UNSTOPPABLE: {
    cardBg: 'bg-gradient-to-br from-[#fff1f2] via-[#fee2e2]/95 to-[#ffedd5]/80 dark:from-slate-900/90 dark:via-red-950/40 dark:to-slate-900/90',
    borderColor: 'border-red-200/90 dark:border-red-800/60',
    hoverBorder: 'hover:border-red-400 dark:hover:border-red-500',
    shadowColor: 'hover:shadow-red-200/60 dark:hover:shadow-red-950/50',
    tagBg: 'bg-red-500/15 dark:bg-red-500/25',
    tagText: 'text-red-800 dark:text-red-300',
    tagBorder: 'border-red-300/50 dark:border-red-700/60',
    accentText: 'text-red-700 dark:text-red-300',
    barGradient: 'bg-gradient-to-r from-red-500 via-orange-500 to-amber-500',
    buttonBg: 'bg-white/95 hover:bg-white dark:bg-slate-800 dark:hover:bg-slate-700 text-red-950 dark:text-red-200',
    buttonText: 'text-red-950 dark:text-red-200',
    buttonBorder: 'border-red-200/80 dark:border-red-700/60',
    glowColor: 'bg-red-400/25 dark:bg-red-500/20',
    haloBg: 'bg-white/90 dark:bg-slate-800/90',
    defaultIcon: 'flame'
  },
  PERFECTIONIST: {
    cardBg: 'bg-gradient-to-br from-[#fdf2f8] via-[#fce7f3]/95 to-[#ede9fe]/80 dark:from-slate-900/90 dark:via-purple-950/40 dark:to-slate-900/90',
    borderColor: 'border-fuchsia-200/90 dark:border-fuchsia-800/60',
    hoverBorder: 'hover:border-fuchsia-400 dark:hover:border-fuchsia-500',
    shadowColor: 'hover:shadow-fuchsia-200/60 dark:hover:shadow-fuchsia-950/50',
    tagBg: 'bg-fuchsia-500/15 dark:bg-fuchsia-500/25',
    tagText: 'text-fuchsia-800 dark:text-fuchsia-300',
    tagBorder: 'border-fuchsia-300/50 dark:border-fuchsia-700/60',
    accentText: 'text-fuchsia-700 dark:text-fuchsia-300',
    barGradient: 'bg-gradient-to-r from-fuchsia-500 via-pink-500 to-purple-600',
    buttonBg: 'bg-white/95 hover:bg-white dark:bg-slate-800 dark:hover:bg-slate-700 text-fuchsia-950 dark:text-fuchsia-200',
    buttonText: 'text-fuchsia-950 dark:text-fuchsia-200',
    buttonBorder: 'border-fuchsia-200/80 dark:border-fuchsia-700/60',
    glowColor: 'bg-fuchsia-400/25 dark:bg-fuchsia-500/20',
    haloBg: 'bg-white/90 dark:bg-slate-800/90',
    defaultIcon: 'crown'
  }
};

export const getBadgeCardTheme = (badgeId: string, category: string): BadgeThemeConfig => {
  if (BADGE_COLOR_THEMES[badgeId]) {
    return BADGE_COLOR_THEMES[badgeId];
  }
  const cat = (category || '').toLowerCase();
  if (cat.includes('rencan') || cat.includes('plan')) {
    return BADGE_COLOR_THEMES.FLASH_PLANNER;
  }
  if (cat.includes('disiplin')) {
    return BADGE_COLOR_THEMES.IRON_DISCIPLINE;
  }
  if (cat.includes('kolabor')) {
    return BADGE_COLOR_THEMES.SYNERGY_CHAMP;
  }
  if (cat.includes('kualitas')) {
    return BADGE_COLOR_THEMES.PERFECTIONIST;
  }
  return BADGE_COLOR_THEMES.TITAN_ACHIEVER;
};

interface TalBadgeGalleryProps {
  badges: TalBadge[];
  progressMap: Record<string, UserBadgeProgress>;
  trophies: TrophyArchiveItem[];
  seasonYear: number;
  userName?: string;
  userEmail?: string;
  currentStreak?: number;
}

export const TalBadgeGallery: React.FC<TalBadgeGalleryProps> = ({
  badges,
  progressMap,
  trophies,
  seasonYear,
  userName = 'Ksatria TAL',
  userEmail = '',
  currentStreak = 0
}) => {
  const [activeTab, setActiveTab] = useState<'catalog' | 'trophy_room' | 'pass_card' | 'rewards'>('catalog');
  const [activeFilter, setActiveFilter] = useState<'all' | 'in_progress' | 'achieved' | 'mastered'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Selected badge for celebration / detail modal popup (Image 3)
  const [selectedPopupBadge, setSelectedPopupBadge] = useState<PopupBadgeData | null>(null);

  // Helper to get tier for a level
  const getTierForLevel = (lvl: number): BadgeTier | 'locked' => {
    if (lvl <= 0) return 'locked';
    if (lvl === 1) return 'bronze';
    if (lvl === 2) return 'silver';
    if (lvl === 3) return 'gold';
    if (lvl === 4) return 'platinum';
    return 'diamond';
  };

  // Find highest tier achieved for user pass card
  const highestAchievedLevel = Object.values(progressMap).reduce((max, cur) => {
    return Math.max(max, cur.currentLevel || 0);
  }, 0);

  const highestTier: BadgeTier = highestAchievedLevel === 5 ? 'diamond'
    : highestAchievedLevel === 4 ? 'platinum'
    : highestAchievedLevel === 3 ? 'gold'
    : highestAchievedLevel === 2 ? 'silver'
    : highestAchievedLevel === 1 ? 'bronze'
    : 'bronze';

  const earnedBadgesCount = Object.values(progressMap).filter(b => b.currentLevel > 0).length;

  // Filtered badges
  const filteredBadges = badges.filter(badge => {
    if (badge.status === 'archived' || badge.status === 'inactive') return false;

    const prog = progressMap[badge.id] || {
      currentValue: 0,
      currentLevel: 0,
      isMastered: false,
      progressPercent: 0
    };

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const match = badge.title.toLowerCase().includes(q) || 
                    badge.description.toLowerCase().includes(q) ||
                    badge.category.toLowerCase().includes(q);
      if (!match) return false;
    }

    if (activeFilter === 'in_progress') {
      return prog.currentLevel < badge.max_level && !prog.isMastered;
    }
    if (activeFilter === 'achieved') {
      return prog.currentLevel >= 1;
    }
    if (activeFilter === 'mastered') {
      return prog.isMastered;
    }
    return true;
  });

  const handleOpenBadgePopup = (badge: TalBadge, prog: UserBadgeProgress, clickedLevel?: number) => {
    const lvl = clickedLevel !== undefined ? clickedLevel : prog.currentLevel;
    const isUnlocked = prog.currentLevel >= (clickedLevel || 1);
    const tier = getTierForLevel(lvl || 1);

    setSelectedPopupBadge({
      title: badge.title,
      category: badge.category,
      description: badge.description,
      level: lvl,
      tier: isUnlocked ? tier : 'locked',
      scoreOrProgressText: `Progres: ${prog.currentValue} / ${badge.levels.find(l => l.level === (lvl || 1))?.target || 10} ${badge.metricUnit}`,
      targetText: `${badge.metricUnit}`,
      isUnlocked,
      isMastered: prog.isMastered && (!clickedLevel || clickedLevel === badge.max_level)
    });
  };

  // Perayaan otomatis saat badge naik level (tambahan WOORK — di backup
  // popup hanya dibuka lewat klik). Bandingkan level progres dengan muatan
  // sebelumnya pada musim yang sama; abaikan muatan pertama & ganti musim.
  const prevLevelsRef = useRef<{ year: number; levels: Record<string, number> } | null>(null);
  useEffect(() => {
    const prev = prevLevelsRef.current;
    const current: Record<string, number> = {};
    for (const p of Object.values(progressMap)) current[p.badgeId] = p.currentLevel || 0;
    if (prev && prev.year === seasonYear) {
      const leveledUp = badges.find((b) => (current[b.id] ?? 0) > (prev.levels[b.id] ?? 0));
      if (leveledUp) {
        const prog = progressMap[leveledUp.id];
        if (prog) handleOpenBadgePopup(leveledUp, prog, prog.currentLevel);
      }
    }
    prevLevelsRef.current = { year: seasonYear, levels: current };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progressMap, badges, seasonYear]);

  return (
    <div className="space-y-4">
      {/* 1. Main Navigation Tabs (Inspired by the Gamification UI Kit Modules) */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-xs font-bold">
          <button
            type="button"
            onClick={() => setActiveTab('catalog')}
            className={`px-3.5 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'catalog'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/25'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Award size={14} />
            <span>Katalog Lencana</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('trophy_room')}
            className={`px-3.5 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'trophy_room'
                ? 'bg-amber-500 text-white shadow-md shadow-amber-500/25'
                : 'text-amber-700 bg-amber-50 hover:bg-amber-100'
            }`}
          >
            <Trophy size={14} />
            <span>Trophy Room ({trophies.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('pass_card')}
            className={`px-3.5 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'pass_card'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-500/25'
                : 'text-purple-700 bg-purple-50 hover:bg-purple-100'
            }`}
          >
            <CreditCard size={14} />
            <span>Member Pass Digital</span>
            <span className="text-[9px] font-black uppercase tracking-wider bg-purple-200/80 text-purple-900 px-1.5 py-0.5 rounded-full">
              Soon
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('rewards')}
            className={`px-3.5 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'rewards'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-500/25'
                : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
            }`}
          >
            <Gift size={14} />
            <span>Hadiah & Apresiasi</span>
            <span className="text-[9px] font-black uppercase tracking-wider bg-emerald-200/80 text-emerald-900 px-1.5 py-0.5 rounded-full">
              Soon
            </span>
          </button>
        </div>
      </div>

      {/* 2. TAB: DIGITAL MEMBER PASS (Image 2 Inspiration) */}
      {activeTab === 'pass_card' && (
        <div className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-sm space-y-4">
          {/* Coming Soon Notice Banner */}
          <div className="bg-amber-50/90 border border-amber-200/90 rounded-2xl p-3.5 sm:p-4 flex items-center gap-3 text-amber-900 shadow-sm max-w-xl mx-auto">
            <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center shrink-0 text-amber-600 border border-amber-200/70">
              <Sparkles size={16} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-amber-800 bg-amber-200/70 px-2 py-0.5 rounded-full">
                  Coming Soon
                </span>
                <span className="text-xs font-bold text-amber-950">
                  Fitur dalam Proses Development
                </span>
              </div>
              <p className="text-[11px] text-amber-800/80 mt-0.5">
                Fitur kustomisasi dan penerbitan Kartu Member Pass Digital sedang dalam tahap pengembangan sistem.
              </p>
            </div>
          </div>

          <div className="max-w-md mx-auto text-center space-y-1 mb-2 opacity-80">
            <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-full">
              SEASON {seasonYear} IDENTITAS PRESTASI
            </span>
            <h3 className="text-base sm:text-lg font-black text-slate-900">
              Kartu Anggota Disiplin Digital
            </h3>
            <p className="text-xs text-slate-500">
              Bukti identitas pencapaian dan rekor performa Anda dalam sistem gamifikasi kinerja TAL.
            </p>
          </div>

          <TalGamificationPassCard
            userName={userName}
            userEmail={userEmail}
            seasonYear={seasonYear}
            highestTier={highestTier}
            earnedCount={earnedBadgesCount}
            currentStreak={currentStreak}
          />
        </div>
      )}

      {/* 3. TAB: REWARDS STORE (Image 2 Inspiration) */}
      {activeTab === 'rewards' && (
        <TalGamificationRewards userPoints={earnedBadgesCount * 250 + currentStreak * 25} />
      )}

      {/* 4. TAB: TROPHY ROOM (Hall of Fame) */}
      {activeTab === 'trophy_room' && (
        <div className="space-y-3">
          <div className="bg-gradient-to-r from-amber-500 to-amber-600 text-white p-4 rounded-2xl flex items-center justify-between shadow-md">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center text-yellow-200 shadow-inner">
                <Trophy size={22} />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-white">Hall of Fame & Trophy Room</h3>
                <p className="text-xs text-amber-100">Arsip permanen pencapaian lencana dari musim-musim sebelumnya.</p>
              </div>
            </div>
            <span className="text-xs font-bold bg-white/20 px-3 py-1 rounded-full border border-white/20 text-white">
              Permanen
            </span>
          </div>

          {trophies.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-slate-400">
              <Trophy size={36} className="mx-auto mb-2 text-slate-300" />
              <p className="text-sm font-bold text-slate-600">Belum ada arsip lencana di Trophy Room.</p>
              <p className="text-xs text-slate-400 mt-0.5">Lencana dari musim berjalan ({seasonYear}) akan diarsipkan saat pergantian musim tahunan.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {trophies.map(trophy => {
                const tierInfo = BADGE_TIERS[trophy.highestLevel] || BADGE_TIERS[1];
                const badgeTier = getTierForLevel(trophy.highestLevel);
                return (
                  <div 
                    key={trophy.id} 
                    onClick={() => {
                      setSelectedPopupBadge({
                        title: trophy.badgeTitle,
                        description: `Diraih pada musim kompetisi ${trophy.seasonYear}.`,
                        level: trophy.highestLevel,
                        tier: badgeTier,
                        scoreOrProgressText: `Level ${trophy.highestLevel} ${tierInfo.name} Achiever`,
                        isUnlocked: true,
                        isMastered: trophy.highestLevel >= 5
                      });
                    }}
                    className="bg-white rounded-2xl border border-amber-200/90 shadow-sm hover:shadow-md transition-all p-4 flex items-center gap-3.5 cursor-pointer group"
                  >
                    <div className="shrink-0 group-hover:scale-105 transition-transform">
                      <TalBadgeEmblem
                        tier={badgeTier}
                        variant="winged"
                        size="sm"
                        iconType="trophy"
                        showSparkles={true}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[9px] font-black text-amber-700 uppercase tracking-wide px-1.5 py-0.5 rounded-md bg-amber-50">
                          Season {trophy.seasonYear}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {new Date(trophy.achievedAt).toLocaleDateString('id-ID')}
                        </span>
                      </div>
                      <h4 className="text-xs sm:text-sm font-bold text-slate-900 truncate mt-1">
                        {trophy.badgeTitle}
                      </h4>
                      <p className="text-[11px] font-semibold text-amber-700 mt-0.5">
                        {tierInfo.emoji} Level {trophy.highestLevel} {tierInfo.name}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 5. TAB: BADGES CATALOG (Image 1 Badges Grid + Filtering) */}
      {activeTab === 'catalog' && (
        <div className="space-y-3.5">
          {/* Filter Bar & Search */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 bg-white p-2.5 sm:p-3 rounded-2xl border border-slate-200/90 shadow-sm">
            {/* Filter Pills */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setActiveFilter('all')}
                className={`px-3 py-1 rounded-xl transition-all cursor-pointer ${
                  activeFilter === 'all'
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                Semua ({badges.filter(b => b.status === 'active').length})
              </button>
              <button
                type="button"
                onClick={() => setActiveFilter('in_progress')}
                className={`px-3 py-1 rounded-xl transition-all cursor-pointer ${
                  activeFilter === 'in_progress'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                Sedang Berjalan
              </button>
              <button
                type="button"
                onClick={() => setActiveFilter('achieved')}
                className={`px-3 py-1 rounded-xl transition-all cursor-pointer ${
                  activeFilter === 'achieved'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                Telah Diraih
              </button>
              <button
                type="button"
                onClick={() => setActiveFilter('mastered')}
                className={`px-3 py-1 rounded-xl transition-all cursor-pointer ${
                  activeFilter === 'mastered'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                👑 Mastered
              </button>
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-56">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Cari lencana kinerja..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 focus:bg-white"
              />
            </div>
          </div>

          {/* Badges Grid (Adopting 3D Stylized Badges from Image 1) */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {filteredBadges.length === 0 ? (
              <div className="col-span-full bg-white rounded-2xl border border-slate-200 p-10 text-center text-slate-400">
                <Award size={36} className="mx-auto mb-2 text-slate-300" />
                <p className="text-xs font-semibold text-slate-600">Tidak ada lencana yang sesuai dengan filter.</p>
              </div>
            ) : (
              filteredBadges.map(badge => {
                const maxLvl = badge.max_level || 5;
                const activeLevels = badge.levels.filter(l => l.level <= maxLvl).sort((a, b) => a.level - b.level);
                const prog: UserBadgeProgress = progressMap[badge.id] || {
                  userEmail: userEmail || '',
                  badgeId: badge.id,
                  seasonYear: seasonYear,
                  currentValue: 0,
                  currentLevel: 0,
                  isMastered: false,
                  nextTarget: activeLevels[0]?.target || 10,
                  progressPercent: 0,
                  remainingToNext: activeLevels[0]?.target || 10,
                  lastUpdated: ''
                };

                const currentTier = getTierForLevel(prog.currentLevel);
                const nextTier = prog.currentLevel < maxLvl ? BADGE_TIERS[(prog.currentLevel + 1) as BadgeLevel] : null;

                const theme = getBadgeCardTheme(badge.id, badge.category);

                // Pick icon type for 3D emblem
                const emblemIconType = theme.defaultIcon || (
                  badge.icon === 'crown' ? 'crown'
                    : badge.icon === 'trophy' ? 'trophy'
                    : badge.icon === 'sparkles' || badge.icon === 'target' ? 'diamond'
                    : badge.icon === 'shield' ? 'shield'
                    : 'star'
                );

                return (
                  <div 
                    key={badge.id}
                    className={`rounded-3xl border p-4 sm:p-5 flex flex-col justify-between transition-all duration-300 shadow-xs hover:shadow-lg hover:-translate-y-1 relative overflow-hidden ${theme.cardBg} ${theme.borderColor} ${theme.hoverBorder} ${theme.shadowColor}`}
                  >
                    {/* Ambient corner glow */}
                    <div className={`absolute -right-6 -top-6 w-32 h-32 rounded-full ${theme.glowColor} blur-2xl pointer-events-none`} />

                    <div>
                      {/* Header with Category Tag, Tier Tag & 3D Emblem */}
                      <div className="flex items-start justify-between gap-3 mb-3 relative z-10">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center flex-wrap gap-1.5 mb-1.5">
                            <span className={`text-[9px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full ${theme.tagBg} ${theme.tagText} ${theme.tagBorder} border shadow-sm`}>
                              {badge.category}
                            </span>
                            {prog.isMastered ? (
                              <span className="text-[9px] font-black px-2.5 py-0.5 rounded-full bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white shadow-sm">
                                👑 Diamond Master
                              </span>
                            ) : prog.currentLevel === 4 ? (
                              <span className="text-[9px] font-black px-2.5 py-0.5 rounded-full bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-sm">
                                💎 Platinum Tier
                              </span>
                            ) : prog.currentLevel === 3 ? (
                              <span className="text-[9px] font-black px-2.5 py-0.5 rounded-full bg-gradient-to-r from-amber-500 to-yellow-600 text-white shadow-sm">
                                🥇 Gold Tier
                              </span>
                            ) : prog.currentLevel === 2 ? (
                              <span className="text-[9px] font-black px-2.5 py-0.5 rounded-full bg-gradient-to-r from-slate-600 to-slate-800 text-white shadow-sm">
                                🥈 Silver Tier
                              </span>
                            ) : prog.currentLevel === 1 ? (
                              <span className="text-[9px] font-black px-2.5 py-0.5 rounded-full bg-gradient-to-r from-amber-600 to-orange-600 text-white shadow-sm">
                                🥉 Bronze Tier
                              </span>
                            ) : (
                              <span className="text-[9px] font-bold px-2.5 py-0.5 rounded-full bg-white/80 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border border-black/5 dark:border-white/10 shadow-sm">
                                🎯 Menuju Lvl 1
                              </span>
                            )}
                          </div>

                          <h4 
                            onClick={() => handleOpenBadgePopup(badge, prog)}
                            className="text-sm sm:text-base font-black text-slate-900 dark:text-white tracking-tight leading-snug cursor-pointer hover:underline transition-colors line-clamp-1"
                            title={badge.title}
                          >
                            {badge.title}
                          </h4>
                          <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-snug line-clamp-2 mt-1">
                            {badge.description}
                          </p>
                        </div>

                        {/* 3D Stylized Badge Emblem in Luminous Halo (Inspired by uploaded kit) */}
                        <div 
                          onClick={() => handleOpenBadgePopup(badge, prog)}
                          className="cursor-pointer transition-all duration-300 hover:scale-105 shrink-0 relative group"
                          title="Klik untuk melihat detail & animasi lencana"
                        >
                          <div className={`absolute -inset-1.5 rounded-2xl ${theme.glowColor} blur-md opacity-75 group-hover:opacity-100 transition-opacity`} />
                          <div className={`relative w-14 h-16 rounded-2xl ${theme.haloBg} backdrop-blur-sm border border-white dark:border-slate-700/80 shadow-xs flex items-center justify-center p-1`}>
                            <TalBadgeEmblem
                              tier={prog.currentLevel > 0 ? currentTier : 'bronze'}
                              variant="shield"
                              size="sm"
                              iconType={emblemIconType}
                              showSparkles={true}
                              isMastered={prog.isMastered}
                              className={prog.currentLevel === 0 ? 'opacity-85' : ''}
                            />
                            {prog.currentLevel === 0 && (
                              <span className="absolute -bottom-1 -right-1 bg-slate-900/85 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full border border-white/80 shadow-xs flex items-center gap-0.5">
                                <Lock size={8} /> L1
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* 5-Level Milestone Sequence in Glassy Strip (L1 - L5) */}
                      <div className="flex items-center gap-1.5 my-3 bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm p-1.5 rounded-2xl border border-white/90 dark:border-slate-700/70 shadow-sm">
                        {activeLevels.map(lvl => {
                          const tier = BADGE_TIERS[lvl.level];
                          const isReached = prog.currentLevel >= lvl.level;
                          const lvlTier = getTierForLevel(lvl.level);

                          return (
                            <button
                              key={lvl.level}
                              type="button"
                              onClick={() => handleOpenBadgePopup(badge, prog, lvl.level)}
                              className={`flex-1 py-1 px-0.5 rounded-xl text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                                isReached
                                  ? 'bg-white dark:bg-slate-700 shadow-xs border border-white dark:border-slate-600 ring-1 ring-black/5 dark:ring-white/5 hover:scale-105'
                                  : 'opacity-55 hover:opacity-95 hover:scale-105'
                              }`}
                              title={`Level ${lvl.level} (${tier.name}): ${lvl.target} ${badge.metricUnit}`}
                            >
                              <TalBadgeEmblem
                                tier={lvlTier}
                                variant="shield"
                                size="xs"
                                iconType={lvl.level === 5 ? 'crown' : 'star'}
                                showSparkles={false}
                              />
                              <span className={`text-[8px] font-black ${isReached ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>
                                L{lvl.level}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Progress Bar & Status Text (Matching Reference Cards) */}
                    <div className="pt-2 relative z-10">
                      <div className="flex items-baseline justify-between text-[11px] mb-1.5">
                        <span className="font-bold text-slate-700 dark:text-slate-300 truncate">
                          {prog.isMastered ? (
                            <span className="font-extrabold text-purple-700 dark:text-purple-300">👑 Master Tuntas!</span>
                          ) : nextTier ? (
                            <span>Target: <strong className="text-slate-900 dark:text-white">Lvl {prog.currentLevel + 1} ({nextTier.name})</strong></span>
                          ) : (
                            <span>Target Selesai</span>
                          )}
                        </span>

                        <span className="font-black text-slate-900 dark:text-white text-xs shrink-0 ml-1">
                          {prog.currentValue} <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">/ {prog.nextTarget} {badge.metricUnit}</span>
                        </span>
                      </div>

                      {/* Smooth Rounded Vibrant Progress Track */}
                      <div className="w-full h-3.5 bg-black/10 dark:bg-white/10 rounded-full p-0.5 relative overflow-hidden shadow-inner">
                        <div 
                          className={`h-full rounded-full transition-all duration-500 shadow-xs flex items-center justify-end pr-1.5 ${theme.barGradient}`}
                          style={{ width: `${Math.min(100, Math.max(prog.progressPercent > 0 ? 8 : 0, prog.progressPercent))}%` }}
                        >
                          {prog.progressPercent >= 22 && (
                            <span className="text-[8px] font-black text-white drop-shadow-xs">
                              {prog.progressPercent}%
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Footer Row with Percentage Pill & Button */}
                      <div className="mt-2.5 pt-2 border-t border-black/5 dark:border-white/10 flex items-center justify-between text-[11px]">
                        <span className="font-bold text-slate-600 dark:text-slate-300">
                          {prog.progressPercent < 22 && (
                            <span className="font-black text-slate-900 dark:text-white mr-1.5 bg-white/70 dark:bg-slate-800/80 px-1.5 py-0.5 rounded-md border border-black/5 dark:border-white/10 shadow-sm">
                              {prog.progressPercent}%
                            </span>
                          )}
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                            {prog.remainingToNext > 0 ? `(sisa ${prog.remainingToNext} lagi)` : 'Target Tercapai!'}
                          </span>
                        </span>

                        <button
                          type="button"
                          onClick={() => handleOpenBadgePopup(badge, prog)}
                          className={`px-3 py-1 rounded-full ${theme.buttonBg} ${theme.buttonBorder} border font-black text-[10px] shadow-sm hover:shadow-xs transition-all flex items-center gap-1 cursor-pointer hover:scale-105 active:scale-95`}
                        >
                          <span>Detail</span>
                          <ChevronRight size={11} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* POPUP CELEBRATION / DETAIL MODAL (Image 3 Inspiration) */}
      <TalGamificationPopupModal
        isOpen={!!selectedPopupBadge}
        onClose={() => setSelectedPopupBadge(null)}
        badge={selectedPopupBadge}
      />
    </div>
  );
};
