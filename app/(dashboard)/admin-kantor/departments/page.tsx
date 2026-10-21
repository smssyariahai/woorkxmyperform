import { getAuthContext, getUserPermissions } from '@/lib/auth-helpers';
import { redirect } from 'next/navigation';
import { DepartmentsClient } from '@/components/office/DepartmentsClient';

export default async function DepartmentsPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  const keys = await getUserPermissions(ctx);
  if (!ctx.isSuperAdmin && !keys.has('DEPARTMENTS_VIEW')) redirect('/admin-kantor');
  return <DepartmentsClient perms={[...keys]} />;
}
