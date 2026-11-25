import { requirePlatformPermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import {
  getBankAccounts,
  upsertBankAccount,
} from '@/lib/tenant/bank-reconciliation';
import { LifecycleError } from '@/lib/tenant/subscription-lifecycle';

export const dynamic = 'force-dynamic';

/** GET /api/super/billing/bank-accounts — daftar rekening penampung
 *  (guard BILLING_VIEW). ?onlyFilled=1 -> hanya yang nomornya terisi. */
export async function GET(req: Request) {
  try {
    await requirePlatformPermission('PLATFORM_BILLING_VIEW', req);
    const url = new URL(req.url);
    const onlyFilled = url.searchParams.get('onlyFilled') === '1';
    const accounts = await getBankAccounts({ onlyFilled });
    return apiOk({ accounts });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal memuat rekening penampung.', 500);
  }
}

/** POST /api/super/billing/bank-accounts — upsert satu rekening
 *  (guard BILLING_MANAGE). Body { bankCode, accountNumber?, accountHolderName?, isActive? }. */
export async function POST(req: Request) {
  try {
    const ctx = await requirePlatformPermission(
      'PLATFORM_BILLING_MANAGE',
      req,
    );
    const body = await req.json().catch(() => null);
    const account = await upsertBankAccount(
      {
        bankCode: body?.bankCode,
        accountNumber: body?.accountNumber,
        accountHolderName: body?.accountHolderName,
        isActive: body?.isActive,
      },
      ctx.userId,
    );
    return apiOk({ account }, 201);
  } catch (e: any) {
    if (e instanceof Response) return e;
    if (e instanceof LifecycleError) return apiErr(e.message, e.status);
    return apiErr('Gagal menyimpan rekening penampung.', 500);
  }
}
