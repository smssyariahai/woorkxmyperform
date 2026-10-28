import { redirect } from 'next/navigation';
import { getAuthContext, getUserPlatformPermissions } from '@/lib/auth-helpers';
import { SuperAuditClient } from '@/components/super/SuperAuditClient';

export const metadata = { title: 'Audit Global — Administrator Pusat' };

export default async function SuperAuditPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  if (!ctx.isSuperAdmin) {
    const pp = await getUserPlatformPermissions(ctx);
    if (!pp.has('PLATFORM_AUDIT_VIEW')) redirect('/dashboard');
  }
  return <SuperAuditClient />;
}
