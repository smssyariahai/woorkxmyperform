'use client';

import { useEffect, useState } from 'react';
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

  useEffect(() => {
    const v = localStorage.getItem('woork-sidebar');
    if (v === 'collapsed') setCollapsed(true);
  }, []);

  // Hak akses modul berubah (diubah admin dari halaman Manajemen Pengguna /
  // Pengaturan Kantor / Role): refresh layout otomatis — menu yang dimatikan
  // langsung hilang tanpa reload manual. EventSource reconnect otomatis.
  useEffect(() => {
    const es = new EventSource('/api/realtime');
    const onModuleAccess = (e: MessageEvent) => {
      try {
        const d = JSON.parse(e.data) as { userId?: string | null };
        if (d.userId && d.userId !== myUserId) return;
        router.refresh();
      } catch {
        /* abaikan payload rusak */
      }
    };
    es.addEventListener('module:access', onModuleAccess);
    return () => es.close();
  }, [myUserId, router]);

  // Bila user sedang membuka halaman modul yang baru saja dimatikan
  // (per pengguna / tingkat langganan), pindahkan ke Dashboard.
  useEffect(() => {
    if (isSuperAdmin) return;
    const hit = pageModuleForPath(pathname);
    if (!hit) return;
    const { module, page } = hit;
    const orgOff = !activeModules.includes(module);
    const level =
      moduleLevels[module] ?? (page.legacyKey ? moduleLevels[page.legacyKey] : undefined) ?? 'WRITE';
    if (orgOff || level === 'NONE') router.replace('/dashboard');
  }, [moduleLevels, activeModules, pathname, isSuperAdmin, router]);

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
          role={role}
          isSuperAdmin={isSuperAdmin}
          permissions={filterTrialMenus(permissions, trial)}
          platformPermissions={platformPermissions}
          activeModules={activeModules}
          moduleLevels={moduleLevels}
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
              role={role}
              isSuperAdmin={isSuperAdmin}
              permissions={filterTrialMenus(permissions, trial)}
              platformPermissions={platformPermissions}
              activeModules={activeModules}
              moduleLevels={moduleLevels}
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
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
