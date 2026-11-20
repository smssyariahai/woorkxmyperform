import React from 'react';
import { BadgeTier } from '@/lib/tal/gamification';

export type EmblemVariant = 'shield' | 'winged' | 'coin' | 'stars';
export type EmblemSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

interface TalBadgeEmblemProps {
  tier: BadgeTier | 'locked';
  variant?: EmblemVariant;
  size?: EmblemSize;
  iconType?: 'crown' | 'diamond' | 'trophy' | 'ribbon' | 'star' | 'flame' | 'shield';
  showSparkles?: boolean;
  className?: string;
  isMastered?: boolean;
}

const SIZE_MAP: Record<EmblemSize, { width: number; height: number; scale: string }> = {
  xs: { width: 28, height: 32, scale: 'w-7 h-8' },
  sm: { width: 40, height: 44, scale: 'w-10 h-11' },
  md: { width: 56, height: 62, scale: 'w-14 h-16' },
  lg: { width: 80, height: 90, scale: 'w-20 h-24' },
  xl: { width: 120, height: 135, scale: 'w-28 h-32' }
};

export const TalBadgeEmblem: React.FC<TalBadgeEmblemProps> = ({
  tier,
  variant = 'shield',
  size = 'md',
  iconType = 'star',
  showSparkles = true,
  className = '',
  isMastered = false
}) => {
  const { width, height } = SIZE_MAP[size];

  // Colors & Gradients configuration based on the uploaded kit
  const getGradients = () => {
    switch (tier) {
      case 'diamond':
        return {
          id: 'diamond',
          bodyStart: '#9333ea', // vibrant purple
          bodyMid: '#c084fc',
          bodyEnd: '#7e22ce',
          borderLight: '#f3e8ff',
          borderDark: '#581c87',
          innerGlow: '#e9d5ff',
          starColor: '#ffffff',
          starGlow: '#fae8ff',
          ambientGlow: 'rgba(168, 85, 247, 0.4)',
          wingColor: '#a855f7'
        };
      case 'platinum':
        return {
          id: 'platinum',
          bodyStart: '#0284c7', // cool ice blue
          bodyMid: '#38bdf8',
          bodyEnd: '#0369a1',
          borderLight: '#e0f2fe',
          borderDark: '#075985',
          innerGlow: '#bae6fd',
          starColor: '#ffffff',
          starGlow: '#e0f2fe',
          ambientGlow: 'rgba(56, 189, 248, 0.4)',
          wingColor: '#0ea5e9'
        };
      case 'gold':
        return {
          id: 'gold',
          bodyStart: '#f59e0b', // radiant gold
          bodyMid: '#fde047',
          bodyEnd: '#d97706',
          borderLight: '#fef08a',
          borderDark: '#b45309',
          innerGlow: '#fef9c3',
          starColor: '#ffffff',
          starGlow: '#fef08a',
          ambientGlow: 'rgba(245, 158, 11, 0.4)',
          wingColor: '#f59e0b'
        };
      case 'silver':
        return {
          id: 'silver',
          bodyStart: '#64748b', // sleek silver
          bodyMid: '#cbd5e1',
          bodyEnd: '#475569',
          borderLight: '#f8fafc',
          borderDark: '#334155',
          innerGlow: '#f1f5f9',
          starColor: '#ffffff',
          starGlow: '#f8fafc',
          ambientGlow: 'rgba(148, 163, 184, 0.3)',
          wingColor: '#94a3b8'
        };
      case 'bronze':
        return {
          id: 'bronze',
          bodyStart: '#c2410c', // warm terracotta bronze
          bodyMid: '#fb923c',
          bodyEnd: '#9a3412',
          borderLight: '#ffedd5',
          borderDark: '#7c2d12',
          innerGlow: '#fed7aa',
          starColor: '#ffffff',
          starGlow: '#ffedd5',
          ambientGlow: 'rgba(234, 88, 12, 0.35)',
          wingColor: '#ea580c'
        };
      case 'locked':
      default:
        return {
          id: 'locked',
          bodyStart: '#94a3b8',
          bodyMid: '#cbd5e1',
          bodyEnd: '#64748b',
          borderLight: '#f1f5f9',
          borderDark: '#475569',
          innerGlow: '#e2e8f0',
          starColor: '#64748b',
          starGlow: 'transparent',
          ambientGlow: 'transparent',
          wingColor: '#cbd5e1'
        };
    }
  };

  const g = getGradients();
  const gradId = `badge-grad-${g.id}-${size}-${variant}`;

  // Center Emblem Graphic based on iconType
  const renderEmblemIcon = () => {
    if (tier === 'locked') {
      return (
        <path
          d="M44 48V42C44 38.6863 46.6863 36 50 36C53.3137 36 56 38.6863 56 42V48M41 48H59C60.1046 48 61 48.8954 61 50V60C61 61.1046 60.1046 62 59 62H41C39.8954 62 39 61.1046 39 60V50C39 48.8954 39.8954 48 41 48Z"
          fill="none"
          stroke="#64748b"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
    }

    if (iconType === 'crown') {
      return (
        <g transform="translate(32, 33) scale(0.72)">
          <path
            d="M5 38L9 15L20 28L31 10L42 28L53 15L57 38H5Z"
            fill="url(#icon-emboss)"
            filter="url(#subtle-shadow)"
          />
          <path
            d="M5 38L9 15L20 28L31 10L42 28L53 15L57 38H5Z"
            fill="#ffffff"
            opacity="0.95"
          />
          <circle cx="9" cy="14" r="2.5" fill="#ffffff" />
          <circle cx="31" cy="9" r="3" fill="#ffffff" />
          <circle cx="53" cy="14" r="2.5" fill="#ffffff" />
          <rect x="7" y="38" width="48" height="4" rx="2" fill="#ffffff" opacity="0.9" />
        </g>
      );
    }

    if (iconType === 'trophy') {
      return (
        <g transform="translate(33, 31) scale(0.7)">
          <path
            d="M14 8H36V22C36 28.0751 31.0751 33 25 33C18.9249 33 14 28.0751 14 22V8Z"
            fill="#ffffff"
            opacity="0.95"
          />
          <path
            d="M14 12H7C5.89543 12 5 12.8954 5 14V17C5 21.4183 8.58172 25 13 25H14"
            fill="none"
            stroke="#ffffff"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            d="M36 12H43C44.1046 12 45 12.8954 45 14V17C45 21.4183 41.4183 25 37 25H36"
            fill="none"
            stroke="#ffffff"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path d="M25 33V40M17 40H33" stroke="#ffffff" strokeWidth="3.5" strokeLinecap="round" />
          <path d="M25 14L26.5 18H31L27.5 20.5L29 24.5L25 22L21 24.5L22.5 20.5L19 18H23.5L25 14Z" fill={g.bodyStart} />
        </g>
      );
    }

    if (iconType === 'diamond') {
      return (
        <g transform="translate(32, 32) scale(0.72)">
          <polygon points="25,5 45,18 25,45 5,18" fill="#ffffff" opacity="0.95" />
          <polyline points="5,18 25,23 45,18" fill="none" stroke={g.bodyStart} strokeWidth="2" opacity="0.5" />
          <line x1="25" y1="5" x2="25" y2="45" stroke={g.bodyStart} strokeWidth="2" opacity="0.5" />
        </g>
      );
    }

    if (iconType === 'ribbon') {
      return (
        <g transform="translate(33, 31) scale(0.7)">
          <circle cx="25" cy="20" r="14" fill="#ffffff" opacity="0.95" />
          <circle cx="25" cy="20" r="10" fill={g.bodyStart} opacity="0.25" />
          <path d="M19 32L15 46L24 41L26 46L29 32" fill="#ffffff" opacity="0.9" />
          <circle cx="25" cy="20" r="5" fill="#ffffff" />
        </g>
      );
    }

    // Default: 3D Beveled Star (as prominently featured in the UI kit image)
    return (
      <g transform="translate(25, 25) scale(0.5)">
        <polygon
          points="50,5 64,36 98,39 72,63 80,97 50,79 20,97 28,63 2,39 36,36"
          fill="#ffffff"
          filter="url(#subtle-shadow)"
        />
        {/* Bevel facets */}
        <polygon points="50,5 50,50 64,36" fill="#ffffff" opacity="0.9" />
        <polygon points="98,39 50,50 72,63" fill="#ffffff" opacity="0.75" />
        <polygon points="80,97 50,50 50,79" fill="#ffffff" opacity="0.6" />
        <polygon points="20,97 50,50 28,63" fill="#ffffff" opacity="0.85" />
        <polygon points="2,39 50,50 36,36" fill="#ffffff" opacity="0.7" />
      </g>
    );
  };

  return (
    <div className={`relative inline-flex items-center justify-center shrink-0 ${className}`}>
      <svg
        width={width}
        height={height}
        viewBox="0 0 100 110"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="overflow-visible select-none drop-shadow-sm transition-transform duration-300 hover:scale-105"
      >
        <defs>
          {/* Main Body Gradient */}
          <linearGradient id={`${gradId}-body`} x1="20" y1="5" x2="80" y2="95" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={g.bodyMid} />
            <stop offset="45%" stopColor={g.bodyStart} />
            <stop offset="100%" stopColor={g.bodyEnd} />
          </linearGradient>

          {/* Bevel Edge Gradient */}
          <linearGradient id={`${gradId}-bevel`} x1="10" y1="0" x2="90" y2="100" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={g.borderLight} stopOpacity="0.9" />
            <stop offset="50%" stopColor={g.bodyMid} stopOpacity="0.5" />
            <stop offset="100%" stopColor={g.borderDark} stopOpacity="0.9" />
          </linearGradient>

          {/* Inner Gloss Overlay */}
          <linearGradient id={`${gradId}-gloss`} x1="50" y1="8" x2="50" y2="55" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>

          {/* Wing Gradients */}
          <linearGradient id={`${gradId}-wing`} x1="0" y1="30" x2="100" y2="70" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={g.bodyMid} />
            <stop offset="100%" stopColor={g.bodyEnd} />
          </linearGradient>

          {/* Ambient Glow Filter */}
          <filter id={`${gradId}-glow`} x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor={g.ambientGlow} />
          </filter>

          <filter id="subtle-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="1.5" floodColor="rgba(0,0,0,0.25)" />
          </filter>
        </defs>

        {/* VARIANT A: WINGED MEDAL (From Image 1: Winged Crown / Diamond / Trophy / Ribbon) */}
        {variant === 'winged' && (
          <g filter={`url(#${gradId}-glow)`}>
            {/* Left Wing Feathers */}
            <path
              d="M30 45C22 36 12 36 2 40C0 46 4 54 12 55C18 56 24 53 28 50M26 53C20 54 10 56 6 62C8 67 15 68 20 66C24 64 26 60 28 56"
              fill={`url(#${gradId}-wing)`}
              stroke={g.borderLight}
              strokeWidth="1"
            />
            {/* Right Wing Feathers */}
            <path
              d="M70 45C78 36 88 36 98 40C100 46 96 54 88 55C82 56 76 53 72 50M74 53C80 54 90 56 94 62C92 67 85 68 80 66C76 64 74 60 72 56"
              fill={`url(#${gradId}-wing)`}
              stroke={g.borderLight}
              strokeWidth="1"
            />
            {/* Central Round Medallion */}
            <circle cx="50" cy="52" r="28" fill={g.borderDark} />
            <circle cx="50" cy="52" r="26" fill={`url(#${gradId}-body)`} stroke={g.borderLight} strokeWidth="1.5" />
            <circle cx="50" cy="52" r="20" fill={g.bodyEnd} opacity="0.3" />
            {renderEmblemIcon()}
          </g>
        )}

        {/* VARIANT B: EMBOSSED COIN */}
        {variant === 'coin' && (
          <g filter={`url(#${gradId}-glow)`}>
            <circle cx="50" cy="52" r="32" fill={g.borderDark} />
            <circle cx="50" cy="50" r="32" fill={`url(#${gradId}-body)`} stroke={g.borderLight} strokeWidth="2" />
            <circle cx="50" cy="50" r="25" fill="none" stroke={g.borderLight} strokeWidth="1.5" strokeDasharray="3 2" />
            {renderEmblemIcon()}
          </g>
        )}

        {/* VARIANT C: 3D STARS */}
        {variant === 'stars' && (
          <g filter={`url(#${gradId}-glow)`}>
            {/* Central Star with 2 flanking smaller stars */}
            <g transform="translate(10, 52) scale(0.35)">
              <polygon points="50,5 64,36 98,39 72,63 80,97 50,79 20,97 28,63 2,39 36,36" fill={`url(#${gradId}-body)`} stroke={g.borderLight} strokeWidth="3" />
            </g>
            <g transform="translate(68, 52) scale(0.35)">
              <polygon points="50,5 64,36 98,39 72,63 80,97 50,79 20,97 28,63 2,39 36,36" fill={`url(#${gradId}-body)`} stroke={g.borderLight} strokeWidth="3" />
            </g>
            <g transform="translate(25, 25) scale(0.5)">
              <polygon points="50,5 64,36 98,39 72,63 80,97 50,79 20,97 28,63 2,39 36,36" fill={`url(#${gradId}-body)`} stroke={g.borderLight} strokeWidth="3" />
              {renderEmblemIcon()}
            </g>
          </g>
        )}

        {/* VARIANT D: SIGNATURE 3D SHIELD (Default - EXACT match of Image 1 Hexagonal Star Shield) */}
        {variant === 'shield' && (
          <g filter={`url(#${gradId}-glow)`}>
            {/* Outer Bevel Frame (3D Depth) */}
            <path
              d="M50 4L88 22V62C88 80 50 102 50 102C50 102 12 80 12 62V22L50 4Z"
              fill={g.borderDark}
            />
            {/* Mid Bevel Gradient */}
            <path
              d="M50 6L86 23V61C86 78 50 99 50 99C50 99 14 78 14 61V23L50 6Z"
              fill={`url(#${gradId}-bevel)`}
            />
            {/* Inner Shield Body */}
            <path
              d="M50 10L82 25V59C82 74 50 94 50 94C50 94 18 74 18 59V25L50 10Z"
              fill={`url(#${gradId}-body)`}
            />
            {/* Gloss Highlight on top half */}
            <path
              d="M50 10L82 25V46C70 48 30 48 18 46V25L50 10Z"
              fill={`url(#${gradId}-gloss)`}
            />

            {/* Inner Border Ridge */}
            <path
              d="M50 14L78 27V57C78 70 50 88 50 88C50 88 22 70 22 57V27L50 14Z"
              fill="none"
              stroke="#ffffff"
              strokeWidth="0.75"
              strokeOpacity="0.45"
            />

            {/* Center Emblem */}
            {renderEmblemIcon()}

            {/* Corner Sparkles `++` (Exact signature detail from the UI Kit in Image 1!) */}
            {showSparkles && tier !== 'locked' && (
              <>
                {/* Top-Left Sparkle */}
                <g transform="translate(20, 20) scale(0.65)" opacity="0.85">
                  <path d="M4 0V8M0 4H8" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" />
                  <path d="M12 4V10M9 7H15" stroke="#ffffff" strokeWidth="1.2" strokeLinecap="round" />
                </g>
                {/* Bottom-Right Sparkle */}
                <g transform="translate(68, 68) scale(0.6)" opacity="0.85">
                  <path d="M4 0V8M0 4H8" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" />
                  <path d="M11 5V9M9 7H13" stroke="#ffffff" strokeWidth="1" strokeLinecap="round" />
                </g>
              </>
            )}

            {/* Mastered Crown Overlay on Top if mastered */}
            {isMastered && (
              <g transform="translate(37, -6) scale(0.55)">
                <path d="M5 25L10 10L18 18L26 5L34 18L42 10L47 25H5Z" fill="#facc15" stroke="#78350f" strokeWidth="1.5" />
                <circle cx="10" cy="9" r="2" fill="#ffffff" />
                <circle cx="26" cy="4" r="2.5" fill="#ffffff" />
                <circle cx="42" cy="9" r="2" fill="#ffffff" />
              </g>
            )}
          </g>
        )}
      </svg>
    </div>
  );
};
