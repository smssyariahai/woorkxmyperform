'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Boxes, ListChecks, MessageSquareText, PanelRight, PanelRightClose, Settings2 } from 'lucide-react';
import { KantorClient } from '@/components/kantor/KantorClient';
import KantorRoom from '@/components/kantor/KantorRoom';
import { CommandPanel } from '@/components/kantor/CommandPanel';
import { cn } from '@/lib/utils';

type ViewMode = '3d' | '2d';

/** Tab mobile (<xl): di HP scene 3D dan chat TIDAK ditumpuk — satu layar
 *  penuh per tab, seperti aplikasi chat. Di desktop (xl ke atas) keduanya
 *  berdampingan seperti biasa dan tab ini tidak tampil. */
type MobileTab = 'scene' | 'chat';

const STORAGE_KEY = 'woork.kantorView';
const PANEL_STORAGE_KEY = 'woork.kantorPanel';
const MOBILE_TAB_KEY = 'woork.kantorMobileTab';

/**
 * Pembungkus halaman /kantor: toggle tampilan 3D (kantor virtual Ruang)
 * dan 2D (daftar agent + tugas). Pilihan diingat per browser.
 *
 * Layout (Wave 7 + Wave 8): di layar lebar (xl ke atas) kantor 3D di kiri
 * dan panel AI Workspace di kanan (lebar tetap 420px). Di bawah xl, tetap
 * bertumpuk (scene dulu, panel di bawah). Panel bisa disembunyikan lewat
 * tombol di header halaman / tombol X di header panel — tampil lagi lewat
 * tombol melayang di kanan bawah.
 *
 * Tinggi dinamis (Wave 8): root memakai max-h calc(100dvh - 7rem) — 7rem =
 * Topbar h-16 (64px) + padding main py-6 (48px). `dvh` (bukan vh) supaya
 * benar di browser HP yang address bar-nya muncul/hilang. Root memakai h
 * (TINGGI PASTI, bukan max-h): rantai flex-1/h-full KantorRoom → stage →
 * Office3D hanya terisi bila root punya tinggi pasti. max-h saja membuat
 * tinggi root = tinggi konten, dan karena semua anak Office3D absolute,
 * tinggi konten = 0 → canvas 0px dan scene tidak terlihat (bug Wave 14
 * di HP). Bila konten pendek, area flex-1 (scene/panel) menyerap sisa
 * ruang; bila konten panjang, scroll pindah ke DALAM panel (thread chat)
 * atau scene — kolom ketik selalu terlihat tanpa scroll halaman penuh.
 * Scene diberi min-h clamp(220px, 32dvh, 320px) sebagai jaring pengaman
 * (bukan h, karena flex-basis 0 dari flex-1 mengabaikan h); di xl panel
 * tertutup, scene diberi tinggi eksplisit calc(100dvh - 11rem) agar
 * rantai h-full tidak collapse (tidak ada panel yang memberi tinggi baris).
 *
 * Lebar penuh saat panel tertutup (Wave 9): wrapper scene memakai
 * `xl:flex-1` di KEDUA cabang (panel buka/tutup). Sebelumnya `xl:flex-1`
 * hanya ada saat panel terbuka — saat panel ditutup, wrapper jadi flex item
 * tanpa grow (flex: 0 0 auto) sehingga lebarnya = max-content konten
 * (baris chip HUD ~725px) dan sisa baris kosong. Canvas 3D ikut melebar
 * lewat rantai w-full (KantorRoom/Office3D mengisi lebar parent; Canvas
 * R3F absolute inset-0; kamera di-reframe otomatis saat ukuran berubah).
 */
export function KantorPageClient({ canManage = false }: { canManage?: boolean }) {
  const [view, setView] = useState<ViewMode>('3d');
  // Sinyal perintah baru (naik tiap kirim perintah berhasil) -> KantorRoom
  // memuat ulang snapshot 3D segera, tanpa menunggu poll berikutnya.
  const [commandSignal, setCommandSignal] = useState(0);
  const [panelOpen, setPanelOpen] = useState(true);
  const [mobileTab, setMobileTab] = useState<MobileTab>('scene');

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === '2d' || saved === '3d') setView(saved);
      const panel = localStorage.getItem(PANEL_STORAGE_KEY);
      if (panel === 'closed') setPanelOpen(false);
      const tab = localStorage.getItem(MOBILE_TAB_KEY);
      if (tab === 'scene' || tab === 'chat') setMobileTab(tab);
    } catch {
      // abaikan — localStorage tidak tersedia
    }
  }, []);

  const pickMobileTab = (next: MobileTab) => {
    setMobileTab(next);
    try {
      localStorage.setItem(MOBILE_TAB_KEY, next);
    } catch {
      // abaikan
    }
  };

  const pick = (next: ViewMode) => {
    setView(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // abaikan
    }
  };

  const togglePanel = () => {
    setPanelOpen((v) => {
      try {
        localStorage.setItem(PANEL_STORAGE_KEY, v ? 'closed' : 'open');
      } catch {
        // abaikan
      }
      return !v;
    });
  };

  return (
    // Tinggi pasti dikurangi safe-area bawah (notch/home indicator iOS) — di
    // perangkat tanpa safe area, env(...) = 0 sehingga tidak berubah.
    <div className="flex h-[calc(100dvh-7rem-env(safe-area-inset-bottom))] flex-col gap-3 xl:gap-4">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border bg-white dark:bg-slate-900 p-1" role="tablist" aria-label="Tampilan kantor">
          <button
            type="button"
            role="tab"
            aria-selected={view === '3d'}
            onClick={() => pick('3d')}
            className={cn(
              'inline-flex min-h-10 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              view === '3d' ? 'bg-brand text-white' : 'text-muted hover:text-ink',
            )}
          >
            <Boxes className="h-4 w-4" />
            3D
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === '2d'}
            onClick={() => pick('2d')}
            className={cn(
              'inline-flex min-h-10 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              view === '2d' ? 'bg-brand text-white' : 'text-muted hover:text-ink',
            )}
          >
            <ListChecks className="h-4 w-4" />
            2D
          </button>
        </div>
        <p className="hidden text-sm text-muted sm:block">
          {view === '3d'
            ? 'Kantor virtual 3D — seret untuk memutar, gulir untuk zoom, klik agent untuk detail.'
            : 'Daftar agent dan tugas terbaru di kantor ini.'}
        </p>
        {canManage && (
          <Link
            href="/kantor/agents"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border bg-white dark:bg-slate-900 px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:text-ink"
          >
            <Settings2 className="h-4 w-4" />
            <span className="hidden sm:inline">Kelola Agent</span>
          </Link>
        )}
        {/* Di HP, tab 3D/Chat di bawah menggantikan tombol ini. */}
        <button
          type="button"
          onClick={togglePanel}
          aria-pressed={panelOpen}
          className="ml-auto hidden min-h-10 items-center gap-1.5 rounded-lg border bg-white dark:bg-slate-900 px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:text-ink xl:inline-flex"
        >
          {panelOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRight className="h-4 w-4" />}
          {panelOpen ? 'Sembunyikan panel AI' : 'Tampilkan panel AI'}
        </button>
      </div>

      {/* Tab mobile (<xl): Kantor 3D / AI Chat — satu layar penuh per tab.
          Di desktop tab ini disembunyikan karena keduanya berdampingan. */}
      <div className="flex shrink-0 rounded-lg border bg-white dark:bg-slate-900 p-1 xl:hidden" role="tablist" aria-label="Panel kantor">
        <button
          type="button"
          role="tab"
          aria-selected={mobileTab === 'scene'}
          onClick={() => pickMobileTab('scene')}
          className={cn(
            'inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
            mobileTab === 'scene' ? 'bg-brand text-white' : 'text-muted hover:text-ink',
          )}
        >
          <Boxes className="h-4 w-4" />
          Kantor 3D
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mobileTab === 'chat'}
          onClick={() => pickMobileTab('chat')}
          className={cn(
            'inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
            mobileTab === 'chat' ? 'bg-brand text-white' : 'text-muted hover:text-ink',
          )}
        >
          <MessageSquareText className="h-4 w-4" />
          AI Chat
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 xl:flex-row xl:items-stretch xl:gap-4">
        <div
          className={cn(
            'min-w-0 w-full shrink-0 overflow-y-auto xl:flex-1',
            // Mobile: tab Scene -> isi sisa tinggi; tab Chat -> sembunyi.
            mobileTab === 'chat' ? 'hidden xl:block' : 'min-h-[clamp(220px,32dvh,320px)] flex-1 xl:h-auto',
            panelOpen ? 'xl:h-auto' : 'xl:h-[calc(100dvh-11rem)]',
          )}
        >
          {view === '3d' ? <KantorRoom refreshSignal={commandSignal} fillHeight /> : <KantorClient />}
        </div>

        {panelOpen && (
          <div
            className={cn(
              'min-h-0 flex-1 xl:w-[420px] xl:shrink-0 xl:flex-none',
              // Mobile: tab Chat -> isi sisa tinggi; tab Scene -> sembunyi.
              mobileTab === 'scene' && 'hidden xl:block',
            )}
          >
            <CommandPanel
              className="h-full"
              onHide={togglePanel}
              onCommandSent={() => setCommandSignal((n) => n + 1)}
            />
          </div>
        )}
      </div>

      {/* Tombol melayang untuk membuka kembali panel yang disembunyikan —
          hanya desktop; di HP tab AI Chat di atas yang menggantikannya. */}
      {!panelOpen && (
        <button
          type="button"
          onClick={togglePanel}
          className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-5 z-40 hidden items-center gap-2 rounded-full bg-brand px-4 py-2.5 text-sm font-medium text-white shadow-lg transition-transform hover:scale-[1.03] xl:inline-flex"
        >
          <MessageSquareText className="h-4 w-4" />
          AI Workspace
        </button>
      )}
    </div>
  );
}
