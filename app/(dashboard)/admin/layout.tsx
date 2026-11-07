import { redirect } from 'next/navigation';
import { getAuthContext, getUserPlatformPermissions } from '@/lib/auth-helpers';

export const metadata = { title: 'Administrator Pusat — WOORK' };

export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/admin');
  // Administrator Pusat lolos penuh; Admin WOORK lolos bila memegang
  // setidaknya satu permission platform (filter menu + guard API yang memilah).
  if (!ctx.isSuperAdmin) {
    const platformPerms = await getUserPlatformPermissions(ctx);
    if (platformPerms.size === 0) redirect('/dashboard');
  }
  return <>{children}</>;
}
