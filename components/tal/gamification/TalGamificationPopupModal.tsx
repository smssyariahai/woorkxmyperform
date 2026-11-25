'use client';

import React, { useState } from 'react';
import { X, Share2, Check, Sparkles } from 'lucide-react';
import { TalBadgeEmblem } from './TalBadgeEmblem';
import { BadgeTier, BADGE_TIERS, BadgeLevel } from '@/lib/tal/gamification-shared';

export interface PopupBadgeData {
  title: string;
  category?: string;
  description: string;
  level: number;
  tier: BadgeTier | 'locked';
  scoreOrProgressText: string;
  targetText?: string;
  isUnlocked: boolean;
  isMastered?: boolean;
  pointsAwarded?: number;
  unlockedDate?: string;
}

interface TalGamificationPopupModalProps {
  isOpen: boolean;
  onClose: () => void;
  badge: PopupBadgeData | null;
  onClaim?: () => void;
}

export const TalGamificationPopupModal: React.FC<TalGamificationPopupModalProps> = ({
  isOpen,
  onClose,
  badge,
  onClaim
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen || !badge) return null;

  const tierInfo = badge.level > 0 ? BADGE_TIERS[badge.level as BadgeLevel] : null;

  const handleShare = () => {
    const shareText = `🏆 Pencapaian TAL: ${badge.title} (${badge.isUnlocked ? `Level ${badge.level} - ${tierInfo?.name || 'Tercapai'}` : 'Target Milestone'})! ${badge.scoreOrProgressText}. Raih disiplin kerja terbaik di TAL!`;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm duration-200">
      {/* Modal Container */}
      <div 
        className="relative w-full max-w-sm sm:max-w-md bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-100 flex flex-col items-center text-center overflow-hidden duration-200"
        style={{
          boxShadow: '0 20px 50px -10px rgba(99, 102, 241, 0.18), 0 10px 20px -5px rgba(0, 0, 0, 0.08)'
        }}
      >
        {/* Soft Ambient Background Glow based on tier */}
        <div 
          className="absolute -top-20 left-1/2 -translate-x-1/2 w-64 h-64 rounded-full blur-3xl pointer-events-none opacity-40"
          style={{
            background: badge.tier === 'diamond' 
              ? 'radial-gradient(circle, #c084fc, #9333ea)' 
              : badge.tier === 'platinum'
                ? 'radial-gradient(circle, #7dd3fc, #0284c7)'
                : badge.tier === 'gold'
                  ? 'radial-gradient(circle, #fde047, #f59e0b)'
                  : badge.tier === 'silver'
                    ? 'radial-gradient(circle, #cbd5e1, #64748b)'
                    : 'radial-gradient(circle, #fed7aa, #ea580c)'
          }}
        />

        {/* Close Button in Upper Right */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors cursor-pointer z-10"
          aria-label="Tutup"
        >
          <X size={16} />
        </button>

        {/* HERO 3D EMBLEM ILLUSTRATION (Image 3 Inspiration) */}
        <div className="relative mb-4 mt-2 flex items-center justify-center">
          {/* Subtle Halo Rings */}
          <div className="absolute w-32 h-32 rounded-full border-2 border-indigo-100/60 animate-pulse pointer-events-none" />
          <div className="absolute w-40 h-40 rounded-full border border-indigo-50/50 pointer-events-none" />
          
          <TalBadgeEmblem
            tier={badge.tier}
            variant="shield"
            size="xl"
            iconType={badge.isMastered ? 'crown' : badge.level >= 4 ? 'diamond' : badge.level >= 3 ? 'trophy' : 'star'}
            showSparkles={true}
            isMastered={badge.isMastered}
          />
        </div>

        {/* Score / Target Pill (From Image 3: 'Your Score: 1,200') */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-slate-50 border border-slate-200/80 text-slate-600 text-xs font-semibold mb-3 shadow-sm">
          <Sparkles size={13} className="text-amber-500" />
          <span>{badge.scoreOrProgressText}</span>
          {badge.targetText && (
            <span className="text-slate-400 font-normal">({badge.targetText})</span>
          )}
        </div>

        {/* Heading / Congratulations */}
        <h3 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight mb-1">
          {badge.isUnlocked ? 'Congratulations!' : 'Detail Lencana'}
        </h3>
        
        <h4 className="text-sm sm:text-base font-bold text-indigo-700 mb-2">
          {badge.title}
        </h4>

        {/* Subtitle / Description */}
        <p className="text-xs sm:text-sm text-slate-500 leading-relaxed max-w-xs mb-5">
          {badge.description}
        </p>

        {/* Milestone Detail Card */}
        <div className="w-full bg-slate-50/80 rounded-2xl p-3 border border-slate-200/60 mb-6 flex items-center justify-around text-xs">
          <div className="text-center">
            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Level</span>
            <strong className="text-slate-800 text-sm font-black">
              {badge.level > 0 ? `Lvl ${badge.level}` : 'Belum'}
            </strong>
          </div>
          <div className="h-7 w-px bg-slate-200" />
          <div className="text-center">
            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Tier</span>
            <strong className="text-slate-800 text-sm font-black capitalize">
              {badge.tier === 'locked' ? 'Terkunci' : badge.tier}
            </strong>
          </div>
          <div className="h-7 w-px bg-slate-200" />
          <div className="text-center">
            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Status</span>
            <strong className={`text-sm font-black ${badge.isUnlocked ? 'text-emerald-600' : 'text-amber-600'}`}>
              {badge.isMastered ? '👑 Master' : badge.isUnlocked ? 'Tercapai' : 'Dalam Proses'}
            </strong>
          </div>
        </div>

        {/* Primary Action Button: Pill Gradient (Image 3 Style) */}
        <button
          type="button"
          onClick={() => {
            if (onClaim) onClaim();
            onClose();
          }}
          className="w-full py-3 px-6 rounded-full font-bold text-sm text-white shadow-md hover:shadow-lg transition-all transform active:scale-95 cursor-pointer flex items-center justify-center gap-2 mb-3"
          style={{
            background: badge.tier === 'diamond'
              ? 'linear-gradient(135deg, #a855f7 0%, #7e22ce 100%)'
              : badge.tier === 'platinum'
                ? 'linear-gradient(135deg, #38bdf8 0%, #0284c7 100%)'
                : badge.tier === 'gold'
                  ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
                  : 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)'
          }}
        >
          <span>{badge.isUnlocked ? 'Koleksi Sekarang »' : 'Lanjutkan Target »'}</span>
        </button>

        {/* Secondary Action: Share Button (Image 3 Inspiration: `< share`) */}
        <button
          type="button"
          onClick={handleShare}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-indigo-600 transition-colors cursor-pointer py-1"
        >
          {copied ? (
            <>
              <Check size={13} className="text-emerald-600" />
              <span className="text-emerald-600 font-bold">Teks Pencapaian Disalin!</span>
            </>
          ) : (
            <>
              <Share2 size={13} />
              <span>Bagikan Pencapaian</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
