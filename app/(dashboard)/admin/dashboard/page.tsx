import { redirect } from 'next/navigation';
import { getAuthContext, getUserPlatformPermissions } from '@/lib/auth-helpers';
import { SuperDashboard } from '@/components/super/SuperDashboard';

// Dashboard pusat: super admin, atau Admin WOORK dengan salah satu permission lihat.
export default async function AdminPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/admin');
  if (!ctx.isSuperAdmin) {
    const pp = await getUserPlatformPermissions(ctx);
    const canView = ['PLATFORM_TENANTS_VIEW', 'PLATFORM_MASTER_VIEW', 'PLATFORM_AUDIT_VIEW'].some((k) => pp.has(k));
    if (!canView) redirect('/dashboard');
  }
  return <SuperDashboard />;
}
