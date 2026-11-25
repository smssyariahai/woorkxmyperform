import { redirect } from 'next/navigation';
import { getAuthContext, getUserPlatformPermissions } from '@/lib/auth-helpers';
import { PackagePricingClient } from '@/components/super/PackagePricingClient';

export const metadata = { title: 'Paket & Harga — Administrator Pusat' };

export default async function PackagePricingPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  if (!ctx.isSuperAdmin) {
    const pp = await getUserPlatformPermissions(ctx);
    if (!pp.has('PLATFORM_PACKAGES_MANAGE')) redirect('/dashboard');
  }
  return <PackagePricingClient />;
}
