import { redirect } from 'next/navigation';
import { getAuthContext, getUserPermissions } from '@/lib/auth-helpers';

export const metadata = { title: 'Admin Kantor — WOORK' };

const ALLOWED = ['USERS_VIEW', 'ROLES_VIEW', 'DEPARTMENTS_VIEW', 'SETTINGS_MANAGE'];

export default async function AdminKantorLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  const keys = await getUserPermissions(ctx);
  const allowed = ctx.isSuperAdmin || ALLOWED.some((k) => keys.has(k));
  if (!allowed) redirect('/dashboard');
  return <>{children}</>;
}
