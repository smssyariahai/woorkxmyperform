import React from 'react';
import { Trophy, Flame, ChevronRight } from 'lucide-react';
import { TalBadgeEmblem } from './TalBadgeEmblem';

interface TalGamificationHeroBannerProps {
  currentStreak: number;
  earnedBadgesCount: number;
  seasonYear: number;
  onExploreTrophyRoom: () => void;
  onOpenPassModal?: () => void;
}

export const TalGamificationHeroBanner: React.FC<TalGamificationHeroBannerProps> = ({
  currentStreak,
  earnedBadgesCount,
  seasonYear,
  onExploreTrophyRoom,
  onOpenPassModal
}) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 sm:gap-4">
      {/* 1. Main Gamification Hero Card (Image 2: Banner with 3D Trophy in glowing capsule) */}
      <div className="md:col-span-8 relative overflow-hidden rounded-3xl p-5 sm:p-7 text-white shadow-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-500 border border-indigo-400/30 flex flex-col justify-between">
        {/* Background Decorative Blobs */}
        <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full bg-white/10 blur-2xl pointer-events-none" />
        <div className="absolute -bottom-10 left-1/3 w-48 h-48 rounded-full bg-purple-900/30 blur-2xl pointer-events-none" />

        {/* Top Tag & Season */}
        <div className="relative z-10 flex items-center justify-between gap-2 mb-3">
          <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-white/20 backdrop-blur-md border border-white/25 text-white">
            SEASON {seasonYear} • GAMIFIKASI TAL
          </span>
          <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-rose-500 text-white shadow-sm animate-pulse">
            NEW
          </span>
        </div>

        {/* Content & Floating 3D Graphic */}
        <div className="relative z-10 flex items-center justify-between gap-4">
          <div className="max-w-sm space-y-2">
            <h2 className="text-lg sm:text-2xl font-black tracking-tight drop-shadow-sm leading-snug">
              Milestone Kinerja & Lencana Kehormatan
            </h2>
            <p className="text-xs sm:text-sm text-indigo-100 font-medium leading-relaxed">
              Tingkatkan konsistensi perencanaan dan pelaporan harian untuk membuka lencana bertingkat dari Bronze hingga Diamond!
            </p>

            {/* Quick Badges Counter Pill */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white/15 backdrop-blur-md text-xs font-bold border border-white/20">
                <Flame size={14} className="text-amber-300" />
                <span>{currentStreak} Hari Streak</span>
              </div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white/15 backdrop-blur-md text-xs font-bold border border-white/20">
                <Trophy size={14} className="text-yellow-300" />
                <span>{earnedBadgesCount} Lencana Diraih</span>
              </div>
            </div>
          </div>

          {/* 3D Floating Trophy in Frosted Glass Capsule (Image 2 Signature Element) */}
          <div className="hidden sm:flex flex-col items-center justify-center shrink-0">
            <div 
              className="w-24 h-28 rounded-2xl bg-white/15 backdrop-blur-xl border border-white/30 p-2 shadow-2xl flex items-center justify-center relative overflow-hidden"
              style={{
                boxShadow: 'inset 0 1px 1px 0 rgba(255, 255, 255, 0.4), 0 12px 24px -6px rgba(0, 0, 0, 0.2)'
              }}
            >
              <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent pointer-events-none" />
              <TalBadgeEmblem
                tier="diamond"
                variant="shield"
                size="md"
                iconType="crown"
                showSparkles={true}
                isMastered={true}
              />
            </div>
          </div>
        </div>

        {/* Action Button: Pill Button (Image 2 style) */}
        <div className="relative z-10 pt-4 flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={onExploreTrophyRoom}
            className="px-5 py-2.5 rounded-full bg-white text-indigo-700 hover:bg-indigo-50 font-bold text-xs shadow-md hover:shadow-lg transition-all duration-200 cursor-pointer flex items-center gap-2"
          >
            <span>Buka Trophy Room</span>
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* 2. Side Feature: Spotlight Winner on Fire (Image 2: 'THIS WEEKS WINNER IS ON FIRE') */}
      <div className="md:col-span-4 rounded-3xl p-5 text-white shadow-xl bg-gradient-to-br from-amber-500 via-orange-500 to-rose-600 border border-amber-300/30 flex flex-col justify-between relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 w-36 h-36 rounded-full bg-yellow-300/20 blur-xl pointer-events-none" />

        <div className="relative z-10 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-amber-100">
            <Flame size={15} className="text-yellow-200 animate-bounce" />
            <span>DISIPLIN TERBAIK</span>
          </div>
          <span className="text-[10px] font-bold bg-white/20 px-2 py-0.5 rounded-full border border-white/20">
            Pekan Ini
          </span>
        </div>

        <div className="relative z-10 my-3 text-center sm:text-left">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center text-xl shadow-inner shrink-0">
              🔥
            </div>
            <div className="min-w-0">
              <h4 className="text-sm font-black truncate text-white">
                Konsistensi Tanpa Celah
              </h4>
              <p className="text-xs text-amber-100 mt-0.5">
                Target 30 Hari Tanpa Terlambat Melapor
              </p>
            </div>
          </div>

          <div className="mt-4 bg-black/15 rounded-2xl p-2.5 border border-white/10">
            <div className="flex items-center justify-between text-[11px] font-bold mb-1">
              <span>Progres Rekor</span>
              <span>{Math.min(100, Math.round((currentStreak / 30) * 100))}%</span>
            </div>
            <div className="w-full h-2 bg-white/20 rounded-full overflow-hidden">
              <div 
                className="h-full bg-yellow-300 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(8, (currentStreak / 30) * 100))}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[10px] text-amber-100/90 mt-1.5">
              <span>{currentStreak} hari aktif</span>
              <span>Sisa {Math.max(0, 30 - currentStreak)} hari lagi</span>
            </div>
          </div>
        </div>

        <div className="relative z-10 pt-1">
          <p className="text-[11px] text-amber-100/90 italic text-center">
            "Disiplin adalah jembatan antara tujuan dan pencapaian."
          </p>
        </div>
      </div>
    </div>
  );
};
