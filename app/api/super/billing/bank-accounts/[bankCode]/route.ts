import { requirePlatformPermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { upsertBankAccount } from '@/lib/tenant/bank-reconciliation';
import { LifecycleError } from '@/lib/tenant/subscription-lifecycle';

export const dynamic = 'force-dynamic';

/** PATCH /api/super/billing/bank-accounts/[bankCode] — ubah satu rekening
 *  (guard BILLING_MANAGE). Body { accountNumber?, accountHolderName?, isActive? }. */
export async function PATCH(
  req: Request,
  { params }: { params: { bankCode: string } },
) {
  try {
    const ctx = await requirePlatformPermission(
      'PLATFORM_BILLING_MANAGE',
      req,
    );
    const body = await req.json().catch(() => null);
    const account = await upsertBankAccount(
      {
        bankCode: params.bankCode,
        accountNumber: body?.accountNumber,
        accountHolderName: body?.accountHolderName,
        isActive: body?.isActive,
      },
      ctx.userId,
    );
    return apiOk({ account });
  } catch (e: any) {
    if (e instanceof Response) return e;
    if (e instanceof LifecycleError) return apiErr(e.message, e.status);
    return apiErr('Gagal mengubah rekening penampung.', 500);
  }
}
