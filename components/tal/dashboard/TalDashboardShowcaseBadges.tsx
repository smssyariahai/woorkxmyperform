// components/tal/dashboard/TalDashboardShowcaseBadges.tsx — widget
// "Lencana & Prestasi Musim <tahun>": lencana yang sudah diraih + lencana
// terdekat berikutnya + popup detail.
// Porting src/components/tal/dashboard/TalDashboardShowcaseBadges.tsx
// (backup MyPerform). Adaptasi WOORK:
// - Link react-router-dom -> next/link.
// - DEFAULT_TAL_BADGES (talGamificationService backup) TIDAK diimpor dari
//   lib/tal/gamification.ts (modul server-only, memakai Prisma): definisi
//   badge diterima lewat prop `badges` (TalBadgeDto[] dari
//   GET /api/tal/badges?year=, di-fetch halaman hub). Bila sebuah badgeId
//   tidak ada di katalog, dipakai definisi darurat dari id-nya.
// - Tipe UserGamificationSummary/UserBadgeProgressDto/BadgeTier diimpor
//   sebagai tipe saja (import type — terhapus saat compile, aman).
// - TalBadgeEmblem + TalGamificationPopupModal dipakai dari
//   components/tal/gamification/* (sudah di-port Wave 4).
'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Trophy, Sparkles } from 'lucide-react';
import type {
  BadgeTier,
  TalBadgeDto,
  UserBadgeProgressDto,
  UserGamificationSummary,
} from '@/lib/tal/gamification';
import { TalBadgeEmblem } from '../gamification/TalBadgeEmblem';
import { TalGamificationPopupModal, type PopupBadgeData } from '../gamification/TalGamificationPopupModal';

interface TalDashboardShowcaseBadgesProps {
  summary: UserGamificationSummary | null;
  seasonYear: number;
  /** Katalog badge (GET /api/tal/badges?year=). Bila kosong, judul/deskripsi diambil dari badgeId. */
  badges?: TalBadgeDto[];
}

export const TalDashboardShowcaseBadges: React.FC<TalDashboardShowcaseBadgesProps> = ({
  summary,
  seasonYear,
  badges = []
}) => {
  const [selectedBadge, setSelectedBadge] = useState<PopupBadgeData | null>(null);

  if (!summary) return null;

  const badgesMap = new Map(badges.map(b => [b.id, b]));

  const badgeDefOf = (badgeId: string): Pick<TalBadgeDto, 'title' | 'category' | 'description' | 'metricUnit'> =>
    badgesMap.get(badgeId) ?? {
      title: badgeId,
      category: 'disiplin',
      description: 'Lencana disiplin performa TAL.',
      metricUnit: 'Target',
    };

  // Convert badgesProgress record to array
  const allProgressList: UserBadgeProgressDto[] = Object.values(summary.badgesProgress || {});

  // Filter badges that have achieved at least Level 1
  const earnedBadges = allProgressList.filter(b => b.currentLevel > 0);

  // Find badge closest to next target
  const inProgressBadges = allProgressList.filter(b => !b.isMastered && b.progressPercent < 100);

  const closestBadge: UserBadgeProgressDto | undefined = [...inProgressBadges].sort((a, b) => {
    return b.progressPercent - a.progressPercent;
  })[0];

  const closestBadgeDef = closestBadge ? badgeDefOf(closestBadge.badgeId) : undefined;
  const closestBadgeTitle = closestBadgeDef?.title || closestBadge?.badgeId || 'Lencana';
  const closestBadgeUnit = closestBadgeDef?.metricUnit || 'Target';

  const getTierForLevel = (lvl: number): BadgeTier | 'locked' => {
    if (lvl <= 0) return 'locked';
    if (lvl === 1) return 'bronze';
    if (lvl === 2) return 'silver';
    if (lvl === 3) return 'gold';
    if (lvl === 4) return 'platinum';
    return 'diamond';
  };

  const handleOpenPopup = (b: UserBadgeProgressDto) => {
    const def = badgeDefOf(b.badgeId);
    const tier = getTierForLevel(b.currentLevel);
    setSelectedBadge({
      title: def?.title || b.badgeId,
      category: def?.category || 'kinerja',
      description: def?.description || 'Lencana disiplin performa TAL.',
      level: b.currentLevel,
      tier,
      scoreOrProgressText: `Capaian: ${b.currentValue} / ${b.nextTarget} ${def?.metricUnit || ''}`,
      targetText: def?.metricUnit,
      isUnlocked: b.currentLevel > 0,
      isMastered: b.isMastered
    });
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-sm space-y-3.5">
      {/* Header with link to Trophy Room */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
            <Trophy size={15} />
          </div>
          <div>
            <span className="text-xs font-extrabold text-slate-900 block truncate">
              Lencana & Prestasi Musim {seasonYear}
            </span>
            <span className="text-[10px] text-slate-500">
              {earnedBadges.length} lencana telah aktif diraih
            </span>
          </div>
        </div>

        <Link
          href="/tal/badges"
          className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5 shrink-0 px-2 py-1 rounded-lg hover:bg-indigo-50 transition-colors"
        >
          <span>Trophy Room</span>
          <ChevronRight size={13} />
        </Link>
      </div>

      {/* Earned Badges Row with 3D Emblems (Image 1 Style) */}
      {earnedBadges.length > 0 ? (
        <div className="flex items-center gap-2 overflow-x-auto pb-1.5 scrollbar-thin scrollbar-thumb-slate-200">
          {earnedBadges.map(b => {
            const def = badgeDefOf(b.badgeId);
            const title = def?.title || b.badgeId;
            const tier = getTierForLevel(b.currentLevel);

            return (
              <button
                key={b.badgeId}
                type="button"
                onClick={() => handleOpenPopup(b)}
                className="flex items-center gap-2 bg-gradient-to-r from-amber-50/70 to-orange-50/70 border border-amber-200/80 px-2.5 py-1.5 rounded-xl text-left shrink-0 hover:shadow-sm hover:border-amber-300 transition-all cursor-pointer group"
                title={`Klik untuk detail: ${title} (Level ${b.currentLevel})`}
              >
                <div className="shrink-0 group-hover:scale-110 transition-transform">
                  <TalBadgeEmblem
                    tier={tier}
                    variant="shield"
                    size="xs"
                    iconType={b.isMastered ? 'crown' : b.currentLevel >= 4 ? 'diamond' : 'star'}
                    showSparkles={true}
                  />
                </div>
                <div className="min-w-0 pr-1">
                  <div className="flex items-center gap-1">
                    <span className="font-extrabold text-[11px] text-slate-900 truncate max-w-[120px]">
                      {title}
                    </span>
                    <span className="text-[9px] bg-amber-200 text-amber-900 px-1 py-0.5 rounded-md font-black">
                      L{b.currentLevel}
                    </span>
                  </div>
                  <span className="text-[9px] text-slate-500 capitalize block">
                    {tier} Achiever
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="text-[11px] text-slate-400 italic py-1.5 bg-slate-50 rounded-xl px-3 border border-slate-100 flex items-center gap-2">
          <Sparkles size={14} className="text-amber-400 shrink-0" />
          <span>Kunci rencana dan selesaikan tugas tepat waktu untuk membuka lencana 3D musim {seasonYear}!</span>
        </div>
      )}

      {/* Shortcut Card: Badge Selanjutnya yang Mendekati Target (Image 2 style) */}
      {closestBadge && (
        <div
          onClick={() => handleOpenPopup(closestBadge)}
          className="bg-gradient-to-r from-indigo-50/60 via-purple-50/40 to-amber-50/50 rounded-2xl border border-indigo-200/80 p-3 space-y-2 cursor-pointer hover:border-indigo-300 hover:shadow-sm transition-all"
        >
          <div className="flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-2 min-w-0">
              <div className="shrink-0">
                <TalBadgeEmblem
                  tier={getTierForLevel((closestBadge.currentLevel || 0) + 1)}
                  variant="shield"
                  size="xs"
                  showSparkles={false}
                />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] text-indigo-600 font-bold uppercase tracking-wider block">
                  🎯 Mendekati Target Lencana
                </span>
                <strong className="text-slate-900 font-extrabold truncate text-xs block">
                  {closestBadgeTitle} (Level {(closestBadge.currentLevel || 0) + 1})
                </strong>
              </div>
            </div>

            <div className="text-right shrink-0 ml-2">
              <span className="text-xs font-black text-indigo-700 block">
                {closestBadge.progressPercent}%
              </span>
              <span className="text-[10px] text-slate-400 font-medium">
                {closestBadge.currentValue}/{closestBadge.nextTarget} {closestBadgeUnit}
              </span>
            </div>
          </div>

          <div className="w-full bg-slate-200/70 h-2 rounded-full overflow-hidden">
            <div
              className="bg-gradient-to-r from-indigo-600 to-amber-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(5, closestBadge.progressPercent))}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[10px] text-slate-500">
            <span>
              Target: <strong className="text-slate-800">{closestBadge.nextTarget} {closestBadgeUnit}</strong>
            </span>
            <span className="text-indigo-600 font-bold">
              Kurang {Math.max(0, closestBadge.nextTarget - closestBadge.currentValue)} lagi untuk naik level »
            </span>
          </div>
        </div>
      )}

      {/* POPUP CELEBRATION / DETAIL MODAL */}
      <TalGamificationPopupModal
        isOpen={!!selectedBadge}
        onClose={() => setSelectedBadge(null)}
        badge={selectedBadge}
      />
    </div>
  );
};
