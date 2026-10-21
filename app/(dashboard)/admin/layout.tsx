import { redirect } from 'next/navigation';
import { getAuthContext } from '@/lib/auth-helpers';

export const metadata = { title: 'Administrator Pusat — WOORK' };

export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  if (!ctx.isSuperAdmin) redirect('/dashboard');
  return <>{children}</>;
}
