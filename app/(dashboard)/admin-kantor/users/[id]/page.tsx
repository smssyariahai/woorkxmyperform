import { getAuthContext, getUserPermissions } from '@/lib/auth-helpers';
import { redirect } from 'next/navigation';
import { UserForm } from '@/components/office/UserForm';

export default async function EditUserPage({ params }: { params: { id: string } }) {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  const keys = await getUserPermissions(ctx);
  if (!ctx.isSuperAdmin && !keys.has('USERS_UPDATE')) redirect('/admin-kantor/users');
  const canManage = ctx.isSuperAdmin || keys.has('USERS_UPDATE');
  return <UserForm mode="edit" membershipId={params.id} canManageCustomFields={canManage} />;
}
