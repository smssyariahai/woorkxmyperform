import { notFound, redirect } from 'next/navigation';
import { getAuthContext, getUserPlatformPermissions } from '@/lib/auth-helpers';
import { masterPrisma } from '@/lib/tenant/master';
import { TenantDetailClient } from '@/components/super/TenantDetailClient';

export const metadata = { title: 'Detail Tenant — Administrator Pusat' };

export default async function TenantDetailPage({ params }: { params: { id: string } }) {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  if (!ctx.isSuperAdmin) {
    const pp = await getUserPlatformPermissions(ctx);
    if (!pp.has('PLATFORM_TENANTS_VIEW') && !pp.has('PLATFORM_TENANTS_MANAGE')) redirect('/dashboard');
  }
  const tenant = await masterPrisma.tenant.findUnique({
    where: { id: params.id },
    select: { id: true },
  });
  if (!tenant) notFound();
  return <TenantDetailClient tenantId={params.id} />;
}
