import { redirect } from 'next/navigation';
import { getAuthContext } from '@/lib/auth-helpers';
import { SystemSettingsClient } from '@/components/super/SystemSettingsClient';

export const metadata = { title: 'Pengaturan Sistem — Administrator Pusat' };

// Pengaturan Sistem memegang kunci rahasia (Google OAuth, Turnstile) —
// tetap khusus Administrator Pusat, bukan Admin WOORK.
export default async function SystemSettingsPage() {
  const ctx = await getAuthContext();
  if (!ctx?.isSuperAdmin) redirect('/dashboard');
  return <SystemSettingsClient />;
}
