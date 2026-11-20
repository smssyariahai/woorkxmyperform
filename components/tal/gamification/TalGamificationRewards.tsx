import React from 'react';
import { Gift, Sparkles, Award, Coffee, Zap, Shield, Clock } from 'lucide-react';

interface RewardItem {
  id: string;
  title: string;
  description: string;
  category: 'store' | 'privilege' | 'merchandise';
  pointsCost: number;
  iconType: 'coffee' | 'badge' | 'trophy' | 'privilege';
  gradient: string;
  badgeTag?: string;
}

const REWARDS_CATALOG: RewardItem[] = [
  {
    id: 'rew_1',
    title: 'Voucher Kopi Disiplin Tim',
    description: 'Voucher kopi apresiasi untuk karyawan dengan streak konsisten 14 hari.',
    category: 'store',
    pointsCost: 500,
    iconType: 'coffee',
    gradient: 'from-amber-500 to-rose-500',
    badgeTag: 'POPULER'
  },
  {
    id: 'rew_2',
    title: 'Pin Fisik Emas Ksatria Disiplin',
    description: 'Pin logam enamel eksklusif berukir logo TAL Season 2026.',
    category: 'merchandise',
    pointsCost: 1200,
    iconType: 'trophy',
    gradient: 'from-yellow-500 to-amber-600',
    badgeTag: 'LIMITED'
  },
  {
    id: 'rew_3',
    title: 'Sertifikat Performa Kehormatan',
    description: 'Sertifikat digital terotentikasi ditandatangani manajemen dan HR.',
    category: 'privilege',
    pointsCost: 800,
    iconType: 'badge',
    gradient: 'from-indigo-600 to-purple-600',
    badgeTag: 'RESMI'
  },
  {
    id: 'rew_4',
    title: 'Prioritas Penjadwalan Cuti / Libur',
    description: 'Hak prioritas konfirmasi izin cuti tahunan bagi peraih Gold Achiever.',
    category: 'privilege',
    pointsCost: 1500,
    iconType: 'privilege',
    gradient: 'from-emerald-500 to-teal-600',
    badgeTag: 'PRIVILEGE'
  }
];

interface TalGamificationRewardsProps {
  userPoints?: number;
}

export const TalGamificationRewards: React.FC<TalGamificationRewardsProps> = ({
  userPoints = 750
}) => {
  return (
    <div className="space-y-4">
      {/* Header Bar */}
      <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white p-4 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-md">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
            <Gift size={20} />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-bold text-white">Katalog Apresiasi & Rewards</h3>
            <p className="text-xs text-slate-300">Tukarkan poin disiplin kinerja dengan benefit nyata.</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/10 border border-white/20 text-white font-bold text-xs">
          <Sparkles size={14} className="text-yellow-300" />
          <span>Poin Kinerja Anda:</span>
          <strong className="text-yellow-300 font-extrabold">{userPoints} Poin</strong>
        </div>
      </div>

      {/* Coming Soon Notice Banner */}
      <div className="bg-amber-50/90 border border-amber-200/90 rounded-2xl p-3.5 sm:p-4 flex items-center gap-3 text-amber-900 shadow-sm">
        <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center shrink-0 text-amber-600 border border-amber-200/70">
          <Clock size={18} />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-amber-800 bg-amber-200/70 px-2 py-0.5 rounded-full">
              Coming Soon
            </span>
            <span className="text-xs sm:text-sm font-bold text-amber-950">
              Fitur dalam Proses Development
            </span>
          </div>
          <p className="text-[11px] sm:text-xs text-amber-800/80 mt-0.5">
            Katalog penukaran hadiah dan apresiasi poin kinerja sedang dalam tahap penyusunan kemitraan reward serta integrasi sistem HR. Semua tombol penukaran dinonaktifkan sementara.
          </p>
        </div>
      </div>

      {/* Rewards Grid (Disabled Buttons) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 opacity-90">
        {REWARDS_CATALOG.map(item => {
          return (
            <div
              key={item.id}
              className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-4 flex flex-col justify-between"
            >
              <div>
                {/* Top Row: Tag & Cost */}
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                    {item.badgeTag || item.category}
                  </span>
                  <div className="flex items-center gap-1 text-xs font-black text-indigo-600">
                    <Sparkles size={12} className="text-amber-500" />
                    <span>{item.pointsCost} Pts</span>
                  </div>
                </div>

                {/* Visual Icon Container with soft gradient */}
                <div className={`w-full h-24 rounded-xl bg-gradient-to-tr ${item.gradient} p-3 flex items-center justify-center text-white shadow-inner mb-3 relative overflow-hidden opacity-90`}>
                  {item.iconType === 'coffee' && <Coffee size={36} className="drop-shadow-md" />}
                  {item.iconType === 'trophy' && <Award size={36} className="drop-shadow-md" />}
                  {item.iconType === 'badge' && <Shield size={36} className="drop-shadow-md" />}
                  {item.iconType === 'privilege' && <Zap size={36} className="drop-shadow-md" />}
                </div>

                <h4 className="text-xs sm:text-sm font-bold text-slate-900 leading-snug mb-1">
                  {item.title}
                </h4>
                <p className="text-[11px] text-slate-500 leading-relaxed line-clamp-2">
                  {item.description}
                </p>
              </div>

              {/* Action Button (Disabled) */}
              <div className="pt-4">
                <button
                  type="button"
                  disabled={true}
                  className="w-full py-2 px-3 rounded-full text-xs font-bold transition-all bg-slate-100 text-slate-400 border border-slate-200/80 cursor-not-allowed flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <Clock size={12} className="text-slate-400" />
                  <span>Coming Soon (Disabled)</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
