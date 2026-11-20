// Halaman /tal/badges — Galeri & Progres Lencana + Kelola Badge (admin).
// Porting src/pages/TalBadgesPage.tsx (backup MyPerform).
// Auth backup (useAuth) diganti session NextAuth + API route WOORK:
//   GET /api/tal/gamification?year=  -> ringkasan (streak, heatmap, progres, trofi)
//   GET /api/tal/badges?year=        -> katalog badge + progres tersimpan
//   GET /api/tal/team                -> canManage (admin TAL, pola kalender-kerja)
// Tidak ada impor firebase / react-router-dom / pgAuthClient.
// Tab "Kelola Badge" (admin saja) memakai TalBadgeManagementTab — porting
// tab manajemen dari KalenderKerja backup; user biasa read-only (galeri).
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Award, ChevronLeft, RefreshCw, Settings2, LayoutGrid } from 'lucide-react';
import { TalHeatmapStreak } from '@/components/tal/TalHeatmapStreak';
import { TalBadgeGallery } from '@/components/tal/TalBadgeGallery';
import { TalBadgeManagementTab } from '@/components/tal/TalBadgeManagementTab';
import { TalGamificationHeroBanner } from '@/components/tal/gamification/TalGamificationHeroBanner';
import type {
  TalBadgeDto,
  TrophyArchiveItemDto,
  UserGamificationSummary,
} from '@/lib/tal/gamification';

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg = typeof json.message === 'string' ? json.message : `Gagal memuat data (${res.status}).`;
    throw new Error(msg);
  }
  return (json.data ?? json) as T;
}

type GalleryView = 'gallery' | 'manage';

export default function TalBadgesPage() {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [view, setView] = useState<GalleryView>('gallery');

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [badges, setBadges] = useState<TalBadgeDto[]>([]);
  const [trophies, setTrophies] = useState<TrophyArchiveItemDto[]>([]);
  const [summary, setSummary] = useState<UserGamificationSummary | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const loadData = useCallback(
    async (isSilent = false) => {
      if (!isSilent) setLoading(true);
      else setRefreshing(true);
      setError(null);
      try {
        const [badgesRes, gamRes] = await Promise.all([
          fetchJson<{ badges: TalBadgeDto[] }>(`/api/tal/badges?year=${selectedYear}`),
          fetchJson<{ summary: UserGamificationSummary }>(`/api/tal/gamification?year=${selectedYear}`),
        ]);
        setBadges(badgesRes.badges ?? []);
        setSummary(gamRes.summary);
        setTrophies(gamRes.summary.trophies ?? []);
      } catch (err: any) {
        setError(err?.message ?? 'Gagal memuat data gamifikasi.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [selectedYear],
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Admin TAL (canManage) — pola yang sama dengan kalender-kerja.
  useEffect(() => {
    (async () => {
      try {
        const team = await fetchJson<{ canManage?: boolean }>('/api/tal/team');
        setIsAdmin(!!team?.canManage);
      } catch {
        setIsAdmin(false);
      }
    })();
  }, []);

  const earnedBadgesCount = summary
    ? Object.values(summary.badgesProgress ?? {}).filter((b) => b.currentLevel > 0).length
    : 0;
  const userName = summary?.userName || summary?.userEmail?.split('@')[0] || 'Ksatria TAL';
  const years = [currentYear - 1, currentYear, currentYear + 1];

  const switchToGallery = () => {
    setView('gallery');
    // Katalog bisa berubah dari tab Kelola — muat ulang diam-diam.
    void loadData(true);
  };

  return (
    <div className="w-full space-y-4 pb-20">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white rounded-xl px-4 py-3 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Link
            href="/tal"
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors shrink-0"
            title="Kembali ke TAL Main"
          >
            <ChevronLeft size={18} />
          </Link>
          <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-300 flex items-center justify-center border border-indigo-400/30 shrink-0">
            <Award size={18} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold tracking-tight text-white truncate">
                Galeri &amp; Progres Lencana
              </h1>
              <span className="text-[10px] font-bold bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 px-2 py-0.5 rounded-full">
                Musim {selectedYear}
              </span>
            </div>
            <p className="text-[11px] text-slate-300 truncate">
              Gamifikasi Kinerja: Milestone bertingkat, rekor disiplin, dan pengakuan performa.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {view === 'gallery' && (
            <>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="px-2 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-semibold border border-white/15 focus:outline-none [&>option]:text-slate-900"
                aria-label="Pilih musim"
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    Musim {y}
                  </option>
                ))}
              </select>
              <button
                onClick={() => loadData(true)}
                disabled={refreshing}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-semibold transition-colors border border-white/15"
              >
                <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
                <span className="hidden sm:inline">Refresh Data</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Saklar tampilan: Galeri (semua user) / Kelola Badge (admin) */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={switchToGallery}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors ${
            view === 'gallery' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/25' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <LayoutGrid size={14} />
          <span>Galeri &amp; Progres</span>
        </button>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setView('manage')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors ${
              view === 'manage' ? 'bg-slate-900 text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Settings2 size={14} />
            <span>Kelola Badge</span>
            <span className="text-[9px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full">
              Admin
            </span>
          </button>
        )}
      </div>

      {view === 'manage' && isAdmin ? (
        <TalBadgeManagementTab canWrite={isAdmin} />
      ) : loading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500 space-y-2">
          <RefreshCw size={24} className="animate-spin mx-auto text-indigo-600" />
          <p className="text-xs font-medium">Menganalisis capaian kinerja &amp; lencana...</p>
        </div>
      ) : error ? (
        <div className="bg-white rounded-xl border border-red-200 p-8 text-center space-y-2">
          <p className="text-sm font-bold text-red-700">Data gamifikasi belum bisa dimuat.</p>
          <p className="text-xs text-slate-500">{error}</p>
          <button
            onClick={() => loadData()}
            className="mt-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold"
          >
            Coba Lagi
          </button>
        </div>
      ) : summary ? (
        <>
          <TalGamificationHeroBanner
            currentStreak={summary.currentStreak}
            earnedBadgesCount={earnedBadgesCount}
            seasonYear={selectedYear}
            onExploreTrophyRoom={() => {
              const el = document.getElementById('badge-gallery-section');
              if (el) el.scrollIntoView({ behavior: 'smooth' });
            }}
          />

          <TalHeatmapStreak
            heatmapData={summary.heatmapData}
            currentStreak={summary.currentStreak}
            bestStreak={summary.bestStreak}
            seasonYear={selectedYear}
            onYearChange={setSelectedYear}
          />

          <div id="badge-gallery-section">
            <TalBadgeGallery
              badges={badges}
              progressMap={summary.badgesProgress}
              trophies={trophies}
              seasonYear={selectedYear}
              userName={userName}
              userEmail={summary.userEmail}
              currentStreak={summary.currentStreak}
            />
          </div>
        </>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500">
          <p className="text-xs">Data gamifikasi belum tersedia untuk akun ini.</p>
        </div>
      )}
    </div>
  );
}
