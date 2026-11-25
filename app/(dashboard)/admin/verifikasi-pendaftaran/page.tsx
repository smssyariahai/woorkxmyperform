import { redirect } from 'next/navigation';
import { getAuthContext, getUserPlatformPermissions } from '@/lib/auth-helpers';
import { RegistrationsClient } from '@/components/super/RegistrationsClient';

export const metadata = { title: 'Verifikasi Pendaftaran — Administrator Pusat' };

export default async function RegistrationsPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  if (!ctx.isSuperAdmin) {
    const pp = await getUserPlatformPermissions(ctx);
    if (!pp.has('PLATFORM_REGISTRATIONS_VIEW') && !pp.has('PLATFORM_REGISTRATIONS_MANAGE')) redirect('/dashboard');
  }
  return <RegistrationsClient />;
}
