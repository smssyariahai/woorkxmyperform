// Halaman Attendance — server component: guard auth + permission,
// render klien.
import { redirect } from 'next/navigation';
import { getAuthContext, getUserPermissions } from '@/lib/auth-helpers';
import { AttendanceClient } from '@/components/absensi/AttendanceClient';

export default async function AttendancePage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  const keys = await getUserPermissions(ctx);
  const canView = ctx.isSuperAdmin || keys.has('ATTENDANCE_VIEW');
  if (!canView) redirect('/dashboard');
  const canCheckIn = ctx.isSuperAdmin || keys.has('ATTENDANCE_CHECKIN');
  const canManage = ctx.isSuperAdmin || keys.has('ATTENDANCE_MANAGE');
  return (
    <AttendanceClient
      canCheckIn={canCheckIn}
      canManage={canManage}
      userName={ctx.name}
      organizationName={ctx.organizationName}
    />
  );
}
