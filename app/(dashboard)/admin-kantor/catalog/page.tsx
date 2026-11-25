import { getAuthContext } from '@/lib/auth-helpers';
import { redirect } from 'next/navigation';
import { CatalogClient } from '@/components/office/CatalogClient';

export default async function CatalogPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  // Install hanya untuk OWNER / ADMIN kantor atau Super Admin
  // (pola yang sama dengan canManageAgents di lib/agents/manage.ts).
  const canManage = ctx.isSuperAdmin || ctx.role === 'OWNER' || ctx.role === 'ADMIN';
  return <CatalogClient canManage={canManage} />;
}
