'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Sidebar } from '@/components/layout/Sidebar';
import { TrialBanner } from '@/components/layout/TrialBanner';
import { SubscriptionBanner, type SubscriptionNotice } from '@/components/layout/SubscriptionBanner';
import type { TrialStatus } from '@/lib/trial';
import { Topbar } from '@/components/layout/Topbar';
import { cn } from '@/lib/utils';
import { pageModuleForPath, type ModularKey, type ModuleAccessLevel } from '@/lib/modular';

// Sembunyikan menu Bot selama trial (fitur tidak tersedia)
function filterTrialMenus(permissions: string[], trial?: TrialStatus | null): string[] {
  if (trial?.isTrial) return permissions.filter((p) => p !== 'BOT_MANAGE');
  return permissions;
}

export function AppShell({
  children,
  orgName,
  orgId,
  userName,
  userEmail,
  userAvatar,
  role,
  isSuperAdmin,
  permissions,
  platformPermissions,
  activeModules,
  moduleLevels,
  memberships,
  unread,
  trial,
  subscriptionNotice,
}: {
  children: React.ReactNode;
  orgName: string;
  orgId: string;
  userName: string;
  userEmail: string;
  /** Foto profil pengguna — null bila belum ada. */
  userAvatar: string | null;
  role: string;
  isSuperAdmin: boolean;
  permissions: string[];
  platformPermissions: string[];
  activeModules: ModularKey[];
  /** level akses per pengguna (kunci modul baru + kunci lama). */
  moduleLevels: Record<string, ModuleAccessLevel>;
  memberships: Array<{ organizationId: string; organizationName: string; role: string; current: boolean; logoUrl: string | null }>;
  unread: number;
  trial?: TrialStatus | null;
  subscriptionNotice?: SubscriptionNotice | null;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const { data: session } = useSession();
  const myUserId = (session?.user as any)?.id as string | undefined;

  /** Hak akses modul "live": diawali dari props layout (server), lalu
   *  diperbarui berkala dari /api/me/modules supaya perubahan oleh admin
   *  (modul dibuat "Tidak ada") langsung tercermin tanpa refresh browser.
   *  SSE /api/realtime tetap jadi jalur cepat; polling ini penjaminnya. */
  const [liveModuleLevels, setLiveModuleLevels] = useState(moduleLevels);
  const [liveActiveModules, setLiveActiveModules] = useState(activeModules);

  /** Ambil hak akses modul terbaru dari server lalu samakan state live.
   *  Dipakai SSE (jalur cepat) dan polling (penjamin) — satu-satunya tempat
   *  state live diubah dari hasil fetch, supaya tidak ada dua logika. */
  const refreshModuleAccess = useCallback(async () => {
    try {
      const r = await fetch('/api/me/modules', { cache: 'no-store' });
      if (!r.ok) return;
      const j = await r.json().catch(() => null);
      const d = j?.data ?? j;
      if (!d || !d.moduleLevels || !d.activeModules) return;
      const levelsKey = JSON.stringify(d.moduleLevels);
      const modsKey = JSON.stringify(d.activeModules);
      setLiveModuleLevels((prev) => (JSON.stringify(prev) === levelsKey ? prev : d.moduleLevels));
      setLiveActiveModules((prev) => (JSON.stringify(prev) === modsKey ? prev : d.activeModules));
    } catch {
      /* jaringan gagal — percobaan berikut yang mengambil alih */
    }
  }, []);

  useEffect(() => {
    const v = localStorage.getItem('woork-sidebar');
    if (v === 'collapsed') setCollapsed(true);
  }, []);

  // Hak akses modul berubah (diubah admin dari halaman Manajemen Pengguna /
  // Pengaturan Kantor / Role): tarik data terbaru LANGSUNG ke state live
  // (modul hilang sekejap, tanpa menunggu router.refresh) + refresh layout.
  // EventSource reconnect otomatis bila koneksi putus.
  useEffect(() => {
    const es = new EventSource('/api/realtime');
    const onModuleAccess = (e: MessageEvent) => {
      try {
        const d = JSON.parse(e.data) as { userId?: string | null };
        if (d.userId && d.userId !== myUserId) return;
        void refreshModuleAccess();
        router.refresh();
      } catch {
        /* abaikan payload rusak */
      }
    };
    es.addEventListener('module:access', onModuleAccess);
    return () => es.close();
  }, [myUserId, router, refreshModuleAccess]);

  // Bila layout server mengirim props baru (mis. sesudah router.refresh()
  // dari event SSE), samakan state live.
  useEffect(() => {
    setLiveModuleLevels(moduleLevels);
    setLiveActiveModules(activeModules);
  }, [moduleLevels, activeModules]);

  // Cek berkala TIAP 1 DETIK (+ saat tab kembali aktif): bila hak akses modul
  // berubah, update state live — Sidebar langsung menyembunyikan modul yang
  // dimatikan, tanpa refresh browser. Dilewati saat tab tersembunyi, supaya
  // tab yang tidak dipakai tidak membebani server.
  useEffect(() => {
    let stopped = false;
    const check = async () => {
      if (stopped || document.visibilityState === 'hidden') return;
      await refreshModuleAccess();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    const t = setInterval(() => void check(), 1000);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      stopped = true;
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [refreshModuleAccess]);

  // Bila user sedang membuka halaman modul yang baru saja dimatikan
  // (per pengguna / tingkat langganan), pindahkan ke Dashboard.
  useEffect(() => {
    if (isSuperAdmin) return;
    const hit = pageModuleForPath(pathname);
    if (!hit) return;
    const { module, page } = hit;
    const orgOff = !liveActiveModules.includes(module);
    const level =
      liveModuleLevels[module] ?? (page.legacyKey ? liveModuleLevels[page.legacyKey] : undefined) ?? 'WRITE';
    if (orgOff || level === 'NONE') router.replace('/dashboard');
  }, [liveModuleLevels, liveActiveModules, pathname, isSuperAdmin, router]);

  function toggleCollapse() {
    setCollapsed((c) => {
      localStorage.setItem('woork-sidebar', c ? 'open' : 'collapsed');
      return !c;
    });
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar */}
      <div className={cn('hidden lg:block shrink-0')}>
        <Sidebar
          orgName={orgName}
          orgId={orgId}
          userName={userName}
          userEmail={userEmail}
          userAvatar={userAvatar}
          role={role}
          isSuperAdmin={isSuperAdmin}
          permissions={filterTrialMenus(permissions, trial)}
          platformPermissions={platformPermissions}
          activeModules={liveActiveModules}
          moduleLevels={liveModuleLevels}
          memberships={memberships}
          unread={unread}
          collapsed={collapsed}
        />
      </div>

      {/* Mobile drawer */}
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-brand-900/45 animate-fade-in" onClick={() => setDrawer(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-[280px] max-w-[85vw] shadow-pop animate-drawer-in">
            <Sidebar
              orgName={orgName}
              orgId={orgId}
              userName={userName}
              userEmail={userEmail}
              userAvatar={userAvatar}
              role={role}
              isSuperAdmin={isSuperAdmin}
              permissions={filterTrialMenus(permissions, trial)}
              platformPermissions={platformPermissions}
              activeModules={liveActiveModules}
              moduleLevels={liveModuleLevels}
              memberships={memberships}
              unread={unread}
              collapsed={false}
              onNavigate={() => setDrawer(false)}
            />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {trial && (trial.isTrial || trial.trialExpired) && <TrialBanner trial={trial} />}
        {subscriptionNotice && <SubscriptionBanner notice={subscriptionNotice} />}
        <Topbar
          onMenu={() => setDrawer(true)}
          collapsed={collapsed}
          onToggleCollapse={toggleCollapse}
          userName={userName}
        />
        <main className="flex-1 overflow-auto"><div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">{children}</div></main>
      </div>
    </div>
  );
}
