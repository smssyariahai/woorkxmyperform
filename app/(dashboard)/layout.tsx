import { redirect } from 'next/navigation';
import { getAuthContext, getUserPermissions, getUserPlatformPermissions } from '@/lib/auth-helpers';
import { getTrialStatus } from '@/lib/trial';
import { prisma } from '@/lib/db';
import { AppShell } from '@/components/layout/AppShell';
import { activeModulesOf, effectiveSubscriptionStatus, getSubscription, getUserModuleLevels } from '@/lib/subscription';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');

  const [unread, permSet, platformPermSet, trial, memberships, moduleLevels, subscription] = await Promise.all([
    prisma.customer.count({
      where: { organizationId: ctx.organizationId, unreadCount: { gt: 0 } },
    }),
    getUserPermissions(ctx),
    getUserPlatformPermissions(ctx),
    getTrialStatus(ctx.organizationId),
    prisma.membership.findMany({
      where: { userId: ctx.userId, status: 'ACTIVE' },
      include: {
        organization: { select: { id: true, name: true, isActive: true } },
        role: { select: { name: true } },
      },
      orderBy: { joinedAt: 'asc' },
    }),
    // Hak akses modul per pengguna (Sistem Modular): kunci modul baru + kunci lama.
    getUserModuleLevels(ctx.userId, ctx.organizationId),
    getSubscription(ctx.organizationId),
  ]);

  const subStatus = effectiveSubscriptionStatus(subscription);
  const subscriptionNotice =
    !ctx.isSuperAdmin && subStatus !== 'ACTIVE'
      ? {
          status: subStatus,
          endDate: subscription?.endDate ? subscription.endDate.toISOString() : null,
          daysLeft:
            subscription?.endDate != null
              ? Math.max(0, Math.ceil((subscription.endDate.getTime() - Date.now()) / 86_400_000))
              : null,
        }
      : null;

  return (
    <AppShell
      trial={trial}
      subscriptionNotice={subscriptionNotice}
      orgName={ctx.organizationName}
      orgId={ctx.organizationId}
      userName={ctx.name}
      userEmail={ctx.email}
      role={ctx.role}
      isSuperAdmin={ctx.isSuperAdmin}
      permissions={[...permSet]}
      platformPermissions={[...platformPermSet]}
      activeModules={activeModulesOf(subscription)}
      moduleLevels={moduleLevels}
      memberships={memberships
        .filter((m) => m.organization.isActive || ctx.isSuperAdmin)
        .map((m) => ({
          organizationId: m.organization.id,
          organizationName: m.organization.name,
          role: m.role.name,
          current: m.organization.id === ctx.organizationId,
        }))}
      unread={unread}
    >
      {children}
    </AppShell>
  );
}
