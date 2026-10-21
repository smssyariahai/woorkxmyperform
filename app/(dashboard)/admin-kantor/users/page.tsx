import { getAuthContext, getUserPermissions } from '@/lib/auth-helpers';
import { redirect } from 'next/navigation';
import { UsersClient } from '@/components/office/UsersClient';

export default async function UsersPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  const keys = await getUserPermissions(ctx);
  if (!ctx.isSuperAdmin && !keys.has('USERS_VIEW')) redirect('/admin-kantor');
  return <UsersClient perms={[...keys]} />;
}
