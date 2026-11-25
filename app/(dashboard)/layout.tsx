import { redirect } from 'next/navigation';
import { getAuthContext, getUserPermissions, getUserPlatformPermissions } from '@/lib/auth-helpers';
import { auth } from '@/lib/auth';
import { resolveOwnSubscription } from '@/lib/tenant/subscription-lifecycle';
import { getTrialStatus } from '@/lib/trial';
import { prisma } from '@/lib/db';
import { AppShell } from '@/components/layout/AppShell';
import { activeModulesOf, effectiveSubscriptionStatus, getSubscription, getUserModuleLevels } from '@/lib/subscription';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthContext();
  if (!ctx) {
    // Fase 4: pengguna tenant yang ditangguhkan (Standar) / nonaktif tidak
    // lolos requireAuth — jangan lempar mereka ke /login (form login akan
    // tampil padahal mereka sudah login), arahkan ke /langganan agar mereka
    // melihat status + alasan + ekspor data. Tanpa sesi sama sekali → /login.
    // CATATAN: redirect() melempar (bukan return) — JANGAN panggil di dalam
    // try/catch, atau lemparan itu tertelan dan jatuh ke /login.
    let ownTenant = false;
    try {
      const session = await auth();
      if (session?.user) {
        const own = await resolveOwnSubscription(session.user as { id?: string | null; email?: string | null });
        ownTenant = !!own;
      }
    } catch {
      /* abaikan — jatuh ke /login di bawah */
    }
    if (ownTenant) redirect('/langganan');
    redirect('/login');
  }

  // Perbaikan resolver header (Opsi 2): TIDAK ADA lagi entry tenant
  // context di frame ini. `enterWith` di `requireAuth` tidak menembus
  // batas await ke frame layout (blokir Lapisan F), dan entry manual di
  // sini hanya menjangkau query layout sendiri — page di bawah layout
  // tetap tidak mewarisinya. Sebagai gantinya, middleware menulis header
  // `x-tenant-code` dari JWT terverifikasi dan proxy `lib/db.ts`
  // membacanya via `next/headers` di SETIAP frame (layout, page, route
  // handler). Terbukti live: dashboard tenant membaca tenant DB tanpa
  // blok ini (lihat laporan perbaikan resolver 2026-11-23).

  const [unread, permSet, platformPermSet, trial, memberships, moduleLevels, subscription, me] = await Promise.all([
    prisma.customer.count({
      where: { organizationId: ctx.organizationId, unreadCount: { gt: 0 } },
    }),
    getUserPermissions(ctx),
    getUserPlatformPermissions(ctx),
    getTrialStatus(ctx.organizationId),
    // Membership TIDAK punya relasi `organization` di tenant client —
    // organisasi diambil terpisah lalu digabung (bentuk hasil sama).
    (async () => {
      const rows = await prisma.membership.findMany({
        where: { userId: ctx.userId, status: 'ACTIVE' },
        include: { role: { select: { name: true } } },
        orderBy: { joinedAt: 'asc' },
      });
      const orgIds = [...new Set(rows.map((m) => m.organizationId))];
      const orgs = orgIds.length
        ? await prisma.organization.findMany({
            where: { id: { in: orgIds } },
            select: { id: true, name: true, isActive: true, logoPath: true, updatedAt: true },
          })
        : [];
      const orgById = new Map(orgs.map((o) => [o.id, o]));
      return rows.map((m) => ({
        ...m,
        organization: orgById.get(m.organizationId) ?? {
          id: m.organizationId,
          name: '',
          isActive: false,
          logoPath: null,
          updatedAt: new Date(0),
        },
      }));
    })(),
    // Hak akses modul per pengguna (Sistem Modular): kunci modul baru + kunci lama.
    getUserModuleLevels(ctx.userId, ctx.organizationId),
    getSubscription(ctx.organizationId),
    // Foto profil pengguna (untuk menu akun di sidebar).
    prisma.user.findUnique({ where: { id: ctx.userId }, select: { avatar: true } }),
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
      userAvatar={me?.avatar ?? null}
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
          // Foto profil kantor (logo). Endpoint authed, jadi kantor tanpa
          // subdomain pun tetap bisa menampilkan logonya. `v=` membatalkan
          // cache browser setelah logo diganti.
          logoUrl: m.organization.logoPath
            ? `/api/office/logo?orgId=${m.organization.id}&v=${m.organization.updatedAt.getTime()}`
            : null,
        }))}
      unread={unread}
    >
      {children}
    </AppShell>
  );
}
