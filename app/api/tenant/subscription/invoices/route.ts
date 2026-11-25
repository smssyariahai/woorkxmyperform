import { auth } from '@/lib/auth';
import { apiOk, apiErr } from '@/lib/utils';
import { masterPrisma } from '@/lib/tenant/master';
import {
  getBankAccounts,
  getCreditBalance,
} from '@/lib/tenant/bank-reconciliation';
import { resolveOwnSubscription } from '@/lib/tenant/subscription-lifecycle';
import { shapeInvoice } from '@/lib/tenant/subscription-automation';

export const dynamic = 'force-dynamic';

/** GET /api/tenant/subscription/invoices — invoice milik tenant sendiri.
 *  auth() + resolveOwnSubscription (pola status Fase 4 — tenant
 *  DITANGGUHKAN/NONAKTIF tidak punya tenant context). Kembalikan
 *  {invoices[], creditBalance, bankAccounts[]} — rekening hanya yang
 *  nomornya terisi. */
export async function GET() {
  try {
    const session = await auth();
    const u = session?.user as any;
    if (!u?.id && !u?.email) {
      return apiErr('Belum login. Silakan masuk kembali.', 401);
    }
    const own = await resolveOwnSubscription({ id: u.id, email: u.email });
    if (!own) {
      return apiErr('Tenant tidak ditemukan.', 404);
    }
    const [invoices, creditBalance, bankAccounts] = await Promise.all([
      masterPrisma.subscriptionInvoice.findMany({
        where: { tenantId: own.tenant.id },
        orderBy: { issuedAt: 'desc' },
      }),
      getCreditBalance(own.tenant.id),
      getBankAccounts({ onlyFilled: true }),
    ]);
    return apiOk({
      invoices: invoices.map(shapeInvoice),
      creditBalance,
      bankAccounts,
    });
  } catch {
    return apiErr('Gagal memuat tagihan.', 500);
  }
}
