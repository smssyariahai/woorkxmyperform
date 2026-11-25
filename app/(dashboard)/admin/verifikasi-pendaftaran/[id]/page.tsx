import { notFound, redirect } from 'next/navigation';
import { getAuthContext, getUserPlatformPermissions } from '@/lib/auth-helpers';
import { masterPrisma } from '@/lib/tenant/master';
import { RegistrationDetailClient } from '@/components/super/RegistrationDetailClient';

export const metadata = { title: 'Detail Pendaftaran — Administrator Pusat' };

export default async function RegistrationDetailPage({ params }: { params: { id: string } }) {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  if (!ctx.isSuperAdmin) {
    const pp = await getUserPlatformPermissions(ctx);
    if (!pp.has('PLATFORM_REGISTRATIONS_VIEW') && !pp.has('PLATFORM_REGISTRATIONS_MANAGE')) redirect('/dashboard');
  }
  const registration = await masterPrisma.tenantRegistration.findUnique({
    where: { id: params.id },
    select: { id: true },
  });
  if (!registration) notFound();
  return <RegistrationDetailClient id={params.id} />;
}
