// Halaman Kelola Agent — server component: guard auth + modul kantor +
// hanya OWNER / ADMIN kantor atau Super Admin (pengguna lain dialihkan
// ke /kantor). UI-nya di components/kantor/AgentManager.tsx.
import { redirect } from 'next/navigation';
import { getAuthContext } from '@/lib/auth-helpers';
import { getSubscription, isModuleSubscribed } from '@/lib/subscription';
import { AgentManager } from '@/components/kantor/AgentManager';

export default async function KantorAgentsPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  if (!ctx.isSuperAdmin) {
    const sub = await getSubscription(ctx.organizationId);
    if (!isModuleSubscribed(sub, 'kantor')) redirect('/dashboard');
  }
  if (!ctx.isSuperAdmin && ctx.role !== 'OWNER' && ctx.role !== 'ADMIN') {
    redirect('/kantor');
  }
  return <AgentManager />;
}
