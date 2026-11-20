import { redirect } from 'next/navigation';
import { getAuthContext } from '@/lib/auth-helpers';
import { PeranPlatformClient } from '@/components/super/PeranPlatformClient';

// Halaman ini khusus Administrator Pusat (daftar role platform + pemegangnya).
export default async function PeranPlatformPage() {
  const ctx = await getAuthContext();
  if (!ctx?.isSuperAdmin) redirect('/dashboard');
  return <PeranPlatformClient />;
}
