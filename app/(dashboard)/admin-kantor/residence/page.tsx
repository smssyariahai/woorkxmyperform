import { getAuthContext, getUserPermissions } from '@/lib/auth-helpers';
import { canManageAgents } from '@/lib/agents/manage';
import { redirect } from 'next/navigation';
import { ResidenceClient } from '@/components/office/ResidenceClient';

export default async function ResidencePage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  const keys = await getUserPermissions(ctx);
  if (!ctx.isSuperAdmin && !keys.has('DEPARTMENTS_VIEW')) redirect('/admin-kantor');
  return <ResidenceClient perms={[...keys]} canManage={canManageAgents(ctx)} />;
}
