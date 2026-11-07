import { redirect } from 'next/navigation';
import { getAuthContext, getUserPlatformPermissions } from '@/lib/auth-helpers';
import { OfficeWizard } from '@/components/super/OfficeWizard';

export const metadata = { title: 'Buat Kantor Baru — Administrator Pusat' };

export default async function NewOfficePage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  if (!ctx.isSuperAdmin) {
    const pp = await getUserPlatformPermissions(ctx);
    if (!pp.has('PLATFORM_TENANTS_MANAGE')) redirect('/admin/offices');
  }
  return <OfficeWizard />;
}
