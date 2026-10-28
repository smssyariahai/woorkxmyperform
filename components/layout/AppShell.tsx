'use client';

import { useEffect, useState } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { TrialBanner } from '@/components/layout/TrialBanner';
import type { TrialStatus } from '@/lib/trial';
import { Topbar } from '@/components/layout/Topbar';
import { cn } from '@/lib/utils';

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
  memberships,
  unread,
  trial,
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
  memberships: Array<{ organizationId: string; organizationName: string; role: string; current: boolean }>;
  unread: number;
  trial?: TrialStatus | null;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    const v = localStorage.getItem('woork-sidebar');
    if (v === 'collapsed') setCollapsed(true);
  }, []);

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
