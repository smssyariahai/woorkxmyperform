import { redirect } from 'next/navigation';
import { getAuthContext } from '@/lib/auth-helpers';
import { PenggunaClient } from '@/components/super/PenggunaClient';

// Halaman ini khusus Administrator Pusat (daftar pengguna lintas kantor).
export default async function PenggunaPage() {
  const ctx = await getAuthContext();
  if (!ctx?.isSuperAdmin) redirect('/dashboard');
  return <PenggunaClient />;
}
