import { getAuthContext, getUserPermissions } from '@/lib/auth-helpers';
import { redirect } from 'next/navigation';
import { RolesClient } from '@/components/office/RolesClient';

export default async function RolesPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  const keys = await getUserPermissions(ctx);
  if (!ctx.isSuperAdmin && !keys.has('ROLES_VIEW')) redirect('/admin-kantor');
  return <RolesClient perms={[...keys]} />;
}
