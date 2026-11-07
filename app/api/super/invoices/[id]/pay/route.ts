import { prisma } from '@/lib/db';
import { requirePlatformPermission } from '@/lib/auth-helpers';
import { apiOk, apiErr } from '@/lib/utils';
import { audit, getClientIp } from '@/lib/audit';
import { syncOrgModulesFromSubscription } from '@/lib/subscription';

export const dynamic = 'force-dynamic';

/**
 * POST /api/super/invoices/[id]/pay — tandai invoice LUNAS (konfirmasi
 * pembayaran manual oleh Administrator Pusat).
 * Body: { paidNote? }
 * Efek: Invoice PAID + paidAt; Subscription AKTIF (periode = periode
 * invoice); Organization.modules disinkronkan dari modul langganan aktif.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePlatformPermission('PLATFORM_TENANTS_MANAGE', req);
    const body = await req.json().catch(() => ({}));
    const paidNote = typeof body?.paidNote === 'string' ? body.paidNote.trim().slice(0, 200) : null;

    const inv = await prisma.invoice.findUnique({
      where: { id: params.id },
      include: { organization: { select: { id: true, name: true } } },
    });
    if (!inv) return apiErr('Invoice tidak ditemukan.', 404);
    if (inv.status === 'PAID') return apiErr('Invoice ini sudah lunas.', 422);
    if (inv.status === 'CANCELLED') return apiErr('Invoice ini sudah dibatalkan.', 422);

    const result = await prisma.$transaction(async (tx) => {
      const paid = await tx.invoice.update({
        where: { id: inv.id },
        data: { status: 'PAID', paidAt: new Date(), paidNote },
      });
      let subscription = null;
      if (inv.subscriptionId) {
        subscription = await tx.subscription.update({
          where: { id: inv.subscriptionId },
          data: {
            status: 'ACTIVE',
            billingCycle: inv.billingCycle,
            startDate: inv.periodStart,
            endDate: inv.periodEnd,
            currentPeriodEnd: inv.periodEnd,
          },
        });
        await syncOrgModulesFromSubscription(tx as any, inv.organizationId, inv.subscriptionId);
      }
      return { paid, subscription };
    });

    await audit({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'INVOICE_PAID',
      module: 'BILLING',
      description: `Invoice ${inv.number} (${inv.organization.name}, Rp${inv.total.toLocaleString('id-ID')}) ditandai LUNAS${paidNote ? ` — ${paidNote}` : ''}`,
      ipAddress: getClientIp(req),
    });
    return apiOk({ invoice: result.paid, subscription: result.subscription });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return apiErr('Gagal menandai invoice lunas.', 500);
  }
}
