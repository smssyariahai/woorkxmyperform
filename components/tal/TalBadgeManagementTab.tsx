// components/tal/TalBadgeManagementTab.tsx — Kelola katalog badge TAL (admin).
// Porting src/components/tal/TalBadgeManagementTab.tsx (backup MyPerform).
// Adaptasi stack: talGamificationService (pgJson) -> API WOORK langsung
//   GET /api/tal/badges            -> katalog (semua status)
//   POST /api/tal/badges           -> buat / perbarui badge (upsert per kode)
//   PATCH /api/tal/badges/[id]     -> ubah status (active/inactive/archived)
// API sudah meng-gate tulis ke admin (isSuperAdmin / OWNER / ADMIN); prop
// canWrite hanya mengatur tampilnya kontrol tulis di UI.
// Perbedaan vs backup:
// - checkBadgeHasAchievements diimpor backup tapi tidak pernah dipanggil —
//   tidak di-port; proteksi hard-delete ada di server (DELETE 409 bila
//   badge sudah punya capaian). UI ini memang tidak menyediakan hapus,
//   hanya arsip (sesuai backup).
// - Form backup menyimpan metricType tapi tidak menyediakan UI mengubahnya
//   (selalu 'done_task_count'); di sini ditambah dropdown tipe metrik agar
//   badge baru benar-benar bisa mengukur metrik lain (API memvalidasinya
//   via parseBadgeInput).
// - Backup hanya console.warn saat gagal simpan; di sini ada banner error.
'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Award,
  Plus,
  Edit3,
  Archive,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Search,
  Zap,
  Target,
  Trophy,
  Crown,
  Shield,
  Sun,
  Users,
  Flame,
  Sparkles,
  X,
  Save,
  AlertTriangle,
  Wand2,
} from 'lucide-react';
import type {
  TalBadgeDto as TalBadge,
  BadgeLevel,
  BadgeMetricType,
  BadgeLevelConfig,
} from '@/lib/tal/gamification';
import { BADGE_TIERS } from '@/lib/tal/gamification';

interface TalBadgeManagementTabProps {
  canWrite: boolean;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg = typeof json.message === 'string' ? json.message : `Permintaan gagal (${res.status}).`;
    throw new Error(msg);
  }
  return (json.data ?? json) as T;
}

const METRIC_TYPES: { value: BadgeMetricType; label: string }[] = [
  { value: 'streak_days', label: 'Streak hari tepat waktu' },
  { value: 'done_task_count', label: 'Jumlah task selesai' },
  { value: 'monthly_ratio_percent', label: 'Rasio bulanan (%)' },
  { value: 'high_priority_streak', label: 'Streak prioritas tinggi' },
  { value: 'delegated_task_count', label: 'Task didelegasikan' },
  { value: 'flash_plan_weeks', label: 'Minggu flash plan' },
  { value: 'sniper_weeks', label: 'Minggu sniper' },
  { value: 'early_bird_streak', label: 'Streak early bird (lapor < 17:00 WIB)' },
  { value: 'perfectionist_months', label: 'Bulan perfectionist' },
];

const ICON_OPTIONS = [
  'Award',
  'Zap',
  'Target',
  'Trophy',
  'Crown',
  'Shield',
  'Sun',
  'Users',
  'Flame',
  'Sparkles',
] as const;

const DEFAULT_LEVEL_TARGETS: Record<BadgeLevel, { target: number; customLabel: string }> = {
  1: { target: 10, customLabel: '' },
  2: { target: 20, customLabel: '' },
  3: { target: 40, customLabel: '' },
  4: { target: 80, customLabel: '' },
  5: { target: 160, customLabel: '' },
};

const TIER_META: { level: BadgeLevel; emoji: string; name: string; rowClass: string; inputClass: string }[] = [
  { level: 1, emoji: '🥉', name: 'Bronze', rowClass: 'bg-amber-50/60 border-amber-200', inputClass: 'border-amber-300' },
  { level: 2, emoji: '🥈', name: 'Silver', rowClass: 'bg-slate-50 border-slate-200', inputClass: 'border-slate-300' },
  { level: 3, emoji: '🥇', name: 'Gold', rowClass: 'bg-yellow-50/60 border-yellow-200', inputClass: 'border-yellow-300' },
  { level: 4, emoji: '🧿', name: 'Platinum', rowClass: 'bg-cyan-50/60 border-cyan-200', inputClass: 'border-cyan-300' },
  { level: 5, emoji: '💎', name: 'Diamond', rowClass: 'bg-indigo-50/60 border-indigo-200', inputClass: 'border-indigo-300' },
];

export const TalBadgeManagementTab: React.FC<TalBadgeManagementTabProps> = ({ canWrite }) => {
  const [badges, setBadges] = useState<TalBadge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTabFilter, setActiveTabFilter] = useState<'all' | 'active' | 'inactive' | 'archived'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Drawer / Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [saving, setSaving] = useState(false);
  const [editingBadgeId, setEditingBadgeId] = useState<string | null>(null);

  // Form states
  const [formCode, setFormCode] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formCategory, setFormCategory] = useState<TalBadge['category']>('eksekusi');
  const [formIcon, setFormIcon] = useState('Award');
  const [formMetricType, setFormMetricType] = useState<BadgeMetricType>('done_task_count');
  const [formMetricUnit, setFormMetricUnit] = useState('tugas');
  const [formMaxLevel, setFormMaxLevel] = useState<BadgeLevel>(5);
  const [formIsGlow, setFormIsGlow] = useState(true);

  // Form targets for 5 levels
  const [levelTargets, setLevelTargets] = useState<Record<BadgeLevel, { target: number; customLabel: string }>>(
    { ...DEFAULT_LEVEL_TARGETS },
  );

  const loadBadges = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJson<{ badges: TalBadge[] }>('/api/tal/badges');
      setBadges(data.badges ?? []);
    } catch (e: any) {
      setError(e?.message ?? 'Gagal memuat katalog badge.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBadges();
  }, [loadBadges]);

  const getBadgeIcon = (iconName: string, className: string = 'w-4 h-4') => {
    switch (iconName?.toLowerCase()) {
      case 'zap': return <Zap className={className} />;
      case 'target': return <Target className={className} />;
      case 'trophy': return <Trophy className={className} />;
      case 'crown': return <Crown className={className} />;
      case 'shield': return <Shield className={className} />;
      case 'sun': return <Sun className={className} />;
      case 'users': return <Users className={className} />;
      case 'flame': return <Flame className={className} />;
      case 'sparkles': return <Sparkles className={className} />;
      default: return <Award className={className} />;
    }
  };

  const handleOpenCreate = () => {
    setModalMode('create');
    setEditingBadgeId(null);
    setFormCode(`BADGE_${Date.now().toString().slice(-4)}`);
    setFormTitle('');
    setFormDescription('');
    setFormCategory('eksekusi');
    setFormIcon('Award');
    setFormMetricType('done_task_count');
    setFormMetricUnit('tugas');
    setFormMaxLevel(5);
    setFormIsGlow(true);
    setLevelTargets({ ...DEFAULT_LEVEL_TARGETS });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (badge: TalBadge) => {
    setModalMode('edit');
    setEditingBadgeId(badge.id);
    setFormCode(badge.code);
    setFormTitle(badge.title);
    setFormDescription(badge.description);
    setFormCategory(badge.category);
    setFormIcon(badge.icon);
    setFormMetricType(badge.metricType);
    setFormMetricUnit(badge.metricUnit);
    setFormMaxLevel(badge.max_level || 5);
    setFormIsGlow(badge.isGlow ?? true);

    const initialTargets: Record<BadgeLevel, { target: number; customLabel: string }> = {
      ...DEFAULT_LEVEL_TARGETS,
    };
    badge.levels.forEach((lvl) => {
      initialTargets[lvl.level] = {
        target: lvl.target,
        customLabel: lvl.customLabel || '',
      };
    });
    setLevelTargets(initialTargets);
    setIsModalOpen(true);
  };

  // Preset Helper: Auto-fill 2x multiplier from Level 1
  const handleApply2xPreset = () => {
    const baseTarget = levelTargets[1]?.target || 10;
    setLevelTargets({
      1: { target: baseTarget, customLabel: levelTargets[1].customLabel },
      2: { target: baseTarget * 2, customLabel: levelTargets[2].customLabel },
      3: { target: baseTarget * 4, customLabel: levelTargets[3].customLabel },
      4: { target: baseTarget * 8, customLabel: levelTargets[4].customLabel },
      5: { target: baseTarget * 16, customLabel: levelTargets[5].customLabel },
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) return;

    setSaving(true);
    setError(null);
    try {
      const levels: BadgeLevelConfig[] = [];
      for (let i = 1; i <= formMaxLevel; i++) {
        const lvl = i as BadgeLevel;
        const tier = BADGE_TIERS[lvl].tier;
        levels.push({
          level: lvl,
          tier,
          target: levelTargets[lvl]?.target || i * 10,
          customLabel: levelTargets[lvl]?.customLabel || undefined,
        });
      }

      // POST /api/tal/badges = upsert per kode (buat maupun edit).
      await fetchJson('/api/tal/badges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: formCode.toUpperCase().replace(/\s+/g, '_'),
          title: formTitle.trim(),
          description: formDescription.trim(),
          category: formCategory,
          icon: formIcon,
          metricType: formMetricType,
          metricUnit: formMetricUnit.trim() || 'tugas',
          max_level: formMaxLevel,
          levels,
          status: 'active',
          isGlow: formIsGlow,
        }),
      });
      setIsModalOpen(false);
      await loadBadges();
    } catch (err: any) {
      setError(err?.message ?? 'Gagal menyimpan badge.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (badge: TalBadge) => {
    if (!canWrite) return;
    const newStatus = badge.status === 'active' ? 'inactive' : 'active';
    try {
      await fetchJson(`/api/tal/badges/${encodeURIComponent(badge.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      await loadBadges();
    } catch (err: any) {
      setError(err?.message ?? 'Gagal mengubah status badge.');
    }
  };

  const handleArchive = async (badge: TalBadge) => {
    if (!canWrite) return;
    if (!window.confirm(`Arsipkan lencana "${badge.title}"? Lencana akan ditarik dari musim berjalan namun pencapaian historis karyawan tetap utuh.`)) {
      return;
    }
    try {
      await fetchJson(`/api/tal/badges/${encodeURIComponent(badge.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'archived' }),
      });
      await loadBadges();
    } catch (err: any) {
      setError(err?.message ?? 'Gagal mengarsipkan badge.');
    }
  };

  const handleRestore = async (badge: TalBadge) => {
    if (!canWrite) return;
    try {
      await fetchJson(`/api/tal/badges/${encodeURIComponent(badge.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'active' }),
      });
      await loadBadges();
    } catch (err: any) {
      setError(err?.message ?? 'Gagal mengembalikan badge dari arsip.');
    }
  };

  const filteredBadges = badges.filter((badge) => {
    if (activeTabFilter === 'active' && badge.status !== 'active') return false;
    if (activeTabFilter === 'inactive' && badge.status !== 'inactive') return false;
    if (activeTabFilter === 'archived' && badge.status !== 'archived') return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        badge.title.toLowerCase().includes(q) ||
        badge.code.toLowerCase().includes(q) ||
        badge.category.toLowerCase().includes(q) ||
        badge.description.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs flex items-center gap-2">
          <AlertTriangle size={15} className="text-red-600 shrink-0" />
          <span className="font-semibold">{error}</span>
        </div>
      )}

      {/* Top Controls: Tabs & Create Button */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
          <button
            onClick={() => setActiveTabFilter('all')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              activeTabFilter === 'all'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Semua ({badges.length})
          </button>
          <button
            onClick={() => setActiveTabFilter('active')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              activeTabFilter === 'active'
                ? 'bg-emerald-600 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Aktif ({badges.filter((b) => b.status === 'active').length})
          </button>
          <button
            onClick={() => setActiveTabFilter('inactive')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              activeTabFilter === 'inactive'
                ? 'bg-amber-600 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Nonaktif ({badges.filter((b) => b.status === 'inactive').length})
          </button>
          <button
            onClick={() => setActiveTabFilter('archived')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              activeTabFilter === 'archived'
                ? 'bg-slate-600 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Diarsipkan ({badges.filter((b) => b.status === 'archived').length})
          </button>
        </div>

        {/* Search & Add button */}
        <div className="flex items-center gap-2">
          <div className="relative w-48 sm:w-56">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Cari lencana..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-7 pr-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 focus:bg-white"
            />
          </div>

          {canWrite && (
            <button
              onClick={handleOpenCreate}
              className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors shrink-0"
            >
              <Plus size={14} />
              <span>Buat Lencana</span>
            </button>
          )}
        </div>
      </div>

      {/* Badges Interactive Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-2.5 px-3">Lencana</th>
                <th className="py-2.5 px-3">Kategori &amp; Metrik</th>
                <th className="py-2.5 px-3">Batas Level</th>
                <th className="py-2.5 px-3">Tingkatan Level Aktif</th>
                <th className="py-2.5 px-3">Status</th>
                {canWrite && <th className="py-2.5 px-3 text-right">Aksi</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    Memuat katalog lencana...
                  </td>
                </tr>
              ) : filteredBadges.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    Tidak ada lencana ditemukan.
                  </td>
                </tr>
              ) : (
                filteredBadges.map((badge) => {
                  const maxLvl = badge.max_level || 5;
                  const activeLevels = badge.levels.filter((l) => l.level <= maxLvl).sort((a, b) => a.level - b.level);

                  return (
                    <tr key={badge.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Name & Icon */}
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-200">
                            {getBadgeIcon(badge.icon)}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 flex items-center gap-1.5">
                              <span>{badge.title}</span>
                              {badge.isGlow && (
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" title="Glowing Effect" />
                              )}
                            </div>
                            <span className="text-[10px] font-mono text-slate-400">{badge.code}</span>
                          </div>
                        </div>
                      </td>

                      {/* Category & Metric */}
                      <td className="py-2.5 px-3">
                        <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 uppercase tracking-wide mb-0.5">
                          {badge.category}
                        </span>
                        <div className="text-[11px] text-slate-500">
                          {badge.metricUnit}
                        </div>
                      </td>

                      {/* Max Level */}
                      <td className="py-2.5 px-3">
                        <span className="font-bold text-slate-800 text-xs">
                          Level {maxLvl}
                        </span>
                        <div className="text-[10px] text-slate-500">
                          {maxLvl === 1 ? 'Single-Tier (Bronze)' : `${BADGE_TIERS[maxLvl]?.name} ${BADGE_TIERS[maxLvl]?.emoji}`}
                        </div>
                      </td>

                      {/* Level Tiers */}
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1">
                          {activeLevels.map((lvl) => (
                            <span
                              key={lvl.level}
                              className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${BADGE_TIERS[lvl.level].badgeClass}`}
                              title={`${BADGE_TIERS[lvl.level].name}: target ${lvl.target} ${badge.metricUnit}`}
                            >
                              {BADGE_TIERS[lvl.level].emoji} {lvl.target}
                            </span>
                          ))}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-2.5 px-3">
                        {badge.status === 'active' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                            Aktif
                          </span>
                        ) : badge.status === 'inactive' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                            Nonaktif
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                            <Archive size={10} />
                            Diarsipkan
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      {canWrite && (
                        <td className="py-2.5 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleOpenEdit(badge)}
                              className="p-1 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                              title="Edit Lencana & Target Level"
                            >
                              <Edit3 size={14} />
                            </button>

                            {badge.status !== 'archived' ? (
                              <>
                                <button
                                  onClick={() => handleToggleStatus(badge)}
                                  className={`p-1 rounded transition-colors ${
                                    badge.status === 'active'
                                      ? 'text-amber-600 hover:bg-amber-50'
                                      : 'text-emerald-600 hover:bg-emerald-50'
                                  }`}
                                  title={badge.status === 'active' ? 'Matikan Sementara' : 'Aktifkan'}
                                >
                                  {badge.status === 'active' ? <XCircle size={14} /> : <CheckCircle2 size={14} />}
                                </button>

                                <button
                                  onClick={() => handleArchive(badge)}
                                  className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                  title="Arsipkan (Anti-Hard-Delete)"
                                >
                                  <Archive size={14} />
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => handleRestore(badge)}
                                className="p-1 text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                                title="Kembalikan dari Arsip"
                              >
                                <RotateCcw size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal / Drawer: Form Builder Konfigurasi Fleksibel */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-xl w-full border border-slate-200 shadow-xl overflow-hidden max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="px-4 py-3 bg-slate-50 text-slate-800 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Award size={18} className="text-amber-500" />
                <h3 className="text-sm font-bold text-slate-900">
                  {modalMode === 'create' ? 'Buat Lencana Baru' : 'Edit Lencana & Batas Level'}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Form Body */}
            <form onSubmit={handleSave} className="p-4 overflow-y-auto space-y-3.5 text-xs flex-1">
              {/* Field Identitas */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Kode Unik
                  </label>
                  <input
                    type="text"
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value.toUpperCase().replace(/\s+/g, '_'))}
                    required
                    disabled={modalMode === 'edit'}
                    placeholder="misal: SPEED_DEMON"
                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-mono bg-slate-50 focus:bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Judul Lencana
                  </label>
                  <input
                    type="text"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    required
                    placeholder="misal: Speed Demon Planner"
                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Deskripsi */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Deskripsi Motivasi
                </label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  rows={2}
                  placeholder="Jelaskan kriteria dan motivasi dari lencana ini..."
                  className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Kategori, Icon, Satuan Target */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Kategori
                  </label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value as TalBadge['category'])}
                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="perencanaan">Perencanaan</option>
                    <option value="eksekusi">Eksekusi</option>
                    <option value="disiplin">Disiplin</option>
                    <option value="kolaborasi">Kolaborasi</option>
                    <option value="kualitas">Kualitas</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Icon Visual
                  </label>
                  <select
                    value={formIcon}
                    onChange={(e) => setFormIcon(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:border-blue-500"
                  >
                    {ICON_OPTIONS.map((ic) => (
                      <option key={ic} value={ic}>{ic}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Satuan Target
                  </label>
                  <input
                    type="text"
                    value={formMetricUnit}
                    onChange={(e) => setFormMetricUnit(e.target.value)}
                    placeholder="misal: tugas, hari, pekan"
                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Tipe Metrik (tambahan WOORK: backup tidak menyediakan UI-nya) */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Tipe Metrik (yang dihitung sistem)
                </label>
                <select
                  value={formMetricType}
                  onChange={(e) => setFormMetricType(e.target.value as BadgeMetricType)}
                  className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:border-blue-500"
                >
                  {METRIC_TYPES.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-500 mt-1">
                  Menentukan angka apa yang dihitung evaluasi gamifikasi untuk lencana ini.
                </p>
              </div>

              {/* Penentuan Batas Level Maksimal (max_level: Level 1 s.d. Level 5) */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-800">
                      Batas Level Maksimal (max_level)
                    </label>
                    <p className="text-[10px] text-slate-500">
                      Tentukan tingkatan lencana ini ingin berjalan sampai level berapa.
                    </p>
                  </div>
                  <select
                    value={formMaxLevel}
                    onChange={(e) => setFormMaxLevel(parseInt(e.target.value, 10) as BadgeLevel)}
                    className="px-3 py-1.5 border border-slate-300 rounded-lg font-bold text-xs bg-white text-blue-700 focus:outline-none focus:border-blue-500 shadow-sm shrink-0"
                  >
                    <option value={1}>Level 1: Bronze 🥉 (Single-Tier)</option>
                    <option value={2}>Level 2: Bronze 🥉 → Silver 🥈</option>
                    <option value={3}>Level 3: Bronze 🥉 → Silver 🥈 → Gold 🥇</option>
                    <option value={4}>Level 4: Bronze 🥉 → ... → Platinum 🧿</option>
                    <option value={5}>Level 5: Bronze 🥉 → ... → Diamond 💎</option>
                  </select>
                </div>

                {/* Preset Helper Button */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-200/80">
                  <span className="text-[10px] text-slate-500">
                    Bebas mengisi angka manual, atau gunakan preset cepat:
                  </span>
                  <button
                    type="button"
                    onClick={handleApply2xPreset}
                    className="flex items-center gap-1 text-[11px] font-semibold text-blue-700 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded-md transition-colors"
                  >
                    <Wand2 size={12} />
                    <span>Isi Rekomendasi Kelipatan 2x</span>
                  </button>
                </div>
              </div>

              {/* Input Manual Target Per Tingkatan Level */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-800">
                  Target Per Tingkatan Level (Input Manual)
                </label>

                {TIER_META.filter((t) => t.level <= formMaxLevel).map((t) => (
                  <div key={t.level} className={`flex items-center gap-2 p-2 rounded-lg border ${t.rowClass}`}>
                    <div className="w-6 text-base text-center">{t.emoji}</div>
                    <div className="w-24 font-bold text-[11px] text-slate-700">Level {t.level} ({t.name})</div>
                    <div className="flex-1">
                      <input
                        type="number"
                        min={1}
                        value={levelTargets[t.level]?.target || ''}
                        onChange={(e) => setLevelTargets({
                          ...levelTargets,
                          [t.level]: { ...levelTargets[t.level], target: parseInt(e.target.value, 10) || 0 },
                        })}
                        placeholder="Target nominal"
                        required
                        className={`w-full px-2 py-1 border ${t.inputClass} rounded text-xs bg-white focus:outline-none`}
                      />
                    </div>
                    <div className="flex-1">
                      <input
                        type="text"
                        value={levelTargets[t.level]?.customLabel || ''}
                        onChange={(e) => setLevelTargets({
                          ...levelTargets,
                          [t.level]: { ...levelTargets[t.level], customLabel: e.target.value },
                        })}
                        placeholder="Label kustom (opsional)"
                        className="w-full px-2 py-1 border border-slate-200 rounded text-xs bg-white focus:outline-none"
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Efek glow */}
              <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formIsGlow}
                  onChange={(e) => setFormIsGlow(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                />
                Efek glow pada kartu lencana
              </label>

              {/* Modal Footer Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors disabled:opacity-50"
                >
                  <Save size={14} />
                  <span>{saving ? 'Menyimpan...' : 'Simpan Konfigurasi'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
