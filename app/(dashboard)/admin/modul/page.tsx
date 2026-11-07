import { redirect } from 'next/navigation';
import { getAuthContext, getUserPlatformPermissions } from '@/lib/auth-helpers';
import { ModulePricesClient } from '@/components/super/ModulePricesClient';

export const metadata = { title: 'Harga Modul — Administrator Pusat' };

export default async function ModulePricesPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  if (!ctx.isSuperAdmin) {
    const pp = await getUserPlatformPermissions(ctx);
    if (!pp.has('PLATFORM_PACKAGES_MANAGE')) redirect('/dashboard');
  }
  return <ModulePricesClient />;
}
