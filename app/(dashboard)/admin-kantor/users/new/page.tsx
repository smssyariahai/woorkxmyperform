import { getAuthContext, getUserPermissions } from '@/lib/auth-helpers';
import { redirect } from 'next/navigation';
import { UserForm } from '@/components/office/UserForm';

export default async function NewUserPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  const keys = await getUserPermissions(ctx);
  if (!ctx.isSuperAdmin && !keys.has('USERS_CREATE')) redirect('/admin-kantor/users');
  const canManage = ctx.isSuperAdmin || keys.has('USERS_UPDATE');
  return <UserForm mode="create" canManageCustomFields={canManage} />;
}
