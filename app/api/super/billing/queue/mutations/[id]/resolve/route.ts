import { requirePlatformPermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import {
  resolveMutation,
  shapeMutation,
} from '@/lib/tenant/bank-reconciliation';
import { LifecycleError } from '@/lib/tenant/subscription-lifecycle';

export const dynamic = 'force-dynamic';

/** POST /api/super/billing/queue/mutations/[id]/resolve — selesaikan satu
 *  mutasi bermasalah (guard BILLING_MANAGE).
 *  Body { action: 'link-invoice'|'credit'|'dismiss', invoiceId?, note?,
 *  handling? } — handling diteruskan ke settleManually (wajib bila selisih
 *  kurang bayar > kode unik: FOLLOW_UP_INVOICE | FORGIVEN_REASON). */
export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const ctx = await requirePlatformPermission(
      'PLATFORM_BILLING_MANAGE',
      req,
    );
    const body = await req.json().catch(() => null);
    const action = body?.action;
    if (!['link-invoice', 'credit', 'dismiss'].includes(action)) {
      return apiErr(
        "Aksi tidak dikenal (link-invoice | credit | dismiss).",
        400,
      );
    }
    const result = await resolveMutation({
      mutationId: params.id,
      action,
      actorId: ctx.userId,
      invoiceId: body?.invoiceId ? String(body.invoiceId) : null,
      note: typeof body?.note === 'string' ? body.note : null,
      handling: typeof body?.handling === 'string' ? body.handling : null,
    });
    return apiOk({
      mutation: shapeMutation(result.mutation),
      settlement: result.settlement,
    });
  } catch (e: any) {
    if (e instanceof Response) return e;
    if (e instanceof LifecycleError) return apiErr(e.message, e.status);
    return apiErr('Gagal menyelesaikan mutasi.', 500);
  }
}
