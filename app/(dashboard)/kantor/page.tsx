// Halaman Kantor Virtual — server component: guard auth + modul,
// render pembungkus klien (toggle 3D/2D).
// Scene 3D diadaptasi dari Ruang (yugienugraha/ruang v0.2.0, MIT).
import { redirect } from 'next/navigation';
import { getAuthContext } from '@/lib/auth-helpers';
import { getSubscription, isModuleSubscribed } from '@/lib/subscription';
import { KantorPageClient } from '@/components/kantor/KantorPageClient';

export default async function KantorPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  if (!ctx.isSuperAdmin) {
    const sub = await getSubscription(ctx.organizationId);
    if (!isModuleSubscribed(sub, 'kantor')) redirect('/dashboard');
  }
  const canManage = ctx.isSuperAdmin || ctx.role === 'OWNER' || ctx.role === 'ADMIN';
  return <KantorPageClient canManage={canManage} />;
}
