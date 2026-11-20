'use client';

import React, { useState } from 'react';
import { Wifi, Trophy, Flame } from 'lucide-react';
import { BadgeTier } from '@/lib/tal/gamification';
import { TalBadgeEmblem } from './TalBadgeEmblem';

interface TalGamificationPassCardProps {
  userName: string;
  userEmail: string;
  seasonYear: number;
  highestTier: BadgeTier;
  earnedCount: number;
  currentStreak: number;
  totalPoints?: number;
}

export const TalGamificationPassCard: React.FC<TalGamificationPassCardProps> = ({
  userName,
  userEmail,
  seasonYear,
  highestTier,
  earnedCount,
  currentStreak,
  totalPoints = 1250
}) => {
  const [theme, setTheme] = useState<'holographic_purple' | 'ice_blue' | 'sunset_gold' | 'obsidian'>('holographic_purple');

  const getThemeStyles = () => {
    switch (theme) {
      case 'ice_blue':
        return {
          bg: 'bg-gradient-to-tr from-sky-600 via-cyan-500 to-teal-400',
          accent: 'from-white/30 to-white/5',
          border: 'border-cyan-300/40',
          shadow: 'shadow-cyan-500/20'
        };
      case 'sunset_gold':
        return {
          bg: 'bg-gradient-to-tr from-amber-600 via-orange-500 to-rose-400',
          accent: 'from-white/30 to-white/5',
          border: 'border-amber-300/40',
          shadow: 'shadow-amber-500/20'
        };
      case 'obsidian':
        return {
          bg: 'bg-gradient-to-tr from-slate-950 via-slate-900 to-slate-800',
          accent: 'from-white/20 to-white/5',
          border: 'border-slate-700/60',
          shadow: 'shadow-slate-950/30'
        };
      case 'holographic_purple':
      default:
        return {
          bg: 'bg-gradient-to-tr from-violet-700 via-purple-600 to-pink-500',
          accent: 'from-white/30 to-white/5',
          border: 'border-purple-300/40',
          shadow: 'shadow-purple-500/25'
        };
    }
  };

  const currentTheme = getThemeStyles();
  const displayName = userName || userEmail.split('@')[0] || 'Ksatria TAL';

  return (
    <div className="space-y-2">
      {/* Digital Member Card (Image 2 Inspiration) */}
      <div 
        className={`relative w-full aspect-[1.58/1] max-w-sm mx-auto rounded-3xl p-5 sm:p-6 text-white overflow-hidden shadow-xl border ${currentTheme.border} ${currentTheme.bg} ${currentTheme.shadow} transition-all duration-300`}
      >
        {/* Holographic Waves & Accents (Image 2 style) */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -right-16 -top-16 w-56 h-56 rounded-full bg-white/10 blur-2xl" />
          <div className="absolute -left-12 -bottom-12 w-48 h-48 rounded-full bg-black/15 blur-2xl" />
          {/* Subtle curved wave pattern */}
          <svg className="absolute inset-0 w-full h-full opacity-20" viewBox="0 0 400 250" fill="none">
            <path d="M-20 180C100 120 200 240 420 140" stroke="white" strokeWidth="2" />
            <path d="M-20 120C120 60 220 180 420 80" stroke="white" strokeWidth="1.5" />
            <path d="M-20 60C140 0 240 120 420 20" stroke="white" strokeWidth="1" />
          </svg>
        </div>

        {/* Top Row: Chip & Contactless & Brand */}
        <div className="relative flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            {/* EMV Chip */}
            <div className="w-10 h-7 rounded-md bg-gradient-to-br from-amber-200 via-yellow-400 to-amber-500 p-0.5 shadow-inner border border-amber-300/60 flex flex-col justify-between">
              <div className="h-0.5 w-full bg-amber-700/30 rounded-sm" />
              <div className="h-0.5 w-full bg-amber-700/30 rounded-sm" />
              <div className="h-0.5 w-full bg-amber-700/30 rounded-sm" />
            </div>
            {/* Contactless Wave */}
            <Wifi size={18} className="rotate-90 text-white/80" />
          </div>

          <div className="text-right">
            <span className="text-[10px] uppercase tracking-widest font-black text-white/80 block">
              TAL PASS
            </span>
            <span className="text-[9px] font-bold bg-white/20 px-2 py-0.5 rounded-full border border-white/20">
              Season {seasonYear}
            </span>
          </div>
        </div>

        {/* Middle: Pass ID Number */}
        <div className="relative my-4 sm:my-5 z-10">
          <p className="text-xs sm:text-sm font-mono tracking-widest text-white/90 drop-shadow-sm">
            TAL • {seasonYear} • {earnedCount.toString().padStart(2, '0')}B • {currentStreak.toString().padStart(3, '0')}S
          </p>
        </div>

        {/* Bottom Row: User Name, Expiry & Tier Badge Emblem */}
        <div className="relative flex items-end justify-between z-10">
          <div className="min-w-0 pr-2">
            <span className="text-[9px] uppercase tracking-wider text-white/70 block">Discipline Achiever</span>
            <h4 className="text-sm sm:text-base font-extrabold tracking-tight truncate drop-shadow-xs capitalize">
              {displayName}
            </h4>
            <div className="flex items-center gap-2 mt-1 text-[10px] text-white/85">
              <span className="flex items-center gap-0.5">
                <Flame size={11} className="text-amber-300" />
                <strong>{currentStreak}</strong> Streak
              </span>
              <span>•</span>
              <span className="flex items-center gap-0.5">
                <Trophy size={11} className="text-yellow-200" />
                <strong>{earnedCount}</strong> Lencana
              </span>
            </div>
          </div>

          {/* Tier Emblem on Card */}
          <div className="shrink-0 drop-shadow-md">
            <TalBadgeEmblem
              tier={highestTier}
              variant="shield"
              size="sm"
              iconType={highestTier === 'diamond' ? 'diamond' : highestTier === 'gold' ? 'crown' : 'star'}
              showSparkles={true}
            />
          </div>
        </div>
      </div>

      {/* Theme Switcher Dots (Disabled / Coming Soon) */}
      <div className="flex items-center justify-center gap-2 pt-1 opacity-70">
        <span className="text-[10px] text-slate-400 font-medium">Tema Kartu:</span>
        <button
          type="button"
          disabled
          className="w-3.5 h-3.5 rounded-full bg-purple-600 ring-2 ring-purple-300 scale-105 cursor-not-allowed opacity-60"
          title="Amethyst Hologram (Coming Soon)"
        />
        <button
          type="button"
          disabled
          className="w-3.5 h-3.5 rounded-full bg-cyan-500 cursor-not-allowed opacity-40"
          title="Ice Platinum (Coming Soon)"
        />
        <button
          type="button"
          disabled
          className="w-3.5 h-3.5 rounded-full bg-amber-500 cursor-not-allowed opacity-40"
          title="Sunset Gold (Coming Soon)"
        />
        <button
          type="button"
          disabled
          className="w-3.5 h-3.5 rounded-full bg-slate-900 cursor-not-allowed opacity-40"
          title="Obsidian Stealth (Coming Soon)"
        />
        <span className="text-[9px] font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded ml-1">
          Kustomisasi Nonaktif
        </span>
      </div>
    </div>
  );
};
