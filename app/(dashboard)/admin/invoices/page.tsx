import { redirect } from 'next/navigation';
import { getAuthContext, getUserPlatformPermissions } from '@/lib/auth-helpers';
import { InvoicesClient } from '@/components/super/InvoicesClient';

export const metadata = { title: 'Invoice — Administrator Pusat' };

export default async function InvoicesPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  if (!ctx.isSuperAdmin) {
    const pp = await getUserPlatformPermissions(ctx);
    if (!pp.has('PLATFORM_TENANTS_VIEW') && !pp.has('PLATFORM_TENANTS_MANAGE')) redirect('/dashboard');
  }
  return <InvoicesClient />;
}
