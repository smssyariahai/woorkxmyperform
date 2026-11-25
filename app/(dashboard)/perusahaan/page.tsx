// Halaman Manajemen Perusahaan — server component: guard auth + permission,
// render klien.
import { redirect } from 'next/navigation';
import { getAuthContext, getUserPermissions } from '@/lib/auth-helpers';
import { PerusahaanClient } from '@/components/perusahaan/PerusahaanClient';

export default async function PerusahaanPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  const keys = await getUserPermissions(ctx);
  const canView = ctx.isSuperAdmin || keys.has('PERUSAHAAN_VIEW');
  if (!canView) redirect('/dashboard');
  const canManage = ctx.isSuperAdmin || keys.has('PERUSAHAAN_MANAGE');
  return <PerusahaanClient canManage={canManage} />;
}
