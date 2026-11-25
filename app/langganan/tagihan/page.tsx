import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { resolveOwnSubscription } from '@/lib/tenant/subscription-lifecycle';
import TagihanClient from '@/components/langganan/TagihanClient';

/**
 * Halaman Tagihan tenant (Fase 6 §9.5).
 *
 * Berdiri sendiri di luar grup (dashboard), pola yang sama dengan
 * /langganan (Fase 4): layout dashboard menolak tenant NONAKTIF, padahal
 * tenant nonaktif tetap perlu melihat tagihannya. Data dimuat client-side
 * oleh TagihanClient dari GET /api/tenant/subscription/invoices.
 */
export default async function TagihanPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const own = await resolveOwnSubscription(session.user as { id?: string | null; email?: string | null });

  if (!own) {
    return (
      <div className="max-w-[860px] mx-auto space-y-5 px-4 py-8">
        <h1 className="text-[22px] font-bold text-ink">Tagihan</h1>
        <p className="text-sm text-muted py-4 text-center">
          Halaman ini hanya untuk pengguna tenant. Akun Anda tidak terikat ke tenant mana pun.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-[860px] mx-auto space-y-5 px-4 py-8">
      <div>
        <h1 className="text-[22px] font-bold text-ink">Tagihan</h1>
        <p className="text-sm text-muted">
          {own.tenant?.companyName} ·{' '}
          <code className="bg-canvas px-1.5 py-0.5 rounded text-[12.5px]">{own.tenant?.tenantCode}</code>
          {' · '}
          <Link href="/langganan" className="text-brand underline">
            Kembali ke Langganan
          </Link>
        </p>
      </div>
      <TagihanClient isOwner={own.isOwner} />
    </div>
  );
}
