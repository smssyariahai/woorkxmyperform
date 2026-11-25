import { redirect } from 'next/navigation';
import { getAuthContext, getUserPlatformPermissions } from '@/lib/auth-helpers';
import { TenantsClient } from '@/components/super/TenantsClient';

export const metadata = { title: 'Tenant & Database — Administrator Pusat' };

export default async function TenantsPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  if (!ctx.isSuperAdmin) {
    const pp = await getUserPlatformPermissions(ctx);
    if (!pp.has('PLATFORM_TENANTS_VIEW') && !pp.has('PLATFORM_TENANTS_MANAGE')) redirect('/dashboard');
  }
  return <TenantsClient />;
}
