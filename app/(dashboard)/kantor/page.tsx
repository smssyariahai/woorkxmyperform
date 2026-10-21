import { getAuthContext } from '@/lib/auth-helpers';
import { KantorClient } from '@/components/kantor/KantorClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Kantor Virtual — WOORK' };

export default async function KantorPage() {
  const ctx = await getAuthContext();
  const isAdmin = ctx?.role === 'OWNER' || ctx?.role === 'ADMIN';
  return <KantorClient isAdmin={!!isAdmin} />;
}
