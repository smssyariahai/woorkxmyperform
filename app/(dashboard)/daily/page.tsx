// Halaman Daily Workspace — server component: guard auth + permission,
// render klien.
import { redirect } from 'next/navigation';
import { getAuthContext, getUserPermissions } from '@/lib/auth-helpers';
import { DailyClient } from '@/components/daily/DailyClient';

export default async function DailyPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  const keys = await getUserPermissions(ctx);
  const canView = ctx.isSuperAdmin || keys.has('DAILY_VIEW');
  if (!canView) redirect('/dashboard');
  const canManage = ctx.isSuperAdmin || keys.has('DAILY_MANAGE');
  return (
    <DailyClient
      canManage={canManage}
      userName={ctx.name}
      organizationName={ctx.organizationName}
    />
  );
}
