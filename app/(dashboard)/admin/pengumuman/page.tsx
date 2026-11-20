import { redirect } from 'next/navigation';
import { getAuthContext, getUserPlatformPermissions } from '@/lib/auth-helpers';
import { AdminPengumumanClient } from '@/components/super/AdminPengumumanClient';

export const metadata = { title: 'Pengumuman Platform — Administrator Pusat' };

export default async function AdminPengumumanPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  // Super admin lolos penuh; platform admin wajib izin kelola kantor
  // (PLATFORM_TENANTS_MANAGE) — pola yang sama dengan /admin/offices/new.
  if (!ctx.isSuperAdmin) {
    const pp = await getUserPlatformPermissions(ctx);
    if (!pp.has('PLATFORM_TENANTS_MANAGE')) redirect('/dashboard');
  }
  return <AdminPengumumanClient />;
}
