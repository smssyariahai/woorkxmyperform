import { getAuthContext, getUserPermissions } from '@/lib/auth-helpers';
import { redirect } from 'next/navigation';
import { OfficeSettingsClient } from '@/components/office/OfficeSettingsClient';

export default async function OfficeSettingsPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  const keys = await getUserPermissions(ctx);
  if (!ctx.isSuperAdmin && !keys.has('SETTINGS_MANAGE')) redirect('/admin-kantor');
  return <OfficeSettingsClient />;
}
