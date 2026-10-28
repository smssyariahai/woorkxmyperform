import { redirect } from 'next/navigation';
import { getAuthContext, getUserPermissions, getUserPlatformPermissions } from '@/lib/auth-helpers';
import { parseOrgModules } from '@/lib/modules';
import { getTrialStatus } from '@/lib/trial';
import { prisma } from '@/lib/db';
import { AppShell } from '@/components/layout/AppShell';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');

  const [unread, permSet, platformPermSet, orgRow, trial, memberships] = await Promise.all([
    prisma.customer.count({
      where: { organizationId: ctx.organizationId, unreadCount: { gt: 0 } },
    }),
    getUserPermissions(ctx),
    getUserPlatformPermissions(ctx),
    prisma.organization.findUnique({
      where: { id: ctx.organizationId },
      select: { modules: true },
    }),
    getTrialStatus(ctx.organizationId),
    prisma.membership.findMany({
      where: { userId: ctx.userId, status: 'ACTIVE' },
      include: {
        organization: { select: { id: true, name: true, isActive: true } },
        role: { select: { name: true } },
      },
      orderBy: { joinedAt: 'asc' },
    }),
  ]);

  return (
    <AppShell
      trial={trial}
      orgName={ctx.organizationName}
      orgId={ctx.organizationId}
      userName={ctx.name}
      userEmail={ctx.email}
      role={ctx.role}
      isSuperAdmin={ctx.isSuperAdmin}
      permissions={[...permSet]}
      platformPermissions={[...platformPermSet]}
      orgModules={parseOrgModules(orgRow?.modules)}
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
