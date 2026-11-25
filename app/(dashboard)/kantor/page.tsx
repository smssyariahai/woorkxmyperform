// Halaman Kantor Virtual — server component: guard auth + modul,
// render pembungkus klien (toggle 3D/2D).
// Scene 3D diadaptasi dari Ruang (yugienugraha/ruang v0.2.0, MIT).
import { redirect } from 'next/navigation';
import { getAuthContext, getUserPermissions } from '@/lib/auth-helpers';
import { getSubscription, isModuleSubscribed } from '@/lib/subscription';
import { KantorPageClient } from '@/components/kantor/KantorPageClient';

/** Izin yang boleh melihat Pusat Kendali — sama dengan guard API katalog
 *  (Fase 4a) dan route Command Center (Fase 7a1). */
const COMMAND_CENTER_ALLOWED = ['USERS_VIEW', 'ROLES_VIEW', 'DEPARTMENTS_VIEW', 'SETTINGS_MANAGE'];

export default async function KantorPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  if (!ctx.isSuperAdmin) {
    const sub = await getSubscription(ctx.organizationId);
    if (!isModuleSubscribed(sub, 'kantor')) redirect('/dashboard');
  }
  const canManage = ctx.isSuperAdmin || ctx.role === 'OWNER' || ctx.role === 'ADMIN';
  const keys = await getUserPermissions(ctx);
  const canViewCommandCenter =
    ctx.isSuperAdmin || COMMAND_CENTER_ALLOWED.some((k) => keys.has(k));
  return <KantorPageClient canManage={canManage} canViewCommandCenter={canViewCommandCenter} />;
}
