// Halaman Work Calendar — server component: guard auth + permission,
// render klien.
import { redirect } from 'next/navigation';
import { getAuthContext, getUserPermissions } from '@/lib/auth-helpers';
import { CalendarClient } from '@/components/calendar/CalendarClient';

export default async function KalenderPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  const keys = await getUserPermissions(ctx);
  const canView = ctx.isSuperAdmin || keys.has('CALENDAR_VIEW');
  if (!canView) redirect('/dashboard');
  const canCreate = ctx.isSuperAdmin || keys.has('CALENDAR_CREATE');
  const canManage = ctx.isSuperAdmin || keys.has('CALENDAR_MANAGE');
  return <CalendarClient canCreate={canCreate} canManage={canManage} />;
}
