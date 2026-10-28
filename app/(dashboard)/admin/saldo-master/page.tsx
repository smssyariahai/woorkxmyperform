import { redirect } from 'next/navigation';
import { getAuthContext, getUserPlatformPermissions } from '@/lib/auth-helpers';
import { SaldoMaster } from '@/components/admin/SaldoMaster';

export const metadata = { title: 'Saldo Master — WOORK' };

export default async function SaldoMasterPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  if (!ctx.isSuperAdmin) {
    const pp = await getUserPlatformPermissions(ctx);
    if (!pp.has('PLATFORM_MASTER_VIEW') && !pp.has('PLATFORM_MASTER_MANAGE')) redirect('/dashboard');
  }
  return <SaldoMaster />;
}
