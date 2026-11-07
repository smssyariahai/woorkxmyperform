import { redirect } from 'next/navigation';
import { getAuthContext, getUserPlatformPermissions } from '@/lib/auth-helpers';
import { InvoiceDetailClient } from '@/components/super/InvoiceDetailClient';

export const metadata = { title: 'Detail Invoice — Administrator Pusat' };

export default async function InvoiceDetailPage({ params }: { params: { id: string } }) {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  if (!ctx.isSuperAdmin) {
    const pp = await getUserPlatformPermissions(ctx);
    if (!pp.has('PLATFORM_TENANTS_VIEW') && !pp.has('PLATFORM_TENANTS_MANAGE')) redirect('/dashboard');
  }
  return <InvoiceDetailClient invoiceId={params.id} />;
}
