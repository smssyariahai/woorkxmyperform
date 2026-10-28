import { redirect } from 'next/navigation';
import { getAuthContext } from '@/lib/auth-helpers';
import { PlatformAdminClient } from '@/components/super/PlatformAdminClient';

// Halaman ini khusus Administrator Pusat. Layout /admin membolehkan Admin WOORK
// masuk ke area pusat, tapi pengelolaan Admin WOORK tetap super-only.
export default async function PlatformAdminsPage() {
  const ctx = await getAuthContext();
  if (!ctx?.isSuperAdmin) redirect('/dashboard');
  return <PlatformAdminClient />;
}
